import numpy as np
from scipy.signal import butter, sosfiltfilt, iirnotch, filtfilt


def validate_eeg_data(samples, sampling_rate):
    data = np.asarray(samples, dtype=float)

    if data.ndim != 2:
        raise ValueError("EEG data must be a 2D array: samples × channels")

    if data.shape[0] < 20:
        raise ValueError("At least 20 samples are required for processing")

    if data.shape[1] < 1:
        raise ValueError("At least one EEG channel is required")

    if not np.isfinite(data).all():
        raise ValueError("EEG data contains invalid numeric values")

    if not isinstance(sampling_rate, int) or sampling_rate <= 0:
        raise ValueError("Sampling rate must be a positive integer")

    return data


def bandpass_filter(data, sampling_rate, lowcut=0.5, highcut=40.0):
    nyquist = sampling_rate / 2

    if not 0 < lowcut < highcut < nyquist:
        raise ValueError(
            "Filter frequencies must be positive and below Nyquist frequency"
        )

    sos = butter(
        4,
        [lowcut, highcut],
        btype="bandpass",
        fs=sampling_rate,
        output="sos"
    )

    return sosfiltfilt(sos, data, axis=0)


def notch_filter(data, sampling_rate, frequency=50.0, quality_factor=30.0):
    if not 0 < frequency < sampling_rate / 2:
        raise ValueError("Notch frequency must be below Nyquist frequency")

    b, a = iirnotch(
        frequency,
        quality_factor,
        fs=sampling_rate
    )

    return filtfilt(b, a, data, axis=0)


def preprocess_eeg(samples, sampling_rate):
    data = validate_eeg_data(samples, sampling_rate)

    filtered = bandpass_filter(data, sampling_rate)

    # Apply 50 Hz notch only when it is below Nyquist frequency.
    if 50.0 < sampling_rate / 2:
        filtered = notch_filter(filtered, sampling_rate)

    return filtered


def segment_eeg(data, sampling_rate, window_seconds=2.0, overlap=0.5):
    data = np.asarray(data, dtype=float)

    if data.ndim != 2 or not np.isfinite(data).all():
        raise ValueError("Input must be a finite 2D EEG array")

    if sampling_rate <= 0:
        raise ValueError("Sampling rate must be positive")

    if window_seconds <= 0:
        raise ValueError("Window duration must be positive")

    if not 0 <= overlap < 1:
        raise ValueError("Overlap must be between 0 and 1")

    window_size = int(window_seconds * sampling_rate)
    step_size = int(window_size * (1 - overlap))

    if window_size < 1 or step_size < 1:
        raise ValueError("Invalid window or overlap configuration")

    segments = []

    for start in range(0, len(data) - window_size + 1, step_size):
        segments.append(data[start:start + window_size])

    if not segments:
        raise ValueError("Not enough EEG samples for one complete segment")

    return np.stack(segments)
