from datetime import datetime, timezone
from typing import Any, Optional
from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str = "healthy"
    application: str = "NeuroCare AI"
    timestamp: datetime = Field(
        default_factory=lambda: datetime.now(timezone.utc)
    )


class DeviceStatusResponse(BaseModel):
    connected: bool = False
    mode: str = "HARDWARE_TEST"
    status: Optional[str] = None
    device_name: Optional[str] = None
    message: str = "Device not connected"
    error_message: Optional[str] = None
    last_updated: Optional[datetime] = None
    port: Optional[str] = None
    baud_rate: Optional[int] = None
    sample_rate_measured: Optional[float] = None
    samples_received: Optional[int] = None
    samples_received_total: Optional[int] = None
    lines_received_total: Optional[int] = None
    invalid_lines_count: Optional[int] = None
    is_recording: Optional[bool] = None
    is_paused: Optional[bool] = None
    active_session_id: Optional[str] = None
    latest_data: Optional[str] = None


class APIResponse(BaseModel):
    success: bool
    message: str
    data: Optional[dict[str, Any]] = None
