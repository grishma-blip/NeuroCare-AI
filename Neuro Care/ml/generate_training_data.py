import numpy as np

from ml.signal_processing import preprocess_eeg, segment_eeg
from ml.eeg_features import extract_eeg_features


SAMPLING_RATE = 250
DURATION_SECONDS = 10
NUMBER_OF_RECORDINGS = 100

rng = np.random.default_rng(42)


def generate_recording(is_noisy):
    time = np.arange(SAMPLING_RATE * DURATION_SECONDS) / SAMPLING_RATE
    channels = []

    for channel in range(2):
        frequency = rng.uniform(8, 15)
        amplitude = rng.uniform(0.5, 1.2)

        signal = amplitude * np.sin(2 * np.pi * frequency * time)
        signal += rng.normal(0, 0.05, len(time))

        if is_noisy:
            signal += rng.normal(0, 0.8, len(time))

            if rng.random() > 0.5:
                signal += rng.normal(0, 1.5, len(time))

        channels.append(signal)

    return np.column_stack(channels)


def main():
    all_features = []
    all_labels = []
    all_groups = []

    recording_id = 0

    for label in (0, 1):
        for _ in range(NUMBER_OF_RECORDINGS):
            raw_signal = generate_recording(is_noisy=(label == 1))

            filtered = preprocess_eeg(raw_signal, SAMPLING_RATE)

            segments = segment_eeg(
                filtered,
                SAMPLING_RATE,
                window_seconds=2,
                overlap=0.5
            )

            features = extract_eeg_features(segments, SAMPLING_RATE)

            all_features.append(features)
            all_labels.extend([label] * len(features))
            all_groups.extend([recording_id] * len(features))

            recording_id += 1

    X = np.vstack(all_features)
    y = np.asarray(all_labels, dtype=int)
    groups = np.asarray(all_groups, dtype=int)

    np.savez_compressed(
        "data/eeg_quality_dataset.npz",
        X=X,
        y=y,
        groups=groups
    )

    print("Dataset generated successfully.")
    print("Feature shape:", X.shape)
    print("Label shape:", y.shape)
    print("Unique recordings:", len(np.unique(groups)))
    print("Clean windows:", np.sum(y == 0))
    print("Noisy windows:", np.sum(y == 1))


if __name__ == "__main__":
    main()
