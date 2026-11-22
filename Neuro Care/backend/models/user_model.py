from datetime import datetime, timezone
from bson import ObjectId


def create_user_document(
    name: str,
    email: str,
    password_hash: str,
    role: str
):
    allowed_roles = {
        "admin",
        "doctor",
        "clinician",
        "researcher",
        "nurse",
        "operator"
    }

    if role not in allowed_roles:
        raise ValueError(f"Invalid user role: {role}")

    return {
        "name": name.strip(),
        "email": email.strip().lower(),
        "password_hash": password_hash,
        "role": role,
        "is_active": True,
        "created_at": datetime.now(timezone.utc),
        "updated_at": datetime.now(timezone.utc)
    }


def serialize_user(user: dict):
    return {
        "id": str(user.get("_id", "")),
        "name": user.get("name"),
        "email": user.get("email"),
        "role": user.get("role"),
        "is_active": user.get("is_active"),
        "created_at": user.get("created_at"),
        "updated_at": user.get("updated_at")
    }
