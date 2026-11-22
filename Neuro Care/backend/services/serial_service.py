import asyncio
import collections
from datetime import datetime, timezone
import math
import threading
import time
from typing import Optional, List, Dict, Any, Tuple

from bson import ObjectId
import numpy as np

from backend.hardware.arduino import ArduinoConnection
from backend.services.dsp_service import dsp_service
from backend.core.config import settings
from backend.core.logger import get_logger
from backend.core.database import database
from backend.models.eeg_record_model import create_eeg_record_document

logger = get_logger(__name__)


def parse_firmware_line(line: str) -> Optional[Tuple[float, float]]:
    """
    Parses a single line of BioAmp Arduino firmware output:
    Expected format: '<timestamp_ms>,<voltage_microvolts>'
    Handles integer and floating-point timestamps (e.g. '10487.634,383.196' or '10487,383.2').
    Returns (timestamp_ms, voltage_uv) or None if invalid.
    """
    if not line:
        return None
    try:
        parts = line.strip().split(",")
        if len(parts) >= 2:
            ts_ms = float(parts[0].strip())
            v_uv = float(parts[1].strip())
            if math.isfinite(ts_ms) and math.isfinite(v_uv):
                return ts_ms, v_uv
    except (ValueError, IndexError):
        pass
    return None


class SerialService:
    """
    Authoritative single-instance hardware acquisition and EEG stream service.
    Coordinates physical Arduino USB serial streaming, real-time DSP analysis,
    WebSocket client broadcasts, and MongoDB time-series batch persistence.
    """
    def __init__(self):
        self.device = ArduinoConnection()
        self.running = False
        self.thread: Optional[threading.Thread] = None
        self._lock = threading.Lock()

        self.mode = settings.DEVICE_MODE or "HARDWARE_TEST"
        self.status = "DISCONNECTED"
        self.latest_data: Optional[str] = None
        self.last_updated: Optional[datetime] = None

        # Diagnostic Counters & Metrics
        self.lines_received_total: int = 0
        self.samples_received_total: int = 0
        self.invalid_lines_count: int = 0
        self._last_reconnect_attempt: float = 0.0

        # Sample Ring Buffers
        self.buffer_size = 2048
        self.raw_samples = collections.deque(maxlen=self.buffer_size)
        self.filtered_samples = collections.deque(maxlen=self.buffer_size)
        self.sample_timestamps_ms = collections.deque(maxlen=self.buffer_size)

        # Sliding window for sampling frequency measurement (last 128 samples)
        self.recent_timestamps = collections.deque(maxlen=128)
        self.sample_rate_measured: float = 0.0

        # WebSocket subscribers (tuples of (asyncio.Queue, Optional[asyncio.AbstractEventLoop]))
        self.subscribers: set = set()

        # Recording session auto-persistence state
        self.is_recording: bool = False
        self.is_paused: bool = False
        self.active_session_id: Optional[str] = None
        self.recording_started_at: Optional[float] = None
        self.recording_samples_count: int = 0
        self.recording_buffer: List[List[float]] = []
        self.recording_batch_index: int = 0

        # Demo simulation state for offline fallback
        self._demo_time = 0.0

    def start(self):
        """Starts the acquisition service and background reading thread."""
        if self.running:
            return

        self.running = True
        if self.mode in ("HARDWARE", "HARDWARE_TEST"):
            if self.device.connect():
                self.status = "CONNECTED"
                self.device.connected = True
            else:
                self.status = "DISCONNECTED"
                logger.info("Serial device not connected on startup; auto-reconnection loop active in background")
        else:
            self.status = "SIMULATED"

        self.thread = threading.Thread(target=self._run_loop, daemon=True)
        self.thread.start()
        logger.info("Serial acquisition service started in %s mode (thread active)", self.mode)

    def _run_loop(self):
        """Main acquisition loop handling hardware reading or demo generation."""
        while self.running:
            start_iter = time.time()

            if self.mode in ("HARDWARE", "HARDWARE_TEST"):
                self._handle_hardware_read()
            elif self.mode == "DEMO":
                self._handle_demo_generation()
            elif self.mode == "REPLAY":
                self._handle_replay_idle()

            elapsed = time.time() - start_iter
            sleep_time = max(0.002, 0.015 - elapsed)
            time.sleep(sleep_time)

    def _handle_hardware_read(self):
        """Reads and processes real incoming serial lines from physical Arduino."""
        if not self.device.connected:
            self.status = "DISCONNECTED"
            now = time.time()
            if now - self._last_reconnect_attempt >= 1.5:
                self._last_reconnect_attempt = now
                logger.debug("Attempting serial auto-reconnect to Arduino...")
                if self.device.connect():
                    self.status = "CONNECTED"
                    logger.info("Serial reconnected successfully to %s @ %d baud",
                                self.device.current_port, self.device.current_baud)
                else:
                    return
            else:
                return

        self.status = "CONNECTED"
        lines = []
        if hasattr(self.device, "read_all_lines"):
            lines = self.device.read_all_lines(max_lines=128)
        if not lines and hasattr(self.device, "read_data"):
            single = self.device.read_data()
            if single:
                lines = [single]

        if not lines:
            return

        new_samples = []
        with self._lock:
            for line in lines:
                self.lines_received_total += 1
                parsed = parse_firmware_line(line)
                if parsed:
                    ts_ms, v_raw = parsed
                    v_filt = dsp_service.filter_single_sample(v_raw)

                    t_sec = ts_ms / 1000.0
                    self.raw_samples.append(v_raw)
                    self.filtered_samples.append(v_filt)
                    self.sample_timestamps_ms.append(ts_ms)
                    self.recent_timestamps.append(ts_ms)

                    self.samples_received_total += 1
                    self.latest_data = f"{ts_ms:.3f},{v_raw:.2f}"
                    self.last_updated = datetime.now(timezone.utc)

                    new_samples.append({
                        "time": t_sec,
                        "raw": round(v_raw, 2),
                        "filtered": round(v_filt, 2)
                    })

                    # If recording session is active, accumulate for MongoDB persistence
                    if self.is_recording and self.active_session_id and not self.is_paused:
                        self.recording_buffer.append([v_raw])
                        self.recording_samples_count += 1

                    if self.samples_received_total % 500 == 0:
                        logger.info("Arduino streaming: %d samples acquired (fs: %.1f Hz, latest: %.2f uV)",
                                    self.samples_received_total, self.sample_rate_measured, v_raw)
                else:
                    self.invalid_lines_count += 1
                    logger.debug("Ignored non-sample line: %s", line[:60])

            self._update_measured_sample_rate()

            # Flush full 256-sample batches to MongoDB
            if self.is_recording and self.active_session_id and len(self.recording_buffer) >= 256:
                self._flush_recording_batch(final=False)

        if new_samples:
            self._notify_subscribers(new_samples)

    def _handle_demo_generation(self):
        """Generates physiological 256 Hz BioAmp EEG waveform for offline research testing."""
        self.status = "SIMULATED"
        now = time.time()
        # Generate 4 samples per 15.6ms iteration (~256 Hz)
        dt = 1.0 / 256.0
        new_samples = []

        with self._lock:
            for _ in range(4):
                self._demo_time += dt
                t = self._demo_time

                # Physiological BioAmp rhythm: 10 Hz Alpha + 6 Hz Theta + 2 Hz Delta + 20 Hz Beta
                alpha = 20.0 * math.sin(2.0 * math.pi * 10.2 * t)
                theta = 8.0 * math.sin(2.0 * math.pi * 5.8 * t)
                delta = 12.0 * math.sin(2.0 * math.pi * 2.1 * t)
                beta = 5.0 * math.sin(2.0 * math.pi * 18.4 * t)
                noise = (np.random.rand() - 0.5) * 3.5

                v_raw = round(alpha + theta + delta + beta + noise, 2)
                v_filt = round(dsp_service.filter_single_sample(v_raw), 2)
                ts_ms = int(t * 1000.0)

                self.raw_samples.append(v_raw)
                self.filtered_samples.append(v_filt)
                self.sample_timestamps_ms.append(ts_ms)
                self.recent_timestamps.append(ts_ms)

                self.samples_received_total += 1
                self.latest_data = f"{ts_ms},{v_raw:.2f}"
                self.last_updated = datetime.now(timezone.utc)

                new_samples.append({
                    "time": round(t, 4),
                    "raw": v_raw,
                    "filtered": v_filt
                })

                if self.is_recording and self.active_session_id and not self.is_paused:
                    self.recording_buffer.append([v_raw])
                    self.recording_samples_count += 1

            self._update_measured_sample_rate()

            if self.is_recording and self.active_session_id and len(self.recording_buffer) >= 256:
                self._flush_recording_batch(final=False)

        if new_samples:
            self._notify_subscribers(new_samples)

    def _handle_replay_idle(self):
        self.status = "REPLAY_IDLE"
        time.sleep(0.05)

    def _update_measured_sample_rate(self):
        """Calculates live sampling rate from empirical timestamp delta."""
        if len(self.recent_timestamps) >= 32:
            dt_ms = self.recent_timestamps[-1] - self.recent_timestamps[0]
            if dt_ms > 0:
                count = len(self.recent_timestamps) - 1
                rate = (count * 1000.0) / dt_ms
                if 50.0 <= rate <= 1000.0:
                    self.sample_rate_measured = round(rate, 1)

    def _flush_recording_batch(self, final: bool = False):
        """Writes accumulated samples to MongoDB eeg_records collection."""
        if not self.active_session_id or not self.recording_buffer:
            return

        batch_size = 256 if not final else len(self.recording_buffer)
        batch_samples = self.recording_buffer[:batch_size]
        self.recording_buffer = self.recording_buffer[batch_size:]

        if not batch_samples:
            return

        try:
            record_doc = create_eeg_record_document(
                session_id=self.active_session_id,
                samples=batch_samples,
                sampling_rate=256,
                channel_names=["EEG_A0"],
                data_mode="HARDWARE" if self.mode in ("HARDWARE", "HARDWARE_TEST") else "SIMULATION"
            )
            database["eeg_records"].insert_one(record_doc)
            self.recording_batch_index += 1
            logger.info("Auto-persisted batch %d (%d samples) for session: %s",
                        self.recording_batch_index, len(batch_samples), self.active_session_id)
        except Exception as err:
            logger.error("Failed to auto-persist EEG recording batch: %s", err)

    def start_recording(self, session_id: str) -> Dict[str, Any]:
        """Binds the active recording session to hardware acquisition."""
        with self._lock:
            self.is_recording = True
            self.is_paused = False
            self.active_session_id = session_id
            self.recording_started_at = time.time()
            self.recording_samples_count = 0
            self.recording_buffer.clear()
            self.recording_batch_index = 0
            logger.info("Serial acquisition linked to active recording session: %s", session_id)
            return {
                "session_id": session_id,
                "is_recording": True,
                "is_paused": False,
                "mode": self.mode
            }

    def pause_recording(self, session_id: str) -> Dict[str, Any]:
        """Pauses sample accumulation for active session while keeping stream alive."""
        with self._lock:
            if self.is_recording and (self.active_session_id == session_id or not session_id):
                self.is_paused = True
                logger.info("Serial recording paused for session: %s", self.active_session_id)
                return {"session_id": self.active_session_id, "is_recording": True, "is_paused": True}
            return {"is_recording": self.is_recording, "is_paused": self.is_paused}

    def resume_recording(self, session_id: str) -> Dict[str, Any]:
        """Resumes sample accumulation for active session."""
        with self._lock:
            if self.is_recording and (self.active_session_id == session_id or not session_id):
                self.is_paused = False
                logger.info("Serial recording resumed for session: %s", self.active_session_id)
                return {"session_id": self.active_session_id, "is_recording": True, "is_paused": False}
            return {"is_recording": self.is_recording, "is_paused": self.is_paused}

    def stop_recording(self, session_id: str) -> Dict[str, Any]:
        """Flushes final batch and finalizes recording session state."""
        with self._lock:
            if self.active_session_id == session_id or not session_id:
                # Flush remaining samples
                while self.recording_buffer:
                    self._flush_recording_batch(final=True)

                duration = time.time() - (self.recording_started_at or time.time())
                total_samples = self.recording_samples_count

                self.is_recording = False
                self.is_paused = False
                prev_id = self.active_session_id
                self.active_session_id = None
                self.recording_started_at = None

                logger.info("Recording session %s completed with %d samples (%.1fs)",
                            prev_id, total_samples, duration)
                return {
                    "session_id": prev_id,
                    "is_recording": False,
                    "is_paused": False,
                    "duration_seconds": round(duration, 1),
                    "total_samples": total_samples
                }
            return {"is_recording": False, "is_paused": False}

    def subscribe(self, queue: asyncio.Queue, loop: Optional[asyncio.AbstractEventLoop] = None):
        with self._lock:
            self.subscribers.add((queue, loop))

    def unsubscribe(self, queue: asyncio.Queue):
        with self._lock:
            self.subscribers = {item for item in self.subscribers if item[0] != queue}

    def _notify_subscribers(self, new_samples: List[Dict[str, Any]]):
        """Pushes new sample frame to all registered WebSocket queues."""
        if not self.subscribers:
            return

        frame = {
            "samples": new_samples,
            "device": self.get_status(),
            "timestamp": time.time()
        }

        dead_subscribers = set()
        for q, loop in list(self.subscribers):
            try:
                if loop and loop.is_running():
                    loop.call_soon_threadsafe(self._safe_queue_put, q, frame)
                else:
                    self._safe_queue_put(q, frame)
            except Exception:
                dead_subscribers.add((q, loop))

        if dead_subscribers:
            with self._lock:
                self.subscribers.difference_update(dead_subscribers)

    @staticmethod
    def _safe_queue_put(queue: asyncio.Queue, frame: Dict[str, Any]):
        try:
            queue.put_nowait(frame)
        except asyncio.QueueFull:
            pass

    def get_live_dsp_analysis(self) -> Dict[str, Any]:
        """Computes live Welch bandpowers and quality metrics across the current sample window."""
        with self._lock:
            raw_window = list(self.raw_samples)[-512:] if len(self.raw_samples) >= 32 else list(self.raw_samples)
            filt_window = list(self.filtered_samples)[-512:] if len(self.filtered_samples) >= 32 else list(self.raw_samples)
            timestamps = list(self.sample_timestamps_ms)[-512:]
            is_conn = bool(self.device.connected) if self.mode in ("HARDWARE", "HARDWARE_TEST") else True
            latest_data = self.latest_data

        if not is_conn or len(filt_window) < 10:
            status_label = "DISCONNECTED" if not is_conn else "WARMING_UP"
            return {
                "band_analysis": dsp_service._empty_bandpower_response(status=status_label, window_samples=len(filt_window)),
                "quality": {
                    "is_acceptable": False,
                    "overall_quality": status_label,
                    "quality_category": status_label,
                    "quality_score": 0,
                    "score": 0,
                    "flatline": not is_conn,
                    "clipping": False,
                    "clipping_count": 0,
                    "baseline_drift": False,
                    "noise": False,
                    "is_pop": False,
                    "is_unphysiological": False,
                    "missing_samples_count": 0,
                    "peak_to_peak_uv": 0.0,
                    "mean_uv": 0.0,
                    "std_uv": 0.0,
                    "sampling_stability": "Disconnected" if not is_conn else f"Warming Up ({len(filt_window)}/512 samples)",
                    "metrics": {
                        "flatline": not is_conn,
                        "clipping": False,
                        "clipping_count": 0,
                        "baseline_drift": False,
                        "high_freq_noise": False,
                        "is_pop": False,
                        "is_unphysiological": False,
                        "gap_count": 0,
                        "mean_uv": 0.0,
                        "std_uv": 0.0,
                        "max_uv": 0.0,
                        "min_uv": 0.0,
                    },
                    "flags": ["DEVICE_DISCONNECTED"] if not is_conn else ["ACCUMULATING_SAMPLES"],
                },
                "fs_measured": self.sample_rate_measured if is_conn else 0.0,
                "sample_count": len(filt_window),
                "buffer_capacity": 512,
                "latest_sample": latest_data,
                "status": status_label,
            }

        fs = self.sample_rate_measured or 256.0
        band_analysis = dsp_service.compute_bandpowers(filt_window, fs=fs, raw_samples=raw_window)
        quality = dsp_service.evaluate_signal_quality(
            filt_window,
            fs=fs,
            timestamps_ms=timestamps,
            raw_samples=raw_window,
            total_power=band_analysis.get("total_power_uv2")
        )

        # Log periodic DSP diagnostic summary every ~500 samples
        if self.samples_received_total > 0 and self.samples_received_total % 500 < 5:
            delta_val = band_analysis["bands"]["delta"]["power_uv2"]
            theta_val = band_analysis["bands"]["theta"]["power_uv2"]
            alpha_val = band_analysis["bands"]["alpha"]["power_uv2"]
            beta_val = band_analysis["bands"]["beta"]["power_uv2"]
            tot_pwr = band_analysis["total_power_uv2"]
            pk_alpha = band_analysis["alpha_peak_hz"]
            freq_res = band_analysis.get("frequency_resolution_hz", 1.0)
            logger.info(
                "DSP Diagnostic: buffer=%d/512, fs=%.1fHz, res=%.2fHz, Total=%.1fuV², Delta=%.1f, Theta=%.1f, Alpha=%.1f, Beta=%.1f, PeakAlpha=%s, Latest=%s",
                len(filt_window), fs, freq_res, tot_pwr, delta_val, theta_val, alpha_val, beta_val, pk_alpha, latest_data
            )

        return {
            "band_analysis": band_analysis,
            "quality": quality,
            "fs_measured": fs,
            "sample_count": len(filt_window),
            "buffer_capacity": 512,
            "latest_sample": latest_data,
            "status": band_analysis.get("status", "ACTIVE"),
        }

    def set_mode(self, mode: str):
        """Switches operating mode (HARDWARE, DEMO, REPLAY)."""
        valid_modes = {"HARDWARE", "HARDWARE_TEST", "DEMO", "REPLAY"}
        if mode not in valid_modes:
            raise ValueError(f"Invalid mode: {mode}. Allowed: {valid_modes}")

        with self._lock:
            self.mode = mode
            if mode in ("HARDWARE", "HARDWARE_TEST"):
                connected = self.device.connect()
                if connected:
                    self.status = "CONNECTED"
                else:
                    self.status = "DISCONNECTED"
                if not self.running:
                    self.running = True
                    self.thread = threading.Thread(target=self._run_loop, daemon=True)
                    self.thread.start()
            elif mode == "DEMO":
                self.device.disconnect()
                self.status = "SIMULATED"
                if not self.running:
                    self.running = True
                    self.thread = threading.Thread(target=self._run_loop, daemon=True)
                    self.thread.start()
            elif mode == "REPLAY":
                self.device.disconnect()
                self.status = "REPLAY_IDLE"
            logger.info("SerialService operating mode changed to: %s", mode)

    def get_status(self) -> Dict[str, Any]:
        """Returns comprehensive hardware telemetry dictionary."""
        is_conn = bool(self.device.connected) if self.mode in ("HARDWARE", "HARDWARE_TEST") else True
        err_msg = getattr(self.device, "error_message", None)
        if not is_conn and err_msg:
            msg = err_msg
        elif is_conn:
            msg = f"USB Serial Active ({self.device.current_port})"
        else:
            msg = "Device not connected"

        return {
            "connected": is_conn,
            "mode": self.mode,
            "status": self.status,
            "port": self.device.current_port,
            "baud_rate": self.device.current_baud,
            "device_name": "Arduino UNO R4 WiFi (BioAmp EXG Pill)",
            "message": msg,
            "error_message": err_msg,
            "sample_rate_measured": self.sample_rate_measured if is_conn else 0.0,
            "samples_received": self.samples_received_total,
            "samples_received_total": self.samples_received_total,
            "lines_received_total": self.lines_received_total,
            "invalid_lines_count": self.invalid_lines_count,
            "is_recording": self.is_recording,
            "is_paused": self.is_paused,
            "active_session_id": self.active_session_id,
            "latest_data": self.latest_data,
            "last_updated": self.last_updated.isoformat() if self.last_updated else None
        }

    def stop(self):
        """Clean shutdown of background thread and port."""
        self.running = False
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=1.5)
        self.device.disconnect()
        self.status = "DISCONNECTED"
        logger.info("Serial acquisition service stopped")


serial_service = SerialService()
