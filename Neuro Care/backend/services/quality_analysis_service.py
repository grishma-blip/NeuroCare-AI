import joblib
import numpy as np

from pathlib import Path

from backend.core.logger import get_logger
from ml.signal_processing import preprocess_eeg, segment_eeg
from ml.eeg_features import extract_eeg_features

logger = get_logger(__name__)

PROJECT_ROOT = Path(__file__).resolve().parents[2]
MODEL_PATH = PROJECT_ROOT / "ml" / "eeg_quality_model.joblib"


class QualityAnalysisService:
    def __init__(self):
        self.model = None

    def load_model(self):
        if self.model is not None:
            return

        if not MODEL_PATH.exists():
            raise FileNotFoundError(
                f"EEG quality model not found: {MODEL_PATH}"
            )

        self.model = joblib.load(MODEL_PATH)
        logger.info("EEG quality model loaded successfully")

    def analyze(self, samples, sampling_rate):
        self.load_model()

        data = np.asarray(samples, dtype=float)

        filtered = preprocess_eeg(data, sampling_rate)

        segments = segment_eeg(
            filtered,
            sampling_rate,
            window_seconds=2,
            overlap=0.5
        )

        features = extract_eeg_features(
            segments,
            sampling_rate
        )

        predictions = self.model.predict(features)
        probabilities = self.model.predict_proba(features)

        noisy_count = int(np.sum(predictions == 1))
        clean_count = int(np.sum(predictions == 0))
        total_count = len(predictions)

        return {
            "classification": (
                "NOISY" if noisy_count > clean_count else "CLEAN"
            ),
            "total_windows": total_count,
            "clean_windows": clean_count,
            "noisy_windows": noisy_count,
            "noisy_window_ratio": float(noisy_count / total_count),
            "average_confidence": float(
                np.mean(np.max(probabilities, axis=1))
            ),
            "window_predictions": [
                {
                    "window": index + 1,
                    "classification": (
                        "NOISY" if prediction == 1 else "CLEAN"
                    ),
                    "confidence": float(
                        probabilities[index][int(prediction)]
                    )
                }
                for index, prediction in enumerate(predictions)
            ],
            "is_experimental": True
        }


quality_analysis_service = QualityAnalysisService()
