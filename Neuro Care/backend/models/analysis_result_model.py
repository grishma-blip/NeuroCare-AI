from datetime import datetime, timezone
from typing import Optional
from bson import ObjectId


ANALYSIS_TYPES = {
    "VALENCE_AROUSAL",
    "EEG_FEATURE_ANALYSIS",
    "SIGNAL_QUALITY",
    "MOTOR_IMAGERY"
}


def create_analysis_document(
    session_id: str,
    analysis_type: str,
    model_name: str,
    results: dict,
    confidence: float = None,
    participant_id: Optional[str] = None
):
    if not ObjectId.is_valid(session_id):
        raise ValueError("Invalid session ID")

    if analysis_type not in ANALYSIS_TYPES:
        raise ValueError("Invalid analysis type")

    if not model_name.strip():
        raise ValueError("Model name is required")

    if confidence is not None and not 0 <= confidence <= 1:
        raise ValueError("Confidence must be between 0 and 1")

    p_id = ObjectId(participant_id) if participant_id and ObjectId.is_valid(str(participant_id)) else None

    return {
        "session_id": ObjectId(session_id),
        "participant_id": p_id,
        "analysis_type": analysis_type,
        "model_name": model_name,
        "results": results,
        "confidence": confidence,
        "is_experimental": True,
        "created_at": datetime.now(timezone.utc)
    }


def serialize_analysis(analysis: dict):
    created_at = analysis.get("created_at")
    if isinstance(created_at, datetime):
        created_at = created_at.isoformat()

    return {
        "id": str(analysis.get("_id", "")),
        "session_id": str(analysis.get("session_id", "")),
        "participant_id": str(analysis.get("participant_id", "")) if analysis.get("participant_id") else None,
        "analysis_type": analysis.get("analysis_type"),
        "model_name": analysis.get("model_name"),
        "results": analysis.get("results", {}),
        "confidence": analysis.get("confidence"),
        "is_experimental": analysis.get("is_experimental", True),
        "created_at": created_at
    }
