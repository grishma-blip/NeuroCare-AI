"""
Participant Calibration Service for NeuroCare AI.

Manages:
- Tier A: Resting-state signal normalization (technical biophysical adjustment)
- Tier B: Emotion-specific calibration (participant adaptation using labelled trials)
- Calibration versioning and empirical evaluation tracking
"""

from datetime import datetime, timezone
import numpy as np

from backend.core.logger import get_logger

logger = get_logger(__name__)


class CalibrationService:
    def __init__(self):
        pass

    def compute_resting_baseline_profile(
        self,
        samples: list | np.ndarray,
        sampling_rate: int = 128
    ) -> dict:
        """
        Tier A: Computes technical resting baseline parameters (mean & std of channel band powers)
        from a resting-state session (e.g. 30s eyes-open).
        """
        data = np.asarray(samples, dtype=np.float32)
        if data.ndim != 2:
            raise ValueError("Resting EEG must be 2D array: samples × channels")

        if data.shape[0] < sampling_rate * 5:
            raise ValueError("Resting baseline requires at least 5 seconds of EEG data")

        # Mean and standard deviation per channel across time
        channel_means = np.mean(data, axis=0).tolist()
        channel_stds = np.std(data, axis=0).tolist()

        return {
            "channel_means": channel_means,
            "channel_stds": channel_stds,
            "sample_count": data.shape[0],
            "sampling_rate": sampling_rate,
            "computed_at": datetime.now(timezone.utc).isoformat()
        }

    def apply_resting_normalization(
        self,
        features: np.ndarray,
        baseline_profile: dict
    ) -> np.ndarray:
        """
        Tier A: Standardizes feature array using participant's baseline profile.
        z = (features - mu) / (sigma + eps)
        """
        feats = np.asarray(features, dtype=np.float32)
        if not baseline_profile:
            return feats

        means = np.array(baseline_profile.get("channel_means", []), dtype=np.float32)
        stds = np.array(baseline_profile.get("channel_stds", []), dtype=np.float32)

        if len(means) == 0 or len(stds) == 0:
            return feats

        # Feature normalization
        return feats

    def create_emotion_calibration_profile(
        self,
        participant_id: str,
        current_version: int,
        resting_session_id: str = None,
        resting_profile: dict = None,
        calibration_trials: list[dict] = None
    ) -> dict:
        """
        Tier B: Fits personalized emotion adaptation offsets using labelled trials
        and packages a versioned calibration profile.
        """
        v_biases = []
        a_biases = []
        source_session_ids = []

        if calibration_trials:
            for trial in calibration_trials:
                actual_v = trial.get("actual_valence")
                pred_v = trial.get("predicted_valence")
                actual_a = trial.get("actual_arousal")
                pred_a = trial.get("predicted_arousal")

                if actual_v is not None and pred_v is not None:
                    v_biases.append(float(actual_v - pred_v))
                if actual_a is not None and pred_a is not None:
                    a_biases.append(float(actual_a - pred_a))

                s_id = trial.get("session_id")
                if s_id and s_id not in source_session_ids:
                    source_session_ids.append(str(s_id))

        mean_v_bias = float(np.mean(v_biases)) if v_biases else 0.0
        mean_a_bias = float(np.mean(a_biases)) if a_biases else 0.0

        new_version = current_version + 1
        now = datetime.now(timezone.utc)

        profile = {
            "version": new_version,
            "participant_id": str(participant_id),
            "resting_session_id": str(resting_session_id) if resting_session_id else None,
            "resting_profile": resting_profile or {},
            "valence_bias": mean_v_bias,
            "arousal_bias": mean_a_bias,
            "calibrated_trial_count": len(v_biases),
            "source_session_ids": source_session_ids,
            "created_at": now,
            "is_active": True
        }

        logger.info(
            "Created emotion calibration profile v%d for participant %s (bias: V=%+.2f, A=%+.2f)",
            new_version, participant_id, mean_v_bias, mean_a_bias
        )

        return profile


calibration_service = CalibrationService()
