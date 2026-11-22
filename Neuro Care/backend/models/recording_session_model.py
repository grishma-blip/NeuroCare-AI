from datetime import datetime, timezone
from uuid import uuid4
from bson import ObjectId
from typing import Optional, List, Dict, Any


SESSION_STATUSES = {
    "scheduled",
    "recording",
    "paused",
    "completed",
    "cancelled",
    "interrupted",
    "failed"
}

DATA_MODES = {
    "HARDWARE",
    "REPLAY",
    "SIMULATION"
}


def create_session_document(
    participant_id: str,
    created_by: str,
    data_mode: str = "HARDWARE",
    sampling_rate: Optional[int] = 256,
    channel_count: int = 1,
    protocol_name: str = "Single Channel BioAmp Acquisition",
    notes: Optional[str] = "",
    device_info: Optional[Dict[str, Any]] = None,
    calibration_info: Optional[Dict[str, Any]] = None
):
    if not participant_id or not participant_id.strip():
        raise ValueError("Participant ID is required")

    if not ObjectId.is_valid(participant_id):
        raise ValueError("Invalid participant ID")

    if not created_by or not created_by.strip():
        raise ValueError("Created by is required")

    if data_mode not in DATA_MODES:
        raise ValueError("Invalid data mode")

    if channel_count < 1:
        raise ValueError("Channel count must be at least 1")

    if sampling_rate is not None and sampling_rate <= 0:
        raise ValueError("Sampling rate must be positive")

    if not protocol_name or not protocol_name.strip():
        raise ValueError("Protocol name cannot be empty")

    now = datetime.now(timezone.utc)

    default_calibration = {
        "status": "UNVERIFIED_NOMINAL",
        "nominal_gain": 2420.0,
        "vref_volts": 5.0,
        "adc_bits": 12,
        "unit": "microvolts (uV)",
        "notes": "Nominal unverified factory calibration"
    }

    default_device = {
        "board": "Arduino UNO R4 WiFi",
        "sensor": "Upside Down Labs BioAmp EXG Pill v1.0",
        "filter_hardware": "0.5–29.5 Hz Active Bandpass",
        "port": "USB CDC Serial"
    }

    return {
        "session_code": f"SES-{uuid4().hex[:8].upper()}",
        "participant_id": participant_id,
        "created_by": created_by.strip(),
        "protocol_name": protocol_name.strip(),
        "data_mode": data_mode,
        "sampling_rate": sampling_rate,
        "channel_count": channel_count,
        "status": "scheduled",
        "notes": notes.strip() if notes else "",
        "events": [],
        "device_info": device_info or default_device,
        "calibration_info": calibration_info or default_calibration,
        "quality_summary": None,
        "ground_truth": None,
        "started_at": None,
        "paused_at": None,
        "ended_at": None,
        "created_at": now,
        "updated_at": now
    }


def serialize_session(session: dict):
    return {
        "id": str(session.get("_id", "")),
        "session_code": session.get("session_code"),
        "participant_id": session.get("participant_id"),
        "created_by": session.get("created_by"),
        "protocol_name": session.get("protocol_name"),
        "data_mode": session.get("data_mode"),
        "sampling_rate": session.get("sampling_rate"),
        "channel_count": session.get("channel_count"),
        "status": session.get("status"),
        "notes": session.get("notes", ""),
        "events": session.get("events", []),
        "device_info": session.get("device_info", {}),
        "calibration_info": session.get("calibration_info", {}),
        "quality_summary": session.get("quality_summary"),
        "ground_truth": session.get("ground_truth"),
        "started_at": session.get("started_at"),
        "paused_at": session.get("paused_at"),
        "ended_at": session.get("ended_at"),
        "created_at": session.get("created_at"),
        "updated_at": session.get("updated_at")
    }
