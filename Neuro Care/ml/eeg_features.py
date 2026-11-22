import numpy as np
from scipy.signal import welch


def extract_channel_features(signal, sampling_rate):
    signal = np.asarray(signal, dtype=float)

    if signal.ndim != 1:
        raise ValueError("Each channel must be a 1D signal")

    if len(signal) < 20:
        raise ValueError("At least 20 samples are required")

    if sampling_rate <= 0:
        raise ValueError("Sampling rate must be positive")

    if not np.isfinite(signal).all():
        raise ValueError("Signal contains invalid values")

    centered = signal - np.mean(signal)

    frequencies, power = welch(
        centered,
        fs=sampling_rate,
        nperseg=min(256, len(signal))
    )

    total_power = np.sum(power) + 1e-12
    high_frequency_power = np.sum(power[frequencies >= 30])

    return {
        "mean": float(np.mean(signal)),
        "std": float(np.std(signal)),
        "rms": float(np.sqrt(np.mean(signal ** 2))),
        "peak_to_peak": float(np.ptp(signal)),
        "line_length": float(np.mean(np.abs(np.diff(signal)))),
        "clipping_ratio": float(np.mean(
            np.abs(signal) >= np.percentile(np.abs(signal), 99.9)
        )),
        "high_frequency_power_ratio": float(
            high_frequency_power / total_power
        )
    }


def extract_eeg_features(segments, sampling_rate):
    segments = np.asarray(segments, dtype=float)

    if segments.ndim != 3:
        raise ValueError("Expected segments with shape: windows × samples × channels")

    if not np.isfinite(segments).all():
        raise ValueError("EEG segments contain invalid values")

    features = []

    for segment in segments:
        window_features = []

        for channel_index in range(segment.shape[1]):
            channel_features = extract_channel_features(
                segment[:, channel_index],
                sampling_rate
            )
            window_features.extend(channel_features.values())

        features.append(window_features)

    return np.asarray(features, dtype=float)
