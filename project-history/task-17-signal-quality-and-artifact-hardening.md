# Task 17: Signal Quality & Artifact Hardening — BioAmp Hardware Saturation, DC Drift & Bandpower Validity

**Date:** 2026-11-21  
**Author:** Antigravity (Google DeepMind)  
**Status:** IMPLEMENTED & TESTED  
**Primary Goal:** Investigate 5 user screenshots captured with physical BioAmp hardware, diagnose root causes of suspicious readings (e.g. 22,759 µV² Theta, 71,462 µV² and 453,579 µV² Delta, Peak Alpha 8 Hz and 13 Hz), prevent artifact-dominated signals from displaying as valid brainwaves, and harden the pre-recording acquisition checklist.

---

## 1. Executive Summary & Root Cause Diagnosis

### The Five User Screenshots
1. **Screenshot 1 & 2 (`media_dd8a9ae2.jpg`, `media_5fcdc596.jpg`):**
   - Waveform: Severe rail-to-rail oscillation with flat-topped and flat-bottomed square clipping.
   - Tooltip: `Raw BioAmp: -1032.81 µV`, `Filtered: 42.46 µV`.
   - Power: Theta reaches $22,759.46\ \mu\text{V}^2$ ($89\%$), Alpha $1,421.08\ \mu\text{V}^2$, Beta $1,336.98\ \mu\text{V}^2$, Peak Alpha $13\text{ Hz}$.
   - Warning overlay: `High Frequency / EMG Muscle Artifact`.
2. **Screenshot 3 (`media_aa6c754c.jpg`):**
   - Waveform: Raw trace near bottom rail, slowly drifting upwards.
   - Power: Delta reaches $71,462.31\ \mu\text{V}^2$ ($99.3\%$), Peak Alpha $8\text{ Hz}$.
   - PSD: Massive low-frequency wall concentrated at $0.5\text{–}1.0\text{ Hz}$ ($>100,000\ \mu\text{V}^2/\text{Hz}$).
   - Readiness: `Check Electrodes` (amber alert).
3. **Screenshot 4 (`media_7f822d30.jpg`):**
   - Waveform: Saturated square wave.
   - Diagnostics: `Last Sample (A0): 1031.42 µV`, Total Power $13,788.86\ \mu\text{V}^2$, Peak Alpha $13\text{ Hz}$.
4. **Screenshot 5 (`media_70189ae8.jpg`):**
   - Waveform: Abrupt drop to $-1033\ \mu\text{V}$, sharp jump to $+1033\ \mu\text{V}$, followed by a multi-second exponential decay.
   - Power: Total Power $453,579.45\ \mu\text{V}^2$, Delta $316,716.15\ \mu\text{V}^2$ ($69.8\%$), Theta $111,187.52\ \mu\text{V}^2$ ($24.5\%$).

---

## 2. Root Cause Analysis

### A. ADC Clipping & Rail Saturation (Screenshots 1, 2, 4)
- **The Hardware Limit:** The Arduino UNO R4 RA4M1 12-bit ADC has a $5.0\text{ V}$ reference voltage ($0\text{–}4095$ counts).
- **The Voltage Formula:** $V_{\text{in}} = \frac{V_{\text{adc}} - 2.5\text{ V}}{2420} \times 10^6\ \mu\text{V}$.
  - At ADC Code $0$ ($0.0\text{ V}$): $V_{\text{in}} = \frac{-2.5}{2420} \times 10^6 = -1033.06\ \mu\text{V}$ (matches tooltip $-1032.81\ \mu\text{V}$!).
  - At ADC Code $4095$ ($5.0\text{ V}$): $V_{\text{in}} = \frac{+2.5}{2420} \times 10^6 = +1033.06\ \mu\text{V}$ (matches telemetry $+1031.42\ \mu\text{V}$!).
- **Why It Happens:** The BioAmp EXG Pill has a high gain of $2420\times$. When electrodes (IN+, IN-, or REF) have high impedance, dry skin contact, or are floating in air, ambient 50 Hz electric mains noise (typically $50\text{–}100\text{ mV}$) is amplified to hundreds of volts. The op-amp saturates against the supply rails, producing flat-topped square waves.
- **Why Theta is 22,759 µV²:** Sampling an aliased, saturated square wave creates harmonics and subharmonics concentrated around 6–8 Hz. Because Theta is $4.0\text{–}8.0\text{ Hz}$, all this saturation energy is dumped into Theta.
- **Why Peak Alpha is 13 Hz:** The second harmonic of the 7 Hz square wave lands at $\sim 14\text{ Hz}$, whose lower skirt peaks at the Alpha boundary ($12.5\text{–}13.0\text{ Hz}$).

### B. Delta Dominance (71,462 µV² and 316,716 µV²) from DC Step Transients (Screenshots 3 & 5)
- **The Physics of Electrode Motion:** Touching or moving an electrode causes a sudden shift in the half-cell potential between the Ag/AgCl metal and the skin electrolyte (often $10\text{–}50\text{ mV}$).
- **The High-Pass Filter Response:** The BioAmp analog high-pass filter ($0.5\text{ Hz}$) responds to a step jump with an exponential decay curve taking 1–3 seconds to settle.
- **The Spectral Consequence:** In a 512-sample ($2.0\text{ s}$) Welch window, an exponential step decay possesses immense spectral power at low frequencies ($\propto \frac{1}{f^2}$). The lowest frequency bins ($0.5\text{–}1.0\text{ Hz}$) reach $>100,000\ \mu\text{V}^2/\text{Hz}$, which integrates into $71,462\ \mu\text{V}^2$ and $316,716\ \mu\text{V}^2$ in Delta ($0.5\text{–}4.0\text{ Hz}$).
- **Why Peak Alpha is 8 Hz in Screenshot 3:** In a monotonically decreasing $\frac{1}{f^2}$ spectrum, the maximum within the Alpha band $[8.0\text{ Hz}, 13.0\text{ Hz}]$ is mathematically always at the lowest boundary ($8.0\text{ Hz}$). It is not a brainwave; it is the tail of a DC transient!

### C. The Software Blindspot Previously Present
- `evaluate_signal_quality()` was previously passed the *filtered* samples (`self.filtered_samples`), where the 0.5 Hz highpass filter removed the DC component and attenuated amplitudes to $<1000\ \mu\text{V}$.
- Consequently, `is_clipping` evaluated to `False`, allowing the pre-recording checklist to display a misleading `Signal In Range` green check even when the raw ADC was saturated at $-1032.81\ \mu\text{V}$!
- Furthermore, spectral calculations had no `is_signal_valid` flag, so the UI displayed tens of thousands of $\mu\text{V}^2$ as genuine brainwaves.

---

## 3. Code Modifications Made

### 1. `backend/services/dsp_service.py`
- **Raw Sample Inspection:** `evaluate_signal_quality` and `compute_bandpowers` now accept `raw_samples: Optional[Union[List[float], np.ndarray]]`.
- **ADC Rail Saturation Detection:** Examines `raw_samples` for values with $|V_{\text{raw}}| \ge 980.0\ \mu\text{V}$ ($>95\%$ of the $\pm 1033\ \mu\text{V}$ rail). When $\ge 2$ samples clip, `is_clipping` is `True`, score drops to $\le 30$ (`POOR`), and `is_acceptable` becomes `False`.
- **Electrode Pop / Step Jump Detection:** Added `is_pop` when single-sample difference exceeds $450\ \mu\text{V}$.
- **Unphysiological Power Guard:** When total power exceeds $2500\ \mu\text{V}^2$ (or std $>200\ \mu\text{V}$), flags `UNPHYSIOLOGICAL_AMPLITUDE` / `ARTIFACT_DOMINATED`.
- **Bandpower Validity Enforcement:** `compute_bandpowers` evaluates `is_signal_valid`. If clipping, drift, or unphysiological power is detected:
  - `is_signal_valid` is set to `False`.
  - `validity_status` returns `"SATURATED_CLIPPING"`, `"BASELINE_DRIFT"`, or `"ARTIFACT_DOMINATED"`.
  - `validity_message` explains the physical hardware cause and corrective action.
  - `alpha_peak_hz` is set to `None` to prevent displaying false harmonic/drift peaks!

### 2. `backend/services/serial_service.py`
- In `get_live_dsp_analysis()`, both `raw_window` and `filt_window` are sliced from the sample buffers and passed to `compute_bandpowers` and `evaluate_signal_quality`.

### 3. `Neuro Care AI Frontend/src/types/index.ts`
- Added `is_signal_valid`, `validity_status`, `validity_message`, `clipping_count`, `clipping_ratio` to `LiveDspBandAnalysis`.
- Added `clipping_count`, `is_pop`, `is_unphysiological` to `LiveSignalQuality.metrics`.

### 4. `Neuro Care AI Frontend/src/pages/LiveMonitoringPage.tsx`
- **4-Stage Acquisition Readiness Strip:**
  1. `1. Device Connected`
  2. `2. Signal Stream (256 Hz)`
  3. `3. Signal Quality Clean / ADC Saturated (Check Electrodes) / Baseline Drift / Muscle Artifact`
  4. `4. Recording Ready / Recording Blocked (Poor Signal)`
- **Artifact-Dominated Warning Banner:** When `!isSignalValid`, displays an explicit alert in the Brainwave Frequency Bands card explaining that the values reflect physical amplifier saturation or DC drift rather than genuine cortical EEG.
- **Bandpower Display Guard:** Saturated bandpowers display with an `(Artifact)` label, percentages render `--%`, and the bar width stays $0\%$.
- **Peak Alpha Guard:** Peak Alpha renders `-- Hz (Artifact)` when the signal is contaminated.
- **Pre-Recording Protection:** `handleStartRecording` prompts the operator with a confirmation warning if signal quality is unacceptable before recording contaminated data.

---

## 4. Verification Results

### 4.1 Automated Backend Pytest Suite
```text
tests/test_deap_loader_and_models.py .....                               [  9%]
tests/test_deap_preprocessing.py .....                                   [ 19%]
tests/test_dsp_and_streaming.py .................                        [ 52%]
tests/test_emotion_api.py ....                                           [ 60%]
tests/test_emotion_service.py ....                                       [ 68%]
tests/test_end_to_end_pipeline.py ....                                   [ 76%]
tests/test_multi_participant_workflow.py ......                          [ 88%]
tests/test_serial_and_hardware.py ......                                 [100%]
======================== 51 passed, 1 warning in 12.89s ========================
```

### 4.2 Frontend Typecheck & Build
- `npm run typecheck`: **0 errors**.
- `npm run build`: **Built in 1.79s** (clean bundle in `dist/`).

### 4.3 Simulation of User Screenshot Conditions
- **Case 1 (Saturated 7 Hz Square Wave - Screenshots 1, 2, 4):**
  - Clipping detected: `True` (clipped count: 348)
  - Signal acceptable: `False` | Score: `0` (`POOR`)
  - Validity status: `SATURATED_CLIPPING`
  - Peak Alpha: `None` (suppressed; no false 13 Hz!)
- **Case 2 (DC Step Transient & Drift - Screenshots 3, 5):**
  - Baseline drift: `True` | Pop: `True`
  - Signal acceptable: `False` | Score: `0` (`POOR`)
  - Validity status: `SATURATED_CLIPPING` / `BASELINE_DRIFT`
  - Peak Alpha: `None` (suppressed; no false 8 Hz!)
- **Case 3 (Nominal 15 µV Alpha Wave):**
  - Signal acceptable: `True` | Score: `100` (`EXCELLENT`)
  - Validity status: `VALID`
  - Peak Alpha: `10.0 Hz` (verified active!)

---

## 5. Physical Hardware & Subject Preparation Checklist

To achieve genuine physiological EEG readings during tomorrow's session:
1. **Electrode Skin Preparation:**
   - Clean the skin at the electrode sites with an alcohol swab to remove sebum and dead skin cells.
   - Use standard conductive EEG gel (or fresh pre-gelled Ag/AgCl disposable sticker electrodes).
2. **Electrode Placement (Single-Channel Prefrontal Protocol):**
   - **IN+ (Active Lead):** Forehead (Fp1 or Fp2, $\approx 2.5\text{ cm}$ above the eyebrow).
   - **IN- (Ground/Reference Lead):** Ear lobe or mastoid bone behind the ear.
   - **REF (Common-Mode Bias Lead):** Contralateral ear lobe, opposite mastoid, or bony prominence.
   > [!IMPORTANT]
   > The reference electrode (REF) must NEVER be left floating. A floating REF completely destroys the common-mode rejection ratio (CMRR), causing the amplifier to instantly slam into rail saturation.
3. **Cable Strain Relief:** Secure the electrode lead wire to the subject's collar or shoulder with medical tape so that head movements do not tug on the electrodes and cause DC step transients.
4. **Acquisition Readiness Verification:** Observe the 4-step readiness strip on `http://localhost:5173/live`: verify that Step 3 reads **`3. Signal Quality Clean`** before clicking `Start Recording`.
