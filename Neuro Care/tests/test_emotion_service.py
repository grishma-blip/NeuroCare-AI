"""
Unit tests for EmotionService and CalibrationService (Path B).
"""

import numpy as np
import pytest

from backend.services.emotion_service import emotion_service, EXPECTED_CHANNELS
from backend.services.calibration_service import calibration_service
from ml.datasets.deap.deap_loader import DEAP_EEG_CHANNELS


def test_emotion_service_input_validation():
    """Verify strict shape, channel count, channel names, and finiteness validation."""
    valid_samples = np.random.randn(512, EXPECTED_CHANNELS).astype(np.float32)

    # 1. Reject 1D or 3D
    with pytest.raises(ValueError, match="2D array"):
        emotion_service.predict(samples=valid_samples.flatten())

    # 2. Reject wrong channel count
    with pytest.raises(ValueError, match="Exactly 32 EEG channels"):
        emotion_service.predict(samples=valid_samples[:, :16])

    # 3. Reject wrong channel names
    wrong_channels = DEAP_EEG_CHANNELS[::-1]
    with pytest.raises(ValueError, match="do not match the standard DEAP"):
        emotion_service.predict(samples=valid_samples, channel_names=wrong_channels)

    # 4. Reject duplicate channel names
    dup_channels = DEAP_EEG_CHANNELS.copy()
    dup_channels[0] = dup_channels[1]
    with pytest.raises(ValueError, match="must be unique"):
        emotion_service.predict(samples=valid_samples, channel_names=dup_channels)

    # 5. Reject NaN or Inf
    nan_samples = valid_samples.copy()
    nan_samples[0, 0] = np.nan
    with pytest.raises(ValueError, match="invalid numeric values"):
        emotion_service.predict(samples=nan_samples)

    # 6. Reject too few samples (< 512)
    with pytest.raises(ValueError, match="At least 512 samples"):
        emotion_service.predict(samples=valid_samples[:200])


def test_emotion_service_prediction_structure():
    """Verify complete output schema, distinct probabilities, intervals, and affect labels."""
    np.random.seed(42)
    samples = np.random.randn(512, EXPECTED_CHANNELS).astype(np.float32)

    result = emotion_service.predict(
        samples=samples,
        sampling_rate=128,
        channel_names=DEAP_EEG_CHANNELS
    )

    # Valence schema
    assert "valence" in result
    v = result["valence"]
    assert 1.0 <= v["continuous_score"] <= 9.0
    assert v["classification"] in {"LOW", "HIGH", "NEUTRAL"}
    assert 0.0 <= v["calibrated_probability"] <= 1.0
    assert 0.5 <= v["confidence"] <= 1.0
    assert len(v["conformal_interval_90"]) == 2
    assert v["conformal_interval_90"][0] <= v["conformal_interval_90"][1]

    # Arousal schema
    assert "arousal" in result
    a = result["arousal"]
    assert 1.0 <= a["continuous_score"] <= 9.0
    assert a["classification"] in {"LOW", "HIGH", "NEUTRAL"}
    assert 0.0 <= a["calibrated_probability"] <= 1.0
    assert 0.5 <= a["confidence"] <= 1.0
    assert len(a["conformal_interval_90"]) == 2

    # Affect Circumplex mapping
    assert result["quadrant"] in {"HVHA", "HVLA", "LVHA", "LVLA"}
    assert "affect_label" in result
    assert "spectral_powers" in result
    assert all(k in result["spectral_powers"] for k in ["theta", "alpha", "beta", "gamma"])
    assert np.isfinite(result["frontal_alpha_asymmetry"])

    # Disclaimers
    assert result["is_experimental"] is True
    assert "Non-diagnostic" in result["clinical_disclaimer"]


def test_emotion_service_calibration_offset():
    """Verify that participant calibration offset shifts continuous scores properly."""
    samples = np.random.randn(512, EXPECTED_CHANNELS).astype(np.float32)

    calib_profile = {
        "version": 1,
        "is_active": True,
        "valence_bias": 1.5,
        "arousal_bias": -1.0
    }

    raw_res = emotion_service.predict(samples=samples, channel_names=DEAP_EEG_CHANNELS)
    calib_res = emotion_service.predict(
        samples=samples,
        channel_names=DEAP_EEG_CHANNELS,
        calibration_profile=calib_profile
    )

    assert calib_res["calibration_applied"] is True
    assert calib_res["calibration_version"] == 1
    # Check that score was shifted within [1.0, 9.0]
    expected_v = min(9.0, max(1.0, raw_res["valence"]["continuous_score"] + 1.5))
    assert np.isclose(calib_res["valence"]["continuous_score"], expected_v, atol=0.01)


def test_calibration_service_workflow():
    """Verify Tier A resting baseline profile and Tier B versioned profile creation."""
    resting_data = np.random.randn(128 * 10, 32).astype(np.float32)  # 10 seconds of 32-channel EEG

    profile_a = calibration_service.compute_resting_baseline_profile(resting_data, sampling_rate=128)
    assert len(profile_a["channel_means"]) == 32
    assert len(profile_a["channel_stds"]) == 32
    assert profile_a["sample_count"] == 1280

    # Tier B
    labelled_trials = [
        {"session_id": "sess_1", "actual_valence": 7.0, "predicted_valence": 6.0, "actual_arousal": 6.5, "predicted_arousal": 6.0},
        {"session_id": "sess_2", "actual_valence": 8.0, "predicted_valence": 7.0, "actual_arousal": 7.0, "predicted_arousal": 6.5}
    ]

    profile_b = calibration_service.create_emotion_calibration_profile(
        participant_id="507f1f77bcf86cd799439011",
        current_version=0,
        resting_session_id="sess_rest",
        resting_profile=profile_a,
        calibration_trials=labelled_trials
    )

    assert profile_b["version"] == 1
    assert profile_b["is_active"] is True
    assert profile_b["calibrated_trial_count"] == 2
    assert np.isclose(profile_b["valence_bias"], 1.0)
    assert np.isclose(profile_b["arousal_bias"], 0.5)
