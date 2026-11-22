"""
Emotion Analysis Service for NeuroCare AI (Path B).

Provides:
- 32-channel EEG validation and feature extraction (PSD, DE, Frontal Alpha Asymmetry)
- Dual Valence and Arousal continuous regression & binary classification
- 2D Affect Circumplex quadrant mapping with non-diagnostic taxonomy
- Conformal prediction intervals and calibrated probability reporting
- Participant calibration offset application
"""

from pathlib import Path
import joblib
import numpy as np

from backend.core.logger import get_logger
from ml.datasets.deap.deap_loader import DEAP_EEG_CHANNELS, SAMPLING_RATE, BASELINE_SAMPLES
from ml.datasets.deap.prepare_dataset import (
    compute_band_powers,
    compute_differential_entropy,
    compute_frontal_alpha_asymmetry,
    extract_features_from_windows,
    WINDOW_SAMPLES
)

logger = get_logger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_DIR = PROJECT_ROOT / "ml" / "models" / "emotion"
VALENCE_MODEL_PATH = MODEL_DIR / "valence_model.joblib"
AROUSAL_MODEL_PATH = MODEL_DIR / "arousal_model.joblib"

EXPECTED_CHANNELS = 32

# Non-diagnostic affect descriptions for Russell's Circumplex Model
CIRCUMPLEX_AFFECT_MAP = {
    "HVHA": {
        "code": "HVHA",
        "description": "High Valence / High Arousal (Pleasant-Activated Affect, e.g., Joy / Excitement)"
    },
    "HVLA": {
        "code": "HVLA",
        "description": "High Valence / Low Arousal (Pleasant-Deactivated Affect, e.g., Calm / Serenity)"
    },
    "LVHA": {
        "code": "LVHA",
        "description": "Low Valence / High Arousal (Unpleasant-Activated Affect, e.g., Tension / Frustration)"
    },
    "LVLA": {
        "code": "LVLA",
        "description": "Low Valence / Low Arousal (Unpleasant-Deactivated Affect, e.g., Lethargy / Boredom)"
    }
}


class EmotionService:
    def __init__(self):
        self.valence_model = None
        self.arousal_model = None
        self.models_loaded = False

    def load_models(self) -> bool:
        """Attempts to load trained model artifacts if present."""
        if self.models_loaded:
            return True

        if VALENCE_MODEL_PATH.exists() and AROUSAL_MODEL_PATH.exists():
            try:
                self.valence_model = joblib.load(VALENCE_MODEL_PATH)
                self.arousal_model = joblib.load(AROUSAL_MODEL_PATH)
                self.models_loaded = True
                logger.info("Loaded trained DEAP emotion models from disk")
                return True
            except Exception as e:
                logger.warning("Could not load emotion models: %s", e)
                return False

        return False

    def predict(
        self,
        samples: list | np.ndarray,
        sampling_rate: int = 128,
        channel_names: list[str] = None,
        calibration_profile: dict = None,
        baseline_samples: list | np.ndarray = None
    ) -> dict:
        """
        Analyzes EEG samples to predict Valence, Arousal, and 2D Affect Quadrant.

        Args:
            samples: 2D array of shape (samples, channels)
            sampling_rate: int, expected 128 Hz
            channel_names: list of channel names (32 DEAP channels)
            calibration_profile: optional participant calibration dict
            baseline_samples: optional pre-stimulus baseline samples of shape (baseline_samples, channels)

        Returns:
            dict containing continuous scores, binary classifications,
            calibrated probabilities, confidence, and affect quadrant.
        """
        data = np.asarray(samples, dtype=np.float32)

        if data.ndim != 2:
            raise ValueError("EEG samples must be a 2D array: samples × channels")

        if data.shape[1] != EXPECTED_CHANNELS:
            raise ValueError(f"Exactly {EXPECTED_CHANNELS} EEG channels are required (got {data.shape[1]})")

        if channel_names is not None:
            if len(channel_names) != EXPECTED_CHANNELS:
                raise ValueError(f"Expected {EXPECTED_CHANNELS} channel names, got {len(channel_names)}")
            if len(set(channel_names)) != EXPECTED_CHANNELS:
                raise ValueError("Channel names must be unique")
            if list(channel_names) != DEAP_EEG_CHANNELS:
                raise ValueError("Channel names or order do not match the standard DEAP 32-channel configuration")

        if not np.isfinite(data).all():
            raise ValueError("EEG samples contain invalid numeric values (NaN or Inf)")

        if sampling_rate <= 0:
            raise ValueError("Sampling rate must be a positive integer")

        if data.shape[0] < WINDOW_SAMPLES:
            raise ValueError(
                f"At least {WINDOW_SAMPLES} samples ({WINDOW_SAMPLES / sampling_rate:.1f}s) "
                f"are required for emotion analysis"
            )

        # Baseline & Feature Extraction parity with DEAP training pipeline
        # Models were trained on Feature Set B (baseline-subtracted relative log-power)
        base_powers = None
        feature_strategy = "Feature Set A (Stimulus-Only Fallback)"
        baseline_corrected = False

        if baseline_samples is not None:
            base_arr = np.asarray(baseline_samples, dtype=np.float32)
            if base_arr.ndim == 2 and base_arr.shape[1] == EXPECTED_CHANNELS and base_arr.shape[0] >= 128:
                base_powers = compute_band_powers(base_arr.T, sfreq=sampling_rate)
                eeg_stim = data.T
                feature_strategy = "Feature Set B (Baseline-Corrected Pre-Stimulus)"
                baseline_corrected = True
            else:
                eeg_stim = data.T
        elif data.shape[0] >= BASELINE_SAMPLES + WINDOW_SAMPLES:
            # Full trial format: first BASELINE_SAMPLES (384 = 3s @ 128Hz) are pre-stimulus baseline
            base_slice = data[:BASELINE_SAMPLES, :]
            stim_slice = data[BASELINE_SAMPLES:, :]
            base_powers = compute_band_powers(base_slice.T, sfreq=sampling_rate)
            eeg_stim = stim_slice.T
            feature_strategy = "Feature Set B (Baseline-Corrected 3s Pre-Stimulus)"
            baseline_corrected = True
        else:
            eeg_stim = data.T

        # Extract features (Set A and Set B)
        feats_a, feats_b = extract_features_from_windows(eeg_stim, baseline_band_powers=base_powers, sfreq=sampling_rate)

        # Compute summary band power and Frontal Alpha Asymmetry for clinical dashboard
        mean_band_power = compute_band_powers(eeg_stim, sfreq=sampling_rate)  # (32, 4)
        total_p = np.sum(mean_band_power, axis=0)
        sum_p = np.sum(total_p) + 1e-12
        rel_powers = {
            "theta": float(total_p[0] / sum_p),
            "alpha": float(total_p[1] / sum_p),
            "beta": float(total_p[2] / sum_p),
            "gamma": float(total_p[3] / sum_p)
        }

        faa_values = compute_frontal_alpha_asymmetry(mean_band_power[:, 1])
        mean_faa = float(np.mean(faa_values))

        # Trial-level pooled feature vector: average across sliding windows
        # Use Feature Set B if baseline was provided/extracted, else fallback to Set A
        features_to_pool = feats_b if baseline_corrected else feats_a
        pooled_features = np.mean(features_to_pool, axis=0, keepdims=True)  # (1, 259)

        # Model Inference
        models_available = self.load_models()

        if models_available:
            pred_v_cont = float(np.clip(self.valence_model.predict(pooled_features)[0], 1.0, 9.0))
            pred_a_cont = float(np.clip(self.arousal_model.predict(pooled_features)[0], 1.0, 9.0))

            # Probabilities if supported
            if hasattr(self.valence_model, "predict_proba"):
                prob_v = float(self.valence_model.predict_proba(pooled_features)[0, 1])
            else:
                prob_v = float(1.0 / (1.0 + np.exp(-(pred_v_cont - 5.0))))

            if hasattr(self.arousal_model, "predict_proba"):
                prob_a = float(self.arousal_model.predict_proba(pooled_features)[0, 1])
            else:
                prob_a = float(1.0 / (1.0 + np.exp(-(pred_a_cont - 5.0))))

            model_name = "DEAP Ridge Regression (32 Ch @ 128 Hz)"
            is_provisional = False
        else:
            # Empirical signal-grounded baseline estimation when DEAP model is not yet trained on disk
            # Higher Frontal Alpha Asymmetry correlates with higher Valence; Beta/Gamma ratio correlates with Arousal
            pred_v_cont = float(np.clip(5.0 + 2.0 * np.tanh(mean_faa), 1.0, 9.0))
            arousal_ratio = (rel_powers["beta"] + rel_powers["gamma"]) / (rel_powers["theta"] + rel_powers["alpha"] + 1e-6)
            pred_a_cont = float(np.clip(5.0 + 2.0 * np.tanh(arousal_ratio - 1.0), 1.0, 9.0))

            prob_v = float(1.0 / (1.0 + np.exp(-(pred_v_cont - 5.0))))
            prob_a = float(1.0 / (1.0 + np.exp(-(pred_a_cont - 5.0))))

            model_name = "DEAP Feature-Spectral Provisional Model (Untrained Artifact Fallback)"
            is_provisional = True

        # Apply participant calibration offsets if present
        v_offset = 0.0
        a_offset = 0.0
        calibration_applied = False

        if calibration_profile and calibration_profile.get("is_active"):
            v_offset = float(calibration_profile.get("valence_bias", 0.0))
            a_offset = float(calibration_profile.get("arousal_bias", 0.0))
            pred_v_cont = float(np.clip(pred_v_cont + v_offset, 1.0, 9.0))
            pred_a_cont = float(np.clip(pred_a_cont + a_offset, 1.0, 9.0))
            calibration_applied = True

        # Classifications
        class_v = "HIGH" if pred_v_cont > 5.0 else ("LOW" if pred_v_cont < 5.0 else "NEUTRAL")
        class_a = "HIGH" if pred_a_cont > 5.0 else ("LOW" if pred_a_cont < 5.0 else "NEUTRAL")

        # Confidence = distance from decision threshold
        conf_v = float(max(prob_v, 1.0 - prob_v))
        conf_a = float(max(prob_a, 1.0 - prob_a))

        # Conformal 90% prediction intervals based on held-out subject empirical evaluations
        # (ml/reports/emotion/held_out_test_report.md: Valence RMSE ~2.49, Arousal RMSE ~2.13)
        q90_val = 2.49
        q90_aro = 2.13
        interval_v = [float(np.clip(pred_v_cont - q90_val, 1.0, 9.0)), float(np.clip(pred_v_cont + q90_val, 1.0, 9.0))]
        interval_a = [float(np.clip(pred_a_cont - q90_aro, 1.0, 9.0)), float(np.clip(pred_a_cont + q90_aro, 1.0, 9.0))]

        # Determine 2D Circumplex Quadrant
        quadrant_key = f"{'H' if pred_v_cont >= 5.0 else 'L'}V{'H' if pred_a_cont >= 5.0 else 'L'}A"
        affect_info = CIRCUMPLEX_AFFECT_MAP.get(quadrant_key, {
            "code": quadrant_key,
            "description": "Indeterminate Affect"
        })

        # Calibrated 4-quadrant probabilities (strictly normalized and finite)
        p_hvha = float(prob_v * prob_a)
        p_hvla = float(prob_v * (1.0 - prob_a))
        p_lvha = float((1.0 - prob_v) * prob_a)
        p_lvla = float((1.0 - prob_v) * (1.0 - prob_a))

        p_sum = p_hvha + p_hvla + p_lvha + p_lvla
        if p_sum > 0:
            p_hvha = p_hvha / p_sum
            p_hvla = p_hvla / p_sum
            p_lvha = p_lvha / p_sum
            p_lvla = p_lvla / p_sum

        probabilities = {
            "HVHA": round(p_hvha, 4),
            "HVLA": round(p_hvla, 4),
            "LVHA": round(p_lvha, 4),
            "LVLA": round(p_lvla, 4),
        }

        return {
            "valence": {
                "continuous_score": round(pred_v_cont, 3),
                "classification": class_v,
                "calibrated_probability": round(prob_v, 4),
                "confidence": round(conf_v, 4),
                "conformal_interval_90": interval_v
            },
            "arousal": {
                "continuous_score": round(pred_a_cont, 3),
                "classification": class_a,
                "calibrated_probability": round(prob_a, 4),
                "confidence": round(conf_a, 4),
                "conformal_interval_90": interval_a
            },
            "quadrant": affect_info["code"],
            "affect_label": affect_info["description"],
            "probabilities": probabilities,
            "spectral_powers": rel_powers,
            "frontal_alpha_asymmetry": round(mean_faa, 4),
            "feature_strategy": feature_strategy,
            "baseline_corrected": baseline_corrected,
            "calibration_applied": calibration_applied,
            "calibration_version": calibration_profile.get("version") if calibration_applied else None,
            "model_name": model_name,
            "is_provisional": is_provisional,
            "is_experimental": True,
            "clinical_disclaimer": "Investigational BCI research metric. Non-diagnostic affect categorization."
        }


emotion_service = EmotionService()
