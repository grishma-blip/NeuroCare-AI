from datetime import datetime, timezone
from typing import Optional, List, Dict, Any


PARTICIPANT_STATUSES = {
    "active",
    "inactive",
    "withdrawn"
}

REGISTRATION_STATUSES = {
    "draft",
    "pending_confirmation",
    "ready_for_testing"
}

DEFAULT_ASSIGNED_TESTS = [
    "Live EEG",
    "Emotion Recognition",
    "Motor Imagery"
]


def create_participant_document(
    participant_code: str,
    age: Optional[int] = None,
    gender: Optional[str] = "Unspecified",
    consent_obtained: bool = True,
    created_by: str = "clinician",
    name: Optional[str] = None,
    notes: Optional[str] = None,
    assigned_doctor: Optional[str] = "dr_neurologist",
    assigned_tests: Optional[List[str]] = None,
    demographics: Optional[Dict[str, Any]] = None,
    registration_status: Optional[str] = "ready_for_testing",
    reviewed_at: Optional[datetime] = None,
    reviewed_by: Optional[str] = None,
    confirmed_at: Optional[datetime] = None,
    confirmed_by: Optional[str] = None
):
    if not participant_code or not participant_code.strip():
        raise ValueError("Participant code is required")

    if age is not None and not (18 <= age <= 120):
        raise ValueError("Participant must be an adult (18–120)")

    if not consent_obtained:
        raise ValueError("Informed consent is required")

    reg_status = (registration_status or "ready_for_testing").strip().lower()
    if reg_status not in REGISTRATION_STATUSES:
        reg_status = "ready_for_testing"

    now = datetime.now(timezone.utc)
    tests = assigned_tests if assigned_tests is not None else list(DEFAULT_ASSIGNED_TESTS)

    return {
        "participant_code": participant_code.strip(),
        "name": name.strip() if name and name.strip() else None,
        "age": age,
        "gender": gender.strip() if gender else "Unspecified",
        "demographics": demographics or {},
        "assigned_doctor": assigned_doctor.strip() if assigned_doctor else "dr_neurologist",
        "assigned_tests": tests,
        "registration_status": reg_status,
        "reviewed_at": reviewed_at,
        "reviewed_by": reviewed_by,
        "confirmed_at": confirmed_at,
        "confirmed_by": confirmed_by,
        "notes": notes.strip() if notes else "",
        "consent": {
            "obtained": True,
            "obtained_at": now
        },
        "status": "active",
        "withdrawal_reason": None,
        "withdrawn_at": None,
        "calibration_profiles": [],
        "created_by": created_by.strip() if created_by else "clinician",
        "created_at": now,
        "updated_at": now
    }


def serialize_participant(participant: dict):
    reg_status = participant.get("registration_status")
    if not reg_status or reg_status not in REGISTRATION_STATUSES:
        reg_status = "ready_for_testing"

    reviewed_at = participant.get("reviewed_at")
    if isinstance(reviewed_at, datetime):
        reviewed_at = reviewed_at.isoformat()

    confirmed_at = participant.get("confirmed_at")
    if isinstance(confirmed_at, datetime):
        confirmed_at = confirmed_at.isoformat()

    created_at = participant.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()

    updated_at = participant.get("updated_at")
    if isinstance(updated_at, datetime):
        updated_at = updated_at.isoformat()

    return {
        "id": str(participant.get("_id", "")),
        "participant_code": participant.get("participant_code"),
        "name": participant.get("name"),
        "age": participant.get("age"),
        "gender": participant.get("gender"),
        "demographics": participant.get("demographics", {}),
        "assigned_doctor": participant.get("assigned_doctor", "dr_neurologist"),
        "assigned_tests": participant.get("assigned_tests", list(DEFAULT_ASSIGNED_TESTS)),
        "registration_status": reg_status,
        "reviewed_at": reviewed_at,
        "reviewed_by": participant.get("reviewed_by"),
        "confirmed_at": confirmed_at,
        "confirmed_by": participant.get("confirmed_by"),
        "notes": participant.get("notes", ""),
        "consent": participant.get("consent"),
        "status": participant.get("status"),
        "withdrawal_reason": participant.get("withdrawal_reason"),
        "withdrawn_at": participant.get("withdrawn_at"),
        "calibration_profiles": participant.get("calibration_profiles", []),
        "created_by": participant.get("created_by"),
        "created_at": created_at,
        "updated_at": updated_at
    }
