"""
NeuroCare AI — Digital Signal Processing (DSP) Service
Provides real-time EEG filtering, Welch PSD spectral estimation,
brainwave frequency band decomposition, and signal quality diagnostics.

Hardware Bandpass Context:
- BioAmp EXG Pill v1.0 features an on-board analog active bandpass filter (0.5 Hz - 29.5 Hz).
- Frequencies above 29.5 Hz (including Gamma band > 30 Hz) are filtered out by hardware.
- Gamma is explicitly marked as unavailable/outside supported hardware bandwidth.
"""

from typing import Optional, Union, List, Dict, Any, Tuple
import numpy as np
import scipy.signal

from backend.core.logger import get_logger

logger = get_logger(__name__)

# Trapezoidal integration function compatible across NumPy versions (2.0+ vs 1.x)
trapz_fn = getattr(np, "trapezoid", getattr(np, "trapz", None))


class DSPService:
    def __init__(self, default_fs: float = 256.0):
        self.default_fs = default_fs
        # Design 2nd-order Butterworth bandpass filter (0.5 Hz to 29.5 Hz)
        nyquist = 0.5 * default_fs
        low = 0.5 / nyquist
        high = min(29.5 / nyquist, 0.95)
        self.b, self.a = scipy.signal.butter(2, [low, high], btype="bandpass")
        self.zi = scipy.signal.lfilter_zi(self.b, self.a) * 0.0

    def filter_single_sample(self, raw_uv: float) -> float:
        """
        Online causal single-sample IIR filtering for low-latency live streaming.
        Uses 2nd-order Direct Form II Transposed IIR filter (scipy.signal.lfilter).
        Filter state (self.zi) is continuously preserved across serial reads,
        ensuring perfect boundary continuity without transient edge distortions.
        Introduces a small, causal frequency-dependent phase delay.
        """
        filtered_val, self.zi = scipy.signal.lfilter(
            self.b, self.a, [raw_uv], zi=self.zi
        )
        return float(filtered_val[0])

    def filter_batch(self, samples: Union[List[float], np.ndarray], fs: Optional[float] = None) -> np.ndarray:
        """
        Zero-phase digital bandpass filtering across a recorded batch of EEG samples.
        Uses forward-backward filtering (scipy.signal.sosfiltfilt) to achieve exact zero
        phase distortion. This is non-causal and reserved for post-hoc analysis/reports.
        """
        data = np.asarray(samples, dtype=np.float64)
        if len(data) < 15:
            return data

        target_fs = fs or self.default_fs
        nyquist = 0.5 * target_fs
        low = 0.5 / nyquist
        high = min(29.5 / nyquist, 0.95)

        try:
            sos = scipy.signal.butter(2, [low, high], btype="bandpass", output="sos")
            return scipy.signal.sosfiltfilt(sos, data)
        except Exception as err:
            logger.debug("Batch filtering fallback: %s", err)
            return data

    def compute_bandpowers(
        self,
        samples: Union[List[float], np.ndarray],
        fs: float = 256.0,
        raw_samples: Optional[Union[List[float], np.ndarray]] = None
    ) -> Dict[str, Any]:
        """
        Calculates spectral density using Welch's periodogram (scipy.signal.welch)
        and integrates power across standard clinical brainwave bands:
        - Delta: 0.5 - 4.0 Hz
        - Theta: 4.0 - 8.0 Hz
        - Alpha: 8.0 - 13.0 Hz
        - Beta:  13.0 - 29.5 Hz
        - Gamma: Above 30.0 Hz (Marked unavailable: BioAmp hardware filter cuts off at 29.5 Hz)
        """
        data = np.asarray(samples, dtype=np.float64)
        n_samples = len(data)

        if n_samples < 32 or not np.isfinite(data).all():
            status = "WARMING_UP" if n_samples > 0 else "NO_DATA"
            return self._empty_bandpower_response(status=status, window_samples=0)

        # Window configuration for Welch PSD: up to 512 samples (~2.0 s @ 256 Hz)
        nperseg = min(512, n_samples)
        noverlap = min(256, nperseg // 2)

        freqs, psd = scipy.signal.welch(
            data,
            fs=fs,
            window="hann",
            nperseg=nperseg,
            noverlap=noverlap,
            scaling="density"
        )

        freq_resolution = float(freqs[1] - freqs[0]) if len(freqs) > 1 else 1.0

        def integrate_band(f_low: float, f_high: float) -> float:
            idx = (freqs >= f_low) & (freqs <= f_high)
            if not np.any(idx):
                return 0.0
            return float(trapz_fn(psd[idx], freqs[idx]))

        delta_pwr = integrate_band(0.5, 4.0)
        theta_pwr = integrate_band(4.0, 8.0)
        alpha_pwr = integrate_band(8.0, 13.0)
        beta_pwr = integrate_band(13.0, 29.5)

        total_supported_power = delta_pwr + theta_pwr + alpha_pwr + beta_pwr
        norm_factor = total_supported_power if total_supported_power > 0 else 1.0

        rel_delta = (delta_pwr / norm_factor) * 100.0 if total_supported_power > 0 else 0.0
        rel_theta = (theta_pwr / norm_factor) * 100.0 if total_supported_power > 0 else 0.0
        rel_alpha = (alpha_pwr / norm_factor) * 100.0 if total_supported_power > 0 else 0.0
        rel_beta = (beta_pwr / norm_factor) * 100.0 if total_supported_power > 0 else 0.0

        # Physical signal validity assessment against hardware saturation and DC drift
        # PROTOTYPE ENGINEERING HEURISTIC:
        # Total spectral power in single-channel frontal EEG (0.5–29.5 Hz) under normal
        # physiological conditions typically ranges between 10–200 µV², and rarely exceeds
        # 400–500 µV² in healthy subjects (even during high-voltage slow waves or drowsiness).
        # Total power > 2500.0 µV² is classified as UNPHYSIOLOGICAL_SPECTRAL_POWER.
        # This threshold is an engineering prototype heuristic (not a clinically validated
        # diagnostic threshold) implemented to distinguish gross physical artifacts (severe facial
        # EMG, mains hum, loose electrode movement, or square-wave ADC rail oscillation)
        # from genuine neural oscillations.
        raw_arr = np.asarray(raw_samples, dtype=np.float64) if raw_samples is not None else data
        raw_clipped = int(np.sum(np.abs(raw_arr) >= 980.0))
        filt_clipped = int(np.sum(np.abs(data) >= 980.0))
        is_clipped = bool(raw_clipped >= 2 or filt_clipped >= 2 or np.any(np.abs(raw_arr) >= 1000.0) or np.any(np.abs(data) >= 1000.0))
        is_drifting = bool(abs(float(np.mean(raw_arr))) > 150.0 or float(np.ptp(raw_arr)) > 800.0)
        is_unphys = bool(total_supported_power > 2500.0)

        is_signal_valid = bool(not is_clipped and not is_drifting and not is_unphys and (total_supported_power > 0.0))

        if not is_signal_valid:
            if is_clipped:
                validity_status = "SATURATED_CLIPPING"
                validity_msg = "ADC rail saturation (±1033 µV) — check electrode contact and reference lead"
            elif is_drifting:
                validity_status = "BASELINE_DRIFT"
                validity_msg = "Severe DC baseline drift (>150 µV) — settling amplifier / movement transient"
            elif is_unphys:
                validity_status = "ARTIFACT_DOMINATED"
                validity_msg = "Non-physiological spectral power (>2500 µV²) — muscle/movement/mains artifact"
            elif total_supported_power == 0:
                validity_status = "NO_DATA"
                validity_msg = "Zero spectral power — no active EEG signal"
            else:
                validity_status = "INVALID"
                validity_msg = "Signal quality compromised by physical artifacts"
        else:
            validity_status = "VALID"
            validity_msg = "Signal quality acceptable for physiological EEG spectral analysis"

        # Peak frequency in alpha band (8.0 - 13.0 Hz): argmax of actual PSD
        # ONLY compute Peak Alpha if signal is valid; do not report false harmonic or drift slope peaks!
        alpha_mask = (freqs >= 8.0) & (freqs <= 13.0)
        if is_signal_valid and np.any(alpha_mask) and alpha_pwr > 0.001 and total_supported_power > 0.01:
            alpha_peak_freq = float(freqs[alpha_mask][np.argmax(psd[alpha_mask])])
        else:
            alpha_peak_freq = None

        if n_samples >= 512:
            status = "FULL_WINDOW"
            window_type = "FULL"
        elif n_samples >= 128:
            status = "PARTIAL_WINDOW"
            window_type = "PARTIAL"
        else:
            status = "WARMING_UP"
            window_type = "INSUFFICIENT"

        # Downsample PSD for frontend chart (0.5 to 35 Hz, steps ~1 Hz)
        chart_mask = (freqs >= 0.5) & (freqs <= 35.0)
        psd_points = [
            {"freq": round(float(f), 1), "power": round(float(p), 4)}
            for f, p in zip(freqs[chart_mask], psd[chart_mask])
        ]

        return {
            "status": status,
            "window_type": window_type,
            "is_full_window": bool(n_samples >= 512),
            "is_signal_valid": is_signal_valid,
            "validity_status": validity_status,
            "validity_message": validity_msg,
            "clipping_count": max(raw_clipped, filt_clipped),
            "sampling_rate_used": round(fs, 1),
            "window_samples": n_samples,
            "frequency_resolution_hz": round(freq_resolution, 3),
            "total_power_uv2": round(total_supported_power, 2),
            "alpha_peak_hz": round(alpha_peak_freq, 1) if alpha_peak_freq is not None else None,
            "bands": {
                "delta": {
                    "name": "Delta",
                    "range_hz": "0.5–4.0 Hz",
                    "power_uv2": round(delta_pwr, 2),
                    "relative_percent": round(rel_delta, 1),
                    "is_available": True,
                },
                "theta": {
                    "name": "Theta",
                    "range_hz": "4.0–8.0 Hz",
                    "power_uv2": round(theta_pwr, 2),
                    "relative_percent": round(rel_theta, 1),
                    "is_available": True,
                },
                "alpha": {
                    "name": "Alpha",
                    "range_hz": "8.0–13.0 Hz",
                    "power_uv2": round(alpha_pwr, 2),
                    "relative_percent": round(rel_alpha, 1),
                    "is_available": True,
                },
                "beta": {
                    "name": "Beta",
                    "range_hz": "13.0–29.5 Hz",
                    "power_uv2": round(beta_pwr, 2),
                    "relative_percent": round(rel_beta, 1),
                    "is_available": True,
                },
                "gamma": {
                    "name": "Gamma",
                    "range_hz": "> 30.0 Hz",
                    "power_uv2": 0.0,
                    "relative_percent": 0.0,
                    "is_available": False,
                    "note": "Cut off by 29.5 Hz hardware bandpass filter on BioAmp EXG PCB",
                    "unavailable_reason": "Cut off by 29.5 Hz hardware bandpass filter on BioAmp EXG PCB",
                },
            },
            "psd_points": psd_points,
            "psd_spectrum": psd_points,
        }

    def evaluate_signal_quality(
        self,
        samples: Union[List[float], np.ndarray],
        fs: float = 256.0,
        timestamps_ms: Optional[List[int]] = None,
        raw_samples: Optional[Union[List[float], np.ndarray]] = None,
        total_power: Optional[float] = None
    ) -> Dict[str, Any]:
        """
        Computes direct physical measurements and heuristic indicators for signal quality:
        - Flatline detection: amplitude peak-to-peak < 1.0 uV
        - Clipping / ADC rail: sample magnitude >= 980.0 uV (BioAmp 12-bit ADC nominal range +/- 1033 uV)
        - Baseline drift: DC offset > 100.0 uV or PTP > 800 uV
        - High-frequency noise: fast jitter / non-physiological spikes
        - Step transient / pop: sudden jumps > 450 uV in single sample
        - Missing samples: detected gaps in sample timestamps
        """
        data = np.asarray(samples, dtype=np.float64)
        n = len(data)

        if n < 64 or not np.isfinite(data).all():
            cat = "DISCONNECTED" if n == 0 else "WARMING_UP"
            return {
                "is_acceptable": False,
                "overall_quality": cat,
                "quality_category": cat,
                "quality_score": 0,
                "score": 0,
                "flatline": n == 0,
                "clipping": False,
                "clipping_count": 0,
                "baseline_drift": False,
                "noise": False,
                "is_pop": False,
                "is_unphysiological": False,
                "missing_samples_count": 0,
                "peak_to_peak_uv": round(float(np.ptp(data)), 2) if n > 0 else 0.0,
                "mean_uv": round(float(np.mean(data)), 2) if n > 0 else 0.0,
                "std_uv": round(float(np.std(data)), 2) if n > 0 else 0.0,
                "sampling_stability": "Disconnected" if n == 0 else f"Warming Up ({n}/512 samples)",
                "metrics": {
                    "flatline": n == 0,
                    "clipping": False,
                    "clipping_count": 0,
                    "baseline_drift": False,
                    "high_freq_noise": False,
                    "is_pop": False,
                    "is_unphysiological": False,
                    "gap_count": 0,
                    "mean_uv": round(float(np.mean(data)), 2) if n > 0 else 0.0,
                    "std_uv": round(float(np.std(data)), 2) if n > 0 else 0.0,
                    "max_uv": round(float(np.max(data)), 2) if n > 0 else 0.0,
                    "min_uv": round(float(np.min(data)), 2) if n > 0 else 0.0,
                },
                "flags": ["NO_DEVICE_CONNECTED"] if n == 0 else ["WARMING_UP_BUFFER"],
            }

        peak_to_peak = float(np.ptp(data))
        mean_val = float(np.mean(data))
        std_val = float(np.std(data))

        # Inspect raw samples if provided to catch unattenuated ADC saturation
        raw_arr = np.asarray(raw_samples, dtype=np.float64) if raw_samples is not None else data
        raw_ptp = float(np.ptp(raw_arr))
        raw_mean = float(np.mean(raw_arr))
        raw_std = float(np.std(raw_arr))

        # Flatline: no microvolt variation (< 1.0 uV)
        is_flatline = bool(peak_to_peak < 1.0 or std_val < 0.5 or raw_ptp < 1.0)

        # Clipping / Rail: saturation on 12-bit ADC (nominally +/-1033 uV full scale)
        # Any sample with magnitude >= 980.0 uV indicates proximity to the ADC rail
        raw_clipped = int(np.sum(np.abs(raw_arr) >= 980.0))
        filt_clipped = int(np.sum(np.abs(data) >= 980.0))
        clipped_count = max(raw_clipped, filt_clipped)
        is_clipping = bool(clipped_count >= 1 or np.any(np.abs(raw_arr) >= 980.0) or np.any(np.abs(data) >= 980.0))

        # Step transient / pop: abrupt jump (> 450 uV in single sample)
        max_step = float(np.max(np.abs(np.diff(raw_arr)))) if len(raw_arr) > 1 else 0.0
        is_pop = bool(max_step > 450.0)

        # Baseline Drift: DC offset exceeds 100 uV on either raw or filtered, or large range
        is_drift = bool(abs(raw_mean) > 100.0 or abs(mean_val) > 100.0 or raw_ptp > 800.0)

        # High-frequency noise: standard deviation of first differences
        diff_std = float(np.std(np.diff(data)))
        is_noisy = bool(diff_std > 50.0)

        # Unphysiological EEG amplitude: EEG std > 200 uV or PTP > 1500 uV, or total spectral power > 2500 uV^2
        is_unphysiological_spectral = bool(total_power is not None and total_power > 2500.0)
        is_unphysiological = bool(std_val > 200.0 or peak_to_peak > 1500.0 or raw_std > 300.0 or is_unphysiological_spectral)

        # Missing samples from timestamps
        missing_count = 0
        if timestamps_ms and len(timestamps_ms) > 1:
            intervals = np.diff(timestamps_ms)
            expected_interval_ms = (1000.0 / fs) if fs > 0 else 3.9
            missing_count = int(np.sum(intervals > (expected_interval_ms * 1.8)))

        # Quality scoring (0 to 100)
        score = 100
        if is_flatline:
            score -= 80
        if is_clipping:
            score -= 80  # Severe ADC rail saturation
        if is_pop:
            score -= 40
        if is_drift:
            score -= 30
        if is_noisy:
            score -= 25
        if is_unphysiological:
            score -= 50
        if missing_count > 0:
            score -= min(missing_count * 5, 25)

        score = max(0, min(100, score))

        # Strict Categorization: Under HARDWARE clipping or unphysiological artifact, quality CANNOT be GOOD or EXCELLENT
        if is_clipping:
            category = "POOR"
            score = min(score, 20)
            is_acceptable = False
        elif is_unphysiological or is_flatline:
            category = "POOR"
            score = min(score, 30)
            is_acceptable = False
        elif score >= 80:
            category = "EXCELLENT"
            is_acceptable = True
        elif score >= 60:
            category = "GOOD"
            is_acceptable = not is_drift and not is_pop
        elif score >= 40:
            category = "FAIR"
            is_acceptable = False
        else:
            category = "POOR"
            is_acceptable = False

        flags = []
        if is_flatline:
            flags.append("FLATLINE_DETECTED")
        if is_clipping:
            flags.append("ADC_RAIL_SATURATION")
        if is_pop:
            flags.append("ELECTRODE_DISCONNECT_POP")
        if is_drift:
            flags.append("BASELINE_DRIFT")
        if is_noisy:
            flags.append("HIGH_FREQUENCY_NOISE")
        if is_unphysiological:
            flags.append("UNPHYSIOLOGICAL_AMPLITUDE")
        if missing_count > 0:
            flags.append("PACKET_JITTER_GAPS")

        return {
            "is_acceptable": is_acceptable,
            "overall_quality": category,
            "quality_category": category,
            "quality_score": score,
            "score": score,
            "flatline": is_flatline,
            "clipping": is_clipping,
            "clipping_count": clipped_count,
            "baseline_drift": is_drift,
            "noise": is_noisy,
            "is_pop": is_pop,
            "is_unphysiological": is_unphysiological,
            "missing_samples_count": missing_count,
            "peak_to_peak_uv": round(peak_to_peak, 2),
            "mean_uv": round(mean_val, 2),
            "std_uv": round(std_val, 2),
            "sampling_stability": "Stable" if missing_count == 0 else f"{missing_count} Jitter Gaps",
            "metrics": {
                "flatline": is_flatline,
                "clipping": is_clipping,
                "clipping_count": clipped_count,
                "baseline_drift": is_drift,
                "high_freq_noise": is_noisy,
                "is_pop": is_pop,
                "is_unphysiological": is_unphysiological,
                "gap_count": missing_count,
                "mean_uv": round(mean_val, 2),
                "std_uv": round(std_val, 2),
                "max_uv": round(float(np.max(data)), 2),
                "min_uv": round(float(np.min(data)), 2),
            },
            "flags": flags,
        }

    def _empty_bandpower_response(self, status: str = "NO_DATA", window_samples: int = 0) -> Dict[str, Any]:
        return {
            "status": status,
            "window_type": "--",
            "is_full_window": False,
            "is_signal_valid": False,
            "validity_status": status,
            "validity_message": "No EEG data packets available" if status == "NO_DATA" else "Accumulating buffer",
            "clipping_count": 0,
            "sampling_rate_used": self.default_fs,
            "window_samples": window_samples,
            "total_power_uv2": 0.0,
            "alpha_peak_hz": None,
            "frequency_resolution_hz": 1.0,
            "bands": {
                "delta": {"name": "Delta", "range_hz": "0.5–4.0 Hz", "power_uv2": 0.0, "relative_percent": 0.0, "is_available": True},
                "theta": {"name": "Theta", "range_hz": "4.0–8.0 Hz", "power_uv2": 0.0, "relative_percent": 0.0, "is_available": True},
                "alpha": {"name": "Alpha", "range_hz": "8.0–13.0 Hz", "power_uv2": 0.0, "relative_percent": 0.0, "is_available": True},
                "beta": {"name": "Beta", "range_hz": "13.0–29.5 Hz", "power_uv2": 0.0, "relative_percent": 0.0, "is_available": True},
                "gamma": {"name": "Gamma", "range_hz": "> 30.0 Hz", "power_uv2": 0.0, "relative_percent": 0.0, "is_available": False, "note": "Cut off by 29.5 Hz hardware bandpass filter on BioAmp EXG PCB", "unavailable_reason": "Cut off by 29.5 Hz hardware bandpass filter on BioAmp EXG PCB"},
            },
            "psd_points": [],
            "psd_spectrum": [],
        }


dsp_service = DSPService()
