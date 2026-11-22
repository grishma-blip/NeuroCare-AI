import io
import json
import csv
import logging
from pathlib import Path
from datetime import datetime, timezone
from typing import Optional, List, Dict, Any

import numpy as np
from bson import ObjectId
from fastapi import APIRouter, HTTPException, Query, Response, UploadFile, File, Request, Header
from pydantic import BaseModel, Field
from pymongo.errors import PyMongoError, DuplicateKeyError

PROJECT_ROOT = Path(__file__).resolve().parents[2]

from backend.core.schemas import DeviceStatusResponse
from backend.core.database import database
from backend.models.analysis_result_model import (
    create_analysis_document,
    serialize_analysis
)
from backend.services.quality_analysis_service import quality_analysis_service
from backend.services.motor_imagery_service import motor_imagery_service, PHYSIONET_CHANNEL_NAMES
from backend.services.emotion_service import emotion_service
from backend.services.calibration_service import calibration_service
from backend.services.pdf_report_service import pdf_report_service
from backend.models.audit_log_model import create_audit_log_document
from backend.models.participant_model import (
    create_participant_document,
    serialize_participant,
    PARTICIPANT_STATUSES,
    REGISTRATION_STATUSES,
    DEFAULT_ASSIGNED_TESTS
)
from backend.models.eeg_record_model import (
    create_eeg_record_document,
    serialize_eeg_record
)
from backend.models.recording_session_model import (
    create_session_document,
    serialize_session,
    SESSION_STATUSES,
    DATA_MODES
)
from backend.services.serial_service import serial_service
from backend.services.dsp_service import dsp_service


logger = logging.getLogger(__name__)
router = APIRouter()

participants_collection = database["participants"]
sessions_collection = database["recording_sessions"]
eeg_records_collection = database["eeg_records"]
analysis_results_collection = database["analysis_results"]
audit_logs_collection = database["audit_logs"]


# -------------------- REQUEST SCHEMAS --------------------

class LoginRequest(BaseModel):
    email: str
    password: str
    role: Optional[str] = None


class GroundTruthSubmit(BaseModel):
    valence: float = Field(ge=1.0, le=9.0)
    arousal: float = Field(ge=1.0, le=9.0)
    dominance: float | None = Field(default=None, ge=1.0, le=9.0)
    liking: float | None = Field(default=None, ge=1.0, le=9.0)
    assessment_method: str = Field(default="SAM_SLIDER", max_length=50)
    submitted_by: str = Field(min_length=1, max_length=100)
    notes: str | None = Field(default=None, max_length=500)


class EmotionAnalysisRequest(BaseModel):
    use_calibration: bool = True
    requested_by: str = Field(default="system", min_length=1, max_length=100)
    role: str = Field(default="clinician", max_length=50)


class EmotionCalibrationRequest(BaseModel):
    resting_session_id: str | None = None
    calibration_session_ids: list[str] = Field(default_factory=list)
    requested_by: str = Field(min_length=1, max_length=100)
    role: str = Field(default="clinician", max_length=50)


class ParticipantCreate(BaseModel):
    participant_code: Optional[str] = None
    name: Optional[str] = None
    age: Optional[int] = Field(default=None, ge=18, le=120)
    gender: Optional[str] = "Unspecified"
    consent_obtained: bool = True
    assigned_doctor: Optional[str] = "dr_neurologist"
    assigned_tests: List[str] = Field(default_factory=lambda: ["Live EEG", "Emotion Recognition", "Motor Imagery"])
    demographics: Optional[Dict[str, Any]] = None
    registration_status: Optional[str] = "ready_for_testing"
    notes: Optional[str] = None
    created_by: str = Field(default="clinician", min_length=1, max_length=100)


class ParticipantReviewRequest(BaseModel):
    reviewed_by: str = Field(min_length=1, max_length=100)
    notes: Optional[str] = None


class ParticipantConfirmRequest(BaseModel):
    confirmed_by: str = Field(min_length=1, max_length=100)
    assigned_doctor: Optional[str] = None
    assigned_tests: Optional[List[str]] = None
    notes: Optional[str] = None


class ParticipantWithdraw(BaseModel):
    reason: Optional[str] = "Participant requested withdrawal"


class ParticipantStatusUpdate(BaseModel):
    status: str


class SessionCreate(BaseModel):
    participant_id: str
    created_by: str = Field(min_length=1, max_length=100)
    data_mode: str = "HARDWARE"
    sampling_rate: Optional[int] = Field(default=256, gt=0)
    channel_count: int = Field(default=1, ge=1)
    protocol_name: str = Field(default="Single Channel BioAmp Acquisition", min_length=1, max_length=100)
    notes: Optional[str] = None


class SessionEventMarker(BaseModel):
    label: str = Field(min_length=1, max_length=100)
    relative_time_sec: float = Field(ge=0.0)
    timestamp_ms: Optional[int] = None
    notes: Optional[str] = None


class SessionNotesUpdate(BaseModel):
    notes: str = Field(default="")


class DatasetExportRequest(BaseModel):
    session_ids: List[str] = Field(default_factory=list)
    train_split_ratio: float = Field(default=0.8, gt=0.0, lt=1.0)
    task_label: Optional[str] = None


class MotorImageryRequest(BaseModel):
    samples: Optional[list[list[float]]] = None
    sampling_rate: int = Field(default=128, ge=128, le=128)
    channel_names: Optional[list[str]] = None
    instruction: Optional[str] = None
    ground_truth: Optional[str] = None
    input_source: Optional[str] = None
    trial_duration_sec: Optional[float] = 3.0


class PhysioNetReplayRequest(BaseModel):
    subject_id: str = Field(default="S001", min_length=4, max_length=5)
    movement: Optional[str] = "left"
    trial_index: Optional[int] = None
    instruction: Optional[str] = "Imagine Left Hand"


class MotorImageryUploadRequest(BaseModel):
    samples: list[list[float]]
    sampling_rate: Optional[int] = 128
    source_name: Optional[str] = "Uploaded Epoch"


class DeviceConnectRequest(BaseModel):
    port: str | None = None
    baud_rate: int = Field(default=115200, ge=9600, le=1000000)


class DeviceModeRequest(BaseModel):
    mode: str = Field(min_length=1, max_length=50)


class DeviceRecordingRequest(BaseModel):
    session_id: str = Field(min_length=1)


# -------------------- DEVICE API --------------------

@router.get("/device/status", response_model=DeviceStatusResponse)
def get_device_status():
    return serial_service.get_status()


@router.get("/device/ports")
def get_device_ports():
    """Scans and lists system serial/USB COM ports."""
    ports = serial_service.device.list_available_ports()
    return {
        "ports": ports,
        "count": len(ports)
    }


@router.post("/device/connect")
def connect_device(payload: DeviceConnectRequest):
    """Establishes USB serial connection to target port."""
    success = serial_service.device.connect(port=payload.port, baudrate=payload.baud_rate)
    if success:
        serial_service.status = "CONNECTED"
        if not serial_service.running:
            serial_service.start()
    else:
        serial_service.status = "DISCONNECTED"
    return {
        "success": success,
        "device": serial_service.get_status()
    }


@router.post("/device/disconnect")
def disconnect_device():
    """Closes USB serial connection."""
    serial_service.device.disconnect()
    serial_service.status = "DISCONNECTED"
    return {
        "success": True,
        "device": serial_service.get_status()
    }


@router.post("/device/mode")
def set_device_mode(payload: DeviceModeRequest):
    """Switches hardware acquisition mode: HARDWARE, HARDWARE_TEST, DEMO, or REPLAY."""
    try:
        serial_service.set_mode(payload.mode)
        return {
            "mode": payload.mode,
            "status": serial_service.status,
            "device": serial_service.get_status()
        }
    except ValueError as err:
        raise HTTPException(status_code=400, detail=str(err))


@router.post("/device/start-recording")
def start_hardware_recording(payload: DeviceRecordingRequest):
    """Directly links serial acquisition to a recording session."""
    res = serial_service.start_recording(payload.session_id)
    return res


@router.post("/device/stop-recording")
def stop_hardware_recording(payload: DeviceRecordingRequest):
    """Stops serial acquisition recording and flushes pending samples to MongoDB."""
    res = serial_service.stop_recording(payload.session_id)
    return res


# -------------------- AUTH API --------------------

@router.post("/auth/login")
def login_user(payload: LoginRequest):
    """
    Presentation/Demonstration authentication endpoint.
    Accepts login credentials, verifies formatting, and assigns user role (clinician or doctor).
    """
    if not payload.email or not payload.password:
        raise HTTPException(status_code=400, detail="Email and password required")

    role = payload.role
    if not role:
        role = "doctor" if "doctor" in payload.email.lower() else "clinician"

    name_part = payload.email.split("@")[0].replace(".", " ").replace("_", " ")
    user_name = " ".join(word.capitalize() for word in name_part.split()) or ("Dr. Patel (Doctor)" if role == "doctor" else "Sarah Chen (Clinician)")
    user_id = "u_doctor" if role == "doctor" else "u_clinician"

    return {
        "token": f"neurocare_demo_token_{user_id}_{payload.email}_{int(datetime.now(timezone.utc).timestamp())}",
        "user": {
            "id": user_id,
            "email": payload.email,
            "name": user_name,
            "role": role
        }
    }


# -------------------- PARTICIPANT APIs --------------------

def get_caller_context(
    request: Request,
    authorization: Optional[str] = None,
    x_user_id: Optional[str] = None,
    x_user_role: Optional[str] = None,
    x_user_email: Optional[str] = None,
    role: Optional[str] = None,
    user_id: Optional[str] = None
) -> Dict[str, Optional[str]]:
    eff_role = x_user_role or role
    eff_id = x_user_id or user_id
    eff_email = x_user_email

    if not eff_role and "role" in request.query_params:
        eff_role = request.query_params.get("role")
    if not eff_id and "user_id" in request.query_params:
        eff_id = request.query_params.get("user_id")

    if authorization and authorization.startswith("Bearer "):
        token = authorization.split("Bearer ", 1)[1].strip()
        parts = token.split("_")
        token_email = next((p for p in parts if "@" in p), None)
        if token_email:
            eff_email = eff_email or token_email
            if not eff_id:
                eff_id = token_email.split("@")[0].replace(".", "_")
            if not eff_role:
                eff_role = "doctor" if "doctor" in token_email or "dr" in token_email else "clinician"

        if "u_doctor" in token or "doctor" in token:
            eff_role = eff_role or "doctor"
            eff_email = eff_email or "dr.patel@neurocare.ai"
            eff_id = eff_id or "dr_patel"
        elif "u_clinician" in token or "clinician" in token:
            eff_role = eff_role or "clinician"
            eff_email = eff_email or "clinician@neurocare.ai"
            eff_id = eff_id or "u_clinician"
        elif "u_admin" in token:
            eff_role = eff_role or "doctor"
            eff_email = eff_email or "dr.patel@neurocare.ai"
            eff_id = eff_id or "dr_patel"

    clean_role = eff_role.strip().lower() if eff_role else None
    clean_id = eff_id.strip() if eff_id else None
    clean_email = eff_email.strip().lower() if eff_email else None

    return {
        "role": clean_role,
        "user_id": clean_id,
        "email": clean_email
    }


def _normalize_identifier(val: Optional[str]) -> str:
    if not val:
        return ""
    import re
    return re.sub(r"[^a-z0-9]", "", val.lower())


def get_doctor_identifiers(caller_id: Optional[str], caller_email: Optional[str]) -> list[str]:
    """Builds a comprehensive list of doctor identifiers for $in matching in MongoDB."""
    cid = caller_id or ""
    cemail = caller_email or ""

    ids = set()
    if cid and cid not in ("u_doctor", "u_clinician", "u_admin"):
        ids.add(cid)
        ids.add(cid.lower())
    if cemail:
        ids.add(cemail)
        ids.add(cemail.lower())
        local = cemail.split("@")[0]
        ids.add(local)
        ids.add(local.lower())

    for s in (cid if cid not in ("u_doctor", "u_clinician", "u_admin") else "", cemail.split("@")[0] if cemail else ""):
        if s:
            cleaned = s.replace(".", " ").replace("_", " ")
            parts = [p.capitalize() for p in cleaned.split()]
            if parts:
                ids.add(" ".join(parts))
                if len(parts) > 1 and parts[0].lower() == "dr":
                    rest = " ".join(parts[1:])
                    ids.add(parts[0] + ". " + rest)
                    ids.add("Dr. " + rest)

    surname = None
    all_str = (cid + " " + cemail).lower()
    known_surnames = ("patel", "chen", "williams", "researcher", "rao", "neurologist")
    for s in known_surnames:
        if s in all_str:
            surname = s
            break

    if not surname and cemail:
        local = cemail.split("@")[0].lower()
        if local.startswith("dr.") or local.startswith("dr_"):
            candidate = local[3:]
            if len(candidate) >= 3:
                surname = candidate
        elif local.startswith("dr"):
            candidate = local[2:]
            if len(candidate) >= 3:
                surname = candidate

    # If generic demo doctor with no specific surname: default to 'patel'
    if not surname and (cid in ("u_doctor", "dr_neurologist") or cemail in ("doctor@neurocare.ai", "")):
        surname = "patel"

    if surname:
        ids.add(surname)
        ids.add(surname.capitalize())
        ids.add(f"Dr. {surname.capitalize()}")
        ids.add(f"Dr {surname.capitalize()}")
        ids.add(f"dr_{surname}")
        ids.add(f"dr.{surname}")

    return [x for x in ids if x]


def check_doctor_participant_access(participant: dict, user_context: dict) -> None:
    role = user_context.get("role")
    user_id = user_context.get("user_id")
    email = user_context.get("email")

    if not role or role in ("clinician", "nurse", "operator"):
        return

    if role in ("doctor", "physician", "neurologist"):
        reg_status = participant.get("registration_status", "ready_for_testing")
        if reg_status not in ("ready_for_testing", "confirmed"):
            raise HTTPException(
                status_code=403,
                detail="Access denied: Participant registration is not confirmed for testing."
            )

        assigned_raw = participant.get("assigned_doctor") or ""
        if not assigned_raw.strip():
            return

        assigned_norm = _normalize_identifier(assigned_raw)

        user_norms = set()
        if user_id and user_id not in ("u_doctor", "u_admin"):
            user_norms.add(_normalize_identifier(user_id))
        if email:
            user_norms.add(_normalize_identifier(email))
            user_norms.add(_normalize_identifier(email.split("@")[0]))

        all_user = ((user_id or "") + " " + (email or "")).lower()
        known_surnames = ("patel", "chen", "williams", "researcher", "rao", "neurologist")
        assigned_surname = next((s for s in known_surnames if s in assigned_raw.lower()), None)
        user_surname = next((s for s in known_surnames if s in all_user), None)

        if not user_surname and email:
            local = email.split("@")[0].lower()
            if local.startswith("dr.") or local.startswith("dr_"):
                candidate = local[3:]
                if len(candidate) >= 3:
                    user_surname = candidate
            elif local.startswith("dr"):
                candidate = local[2:]
                if len(candidate) >= 3:
                    user_surname = candidate

        if not user_surname and (user_id in ("u_doctor", "dr_neurologist") or email in ("doctor@neurocare.ai", None)):
            user_surname = "patel"

        has_match = bool(
            assigned_norm in user_norms
            or any(u in assigned_norm for u in user_norms if len(u) >= 4)
            or (assigned_surname and user_surname and assigned_surname == user_surname)
        )

        if not has_match:
            raise HTTPException(
                status_code=403,
                detail=f"Access denied: Participant is assigned to '{participant.get('assigned_doctor')}', not this doctor."
            )


@router.get("/participants/next-code")
def get_next_participant_code():
    """Generates the next sequential participant code (e.g. P-001, P-002, etc.)."""
    try:
        count = participants_collection.count_documents({})
        next_code = f"P-{(count + 1):03d}"
        while participants_collection.find_one({"participant_code": next_code}):
            count += 1
            next_code = f"P-{(count + 1):03d}"
        return {"next_code": next_code}
    except Exception as err:
        logger.exception("Failed to generate next participant code: %s", err)
        return {"next_code": "P-001"}


@router.post("/participants", status_code=201)
def register_participant(payload: ParticipantCreate):
    try:
        code = payload.participant_code
        if not code or code.strip().upper() in ("", "AUTO", "AUTO-GENERATE"):
            count = participants_collection.count_documents({})
            code = f"P-{(count + 1):03d}"
            while participants_collection.find_one({"participant_code": code}):
                count += 1
                code = f"P-{(count + 1):03d}"

        participant = create_participant_document(
            participant_code=code,
            age=payload.age,
            gender=payload.gender,
            consent_obtained=payload.consent_obtained,
            created_by=payload.created_by,
            name=payload.name,
            notes=payload.notes,
            assigned_doctor=payload.assigned_doctor,
            assigned_tests=payload.assigned_tests,
            demographics=payload.demographics,
            registration_status=payload.registration_status
        )

        result = participants_collection.insert_one(participant)
        participant["_id"] = result.inserted_id

        logger.info("Participant registered: %s (Status: %s, Assigned: %s)", participant["participant_code"], participant["registration_status"], participant["assigned_doctor"])

        return {
            "message": "Participant registered successfully",
            "participant": serialize_participant(participant)
        }

    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Participant code already exists")
    except PyMongoError:
        logger.exception("Participant registration failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.patch("/participants/{participant_id}/review")
def review_participant(
    participant_id: str,
    payload: ParticipantReviewRequest
):
    """
    Clinician reviews entered participant information.
    Transitions registration_status from 'draft' to 'pending_confirmation'.
    """
    if not ObjectId.is_valid(participant_id):
        raise HTTPException(status_code=400, detail="Invalid participant ID")

    now = datetime.now(timezone.utc)
    try:
        participant = participants_collection.find_one({"_id": ObjectId(participant_id)})
        if not participant:
            raise HTTPException(status_code=404, detail="Participant not found")

        update_fields: Dict[str, Any] = {
            "registration_status": "pending_confirmation",
            "reviewed_at": now,
            "reviewed_by": payload.reviewed_by.strip(),
            "updated_at": now
        }
        if payload.notes:
            update_fields["notes"] = payload.notes.strip()

        participants_collection.update_one(
            {"_id": ObjectId(participant_id)},
            {"$set": update_fields}
        )

        updated = participants_collection.find_one({"_id": ObjectId(participant_id)})
        logger.info("Participant %s reviewed by %s (Pending Confirmation)", participant.get("participant_code"), payload.reviewed_by)
        return {
            "message": "Participant reviewed successfully and marked pending confirmation",
            "participant": serialize_participant(updated)
        }
    except PyMongoError:
        logger.exception("Reviewing participant failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.patch("/participants/{participant_id}/confirm")
def confirm_participant(
    participant_id: str,
    payload: ParticipantConfirmRequest
):
    """
    Clinician confirms participant registration.
    Transitions registration_status to 'ready_for_testing'.
    Participant becomes available and authorized for testing in Doctor dashboard.
    """
    if not ObjectId.is_valid(participant_id):
        raise HTTPException(status_code=400, detail="Invalid participant ID")

    now = datetime.now(timezone.utc)
    try:
        participant = participants_collection.find_one({"_id": ObjectId(participant_id)})
        if not participant:
            raise HTTPException(status_code=404, detail="Participant not found")

        update_fields: Dict[str, Any] = {
            "registration_status": "ready_for_testing",
            "confirmed_at": now,
            "confirmed_by": payload.confirmed_by.strip(),
            "updated_at": now
        }
        if payload.assigned_doctor:
            update_fields["assigned_doctor"] = payload.assigned_doctor.strip()
        if payload.assigned_tests:
            update_fields["assigned_tests"] = payload.assigned_tests
        if payload.notes:
            update_fields["notes"] = payload.notes.strip()

        participants_collection.update_one(
            {"_id": ObjectId(participant_id)},
            {"$set": update_fields}
        )

        updated = participants_collection.find_one({"_id": ObjectId(participant_id)})
        logger.info("Participant %s confirmed by %s - Ready for Testing", participant.get("participant_code"), payload.confirmed_by)
        return {
            "message": "Participant registration confirmed successfully. Ready for EEG testing.",
            "participant": serialize_participant(updated)
        }
    except PyMongoError:
        logger.exception("Confirming participant failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.patch("/participants/{participant_id}/withdraw")
def withdraw_participant(participant_id: str, payload: ParticipantWithdraw):
    """
    Handles informed consent withdrawal by participant.
    Marks status as 'withdrawn', records timestamp and withdrawal reason.
    """
    if not ObjectId.is_valid(participant_id):
        raise HTTPException(status_code=400, detail="Invalid participant ID")

    now = datetime.now(timezone.utc)
    try:
        result = participants_collection.update_one(
            {"_id": ObjectId(participant_id)},
            {"$set": {
                "status": "withdrawn",
                "withdrawal_reason": payload.reason or "Participant requested withdrawal",
                "withdrawn_at": now,
                "updated_at": now
            }}
        )
        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Participant not found")

        updated = participants_collection.find_one({"_id": ObjectId(participant_id)})
        return {
            "message": "Participant consent withdrawn",
            "participant": serialize_participant(updated)
        }
    except PyMongoError:
        logger.exception("Withdrawing participant failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.get("/participants")
def get_participants(
    request: Request,
    status: str | None = Query(default=None),
    registration_status: str | None = Query(default=None),
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
    role: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None)
):
    ctx = get_caller_context(request, authorization, x_user_id, x_user_role, x_user_email, role, user_id)
    caller_role = ctx["role"]
    caller_id = ctx["user_id"]
    caller_email = ctx["email"]

    query: Dict[str, Any] = {}

    if status:
        if status not in PARTICIPANT_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid participant status")
        query["status"] = status

    if registration_status:
        if registration_status not in REGISTRATION_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid registration status")
        query["registration_status"] = registration_status

    # Access Control: Doctor Dashboard Visibility
    # "A participant must NOT appear in the Doctor/Administrator testing dashboard before the clinician completes and confirms registration."
    if caller_role in ("doctor", "physician", "neurologist"):
        # Strict enforcement: Doctor testing dashboard can ONLY view ready_for_testing
        query["registration_status"] = "ready_for_testing"

        # Filter by doctor assignment
        doc_identifiers = get_doctor_identifiers(caller_id, caller_email)
        if doc_identifiers:
            query["assigned_doctor"] = {"$in": doc_identifiers}

    try:
        participants = list(participants_collection.find(query).sort("created_at", -1))
        return {
            "total": len(participants),
            "participants": [serialize_participant(item) for item in participants]
        }
    except PyMongoError:
        logger.exception("Fetching participants failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.get("/participants/{participant_id}")
def get_participant(
    participant_id: str,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
    role: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None)
):
    if not ObjectId.is_valid(participant_id):
        raise HTTPException(status_code=400, detail="Invalid participant ID")

    try:
        participant = participants_collection.find_one({"_id": ObjectId(participant_id)})
        if not participant:
            raise HTTPException(status_code=404, detail="Participant not found")

        ctx = get_caller_context(request, authorization, x_user_id, x_user_role, x_user_email, role, user_id)
        if ctx["role"] in ("doctor", "physician", "neurologist"):
            check_doctor_participant_access(participant, ctx)

        return serialize_participant(participant)
    except HTTPException:
        raise
    except PyMongoError:
        logger.exception("Fetching participant failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.get("/participants/{participant_id}/profile")
def get_participant_profile(
    participant_id: str,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
    role: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None)
):
    """
    Returns comprehensive participant research profile for Doctor Dashboard:
    - Demographic & registration details
    - Assigned EEG testing battery
    - Historical recording sessions
    - Emotion Recognition history
    - Motor Imagery history
    Enforces authorization: Doctor can only access confirmed, assigned participants.
    """
    if not ObjectId.is_valid(participant_id):
        raise HTTPException(status_code=400, detail="Invalid participant ID")

    try:
        participant = participants_collection.find_one({"_id": ObjectId(participant_id)})
        if not participant:
            raise HTTPException(status_code=404, detail="Participant not found")

        ctx = get_caller_context(request, authorization, x_user_id, x_user_role, x_user_email, role, user_id)
        if ctx["role"] in ("doctor", "physician", "neurologist"):
            check_doctor_participant_access(participant, ctx)

        # 1. Fetch Sessions for this participant
        sessions_cursor = sessions_collection.find(
            {"$or": [
                {"participant_id": str(participant_id)},
                {"participant_id": ObjectId(participant_id)}
            ]}
        ).sort("created_at", -1)
        sessions_list = [serialize_session(s) for s in sessions_cursor]

        session_ids = [ObjectId(s["id"]) for s in sessions_list if ObjectId.is_valid(s.get("id", ""))]

        # 2. Fetch Emotion Analysis History (VALENCE_AROUSAL)
        emotion_query: Dict[str, Any] = {"analysis_type": "VALENCE_AROUSAL"}
        if session_ids:
            emotion_query["$or"] = [
                {"participant_id": ObjectId(participant_id)},
                {"session_id": {"$in": session_ids}}
            ]
        else:
            emotion_query["participant_id"] = ObjectId(participant_id)

        emotion_records = list(analysis_results_collection.find(emotion_query).sort("created_at", -1))
        emotion_history = [serialize_analysis(e) for e in emotion_records]

        # 3. Fetch Motor Imagery History (MOTOR_IMAGERY)
        mi_query: Dict[str, Any] = {"analysis_type": "MOTOR_IMAGERY"}
        if session_ids:
            mi_query["$or"] = [
                {"participant_id": ObjectId(participant_id)},
                {"session_id": {"$in": session_ids}}
            ]
        else:
            mi_query["participant_id"] = ObjectId(participant_id)

        mi_records = list(analysis_results_collection.find(mi_query).sort("created_at", -1))
        motor_imagery_history = [serialize_analysis(m) for m in mi_records]

        reg_status = participant.get("registration_status", "ready_for_testing")

        return {
            "participant": serialize_participant(participant),
            "sessions": sessions_list,
            "emotion_history": emotion_history,
            "motor_imagery_history": motor_imagery_history,
            "summary": {
                "total_sessions": len(sessions_list),
                "last_session_date": sessions_list[0].get("created_at") if sessions_list else None,
                "assigned_tests": participant.get("assigned_tests", list(DEFAULT_ASSIGNED_TESTS)),
                "registration_status": reg_status,
                "is_ready_for_testing": reg_status == "ready_for_testing"
            }
        }
    except HTTPException:
        raise
    except PyMongoError:
        logger.exception("Fetching participant profile failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.patch("/participants/{participant_id}/status")
def update_participant_status(participant_id: str, payload: ParticipantStatusUpdate):
    if not ObjectId.is_valid(participant_id):
        raise HTTPException(status_code=400, detail="Invalid participant ID")

    if payload.status not in PARTICIPANT_STATUSES:
        raise HTTPException(status_code=400, detail="Invalid participant status")

    try:
        result = participants_collection.update_one(
            {"_id": ObjectId(participant_id)},
            {"$set": {
                "status": payload.status,
                "updated_at": datetime.now(timezone.utc)
            }}
        )

        if result.matched_count == 0:
            raise HTTPException(status_code=404, detail="Participant not found")

        return {
            "message": "Participant status updated successfully",
            "status": payload.status
        }
    except PyMongoError:
        logger.exception("Updating participant status failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


# -------------------- RECORDING SESSION APIs --------------------

@router.post("/sessions", status_code=201)
def create_recording_session(
    payload: SessionCreate,
    request: Request,
    authorization: Optional[str] = Header(default=None),
    x_user_id: Optional[str] = Header(default=None),
    x_user_role: Optional[str] = Header(default=None),
    x_user_email: Optional[str] = Header(default=None),
    role: Optional[str] = Query(default=None),
    user_id: Optional[str] = Query(default=None)
):
    try:
        if payload.data_mode not in DATA_MODES:
            raise HTTPException(status_code=400, detail="Invalid data mode")

        if not ObjectId.is_valid(payload.participant_id):
            raise HTTPException(status_code=400, detail="Invalid participant ID")

        participant = participants_collection.find_one(
            {"_id": ObjectId(payload.participant_id)}
        )

        if not participant:
            raise HTTPException(status_code=404, detail="Participant not found")

        if participant.get("status") != "active":
            raise HTTPException(status_code=400, detail="Participant is not active")

        # Access control & registration status enforcement
        ctx = get_caller_context(request, authorization, x_user_id, x_user_role, x_user_email, role, user_id)
        is_doctor_caller = ctx["role"] in ("doctor", "physician", "neurologist") or payload.created_by.startswith("dr_") or "doctor" in payload.created_by.lower()
        if is_doctor_caller:
            reg_status = participant.get("registration_status", "ready_for_testing")
            if reg_status in ("draft", "pending_confirmation"):
                raise HTTPException(
                    status_code=403,
                    detail="Cannot start EEG session: Participant registration is not confirmed for testing."
                )
            if ctx["role"] in ("doctor", "physician", "neurologist"):
                check_doctor_participant_access(participant, ctx)

        session = create_session_document(
            participant_id=payload.participant_id,
            created_by=payload.created_by,
            data_mode=payload.data_mode,
            sampling_rate=payload.sampling_rate,
            channel_count=payload.channel_count,
            protocol_name=payload.protocol_name
        )

        # Link participant metadata to session
        session["assigned_doctor"] = participant.get("assigned_doctor", "dr_neurologist")
        session["assigned_tests"] = participant.get("assigned_tests", list(DEFAULT_ASSIGNED_TESTS))
        session["participant_code"] = participant.get("participant_code")

        result = sessions_collection.insert_one(session)
        session["_id"] = result.inserted_id

        logger.info("Recording session created: %s for participant %s", session["session_code"], participant.get("participant_code"))

        return {
            "message": "Recording session created successfully",
            "session": serialize_session(session)
        }

    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except PyMongoError:
        logger.exception("Creating recording session failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.get("/sessions")
def get_recording_sessions(
    status: str | None = Query(default=None),
    participant_id: str | None = Query(default=None)
):
    query = {}

    if status:
        if status not in SESSION_STATUSES:
            raise HTTPException(status_code=400, detail="Invalid session status")
        query["status"] = status

    if participant_id:
        if not ObjectId.is_valid(participant_id):
            raise HTTPException(status_code=400, detail="Invalid participant ID")
        query["participant_id"] = participant_id

    try:
        sessions = sessions_collection.find(query).sort("created_at", -1)
        return {
            "total": sessions_collection.count_documents(query),
            "sessions": [serialize_session(item) for item in sessions]
        }
    except PyMongoError:
        logger.exception("Fetching recording sessions failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.get("/sessions/{session_id}")
def get_recording_session(session_id: str):
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    try:
        session = sessions_collection.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Recording session not found")
        return serialize_session(session)
    except PyMongoError:
        logger.exception("Fetching recording session failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.patch("/sessions/{session_id}/start")
def start_recording_session(session_id: str):
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    now = datetime.now(timezone.utc)

    try:
        result = sessions_collection.update_one(
            {"_id": ObjectId(session_id), "status": "scheduled"},
            {"$set": {
                "status": "recording",
                "started_at": now,
                "updated_at": now
            }}
        )

        if result.modified_count == 0:
            existing = sessions_collection.find_one({"_id": ObjectId(session_id)})
            if not existing:
                raise HTTPException(status_code=404, detail="Recording session not found")
            raise HTTPException(
                status_code=409,
                detail=f"Cannot start session with status '{existing.get('status')}'"
            )

        session = sessions_collection.find_one({"_id": ObjectId(session_id)})
        logger.info("Recording session started: %s", session_id)

        try:
            serial_service.start_recording(session_id)
        except Exception as e:
            logger.warning("Could not link serial acquisition to session %s: %s", session_id, e)

        return {
            "message": "Recording session started successfully",
            "session": serialize_session(session)
        }
    except PyMongoError:
        logger.exception("Starting recording session failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.patch("/sessions/{session_id}/pause")
def pause_recording_session(session_id: str):
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    now = datetime.now(timezone.utc)
    try:
        session = sessions_collection.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Recording session not found")

        if session.get("status") != "recording":
            raise HTTPException(
                status_code=409,
                detail=f"Cannot pause session with status '{session.get('status')}'"
            )

        sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {
                "status": "paused",
                "paused_at": now,
                "updated_at": now
            }}
        )

        try:
            serial_service.pause_recording(session_id)
        except Exception as e:
            logger.warning("Could not pause serial acquisition for session %s: %s", session_id, e)

        updated = sessions_collection.find_one({"_id": ObjectId(session_id)})
        return {
            "message": "Recording session paused successfully",
            "session": serialize_session(updated)
        }
    except HTTPException:
        raise
    except PyMongoError:
        logger.exception("Pausing session failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.patch("/sessions/{session_id}/resume")
def resume_recording_session(session_id: str):
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    now = datetime.now(timezone.utc)
    try:
        session = sessions_collection.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Recording session not found")

        if session.get("status") != "paused":
            raise HTTPException(
                status_code=409,
                detail=f"Cannot resume session with status '{session.get('status')}'"
            )

        sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {
                "status": "recording",
                "updated_at": now
            }}
        )

        try:
            serial_service.resume_recording(session_id)
        except Exception as e:
            logger.warning("Could not resume serial acquisition for session %s: %s", session_id, e)

        updated = sessions_collection.find_one({"_id": ObjectId(session_id)})
        return {
            "message": "Recording session resumed successfully",
            "session": serialize_session(updated)
        }
    except HTTPException:
        raise
    except PyMongoError:
        logger.exception("Resuming session failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.patch("/sessions/{session_id}/stop")
def stop_recording_session(session_id: str):
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    now = datetime.now(timezone.utc)

    try:
        session = sessions_collection.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Recording session not found")

        if session.get("status") not in ("recording", "paused"):
            raise HTTPException(
                status_code=409,
                detail=f"Cannot stop session with status '{session.get('status')}'"
            )

        result = sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {
                "status": "completed",
                "ended_at": now,
                "updated_at": now
            }}
        )

        session = sessions_collection.find_one({"_id": ObjectId(session_id)})
        logger.info("Recording session completed: %s", session_id)

        try:
            serial_service.stop_recording(session_id)
        except Exception as e:
            logger.warning("Could not stop serial recording for session %s: %s", session_id, e)

        # Compute and persist quality summary if records exist
        try:
            records = list(eeg_records_collection.find({"session_id": ObjectId(session_id)}))
            if records:
                all_s = []
                fs = float(records[0].get("sampling_rate", 256))
                for r in records:
                    for s in r.get("samples", []):
                        val = s[0] if isinstance(s, (list, tuple)) else s
                        all_s.append(float(val))
                if len(all_s) >= 32:
                    q_res = dsp_service.evaluate_signal_quality(all_s, fs=fs)
                    sessions_collection.update_one(
                        {"_id": ObjectId(session_id)},
                        {"$set": {"quality_summary": q_res}}
                    )
                    session["quality_summary"] = q_res
        except Exception as err:
            logger.warning("Could not calculate quality summary on stop: %s", err)

        return {
            "message": "Recording session completed successfully",
            "session": serialize_session(session)
        }
    except HTTPException:
        raise
    except PyMongoError:
        logger.exception("Stopping recording session failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.post("/sessions/{session_id}/events")
def add_session_event(session_id: str, payload: SessionEventMarker):
    """Adds a timestamped experimental event marker to the active or completed session."""
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    now = datetime.now(timezone.utc)
    event_entry = {
        "id": f"evt_{int(now.timestamp() * 1000)}",
        "label": payload.label,
        "relative_time_sec": round(payload.relative_time_sec, 2),
        "timestamp_ms": payload.timestamp_ms or int(now.timestamp() * 1000),
        "created_at": now.isoformat(),
        "notes": payload.notes or ""
    }

    try:
        res = sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {"$push": {"events": event_entry}, "$set": {"updated_at": now}}
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Recording session not found")
        return {"message": "Event marker recorded successfully", "event": event_entry}
    except PyMongoError:
        logger.exception("Adding event marker failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.get("/sessions/{session_id}/events")
def get_session_events(session_id: str):
    """Retrieves all experimental event markers for a session."""
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = sessions_collection.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Recording session not found")
    return {"session_id": session_id, "events": session.get("events", [])}


@router.patch("/sessions/{session_id}/notes")
def update_session_notes(session_id: str, payload: SessionNotesUpdate):
    """Updates operator notes for a recording session."""
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    now = datetime.now(timezone.utc)
    try:
        res = sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"notes": payload.notes, "updated_at": now}}
        )
        if res.matched_count == 0:
            raise HTTPException(status_code=404, detail="Recording session not found")
        return {"message": "Session notes updated successfully", "notes": payload.notes}
    except PyMongoError:
        logger.exception("Updating session notes failed")
        raise HTTPException(status_code=500, detail="Database operation failed")

# -------------------- EEG RECORD APIs --------------------

class EEGRecordCreate(BaseModel):
    samples: list[list[float]] = Field(min_length=1, max_length=1000)
    sampling_rate: int = Field(gt=0)
    channel_names: list[str] = Field(min_length=1)
    data_mode: str


@router.post("/sessions/{session_id}/eeg-records", status_code=201)
def create_eeg_record(session_id: str, payload: EEGRecordCreate):
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    try:
        session = sessions_collection.find_one(
            {"_id": ObjectId(session_id)}
        )

        if not session:
            raise HTTPException(status_code=404, detail="Recording session not found")

        if session.get("status") != "recording":
            raise HTTPException(
                status_code=409,
                detail="EEG data can only be added to a recording session"
            )

        if payload.sampling_rate != session.get("sampling_rate"):
            raise HTTPException(
                status_code=400,
                detail="Sampling rate does not match recording session"
            )

        if payload.data_mode != session.get("data_mode"):
            raise HTTPException(
                status_code=400,
                detail="Data mode does not match recording session"
            )

        if len(payload.channel_names) != session.get("channel_count"):
            raise HTTPException(
                status_code=400,
                detail="Channel count does not match recording session"
            )

        record = create_eeg_record_document(
            session_id=session_id,
            samples=payload.samples,
            sampling_rate=payload.sampling_rate,
            channel_names=payload.channel_names,
            data_mode=payload.data_mode
        )

        result = eeg_records_collection.insert_one(record)
        record["_id"] = result.inserted_id

        logger.info("EEG record batch saved for session: %s", session_id)

        return {
            "message": "EEG record batch saved successfully",
            "record": serialize_eeg_record(record)
        }

    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except PyMongoError:
        logger.exception("Saving EEG record failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.get("/sessions/{session_id}/eeg-records")
def get_eeg_records(session_id: str):
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    try:
        session = sessions_collection.find_one(
            {"_id": ObjectId(session_id)}
        )

        if not session:
            raise HTTPException(status_code=404, detail="Recording session not found")

        records = eeg_records_collection.find(
            {"session_id": ObjectId(session_id)}
        ).sort("recorded_at", 1)

        record_list = [serialize_eeg_record(item) for item in records]

        return {
            "session_id": session_id,
            "total_batches": len(record_list),
            "total_samples": sum(item["sample_count"] for item in record_list),
            "records": record_list
        }

    except PyMongoError:
        logger.exception("Fetching EEG records failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.post("/sessions/{session_id}/psd")
def get_session_psd(session_id: str):
    """
    Computes rigorous Welch Power Spectral Density and EEG bandpowers (Delta, Theta, Alpha, Beta)
    from actual persisted session samples in MongoDB.
    Gamma band (>30 Hz) is explicitly marked unavailable due to BioAmp 29.5 Hz analog hardware filter.
    """
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    try:
        session = sessions_collection.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Recording session not found")

        records = list(eeg_records_collection.find(
            {"session_id": ObjectId(session_id)}
        ).sort("recorded_at", 1))

        if not records:
            if serial_service.is_recording and serial_service.active_session_id == session_id:
                live_dsp = serial_service.get_live_dsp_analysis()
                return {
                    "session_id": session_id,
                    "total_samples": live_dsp.get("sample_count", 0),
                    "sampling_rate": live_dsp.get("fs_measured", 256.0),
                    "band_analysis": live_dsp.get("band_analysis"),
                    "quality": live_dsp.get("quality"),
                    "is_live": True
                }
            raise HTTPException(status_code=404, detail="No EEG data recorded for this session yet")

        all_samples = []
        fs = 256.0
        for rec in records:
            fs = float(rec.get("sampling_rate", 256))
            for s in rec.get("samples", []):
                val = s[0] if isinstance(s, (list, tuple)) else s
                all_samples.append(float(val))

        if len(all_samples) < 32:
            raise HTTPException(status_code=400, detail=f"Insufficient samples for PSD analysis ({len(all_samples)} available; minimum 32 required)")

        band_analysis = dsp_service.compute_bandpowers(all_samples, fs=fs)
        quality = dsp_service.evaluate_signal_quality(all_samples, fs=fs)

        return {
            "session_id": session_id,
            "total_samples": len(all_samples),
            "sampling_rate": fs,
            "band_analysis": band_analysis,
            "quality": quality,
            "is_live": False
        }
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("Failed to compute PSD for session %s: %s", session_id, err)
        raise HTTPException(status_code=500, detail="Failed to compute spectral analysis")



@router.post("/sessions/{session_id}/analyze-quality")
def analyze_session_quality(session_id: str):
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    try:
        session = sessions_collection.find_one(
            {"_id": ObjectId(session_id)}
        )

        if not session:
            raise HTTPException(
                status_code=404,
                detail="Recording session not found"
            )

        if session.get("status") not in ["completed", "scheduled", "recording"]:
            raise HTTPException(
                status_code=409,
                detail="Only completed, scheduled, or recording sessions can be analysed"
            )

        # Transition session to completed if scheduled or recording
        if session.get("status") != "completed":
            now_ts = datetime.now(timezone.utc)
            sessions_collection.update_one(
                {"_id": ObjectId(session_id)},
                {"$set": {
                    "status": "completed",
                    "started_at": session.get("started_at") or now_ts,
                    "ended_at": now_ts,
                    "sample_count": session.get("sample_count") or 385
                }}
            )

        records = list(
            eeg_records_collection.find(
                {"session_id": ObjectId(session_id)}
            ).sort("recorded_at", 1)
        )

        if not records:
            raise HTTPException(
                status_code=404,
                detail="No EEG records found for this session"
            )

        sampling_rates = {record.get("sampling_rate") for record in records}
        channel_sets = {
            tuple(record.get("channel_names", []))
            for record in records
        }
        data_modes = {record.get("data_mode") for record in records}

        if len(sampling_rates) != 1 or len(channel_sets) != 1 or len(data_modes) != 1:
            raise HTTPException(
                status_code=400,
                detail="EEG batches contain inconsistent recording metadata"
            )

        sampling_rate = sampling_rates.pop()
        channel_names = list(channel_sets.pop())

        combined_samples = []
        for record in records:
            combined_samples.extend(record.get("samples", []))

        results = quality_analysis_service.analyze(
            combined_samples,
            sampling_rate
        )

        analysis_document = create_analysis_document(
            session_id=session_id,
            analysis_type="SIGNAL_QUALITY",
            model_name="RandomForest EEG Quality Model",
            results={
                **results,
                "channel_names": channel_names,
                "data_mode": data_modes.pop(),
                "total_batches": len(records),
                "total_samples": len(combined_samples)
            },
            confidence=results["average_confidence"],
            participant_id=str(session.get("participant_id")) if session.get("participant_id") else None
        )

        inserted = analysis_results_collection.insert_one(
            analysis_document
        )
        analysis_document["_id"] = inserted.inserted_id

        logger.info(
            "EEG quality analysis completed for session: %s",
            session_id
        )

        return {
            "message": "EEG quality analysis completed successfully",
            "analysis": serialize_analysis(analysis_document)
        }

    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except FileNotFoundError:
        logger.exception("EEG quality model file not found")
        raise HTTPException(
            status_code=503,
            detail="EEG quality model is unavailable"
        )
    except PyMongoError:
        logger.exception("EEG quality analysis database operation failed")
        raise HTTPException(
            status_code=500,
            detail="Database operation failed"
        )
    except Exception:
        logger.exception("EEG quality analysis failed")
        raise HTTPException(
            status_code=500,
            detail="EEG quality analysis failed"
        )


# -------------------- MOTOR IMAGERY REPLAY API --------------------

@router.post("/sessions/{session_id}/analyze-motor-imagery")
def analyze_motor_imagery(
    session_id: str,
    payload: MotorImageryRequest
):
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    try:
        session = sessions_collection.find_one(
            {"_id": ObjectId(session_id)}
        )

        if not session:
            raise HTTPException(
                status_code=404,
                detail="Recording session not found"
            )

        if session.get("status") not in ["completed", "scheduled", "recording"]:
            raise HTTPException(
                status_code=409,
                detail="Only completed, scheduled, or recording sessions can be analysed"
            )

        # Transition session to completed if scheduled or recording
        if session.get("status") != "completed":
            now_ts = datetime.now(timezone.utc)
            sessions_collection.update_one(
                {"_id": ObjectId(session_id)},
                {"$set": {
                    "status": "completed",
                    "started_at": session.get("started_at") or now_ts,
                    "ended_at": now_ts,
                    "sample_count": session.get("sample_count") or 385
                }}
            )

        if session.get("data_mode") != "REPLAY":
            raise HTTPException(
                status_code=400,
                detail="Motor imagery replay requires a REPLAY session"
            )

        if session.get("sampling_rate") != 128:
            raise HTTPException(
                status_code=400,
                detail="Replay session must use 128 Hz sampling rate"
            )

        if session.get("channel_count") != 64:
            raise HTTPException(
                status_code=400,
                detail="Replay session must contain 64 EEG channels"
            )

        samples = payload.samples
        channel_names = payload.channel_names or PHYSIONET_CHANNEL_NAMES

        if samples is None:
            # Sourced from persisted MongoDB EEG records for this session
            records = list(
                eeg_records_collection.find({"session_id": ObjectId(session_id)}).sort("recorded_at", 1)
            )
            if not records:
                raise HTTPException(
                    status_code=400,
                    detail="No EEG samples provided and no persisted EEG records found in session"
                )

            combined: list[list[float]] = []
            for r in records:
                combined.extend(r.get("samples", []))

            if len(combined) < 385:
                raise HTTPException(
                    status_code=400,
                    detail=f"Insufficient samples in session: expected 385 samples, found {len(combined)}"
                )

            samples = combined[:385]
            channel_names = records[0].get("channel_names", PHYSIONET_CHANNEL_NAMES)

        if len(samples) != 385:
            raise HTTPException(
                status_code=400,
                detail=f"Preprocessed epoch must contain exactly 385 samples (got {len(samples)})"
            )

        if len(channel_names) != 64:
            raise HTTPException(
                status_code=400,
                detail=f"Exactly 64 EEG channel names are required (got {len(channel_names)})"
            )

        result = motor_imagery_service.predict(
            samples=samples,
            sampling_rate=payload.sampling_rate,
            channel_names=channel_names,
            input_type="preprocessed_epoch"
        )

        import re
        instruction = payload.instruction
        ground_truth = payload.ground_truth or (
            "Left Hand" if instruction and "left" in instruction.lower() else "Right Hand" if instruction and "right" in instruction.lower() else "Unknown"
        )
        input_source = payload.input_source or "PhysioNet 64-Channel Dataset"
        trial_duration = payload.trial_duration_sec or 3.0

        is_match = None
        if instruction:
            is_match = bool(result["classification"].lower() in instruction.lower())

        is_accuracy_match = None
        if ground_truth:
            is_accuracy_match = bool(result["classification"].lower() in ground_truth.lower())

        subject_id = "S001"
        trial_index = 0
        if "PhysioNet" in input_source:
            sub_m = re.search(r"S\d{3}", input_source)
            if sub_m:
                subject_id = sub_m.group(0)
            tr_m = re.search(r"Trial #?(\d+)", input_source)
            if tr_m:
                trial_index = int(tr_m.group(1))

        part_id_str = str(session.get("participant_id")) if session.get("participant_id") else None
        part_code = session.get("participant_code") or "P-UNKNOWN"
        if not session.get("participant_code") and part_id_str and ObjectId.is_valid(part_id_str):
            p_doc = participants_collection.find_one({"_id": ObjectId(part_id_str)})
            if p_doc:
                part_code = p_doc.get("participant_code", part_code)

        doctor_identity = session.get("created_by") or session.get("assigned_doctor") or "Dr. Patel"

        analysis_document = create_analysis_document(
            session_id=session_id,
            analysis_type="MOTOR_IMAGERY",
            model_name=result["model_name"],
            results={
                **result,
                "participant_id": part_id_str,
                "participant_code": part_code,
                "doctor_identity": doctor_identity,
                "dataset_name": "PhysioNet EEG Motor Movement/Imagery Dataset" if "PhysioNet" in input_source else "Custom Upload",
                "subject_id": subject_id,
                "trial_index": trial_index,
                "epoch_dimensions": [385, 64],
                "input_type": "preprocessed_epoch",
                "data_mode": "REPLAY",
                "instruction": instruction,
                "input_source": input_source,
                "trial_duration_sec": trial_duration,
                "is_match": is_match,
                "is_accuracy_match": is_accuracy_match,
                "ground_truth": ground_truth,
                "evaluation_status": "EVALUATED" if ground_truth else "NOT_EVALUATED"
            },
            confidence=result["confidence"],
            participant_id=part_id_str
        )

        inserted = analysis_results_collection.insert_one(
            analysis_document
        )
        analysis_document["_id"] = inserted.inserted_id

        logger.info(
            "Motor imagery prediction saved for session: %s (Predicted: %s, Conf: %.2f)",
            session_id, result["classification"], result["confidence"]
        )

        return {
            "message": "Motor imagery prediction completed successfully",
            "analysis": serialize_analysis(analysis_document)
        }

    except HTTPException:
        raise
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error))
    except FileNotFoundError:
        logger.exception("Motor imagery model file not found")
        raise HTTPException(
            status_code=503,
            detail="Motor imagery model is unavailable"
        )
    except PyMongoError:
        logger.exception("Motor imagery database operation failed")
        raise HTTPException(
            status_code=500,
            detail="Database operation failed"
        )
    except Exception:
        logger.exception("Motor imagery analysis failed")
        raise HTTPException(
            status_code=500,
            detail="Motor imagery analysis failed"
        )


@router.post("/sessions/{session_id}/replay-physionet")
def inject_physionet_replay_data(
    session_id: str,
    payload: PhysioNetReplayRequest = PhysioNetReplayRequest()
):
    """
    Injects a verified 64-channel PhysioNet Motor Movement/Imagery trial epoch
    into a REPLAY session to facilitate end-to-end motor imagery BCI trial evaluation.
    """
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    try:
        session = sessions_collection.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Recording session not found")

        if session.get("data_mode") != "REPLAY":
            raise HTTPException(status_code=400, detail="PhysioNet replay requires a REPLAY session")

        # Load real PhysioNet epoch from disk
        physio_dir = PROJECT_ROOT / "data" / "processed" / "physionet"
        file_path = physio_dir / f"{payload.subject_id}.npz"
        if not file_path.exists():
            file_path = physio_dir / "S001.npz"
            if not file_path.exists():
                raise HTTPException(status_code=404, detail="PhysioNet processed dataset files not found on disk")

        with np.load(file_path) as data:
            X = data["X"]
            y = data["y"]

        idx = 0
        if payload.trial_index is not None and 0 <= payload.trial_index < len(y):
            idx = payload.trial_index
        elif payload.movement:
            target_code = 1 if payload.movement.lower().startswith("left") else 2
            matching = np.where(y == target_code)[0]
            if len(matching) > 0:
                idx = int(matching[0])

        epoch = X[idx].T  # shape (385, 64)
        true_label = "Left Hand" if y[idx] == 1 else ("Right Hand" if y[idx] == 2 else "Rest")
        instruction = payload.instruction or f"Imagine {true_label}"

        record_doc = create_eeg_record_document(
            session_id=session_id,
            samples=epoch.tolist(),
            sampling_rate=128,
            channel_names=PHYSIONET_CHANNEL_NAMES,
            data_mode="REPLAY"
        )
        inserted = eeg_records_collection.insert_one(record_doc)
        record_doc["_id"] = inserted.inserted_id

        # Attach event marker to session
        event = {
            "id": f"evt_{int(datetime.now(timezone.utc).timestamp()*1000)}",
            "label": instruction,
            "relative_time_sec": 0.0,
            "notes": f"PhysioNet {payload.subject_id} Trial #{idx} ({true_label})",
            "created_at": datetime.now(timezone.utc)
        }
        sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {"$push": {"events": event}}
        )

        return {
            "message": "PhysioNet replay trial injected successfully",
            "session_id": session_id,
            "subject_id": payload.subject_id,
            "trial_index": int(idx),
            "sample_count": 385,
            "channel_count": 64,
            "true_label": true_label,
            "instruction": instruction
        }
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("PhysioNet replay trial injection failed: %s", err)
        raise HTTPException(status_code=500, detail="Failed to inject PhysioNet trial data")


@router.get("/motor-imagery/history")
def get_motor_imagery_history(limit: int = 50):
    """Retrieves persisted motor imagery BCI trials from MongoDB."""
    try:
        analyses = list(
            analysis_results_collection.find({"analysis_type": "MOTOR_IMAGERY"})
            .sort("created_at", -1)
            .limit(limit)
        )
        trials = []
        for a in analyses:
            sess_id = a.get("session_id")
            session = None
            if sess_id:
                if ObjectId.is_valid(str(sess_id)):
                    session = sessions_collection.find_one({"_id": ObjectId(str(sess_id))})
                else:
                    session = sessions_collection.find_one({"_id": sess_id})

            res = a.get("results", {})
            part_code = res.get("participant_code") or "P-UNASSIGNED"
            sess_code = res.get("session_code") or "SES-UNKNOWN"

            if session:
                sess_code = session.get("session_code", str(session["_id"]))
                part_id = session.get("participant_id")
                if part_id and ObjectId.is_valid(str(part_id)):
                    part = participants_collection.find_one({"_id": ObjectId(str(part_id))})
                    if part:
                        part_code = part.get("participant_code", part_code)
            elif not res.get("participant_code") and a.get("participant_id"):
                part_id = a.get("participant_id")
                if part_id and ObjectId.is_valid(str(part_id)):
                    part = participants_collection.find_one({"_id": ObjectId(str(part_id))})
                    if part:
                        part_code = part.get("participant_code", part_code)

            trials.append({
                "id": str(a.get("_id", "")),
                "session_id": str(sess_id) if sess_id else "",
                "session_code": sess_code,
                "participant_code": part_code,
                "timestamp": a.get("created_at").isoformat() if a.get("created_at") else datetime.now(timezone.utc).isoformat(),
                "instruction": res.get("instruction") or "Left Hand Imagery",
                "input_source": res.get("input_source") or "PhysioNet 64-Channel Epoch",
                "duration_seconds": res.get("trial_duration_sec") or 3.0,
                "predicted_movement": res.get("classification") or "Left",
                "confidence": a.get("confidence") if a.get("confidence") is not None else res.get("confidence", 0.0),
                "probabilities": res.get("probabilities", {}),
                "model_name": a.get("model_name", "CSP + LDA"),
                "is_match": res.get("is_match"),
                "ground_truth": res.get("ground_truth") or ("Left Hand" if "left" in (res.get("instruction") or "").lower() else "Right Hand"),
                "is_accuracy_match": res.get("is_accuracy_match"),
                "is_experimental": True
            })
        return {"total": len(trials), "trials": trials}
    except Exception as err:
        logger.exception("Fetching motor imagery history failed: %s", err)
        raise HTTPException(status_code=500, detail="Failed to fetch trial history")


@router.get("/emotion/history")
def get_emotion_history(limit: int = 25):
    """Retrieves persisted DEAP emotion analyses from MongoDB."""
    try:
        analyses = list(
            analysis_results_collection.find({"analysis_type": "VALENCE_AROUSAL"})
            .sort("created_at", -1)
            .limit(limit)
        )
        history = []
        for a in analyses:
            sess_id = a.get("session_id")
            session = sessions_collection.find_one({"_id": sess_id}) if sess_id else None
            part_code = "P-UNASSIGNED"
            sess_code = "SES-UNKNOWN"
            if session:
                sess_code = session.get("session_code", str(session["_id"]))
                part_id = session.get("participant_id")
                if part_id and ObjectId.is_valid(part_id):
                    part = participants_collection.find_one({"_id": ObjectId(part_id)})
                    if part:
                        part_code = part.get("participant_code", "P-UNKNOWN")
            res = a.get("results", {})
            history.append({
                "id": str(a.get("_id", "")),
                "session_id": str(sess_id) if sess_id else "",
                "session_code": sess_code,
                "participant_code": part_code,
                "timestamp": a.get("created_at").isoformat() if a.get("created_at") else datetime.now(timezone.utc).isoformat(),
                "quadrant": res.get("quadrant", "HVLA"),
                "affect_label": res.get("affect_label", ""),
                "confidence": a.get("confidence", 0.0),
                "probabilities": res.get("probabilities", {}),
                "valence": res.get("valence", {}),
                "arousal": res.get("arousal", {}),
                "model_name": a.get("model_name", "DEAP Ridge Regression (32 Ch @ 128 Hz)"),
            })
        return {"total": len(history), "history": history}
    except Exception as err:
        logger.exception("Failed to fetch emotion history: %s", err)
        return {"total": 0, "history": []}


@router.get("/motor-imagery/subjects")
def get_motor_imagery_subjects():
    """Lists all available PhysioNet subject IDs found on disk."""
    try:
        physio_dir = PROJECT_ROOT / "data" / "processed" / "physionet"
        if not physio_dir.exists():
            return {"total": 0, "subjects": []}

        subjects = []
        for p in physio_dir.glob("S*.npz"):
            stem = p.stem
            subjects.append(stem)

        # Sort naturally by subject index (S001 -> 1, S002 -> 2, etc.)
        def sort_key(s):
            try:
                return int(s[1:])
            except ValueError:
                return 9999

        subjects.sort(key=sort_key)
        return {
            "total": len(subjects),
            "subjects": subjects
        }
    except Exception as err:
        logger.exception("Failed to list PhysioNet subjects: %s", err)
        return {"total": 0, "subjects": []}


@router.get("/motor-imagery/dataset-trials")
def get_motor_imagery_dataset_trials(subject_id: str = "S001"):
    """Lists real labelled motor imagery epochs from PhysioNet dataset on disk."""
    try:
        physio_dir = PROJECT_ROOT / "data" / "processed" / "physionet"
        file_path = physio_dir / f"{subject_id}.npz"
        if not file_path.exists():
            raise HTTPException(
                status_code=404,
                detail=f"PhysioNet subject file '{subject_id}.npz' was not found on disk"
            )

        with np.load(file_path) as data:
            y = data["y"]

        trials = []
        for i, label in enumerate(y):
            lbl = int(label)
            if lbl in (1, 2):  # 1: Left Hand, 2: Right Hand
                trials.append({
                    "trial_index": i,
                    "movement": "Left Hand" if lbl == 1 else "Right Hand",
                    "label_code": lbl
                })
        return {
            "subject_id": subject_id,
            "total_trials": len(trials),
            "trials": trials
        }
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("Failed to load dataset trials for %s: %s", subject_id, err)
        raise HTTPException(status_code=500, detail=f"Failed to load dataset trials for {subject_id}")


@router.get("/motor-imagery/sample-epoch")
def get_motor_imagery_sample_epoch(subject_id: str = "S001", trial_index: int = 0, movement: Optional[str] = None):
    """Loads a real 64-channel 385-sample epoch from PhysioNet dataset on disk."""
    try:
        physio_dir = PROJECT_ROOT / "data" / "processed" / "physionet"
        file_path = physio_dir / f"{subject_id}.npz"
        if not file_path.exists():
            raise HTTPException(status_code=404, detail=f"PhysioNet dataset file '{subject_id}.npz' not found on disk")

        with np.load(file_path) as data:
            X = data["X"]
            y = data["y"]

        if trial_index < 0 or trial_index >= len(y):
            raise HTTPException(status_code=400, detail=f"Trial index {trial_index} out of range (0-{len(y)-1})")

        idx = trial_index
        # Optional helper: if movement requested and trial_index is not already of that movement
        if movement:
            target_code = 1 if movement.lower().startswith("left") else 2
            matching = np.where(y == target_code)[0]
            if len(matching) > 0 and y[idx] != target_code:
                idx = int(matching[trial_index % len(matching)])

        epoch = X[idx].T  # shape (385, 64)
        true_label = "Left" if y[idx] == 1 else ("Right" if y[idx] == 2 else "Rest")
        movement_label = "Left Hand" if y[idx] == 1 else ("Right Hand" if y[idx] == 2 else "Rest")

        return {
            "subject_id": subject_id,
            "trial_index": int(idx),
            "samples": epoch.tolist(),
            "sampling_rate": 128,
            "channel_count": 64,
            "channel_names": PHYSIONET_CHANNEL_NAMES,
            "true_label": true_label,
            "movement": movement_label,
            "shape": list(epoch.shape),
            "summary": {
                "min_uv": round(float(np.min(epoch)), 2),
                "max_uv": round(float(np.max(epoch)), 2),
                "mean_uv": round(float(np.mean(epoch)), 2),
                "std_uv": round(float(np.std(epoch)), 2),
            }
        }
    except HTTPException:
        raise
    except Exception as err:
        logger.exception("Failed to get sample epoch: %s", err)
        raise HTTPException(status_code=500, detail="Failed to load sample epoch from dataset")


@router.post("/motor-imagery/upload-epoch")
async def upload_motor_imagery_epoch(request: Request):
    """
    Validates an uploaded 64-channel preprocessed EEG epoch (.npz binary or .json matrix).
    Ensures exact 385 samples × 64 channels shape and finite numeric values.
    Supports both multipart file upload and JSON body payloads.
    """
    samples_matrix = None
    source_name = "Uploaded Epoch"
    content_type = request.headers.get("content-type", "")

    if "multipart/form-data" in content_type:
        form = await request.form()
        file = form.get("file")
        if not file:
            raise HTTPException(status_code=400, detail="No file uploaded in form field 'file'")

        source_name = getattr(file, "filename", "Uploaded File") or "Uploaded File"
        content = await file.read()
        if source_name.endswith(".npz"):
            try:
                with np.load(io.BytesIO(content)) as data:
                    if "X" in data:
                        arr = data["X"]
                        if arr.ndim == 3 and arr.shape[1] == 64 and arr.shape[2] == 385:
                            samples_matrix = arr[0].T.tolist()
                        elif arr.ndim == 2 and arr.shape == (385, 64):
                            samples_matrix = arr.tolist()
                        elif arr.ndim == 2 and arr.shape == (64, 385):
                            samples_matrix = arr.T.tolist()
                    elif "samples" in data:
                        arr = data["samples"]
                        if arr.shape == (385, 64):
                            samples_matrix = arr.tolist()
            except Exception as err:
                raise HTTPException(status_code=400, detail=f"Failed to parse .npz file: {err}")
        else:
            try:
                parsed = json.loads(content.decode("utf-8"))
                if isinstance(parsed, list):
                    samples_matrix = parsed
                elif isinstance(parsed, dict) and "samples" in parsed:
                    samples_matrix = parsed["samples"]
            except Exception as err:
                raise HTTPException(status_code=400, detail=f"Failed to parse JSON file: {err}")
    else:
        try:
            body = await request.json()
            if isinstance(body, list):
                samples_matrix = body
            elif isinstance(body, dict):
                samples_matrix = body.get("samples")
                source_name = body.get("source_name", "Uploaded JSON Epoch")
        except Exception as err:
            raise HTTPException(status_code=400, detail=f"Invalid JSON payload: {err}")

    if not samples_matrix:
        raise HTTPException(status_code=400, detail="No valid EEG samples provided in upload")

    try:
        data = np.asarray(samples_matrix, dtype=np.float32)
    except Exception as conv_err:
        raise HTTPException(status_code=400, detail=f"Cannot parse samples as numeric array: {conv_err}")

    if data.ndim != 2 or data.shape != (385, 64):
        raise HTTPException(
            status_code=400,
            detail=f"Invalid matrix shape: expected exactly 385 samples × 64 channels (got {data.shape[0]} × {data.shape[1] if data.ndim > 1 else 1})"
        )

    if not np.isfinite(data).all():
        raise HTTPException(status_code=400, detail="Matrix contains NaN or non-finite values")

    return {
        "valid": True,
        "source_name": source_name,
        "shape": [385, 64],
        "sampling_rate": 128,
        "channel_count": 64,
        "samples": data.tolist(),
        "summary": {
            "min_uv": round(float(np.min(data)), 2),
            "max_uv": round(float(np.max(data)), 2),
            "mean_uv": round(float(np.mean(data)), 2),
            "std_uv": round(float(np.std(data)), 2),
        }
    }


# -------------------- PATH B: EMOTION & GROUND TRUTH APIs --------------------

@router.post("/sessions/{session_id}/ground-truth")
def submit_session_ground_truth(session_id: str, payload: GroundTruthSubmit):
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    try:
        session = sessions_collection.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Recording session not found")

        # Determine discrete affect categories based on official midpoint formulation
        v_discrete = "HIGH" if payload.valence > 5.0 else ("LOW" if payload.valence < 5.0 else "NEUTRAL")
        a_discrete = "HIGH" if payload.arousal > 5.0 else ("LOW" if payload.arousal < 5.0 else "NEUTRAL")
        quadrant = f"{'H' if payload.valence >= 5.0 else 'L'}V{'H' if payload.arousal >= 5.0 else 'L'}A"

        now = datetime.now(timezone.utc)
        gt_doc = {
            "valence": float(payload.valence),
            "arousal": float(payload.arousal),
            "dominance": float(payload.dominance) if payload.dominance is not None else None,
            "liking": float(payload.liking) if payload.liking is not None else None,
            "valence_discrete": v_discrete,
            "arousal_discrete": a_discrete,
            "quadrant": quadrant,
            "assessment_method": payload.assessment_method,
            "submitted_by": payload.submitted_by.strip(),
            "notes": payload.notes,
            "submitted_at": now
        }

        sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"ground_truth": gt_doc, "updated_at": now}}
        )

        # Audit log
        try:
            audit_entry = create_audit_log_document(
                user_id=str(session["created_by"]) if ObjectId.is_valid(str(session.get("created_by"))) else str(ObjectId()),
                action="UPDATE",
                resource_type="recording_session",
                resource_id=session_id,
                details={"action_name": "GROUND_TRUTH_SUBMIT", "submitted_by": payload.submitted_by}
            )
            audit_logs_collection.insert_one(audit_entry)
        except Exception as audit_err:
            logger.warning("Audit log write skipped: %s", audit_err)

        logger.info("Ground truth submitted for session: %s", session_id)
        return {
            "message": "Ground truth submitted successfully",
            "session_id": session_id,
            "ground_truth": gt_doc
        }

    except HTTPException:
        raise
    except PyMongoError:
        logger.exception("Submitting ground truth failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.post("/sessions/{session_id}/analyze-emotion")
def analyze_session_emotion(session_id: str, payload: EmotionAnalysisRequest = EmotionAnalysisRequest()):
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    # RBAC verification: Doctor, Clinician, Researcher, Admin
    allowed_roles = {"doctor", "clinician", "researcher", "admin"}
    if payload.role.lower() not in allowed_roles:
        raise HTTPException(
            status_code=403,
            detail=f"Role '{payload.role}' does not have permission to execute emotion analysis"
        )

    try:
        session = sessions_collection.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Recording session not found")

        if session.get("status") != "completed":
            raise HTTPException(status_code=409, detail="Only completed sessions can be analysed")

        records = list(
            eeg_records_collection.find({"session_id": ObjectId(session_id)}).sort("recorded_at", 1)
        )

        if not records:
            raise HTTPException(status_code=404, detail="No EEG records found for this session")

        sampling_rate = records[0].get("sampling_rate", 128)
        channel_names = records[0].get("channel_names", [])

        combined_samples = []
        for r in records:
            combined_samples.extend(r.get("samples", []))

        # Check for participant calibration if requested
        calib_profile = None
        if payload.use_calibration and session.get("participant_id"):
            part = participants_collection.find_one({"_id": ObjectId(session["participant_id"])})
            if part:
                profiles = part.get("calibration_profiles", [])
                active_profiles = [p for p in profiles if p.get("is_active")]
                if active_profiles:
                    calib_profile = active_profiles[-1]

        # Execute prediction
        result = emotion_service.predict(
            samples=combined_samples,
            sampling_rate=sampling_rate,
            channel_names=channel_names,
            calibration_profile=calib_profile
        )

        # Ground truth comparison if present
        gt = session.get("ground_truth")
        evaluation = {
            "evaluation_status": "NOT_EVALUATED" if not gt else "EVALUATED",
            "ground_truth_present": gt is not None
        }

        if gt:
            v_err = abs(result["valence"]["continuous_score"] - gt["valence"])
            a_err = abs(result["arousal"]["continuous_score"] - gt["arousal"])
            v_match = (result["valence"]["classification"] == gt.get("valence_discrete"))
            a_match = (result["arousal"]["classification"] == gt.get("arousal_discrete"))
            q_match = (result["quadrant"] == gt.get("quadrant"))

            evaluation.update({
                "actual_valence": gt["valence"],
                "actual_arousal": gt["arousal"],
                "actual_quadrant": gt.get("quadrant"),
                "valence_absolute_error": round(v_err, 3),
                "arousal_absolute_error": round(a_err, 3),
                "valence_match": v_match,
                "arousal_match": a_match,
                "quadrant_match": q_match
            })

        analysis_doc = create_analysis_document(
            session_id=session_id,
            analysis_type="VALENCE_AROUSAL",
            model_name=result["model_name"],
            results={
                **result,
                "evaluation": evaluation,
                "total_samples": len(combined_samples),
                "total_batches": len(records),
                "requested_by": payload.requested_by,
                "requested_role": payload.role
            },
            confidence=float((result["valence"]["confidence"] + result["arousal"]["confidence"]) / 2.0),
            participant_id=str(session.get("participant_id")) if session.get("participant_id") else None
        )

        inserted = analysis_results_collection.insert_one(analysis_doc)
        analysis_doc["_id"] = inserted.inserted_id

        logger.info("Emotion analysis completed for session: %s by %s (%s)", session_id, payload.requested_by, payload.role)

        return {
            "message": "Emotion analysis completed successfully",
            "analysis": serialize_analysis(analysis_doc)
        }

    except HTTPException:
        raise
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except PyMongoError:
        logger.exception("Emotion analysis database error")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.get("/sessions/{session_id}/evaluation")
def get_session_evaluation(session_id: str):
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    try:
        session = sessions_collection.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Recording session not found")

        analysis = analysis_results_collection.find_one(
            {"session_id": ObjectId(session_id), "analysis_type": "VALENCE_AROUSAL"},
            sort=[("created_at", -1)]
        )

        gt = session.get("ground_truth")

        if not analysis:
            return {
                "session_id": session_id,
                "status": "AWAITING_ANALYSIS",
                "ground_truth_present": gt is not None,
                "ground_truth": gt,
                "analysis": None
            }

        return {
            "session_id": session_id,
            "status": "EVALUATED" if gt else "AWAITING_GROUND_TRUTH",
            "ground_truth_present": gt is not None,
            "ground_truth": gt,
            "prediction": {
                "valence": analysis.get("results", {}).get("valence"),
                "arousal": analysis.get("results", {}).get("arousal"),
                "quadrant": analysis.get("results", {}).get("quadrant"),
                "affect_label": analysis.get("results", {}).get("affect_label"),
                "confidence": analysis.get("confidence")
            },
            "evaluation_metrics": analysis.get("results", {}).get("evaluation", {}),
            "analyzed_at": analysis.get("created_at")
        }

    except PyMongoError:
        logger.exception("Fetching evaluation failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.post("/participants/{participant_id}/calibrate-emotion")
def calibrate_participant_emotion(participant_id: str, payload: EmotionCalibrationRequest):
    if not ObjectId.is_valid(participant_id):
        raise HTTPException(status_code=400, detail="Invalid participant ID")

    # RBAC check: Clinician, Doctor, Admin can calibrate
    allowed_roles = {"clinician", "doctor", "admin"}
    if payload.role.lower() not in allowed_roles:
        raise HTTPException(
            status_code=403,
            detail=f"Role '{payload.role}' does not have permission to execute participant calibration"
        )

    try:
        participant = participants_collection.find_one({"_id": ObjectId(participant_id)})
        if not participant:
            raise HTTPException(status_code=404, detail="Participant not found")

        profiles = participant.get("calibration_profiles", [])
        current_version = len(profiles)

        resting_profile = None
        if payload.resting_session_id and ObjectId.is_valid(payload.resting_session_id):
            records = list(eeg_records_collection.find({"session_id": ObjectId(payload.resting_session_id)}))
            if records:
                all_s = []
                for r in records:
                    all_s.extend(r.get("samples", []))
                if all_s:
                    resting_profile = calibration_service.compute_resting_baseline_profile(all_s, records[0].get("sampling_rate", 128))

        # Retrieve any labelled calibration trials
        calibration_trials = []
        for s_id in payload.calibration_session_ids:
            if ObjectId.is_valid(s_id):
                s_doc = sessions_collection.find_one({"_id": ObjectId(s_id)})
                a_doc = analysis_results_collection.find_one({"session_id": ObjectId(s_id), "analysis_type": "VALENCE_AROUSAL"})
                if s_doc and a_doc and s_doc.get("ground_truth"):
                    gt = s_doc["ground_truth"]
                    res = a_doc.get("results", {})
                    calibration_trials.append({
                        "session_id": s_id,
                        "actual_valence": gt.get("valence"),
                        "predicted_valence": res.get("valence", {}).get("continuous_score"),
                        "actual_arousal": gt.get("arousal"),
                        "predicted_arousal": res.get("arousal", {}).get("continuous_score")
                    })

        new_profile = calibration_service.create_emotion_calibration_profile(
            participant_id=participant_id,
            current_version=current_version,
            resting_session_id=payload.resting_session_id,
            resting_profile=resting_profile,
            calibration_trials=calibration_trials
        )

        # Deactivate older profiles and push new profile
        participants_collection.update_one(
            {"_id": ObjectId(participant_id)},
            {
                "$set": {"calibration_profiles.$[].is_active": False},
                "$push": {"calibration_profiles": new_profile}
            }
        )

        logger.info("Participant %s calibrated to profile v%d by %s", participant_id, new_profile["version"], payload.requested_by)

        return {
            "message": "Participant calibrated successfully",
            "calibration_profile": new_profile
        }

    except HTTPException:
        raise
    except ValueError as val_err:
        raise HTTPException(status_code=400, detail=str(val_err))
    except PyMongoError:
        logger.exception("Participant calibration failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.get("/participants/{participant_id}/calibration")
def get_participant_calibration(participant_id: str):
    if not ObjectId.is_valid(participant_id):
        raise HTTPException(status_code=400, detail="Invalid participant ID")

    try:
        participant = participants_collection.find_one({"_id": ObjectId(participant_id)})
        if not participant:
            raise HTTPException(status_code=404, detail="Participant not found")

        profiles = participant.get("calibration_profiles", [])
        active_profile = next((p for p in profiles if p.get("is_active")), None)

        return {
            "participant_id": participant_id,
            "total_versions": len(profiles),
            "active_profile": active_profile,
            "history": profiles
        }

    except PyMongoError:
        logger.exception("Fetching calibration profiles failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


@router.post("/sessions/{session_id}/replay-deap")
def inject_deap_replay_data(session_id: str, subject: str = "s29", trial_index: int = 0):
    """
    BCI Replay Utility: Injects a genuine 32-channel DEAP laboratory trial
    (8,064 samples @ 128 Hz with pre-stimulus baseline and empirical ground truth)
    into a REPLAY session to facilitate end-to-end evaluation.
    """
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    try:
        session = sessions_collection.find_one({"_id": ObjectId(session_id)})
        if not session:
            raise HTTPException(status_code=404, detail="Recording session not found")

        if session.get("data_mode") != "REPLAY":
            raise HTTPException(status_code=400, detail="DEAP replay requires a REPLAY session")

        from ml.datasets.deap.deap_loader import (
            DEAP_EEG_CHANNELS,
            load_raw_subject_dat,
            NUM_TRIALS_PER_SUBJECT
        )

        dat_path = PROJECT_ROOT / "data" / "raw" / "deap" / f"{subject}.dat"
        safe_trial_idx = max(0, min(trial_index, NUM_TRIALS_PER_SUBJECT - 1))

        if dat_path.exists():
            raw_dict = load_raw_subject_dat(dat_path)
            # Slices 32 EEG channels (Channels 0 to 31), shape: (32, 8064)
            eeg_trial = raw_dict["data"][safe_trial_idx, :32, :]
            # Transpose to (samples, channels) = (8064, 32)
            test_samples = eeg_trial.T.tolist()

            raw_labels = raw_dict["labels"][safe_trial_idx]
            v_val = float(raw_labels[0])
            a_val = float(raw_labels[1])
            quadrant = f"{'H' if v_val >= 5.0 else 'L'}V{'H' if a_val >= 5.0 else 'L'}A"

            gt_doc = {
                "valence": round(v_val, 2),
                "arousal": round(a_val, 2),
                "valence_discrete": "HIGH" if v_val >= 5.0 else "LOW",
                "arousal_discrete": "HIGH" if a_val >= 5.0 else "LOW",
                "quadrant": quadrant,
                "assessment_method": "DEAP_SELF_ASSESSMENT_MANIKIN",
                "subject_id": subject,
                "trial_index": safe_trial_idx,
                "submitted_by": "deap_benchmark_replay",
                "submitted_at": datetime.now(timezone.utc)
            }
        else:
            # Fallback mock trial if raw dataset is absent
            np.random.seed(42 + safe_trial_idx)
            test_samples = (np.random.randn(8064, 32) * 5.0).tolist()
            gt_doc = {
                "valence": 5.0,
                "arousal": 5.0,
                "valence_discrete": "NEUTRAL",
                "arousal_discrete": "NEUTRAL",
                "quadrant": "HVHA",
                "assessment_method": "DEAP_MOCK_FALLBACK",
                "subject_id": "mock",
                "trial_index": safe_trial_idx,
                "submitted_by": "deap_benchmark_fallback",
                "submitted_at": datetime.now(timezone.utc)
            }

        # Insert batches adhering to MAX_SAMPLES_PER_BATCH (1000)
        chunk_size = 512
        for i in range(0, len(test_samples), chunk_size):
            chunk = test_samples[i:i + chunk_size]
            record_doc = create_eeg_record_document(
                session_id=session_id,
                samples=chunk,
                sampling_rate=128,
                channel_names=DEAP_EEG_CHANNELS,
                data_mode="REPLAY"
            )
            eeg_records_collection.insert_one(record_doc)

        # Update session ground truth
        sessions_collection.update_one(
            {"_id": ObjectId(session_id)},
            {"$set": {"ground_truth": gt_doc}}
        )

        return {
            "message": f"DEAP replay trial ({subject} trial {safe_trial_idx}) injected successfully",
            "session_id": session_id,
            "subject": subject,
            "trial_index": safe_trial_idx,
            "sample_count": len(test_samples),
            "channel_count": 32,
            "ground_truth": gt_doc
        }

    except HTTPException:
        raise
    except PyMongoError:
        logger.exception("Replay trial injection failed")
        raise HTTPException(status_code=500, detail="Database operation failed")


# -------------------- REPORT & DATASET EXPORT APIs --------------------

@router.get("/sessions/{session_id}/report/pdf")
def download_session_pdf(session_id: str):
    """Generates and streams a 2-page publication/clinical style vector PDF report."""
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = sessions_collection.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Recording session not found")

    participant = None
    if ObjectId.is_valid(session.get("participant_id", "")):
        participant = participants_collection.find_one({"_id": ObjectId(session["participant_id"])})

    records = list(eeg_records_collection.find({"session_id": ObjectId(session_id)}).sort("recorded_at", 1))
    samples = []
    fs = float(session.get("sampling_rate") or 256.0)
    for r in records:
        for s in r.get("samples", []):
            val = s[0] if isinstance(s, (list, tuple)) else s
            samples.append(float(val))

    pdf_bytes = pdf_report_service.generate_session_pdf(
        session=session,
        participant=participant,
        samples=samples,
        fs=fs,
        events=session.get("events", []),
        notes=session.get("notes")
    )

    filename = f"NeuroCare_Report_{session.get('session_code', session_id)}.pdf"
    return Response(
        content=pdf_bytes,
        media_type="application/pdf",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.get("/sessions/{session_id}/export/csv")
def export_session_csv(session_id: str):
    """Exports raw EEG samples as timestamped microvolt CSV with experimental event markers."""
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = sessions_collection.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Recording session not found")

    participant = None
    if ObjectId.is_valid(session.get("participant_id", "")):
        participant = participants_collection.find_one({"_id": ObjectId(session["participant_id"])})

    part_code = participant.get("participant_code") if participant else session.get("participant_id")
    records = list(eeg_records_collection.find({"session_id": ObjectId(session_id)}).sort("recorded_at", 1))

    fs = float(session.get("sampling_rate") or 256.0)
    dt_ms = 1000.0 / fs if fs > 0 else 3.90625

    events = session.get("events", [])
    event_map = {}
    for ev in events:
        rel_s = ev.get("relative_time_sec", 0.0)
        idx = int(round(rel_s * fs))
        event_map[idx] = ev.get("label", "")

    output = io.StringIO()
    writer = csv.writer(output)

    writer.writerow(["# NeuroCare AI Raw EEG Export"])
    writer.writerow([f"# Session Code: {session.get('session_code')}"])
    writer.writerow([f"# Participant Code: {part_code}"])
    writer.writerow([f"# Protocol: {session.get('protocol_name')}"])
    writer.writerow([f"# Sampling Rate: {fs} Hz"])
    writer.writerow([f"# Channel: EEG_A0 (BioAmp EXG Pill)"])
    writer.writerow([f"# Data Mode: {session.get('data_mode')}"])
    writer.writerow([f"# Recorded At: {session.get('started_at') or session.get('created_at')}"])
    writer.writerow(["# Disclaimer: Research prototype only. Nominal calibration unverified. 0.5-29.5 Hz analog bandpass."])
    writer.writerow(["index", "timestamp_ms", "voltage_uV", "event_marker"])

    curr_idx = 0
    t_start = 0.0
    for r in records:
        for s in r.get("samples", []):
            val = s[0] if isinstance(s, (list, tuple)) else s
            t_ms = round(t_start + (curr_idx * dt_ms), 2)
            ev_label = event_map.get(curr_idx, "")
            writer.writerow([curr_idx, t_ms, f"{float(val):.2f}", ev_label])
            curr_idx += 1

    csv_content = output.getvalue()
    output.close()

    filename = f"NeuroCare_{session.get('session_code', session_id)}_raw.csv"
    return Response(
        content=csv_content,
        media_type="text/csv",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.get("/sessions/{session_id}/export/json")
def export_session_json(session_id: str):
    """Exports structured session metadata, events, and quality diagnostic summaries as clean JSON."""
    if not ObjectId.is_valid(session_id):
        raise HTTPException(status_code=400, detail="Invalid session ID")

    session = sessions_collection.find_one({"_id": ObjectId(session_id)})
    if not session:
        raise HTTPException(status_code=404, detail="Recording session not found")

    participant = None
    if ObjectId.is_valid(session.get("participant_id", "")):
        participant = participants_collection.find_one({"_id": ObjectId(session["participant_id"])})

    records_count = eeg_records_collection.count_documents({"session_id": ObjectId(session_id)})

    export_data = {
        "export_timestamp": datetime.now(timezone.utc).isoformat(),
        "system": "NeuroCare AI Research Platform",
        "session": serialize_session(session),
        "participant": serialize_participant(participant) if participant else None,
        "eeg_data_summary": {
            "total_batches": records_count,
            "estimated_samples": records_count * 256,
            "channel": "EEG_A0",
            "sampling_rate_nominal_hz": session.get("sampling_rate", 256)
        },
        "disclaimer": "Experimental prototype for research and education. Not a medical diagnostic device."
    }

    json_str = json.dumps(export_data, default=str, indent=2)
    filename = f"NeuroCare_{session.get('session_code', session_id)}_metadata.json"
    return Response(
        content=json_str,
        media_type="application/json",
        headers={
            "Content-Disposition": f'attachment; filename="{filename}"'
        }
    )


@router.post("/datasets/export")
def export_ml_dataset(payload: DatasetExportRequest):
    """
    Groups recording sessions by participant to prevent cross-subject data leakage,
    then partitions sessions into train and test cohorts for reproducible ML evaluation.
    """
    try:
        query = {"status": "completed"}
        if payload.session_ids:
            query["_id"] = {"$in": [ObjectId(s_id) for s_id in payload.session_ids if ObjectId.is_valid(s_id)]}

        sessions = list(sessions_collection.find(query))
        if not sessions:
            raise HTTPException(status_code=404, detail="No completed sessions available for dataset export")

        participant_groups: Dict[str, List[Dict[str, Any]]] = {}
        for s in sessions:
            pid = str(s.get("participant_id", "unknown"))
            participant_groups.setdefault(pid, []).append(s)

        pids = list(participant_groups.keys())
        np.random.seed(42)
        np.random.shuffle(pids)

        split_idx = max(1, int(len(pids) * payload.train_split_ratio))
        train_pids = set(pids[:split_idx])
        test_pids = set(pids[split_idx:]) if split_idx < len(pids) else set(pids[:1])

        train_sessions = []
        test_sessions = []

        for pid, s_list in participant_groups.items():
            for s in s_list:
                s_info = {
                    "session_id": str(s["_id"]),
                    "session_code": s.get("session_code"),
                    "participant_id": pid,
                    "protocol": s.get("protocol_name"),
                    "data_mode": s.get("data_mode"),
                    "sampling_rate": s.get("sampling_rate"),
                    "started_at": str(s.get("started_at")),
                    "has_ground_truth": s.get("ground_truth") is not None
                }
                if pid in train_pids:
                    train_sessions.append(s_info)
                else:
                    test_sessions.append(s_info)

        manifest = {
            "dataset_name": f"NeuroCare_Cohort_Split_{datetime.now(timezone.utc).strftime('%Y%m%d_%H%M%S')}",
            "created_at": datetime.now(timezone.utc).isoformat(),
            "train_split_ratio": payload.train_split_ratio,
            "leakage_prevention": "Strict participant-level partitioning",
            "summary": {
                "total_participants": len(pids),
                "total_sessions": len(sessions),
                "train_participants_count": len(train_pids),
                "test_participants_count": len(test_pids),
                "train_sessions_count": len(train_sessions),
                "test_sessions_count": len(test_sessions)
            },
            "train_set": train_sessions,
            "test_set": test_sessions
        }

        return manifest

    except HTTPException:
        raise
    except Exception as err:
        logger.exception("Failed to export dataset: %s", err)
        raise HTTPException(status_code=500, detail=str(err))
