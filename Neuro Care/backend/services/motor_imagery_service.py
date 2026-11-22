from pathlib import Path

import joblib
import mne
import numpy as np

from backend.core.logger import get_logger

logger = get_logger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]

MODEL_PATH = (
    PROJECT_ROOT / "ml" / "models" / "motor_imagery"
    / "binary_motor_imagery_csp_lda.joblib"
)

TARGET_SAMPLING_RATE = 128
EXPECTED_CHANNELS = 64
EPOCH_SAMPLES = 385

PHYSIONET_CHANNEL_NAMES = [
    "Fc5.", "Fc3.", "Fc1.", "Fcz.", "Fc2.", "Fc4.", "Fc6.",
    "C5..", "C3..", "C1..", "Cz..", "C2..", "C4..", "C6..",
    "Cp5.", "Cp3.", "Cp1.", "Cpz.", "Cp2.", "Cp4.", "Cp6.",
    "Fp1.", "Fpz.", "Fp2.", "Af7.", "Af3.", "Afz.", "Af4.",
    "Af8.", "F7..", "F5..", "F3..", "F1..", "Fz..", "F2..",
    "F4..", "F6..", "F8..", "Ft7.", "Ft8.", "T7..", "T8..",
    "T9..", "T10.", "Tp7.", "Tp8.", "P7..", "P5..", "P3..",
    "P1..", "Pz..", "P2..", "P4..", "P6..", "P8..", "Po7.",
    "Po3.", "Poz.", "Po4.", "Po8.", "O1..", "Oz..", "O2..",
    "Iz.."
]


class MotorImageryService:
    def __init__(self):
        self.model = None

    def load_model(self):
        if self.model is None:
            if not MODEL_PATH.exists():
                raise FileNotFoundError(f"Model not found: {MODEL_PATH}")

            self.model = joblib.load(MODEL_PATH)
            logger.info("Binary motor imagery model loaded successfully")

    def predict(
        self,
        samples,
        sampling_rate,
        channel_names,
        input_type="raw"
    ):
        self.load_model()

        data = np.asarray(samples, dtype=np.float64)

        if data.ndim != 2:
            raise ValueError("EEG samples must be a 2D array")

        if data.shape[1] != EXPECTED_CHANNELS:
            raise ValueError("Exactly 64 EEG channels are required")

        if len(channel_names) != EXPECTED_CHANNELS:
            raise ValueError("Exactly 64 channel names are required")

        if len(set(channel_names)) != EXPECTED_CHANNELS:
            raise ValueError("Channel names must be unique")

        if not np.isfinite(data).all():
            raise ValueError("EEG samples contain invalid numeric values")

        if (
            not isinstance(sampling_rate, (int, float))
            or isinstance(sampling_rate, bool)
            or not np.isfinite(sampling_rate)
            or sampling_rate <= 0
        ):
            raise ValueError("Sampling rate must be positive")

        if input_type == "preprocessed_epoch":
            if list(channel_names) != PHYSIONET_CHANNEL_NAMES:
                raise ValueError(
                    "Channel names or order do not match the PhysioNet "
                    "training channel configuration"
                )

            if sampling_rate != TARGET_SAMPLING_RATE:
                raise ValueError("Preprocessed epochs must use 128 Hz")

            if data.shape[0] != EPOCH_SAMPLES:
                raise ValueError(
                    "Preprocessed epoch must contain exactly 385 samples"
                )

            epoch = data.T.astype(np.float32)

        elif input_type == "raw":
            if data.shape[0] < int(sampling_rate * 3.5):
                raise ValueError("Raw EEG requires at least 3.5 seconds")

            info = mne.create_info(
                ch_names=channel_names,
                sfreq=float(sampling_rate),
                ch_types=["eeg"] * EXPECTED_CHANNELS
            )

            raw = mne.io.RawArray(data.T, info, verbose="ERROR")

            try:
                raw.resample(
                    TARGET_SAMPLING_RATE,
                    npad="auto",
                    verbose="ERROR"
                )
                raw.filter(
                    l_freq=8.0,
                    h_freq=30.0,
                    picks="eeg",
                    verbose="ERROR"
                )
                raw.set_eeg_reference(
                    "average",
                    projection=False,
                    verbose="ERROR"
                )
                filtered = raw.get_data()
            finally:
                raw.close()

            start = int(0.5 * TARGET_SAMPLING_RATE)
            stop = start + EPOCH_SAMPLES

            if filtered.shape[1] < stop:
                raise ValueError("Insufficient samples after resampling")

            epoch = filtered[:, start:stop].astype(np.float32)

        else:
            raise ValueError(
                "input_type must be 'raw' or 'preprocessed_epoch'"
            )

        X = epoch[np.newaxis, :, :]

        prediction = int(self.model.predict(X)[0])
        probabilities = self.model.predict_proba(X)[0]

        return {
            "classification": "Right" if prediction == 1 else "Left",
            "predicted_label": prediction,
            "confidence": float(probabilities[prediction]),
            "probabilities": {
                "left": float(probabilities[0]),
                "right": float(probabilities[1])
            },
            "input_shape": list(X.shape),
            "sampling_rate": TARGET_SAMPLING_RATE,
            "model_name": "CSP + StandardScaler + LDA",
            "is_experimental": True
        }


motor_imagery_service = MotorImageryService()
