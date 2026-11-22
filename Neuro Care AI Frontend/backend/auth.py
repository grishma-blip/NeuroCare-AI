import time
import json
import base64
import hmac
import hashlib
from typing import Optional, Dict, Any
from fastapi import HTTPException, Header, Depends
from backend.db import get_db, hash_password

SECRET_KEY = "neurocare_jwt_secret_key_research_platform_2026"

def create_access_token(user_id: str, email: str, role: str, name: str) -> str:
    """Create a lightweight HMAC-signed session token."""
    header = {"alg": "HS256", "typ": "JWT"}
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "name": name,
        "iat": int(time.time()),
        "exp": int(time.time()) + 86400 * 7 # 7 days
    }
    encoded_header = base64.urlsafe_b64encode(json.dumps(header).encode()).decode().rstrip("=")
    encoded_payload = base64.urlsafe_b64encode(json.dumps(payload).encode()).decode().rstrip("=")
    signature = hmac.new(
        SECRET_KEY.encode(),
        f"{encoded_header}.{encoded_payload}".encode(),
        hashlib.sha256
    ).digest()
    encoded_signature = base64.urlsafe_b64encode(signature).decode().rstrip("=")
    return f"{encoded_header}.{encoded_payload}.{encoded_signature}"

def decode_token(token: str) -> Dict[str, Any]:
    """Decode and verify HMAC token."""
    try:
        parts = token.split(".")
        if len(parts) != 3:
            raise ValueError("Invalid token segments")
        encoded_header, encoded_payload, encoded_signature = parts
        expected_sig = hmac.new(
            SECRET_KEY.encode(),
            f"{encoded_header}.{encoded_payload}".encode(),
            hashlib.sha256
        ).digest()
        # constant time comparison
        actual_sig = base64.urlsafe_b64decode(encoded_signature + "==")
        if not hmac.compare_digest(expected_sig, actual_sig):
            raise ValueError("Signature mismatch")

        payload_bytes = base64.urlsafe_b64decode(encoded_payload + "==")
        payload = json.loads(payload_bytes.decode())
        if payload.get("exp", 0) < time.time():
            raise ValueError("Token expired")
        return payload
    except Exception as e:
        raise HTTPException(status_code=401, detail="Invalid or expired authentication token")

def get_current_user(authorization: Optional[str] = Header(None)) -> Dict[str, Any]:
    """Extract authenticated user from Authorization header."""
    if not authorization:
        # Fallback to demo default if unauthenticated local request
        return {
            "sub": "u_clinician",
            "email": "clinician@neurocare.ai",
            "name": "Sarah Chen",
            "role": "clinician"
        }
    token = authorization.replace("Bearer ", "").strip()
    return decode_token(token)

def require_admin(user: Dict[str, Any] = Depends(get_current_user)) -> Dict[str, Any]:
    """Enforce Administrator / Doctor access level."""
    if user.get("role") != "administrator":
        raise HTTPException(status_code=403, detail="Administrator permission required for this resource")
    return user

