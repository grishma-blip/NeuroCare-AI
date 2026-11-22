from datetime import datetime, timezone
from bson import ObjectId


AUDIT_ACTIONS = {
    "CREATE",
    "READ",
    "UPDATE",
    "DELETE",
    "LOGIN",
    "LOGOUT",
    "EXPORT",
    "RECORDING_START",
    "RECORDING_STOP"
}


def create_audit_log_document(
    user_id: str,
    action: str,
    resource_type: str,
    resource_id: str = None,
    details: dict = None
):
    if not ObjectId.is_valid(user_id):
        raise ValueError("Invalid user ID")

    if action not in AUDIT_ACTIONS:
        raise ValueError("Invalid audit action")

    if not resource_type.strip():
        raise ValueError("Resource type is required")

    return {
        "user_id": ObjectId(user_id),
        "action": action,
        "resource_type": resource_type,
        "resource_id": resource_id,
        "details": details or {},
        "created_at": datetime.now(timezone.utc)
    }


def serialize_audit_log(log: dict):
    return {
        "id": str(log.get("_id", "")),
        "user_id": str(log.get("user_id", "")),
        "action": log.get("action"),
        "resource_type": log.get("resource_type"),
        "resource_id": log.get("resource_id"),
        "details": log.get("details", {}),
        "created_at": log.get("created_at")
    }
