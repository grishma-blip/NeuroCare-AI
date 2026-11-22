
import asyncio
import json
import time
from contextlib import asynccontextmanager

from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware

from backend.api.routes import router
from backend.core.config import settings
from backend.core.logger import get_logger
from backend.core.database import (
    check_database_connection,
    initialize_database,
    close_database_connection,
)
from backend.services.serial_service import serial_service


logger = get_logger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("NeuroCare AI backend starting")

    # Check MongoDB connection
    if not check_database_connection():
        raise RuntimeError("MongoDB connection failed. Backend startup aborted.")

    logger.info("MongoDB connection established")

    # Initialize collections and indexes
    if not initialize_database():
        close_database_connection()
        raise RuntimeError("Database initialization failed. Backend startup aborted.")

    logger.info("MongoDB collections and indexes initialized")

    # Start serial acquisition service in background
    serial_service.start()
    logger.info("Serial acquisition service started on backend lifespan")

    try:
        yield

    finally:
        logger.info("NeuroCare AI backend shutting down")

        try:
            serial_service.stop()
        finally:
            close_database_connection()

        logger.info("NeuroCare AI backend stopped")


app = FastAPI(
    title=settings.APP_NAME,
    version=settings.APP_VERSION,
    lifespan=lifespan,
)


app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/")
def root():
    return {
        "application": settings.APP_NAME,
        "version": settings.APP_VERSION,
        "status": "running",
    }


@app.get("/api/health")
def health():
    return {
        "status": "healthy",
        "database": "connected",
    }


@app.websocket("/ws/eeg")
@app.websocket("/api/ws/eeg")
async def websocket_eeg_endpoint(websocket: WebSocket):
    """
    Real-time bidirectional WebSocket streaming endpoint for raw and filtered EEG samples,
    live Welch bandpower calculations, PSD spectrum, and signal quality metrics.
    """
    await websocket.accept()
    loop = asyncio.get_running_loop()
    client_queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    serial_service.subscribe(client_queue, loop)
    logger.info("WebSocket client connected to EEG stream")

    last_dsp_time = 0.0
    is_monitoring_paused = False

    def serialize_ws_payload(obj):
        if hasattr(obj, "isoformat"):
            return obj.isoformat()
        if hasattr(obj, "item"):
            return obj.item()
        if hasattr(obj, "tolist"):
            return obj.tolist()
        return str(obj)

    async def sender_task():
        nonlocal last_dsp_time, is_monitoring_paused
        try:
            while True:
                try:
                    # Retrieve new sample frame or timeout to send periodic telemetry heartbeat
                    frame = await asyncio.wait_for(client_queue.get(), timeout=0.25)
                except asyncio.TimeoutError:
                    frame = {
                        "samples": [],
                        "device": serial_service.get_status(),
                        "timestamp": time.time(),
                    }

                if is_monitoring_paused:
                    # Client has explicitly paused monitoring: suspend sample & DSP delivery
                    # Send only heartbeat telemetry
                    paused_frame = {
                        "samples": [],
                        "device": serial_service.get_status(),
                        "monitoring_paused": True,
                        "timestamp": time.time(),
                    }
                    payload_str = json.dumps(paused_frame, default=serialize_ws_payload)
                    await websocket.send_text(payload_str)
                    continue

                now = time.time()
                # Attach live DSP Welch bandpower frame every ~120ms
                if now - last_dsp_time >= 0.12:
                    frame["dsp"] = serial_service.get_live_dsp_analysis()
                    last_dsp_time = now

                payload_str = json.dumps(frame, default=serialize_ws_payload)
                await websocket.send_text(payload_str)
        except asyncio.CancelledError:
            pass
        except Exception as err:
            logger.error("WebSocket sender task error: %s", err, exc_info=True)

    async def receiver_task():
        nonlocal is_monitoring_paused
        try:
            while True:
                msg = await websocket.receive_json()
                action = msg.get("action")
                if action == "ping":
                    await websocket.send_json({"type": "pong", "timestamp": time.time()})
                elif action == "pause_monitoring":
                    is_monitoring_paused = True
                    logger.info("WebSocket client paused monitoring stream")
                    await websocket.send_json({
                        "type": "monitoring_paused",
                        "is_monitoring_paused": True,
                        "device": serial_service.get_status()
                    })
                elif action == "resume_monitoring":
                    is_monitoring_paused = False
                    logger.info("WebSocket client resumed monitoring stream")
                    await websocket.send_json({
                        "type": "monitoring_resumed",
                        "is_monitoring_paused": False,
                        "device": serial_service.get_status()
                    })
                elif action == "set_mode":
                    mode = msg.get("mode")
                    if mode:
                        serial_service.set_mode(mode)
                        await websocket.send_json({"type": "mode_updated", "device": serial_service.get_status()})
                elif action == "start_recording":
                    sess_id = msg.get("session_id")
                    if sess_id:
                        res = serial_service.start_recording(sess_id)
                        await websocket.send_json({"type": "recording_started", "data": res})
                elif action == "stop_recording":
                    sess_id = msg.get("session_id", "")
                    res = serial_service.stop_recording(sess_id)
                    await websocket.send_json({"type": "recording_stopped", "data": res})
                elif action == "get_status":
                    await websocket.send_json({"type": "status", "device": serial_service.get_status()})
        except WebSocketDisconnect:
            pass
        except asyncio.CancelledError:
            pass
        except Exception as err:
            logger.debug("WebSocket receiver task exited: %s", err)

    sender = asyncio.create_task(sender_task())
    receiver = asyncio.create_task(receiver_task())

    try:
        done, pending = await asyncio.wait(
            [sender, receiver],
            return_when=asyncio.FIRST_COMPLETED
        )
        for task in pending:
            task.cancel()
    finally:
        serial_service.unsubscribe(client_queue)
        logger.info("WebSocket client disconnected from EEG stream")


app.include_router(router, prefix=settings.API_PREFIX)
