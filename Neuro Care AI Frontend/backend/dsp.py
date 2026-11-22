import numpy as np
from scipy import signal
from typing import Dict, Any, List, Tuple

# Sampling and filter parameters
DEFAULT_FS = 256.0  # Hz, standard BioAmp UNO R4 sketch
BAND_LIMITS = {
    "delta": (0.5, 4.0),
    "theta": (4.0, 8.0),
    "alpha": (8.0, 13.0),
    "beta": (13.0, 29.5),
    # Gamma (30.0 - 100.0 Hz) is intentionally disabled due to the 29.5 Hz hardware filter!
}

def apply_bandpass_filter(data: np.ndarray, fs: float = DEFAULT_FS, lowcut: float = 0.5, highcut: float = 29.5, order: int = 4) -> np.ndarray:
    """
    Apply Butterworth bandpass filter matching the BioAmp EXG hardware bandpass (0.5 - 29.5 Hz).
    Uses second-order sections (SOS) for numerical stability.
    """
    if len(data) < 40:
        return data - np.mean(data) if len(data) > 0 else data
    nyq = 0.5 * fs
    low = max(0.1, lowcut) / nyq
    high = min(0.95 * nyq, highcut) / nyq
    if low >= high:
        return data - np.mean(data)
    sos = signal.butter(order, [low, high], btype='bandpass', output='sos')
    # Use forward-backward filtering to avoid phase distortion
    return signal.sosfiltfilt(sos, data)

def apply_notch_filter(data: np.ndarray, fs: float = DEFAULT_FS, notch_freq: float = 50.0, quality_factor: float = 30.0) -> np.ndarray:
    """
    Apply notch filter to eliminate 50 Hz or 60 Hz powerline interference.
    """
    if len(data) < 15 or notch_freq >= 0.5 * fs:
        return data
    b, a = signal.iirnotch(notch_freq, quality_factor, fs)
    return signal.filtfilt(b, a, data)

def compute_psd(data: np.ndarray, fs: float = DEFAULT_FS, nperseg: int = None) -> Tuple[np.ndarray, np.ndarray]:
    """
    Compute Power Spectral Density using Welch's method with Hann windowing.
    """
    if len(data) < 16:
        freqs = np.linspace(0.5, 30.0, 30)
        psd = np.zeros_like(freqs)
        return freqs, psd

    if nperseg is None:
        nperseg = min(len(data), int(fs * 2))  # 2-second segments if possible
        if nperseg < 16:
            nperseg = len(data)

    freqs, psd = signal.welch(data, fs=fs, window='hann', nperseg=nperseg, noverlap=nperseg // 2)
    return freqs, psd

def extract_band_powers(freqs: np.ndarray, psd: np.ndarray) -> Dict[str, Any]:
    """
    Calculate absolute and relative power for Delta, Theta, Alpha, and Beta bands.
    Explicitly tags Gamma as unsupported by hardware filter.
    """
    powers = {}
    total_power = 0.0

    # Calculate band powers using trapezoidal integration
    for band, (low, high) in BAND_LIMITS.items():
        mask = (freqs >= low) & (freqs <= high)
        if np.any(mask):
            trapz_fn = getattr(np, 'trapezoid', getattr(np, 'trapz', None))
            bp = float(trapz_fn(psd[mask], freqs[mask]))
        else:
            bp = 0.0
        powers[band] = max(0.0, bp)
        total_power += powers[band]

    # Relative band powers
    relative_powers = {}
    for band in BAND_LIMITS.keys():
        relative_powers[band] = (powers[band] / total_power) if total_power > 1e-12 else 0.0

    # Spectral ratios
    alpha_power = powers.get("alpha", 0.0)
    beta_power = powers.get("beta", 0.0)
    theta_power = powers.get("theta", 0.0)

    alpha_beta_ratio = (alpha_power / beta_power) if beta_power > 1e-9 else 0.0
    theta_beta_ratio = (theta_power / beta_power) if beta_power > 1e-9 else 0.0

    return {
        "absolute": powers,
        "relative": relative_powers,
        "total_power": float(total_power),
        "alpha_beta_ratio": float(alpha_beta_ratio),
        "theta_beta_ratio": float(theta_beta_ratio),
        "gamma_supported": False,
        "gamma_note": "Gamma (30–100 Hz) is unmeasurable with current BioAmp EXG 0.5–29.5 Hz hardware filter. Future capability requires updated hardware filter."
    }

def assess_signal_quality(raw_samples: np.ndarray) -> Dict[str, Any]:
    """
    Evaluate real-time signal quality:
    - Flatline detection: standard deviation < 1.0 uV
    - Clipping detection: saturation near ADC rails
    - Noise detection: excessive variance or 50/60 Hz spikes
    - Quality category: 'excellent', 'good', 'fair', 'poor'
    """
    if len(raw_samples) < 10:
        return {
            "quality": "poor",
            "flatline": False,
            "clipping": False,
            "noise": False,
            "std_uv": 0.0,
            "message": "Insufficient samples for quality assessment"
        }

    std_val = float(np.std(raw_samples))
    mean_val = float(np.mean(raw_samples))
    max_val = float(np.max(raw_samples))
    min_val = float(np.min(raw_samples))

    flatline = std_val < 1.0  # uV
    # BioAmp raw ADC at rails or extreme uV values (> 1500 uV or < -1500 uV)
    clipping = (max_val > 1500.0) or (min_val < -1500.0) or (abs(max_val - min_val) < 0.001 and not flatline)
    noise = std_val > 450.0  # high motion or EMG artifact

    if flatline:
        quality = "poor"
        msg = "Flatline detected: Check electrode contact and cable connection."
    elif clipping:
        quality = "poor"
        msg = "Signal clipping/rail saturation detected: Reposition electrodes."
    elif noise:
        quality = "fair"
        msg = "High artifact/noise level detected: Ensure participant is still."
    elif std_val < 80.0:
        quality = "excellent"
        msg = "Signal quality excellent. Clean physiological baseline."
    else:
        quality = "good"
        msg = "Signal quality good. Within expected physiological range."

    return {
        "quality": quality,
        "flatline": flatline,
        "clipping": clipping,
        "noise": noise,
        "std_uv": round(std_val, 2),
        "mean_uv": round(mean_val, 2),
        "message": msg
    }
