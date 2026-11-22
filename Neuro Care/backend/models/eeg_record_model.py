from datetime import datetime, timezone
from math import isfinite
from bson import ObjectId


MAX_SAMPLES_PER_BATCH = 1000
ALLOWED_DATA_MODES = {"HARDWARE", "REPLAY", "SIMULATION"}


def create_eeg_record_document(
    session_id: str,
    samples: list,
    sampling_rate: int,
    channel_names: list,
    data_mode: str
):
    if not ObjectId.is_valid(session_id):
        raise ValueError("Invalid session ID")

    if not isinstance(samples, list) or not samples:
        raise ValueError("EEG samples must be a non-empty list")

    if len(samples) > MAX_SAMPLES_PER_BATCH:
        raise ValueError(
            f"A batch cannot contain more than {MAX_SAMPLES_PER_BATCH} samples"
        )

    if not isinstance(sampling_rate, int) or isinstance(sampling_rate, bool) or sampling_rate <= 0:
        raise ValueError("Sampling rate must be a positive integer")

    if not isinstance(channel_names, list) or not channel_names:
        raise ValueError("Channel names are required")

    if any(not isinstance(name, str) or not name.strip() for name in channel_names):
        raise ValueError("Every channel name must be a non-empty string")

    if len(set(channel_names)) != len(channel_names):
        raise ValueError("Channel names must be unique")

    if data_mode not in ALLOWED_DATA_MODES:
        raise ValueError("Invalid data mode")

    validated_samples = []

    for sample_index, sample in enumerate(samples):
        if not isinstance(sample, list):
            raise ValueError(f"Sample {sample_index} must be a list")

        if len(sample) != len(channel_names):
            raise ValueError(
                f"Sample {sample_index} must contain exactly "
                f"{len(channel_names)} channel values"
            )

        validated_sample = []

        for value in sample:
            if isinstance(value, bool) or not isinstance(value, (int, float)):
                raise ValueError("EEG sample values must be numeric")

            if not isfinite(value):
                raise ValueError("EEG sample values must be finite numbers")

            validated_sample.append(float(value))

        validated_samples.append(validated_sample)

    now = datetime.now(timezone.utc)

    return {
        "session_id": ObjectId(session_id),
        "samples": validated_samples,
        "sampling_rate": sampling_rate,
        "channel_names": channel_names,
        "data_mode": data_mode,
        "sample_count": len(validated_samples),
        "recorded_at": now,
        "created_at": now
    }


def serialize_eeg_record(record: dict):
    return {
        "id": str(record.get("_id", "")),
        "session_id": str(record.get("session_id", "")),
        "samples": record.get("samples", []),
        "sampling_rate": record.get("sampling_rate"),
        "channel_names": record.get("channel_names", []),
        "data_mode": record.get("data_mode"),
        "sample_count": record.get("sample_count"),
        "recorded_at": record.get("recorded_at"),
        "created_at": record.get("created_at")
    }
