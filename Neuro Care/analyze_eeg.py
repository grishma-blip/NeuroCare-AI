import os
import numpy as np
import matplotlib.pyplot as plt
from scipy.signal import butter, sosfiltfilt, welch

FILES = {
    "Eyes Open": "~/Desktop/Eyes_Open.txt",
    "Eyes Closed": "~/Desktop/Eyes_Closed.txt"
}

def load_recording(path):
    timestamps, values = [], []

    with open(os.path.expanduser(path), "r") as f:
        for line in f:
            parts = line.strip().split(",")
            if len(parts) != 2:
                continue
            try:
                timestamps.append(int(parts[0]))
                values.append(float(parts[1]))
            except ValueError:
                continue

    t = np.array(timestamps)
    x = np.array(values)

    if len(x) < 1000:
        raise ValueError(f"Insufficient samples: {path}")

    fs = 1 / (np.median(np.diff(t)) / 1_000_000)
    return t, x, fs

results = {}

for label, path in FILES.items():
    t, raw, fs = load_recording(path)

    # First 20 seconds from each recording
    n = min(len(raw), int(20 * fs))
    raw = raw[:n]

    centered = raw - np.mean(raw)
    sos = butter(4, [8, 13], btype="bandpass", fs=fs, output="sos")
    filtered = sosfiltfilt(sos, centered)

    freqs, psd = welch(filtered, fs=fs, nperseg=min(512, len(filtered)))
    mask = (freqs >= 8) & (freqs <= 13)
    alpha_power = np.trapezoid(psd[mask], freqs[mask])

    results[label] = (raw, filtered, fs, alpha_power, freqs, psd)

    print(f"\n{label}")
    print(f"Samples: {n}")
    print(f"Sampling rate: {fs:.2f} Hz")
    print(f"Alpha power (8–13 Hz): {alpha_power:.6f}")

open_power = results["Eyes Open"][3]
closed_power = results["Eyes Closed"][3]

print("\n--- EYES OPEN vs EYES CLOSED ---")
print(f"Eyes Open:   {open_power:.6f}")
print(f"Eyes Closed: {closed_power:.6f}")

if open_power > 0:
    ratio = closed_power / open_power
    print(f"Closed/Open ratio: {ratio:.3f}")
    print(f"Percentage change: {(ratio - 1) * 100:.2f}%")

fig, axes = plt.subplots(2, 2, figsize=(13, 8))

for col, label in enumerate(["Eyes Open", "Eyes Closed"]):
    raw, filtered, fs, power, freqs, psd = results[label]
    time = np.arange(len(raw)) / fs

    axes[0, col].plot(time, raw)
    axes[0, col].set_title(f"{label} - Raw Signal")
    axes[0, col].set_xlabel("Time (seconds)")
    axes[0, col].set_ylabel("ADC value")

    axes[1, col].plot(time, filtered)
    axes[1, col].set_title(f"{label} - Alpha Filter (8–13 Hz)")
    axes[1, col].set_xlabel("Time (seconds)")
    axes[1, col].set_ylabel("Amplitude")

plt.tight_layout()
plt.savefig("eeg_comparison.png", dpi=150)
plt.show()
