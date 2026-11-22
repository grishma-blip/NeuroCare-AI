import numpy as np
from scipy import stats
from typing import Dict, Any, List, Optional
from backend.dsp import compute_psd, extract_band_powers, DEFAULT_FS

def analyze_cognitive_response(
    baseline_samples: np.ndarray,
    task_trial_1: np.ndarray,
    task_trial_2: Optional[np.ndarray] = None,
    fs: float = DEFAULT_FS,
    target_band: str = "alpha"
) -> Dict[str, Any]:
    """
    Perform rigorous event-related spectral power comparison between resting baseline
    and instructed mental imagery task trials.

    Evaluates Event-Related Desynchronization (ERD) or Synchronization (ERS):
        Power Shift % = ((P_task - P_baseline) / P_baseline) * 100

    Outputs strictly bounded research labels:
    - 'Experimental task-related EEG response observed'
    - 'No reliable task-related response detected'
    - 'Inconclusive'
    """
    # Validation
    min_samples = int(fs * 4.0)  # at least 4 seconds per epoch
    if len(baseline_samples) < min_samples or len(task_trial_1) < min_samples:
        return {
            "result_label": "Inconclusive",
            "p_value": 1.0,
            "power_shift_percent": 0.0,
            "repeatability": 0.0,
            "baseline_power_uv2": 0.0,
            "task_power_uv2": 0.0,
            "trials_analyzed": 1 if len(task_trial_1) >= min_samples else 0,
            "significant": False,
            "details": "Insufficient recording duration in baseline or task segments (minimum 4s required per condition)."
        }

    # Split into 1-second epochs to compute trial distributions and statistical significance
    epoch_len = int(fs * 1.0)
    baseline_epochs = [baseline_samples[i:i + epoch_len] for i in range(0, len(baseline_samples) - epoch_len + 1, epoch_len)]
    trial1_epochs = [task_trial_1[i:i + epoch_len] for i in range(0, len(task_trial_1) - epoch_len + 1, epoch_len)]

    if len(baseline_epochs) < 3 or len(trial1_epochs) < 3:
        return {
            "result_label": "Inconclusive",
            "p_value": 1.0,
            "power_shift_percent": 0.0,
            "repeatability": 0.0,
            "baseline_power_uv2": 0.0,
            "task_power_uv2": 0.0,
            "trials_analyzed": 1,
            "significant": False,
            "details": "Insufficient clean epochs for statistical test."
        }

    def get_epoch_powers(epochs: List[np.ndarray]) -> List[float]:
        pows = []
        for ep in epochs:
            f, p = compute_psd(ep, fs=fs)
            bp = extract_band_powers(f, p)["absolute"].get(target_band, 0.0)
            pows.append(bp)
        return pows

    base_pows = get_epoch_powers(baseline_epochs)
    t1_pows = get_epoch_powers(trial1_epochs)

    mean_base = float(np.mean(base_pows))
    mean_t1 = float(np.mean(t1_pows))

    all_task_pows = list(t1_pows)
    t2_agreement = True
    trials_count = 1

    if task_trial_2 is not None and len(task_trial_2) >= min_samples:
        trial2_epochs = [task_trial_2[i:i + epoch_len] for i in range(0, len(task_trial_2) - epoch_len + 1, epoch_len)]
        if len(trial2_epochs) >= 3:
            t2_pows = get_epoch_powers(trial2_epochs)
            all_task_pows.extend(t2_pows)
            mean_t2 = float(np.mean(t2_pows))
            trials_count = 2

            # Check directional agreement between Trial 1 and Trial 2
            shift_t1 = mean_t1 - mean_base
            shift_t2 = mean_t2 - mean_base
            t2_agreement = (shift_t1 * shift_t2 > 0)  # both desynchronized or both synchronized

    mean_task = float(np.mean(all_task_pows))

    # Power shift percentage
    if mean_base > 1e-9:
        power_shift = float(((mean_task - mean_base) / mean_base) * 100.0)
    else:
        power_shift = 0.0

    # Welch's two-sample t-test (independent samples with unequal variance)
    t_stat, p_val = stats.ttest_ind(base_pows, all_task_pows, equal_var=False)
    p_val = float(p_val) if not np.isnan(p_val) else 1.0

    # Repeatability score (0.0 to 1.0)
    if trials_count == 2:
        repeatability = 0.88 if (t2_agreement and p_val < 0.05) else (0.55 if t2_agreement else 0.25)
    else:
        repeatability = 0.65 if p_val < 0.05 else 0.40

    # Determine scientifically grounded label
    # Significant desynchronization or modulation: p < 0.05 AND abs(power_shift) >= 15% AND trials agree
    if p_val < 0.05 and abs(power_shift) >= 15.0 and t2_agreement:
        result_label = "Experimental task-related EEG response observed"
        note = f"Statistically significant {target_band.capitalize()} modulation ({power_shift:+.1f}%, p={p_val:.4f}) detected across instructed imagery blocks."
        significant = True
    elif p_val >= 0.15 or abs(power_shift) < 8.0:
        result_label = "No reliable task-related response detected"
        note = f"No significant spectral modulation between baseline and task (shift {power_shift:+.1f}%, p={p_val:.4f})."
        significant = False
    else:
        result_label = "Inconclusive"
        note = f"Marginal shift ({power_shift:+.1f}%, p={p_val:.4f}) or inter-trial variability. Additional trials recommended."
        significant = False

    return {
        "result_label": result_label,
        "protocol_name": "Kinesthetic Motor Imagery vs Baseline Rest",
        "target_band": target_band.capitalize(),
        "baseline_power_uv2": round(mean_base, 2),
        "task_power_uv2": round(mean_task, 2),
        "power_shift_percent": round(power_shift, 1),
        "p_value": round(p_val, 4),
        "repeatability": round(repeatability, 2),
        "trials_analyzed": trials_count,
        "significant": significant,
        "details": note,
        "disclaimer": "This is an experimental research prototype calculation. Single-channel acquisition cannot diagnose cognitive motor dissociation or consciousness."
    }

