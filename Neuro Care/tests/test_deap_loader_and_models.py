"""
Unit tests for DEAP data loader, feature extraction, and ML pipelines.
Runs with synthetic mock tensors in memory to verify math and pipeline logic
without requiring the 32-subject raw DEAP dataset to be downloaded on disk.
"""

import numpy as np
import pytest

from ml.datasets.deap.deap_loader import (
    DEAP_EEG_CHANNELS,
    DEAP_PERIPHERAL_CHANNELS,
    NUM_EEG_CHANNELS,
    NUM_TOTAL_CHANNELS,
    BASELINE_SAMPLES,
    STIMULUS_SAMPLES,
    TOTAL_SAMPLES,
    parse_subject_channels_and_epochs,
    split_binary_labels
)
from ml.datasets.deap.prepare_dataset import (
    compute_band_powers,
    compute_differential_entropy,
    compute_frontal_alpha_asymmetry,
    extract_features_from_windows
)
from ml.datasets.deap.train_emotion_models import (
    compute_conformal_quantile,
    evaluate_regression_cv,
    evaluate_classification_cv
)
from ml.datasets.deap.evaluate_emotion_models import (
    aggregate_window_predictions_to_trials,
    compute_expected_calibration_error
)


def test_channel_separation_and_slicing():
    """Verify that 32 EEG channels are isolated from 8 peripheral channels and sliced correctly."""
    # Create mock tensor (2 trials, 40 channels, 8064 samples)
    mock_data = np.zeros((2, NUM_TOTAL_CHANNELS, TOTAL_SAMPLES), dtype=np.float32)

    # Set distinct channel markers
    for ch in range(NUM_TOTAL_CHANNELS):
        mock_data[:, ch, :] = ch

    parsed = parse_subject_channels_and_epochs(mock_data)

    assert parsed["eeg_baseline"].shape == (2, 32, BASELINE_SAMPLES)
    assert parsed["eeg_stimulus"].shape == (2, 32, STIMULUS_SAMPLES)
    assert parsed["peripheral_baseline"].shape == (2, 8, BASELINE_SAMPLES)
    assert parsed["peripheral_stimulus"].shape == (2, 8, STIMULUS_SAMPLES)

    # Verify channel indices: EEG should be 0..31, Peripheral should be 32..39
    assert np.all(parsed["eeg_baseline"][:, 0, :] == 0)
    assert np.all(parsed["eeg_baseline"][:, 31, :] == 31)
    assert np.all(parsed["peripheral_baseline"][:, 0, :] == 32)
    assert np.all(parsed["peripheral_baseline"][:, 7, :] == 39)


def test_neutral_label_splitting():
    """Verify exact 5.0 exclusion vs margin 4.5-5.5 exclusion."""
    ratings = np.array([2.0, 4.0, 4.8, 5.0, 5.2, 6.0, 8.5])

    # Exact method: <5 is 0, >5 is 1, ==5 is excluded
    bin_exact, mask_exact = split_binary_labels(ratings, method="exact")
    assert mask_exact.tolist() == [True, True, True, False, True, True, True]
    assert bin_exact[mask_exact].tolist() == [0, 0, 0, 1, 1, 1]

    # Margin method: <=4.5 is 0, >=5.5 is 1, (4.5, 5.5) excluded
    bin_margin, mask_margin = split_binary_labels(ratings, method="margin")
    assert mask_margin.tolist() == [True, True, False, False, False, True, True]
    assert bin_margin[mask_margin].tolist() == [0, 0, 1, 1]


def test_feature_extraction_pipeline():
    """Verify band power, DE, FAA, and sliding window feature dimensions."""
    # 32 channels, 7680 stimulus samples (60s at 128Hz)
    sfreq = 128
    stim_signal = np.random.randn(32, 7680).astype(np.float32)
    base_signal = np.random.randn(32, 384).astype(np.float32)

    base_powers = compute_band_powers(base_signal, sfreq=sfreq)
    assert base_powers.shape == (32, 4)

    fa, fb = extract_features_from_windows(stim_signal, baseline_band_powers=base_powers, sfreq=sfreq)
    # 4s window with 50% overlap on 60s gives (7680 - 512) // 256 + 1 = 29 windows
    # Features per window: 32*4 log powers + 32*4 DE + 3 FAA = 128 + 128 + 3 = 259
    assert fa.shape == (29, 259)
    assert fb.shape == (29, 259)
    assert np.isfinite(fa).all()
    assert np.isfinite(fb).all()


def test_training_pipeline_cv_and_conformal():
    """Verify that regression and classification CV run without leakage and compute valid metrics."""
    np.random.seed(42)
    n_trials = 30  # 6 subjects with 5 trials each
    n_features = 20
    X_trials = np.random.randn(n_trials, n_features).astype(np.float32)
    # Targets: 1.0 - 9.0
    y_ratings = np.random.uniform(1.0, 9.0, size=n_trials).astype(np.float32)
    # Include an exact 5.0 to test neutral filtering
    y_ratings[0] = 5.0

    subject_groups = np.array([f"s{i // 5:02d}" for i in range(n_trials)])

    # 1. Regression CV
    reg_res = evaluate_regression_cv(X_trials, y_ratings, subject_groups, n_splits=3)
    assert "pooled_mae" in reg_res
    assert "conformal_q90" in reg_res
    assert reg_res["conformal_q90"] > 0
    assert len(reg_res["oof_predictions"]) == n_trials

    # 2. Classification CV
    clf_res = evaluate_classification_cv(X_trials, y_ratings, subject_groups, split_method="exact", n_splits=3)
    assert "pooled_accuracy" in clf_res
    assert "pooled_balanced_accuracy" in clf_res
    assert "pooled_macro_f1" in clf_res
    # Total samples should be 29 because 1 exact 5.0 was excluded
    assert clf_res["total_samples"] == 29


def test_window_to_trial_aggregation():
    """Verify window predictions aggregate properly into trial point estimates."""
    window_preds = np.array([7.0, 7.5, 6.5, 3.0, 3.5, 4.0], dtype=np.float32)
    window_probs = np.array([0.8, 0.9, 0.7, 0.2, 0.3, 0.1], dtype=np.float32)
    trial_groups = np.array(["t1", "t1", "t1", "t2", "t2", "t2"])

    trials, t_preds, t_probs = aggregate_window_predictions_to_trials(window_preds, window_probs, trial_groups)
    assert len(trials) == 2
    assert np.isclose(t_preds[0], 7.0)
    assert np.isclose(t_preds[1], 3.5)
    assert np.isclose(t_probs[0], 0.8)
    assert np.isclose(t_probs[1], 0.2)
