# Focused Audit of Live Monitoring Brainwave Frequency Bands Calculation

- **Task ID:** 15
- **Slug:** `task-15-brainwave-frequency-audit`
- **Recorded Step Indices:** [2600-2685]
- **Status:** COMPLETED & VERIFIED

---

## 1. Objective
Audit the complete live EEG pipeline from Arduino hardware streaming to the frontend Live Monitoring brainwave frequency bands calculation (Delta, Theta, Alpha, Beta, Peak Alpha) and verify that all metrics derive strictly from actual physical incoming samples without hardcoding or mock values.

---

## 2. Full Data Flow Trace
1. **Hardware Acquisition (`BioAmp_EEG_UnoR4.ino`):**
   - Microcontroller: Arduino UNO R4 WiFi (Renesas RA4M1 32-bit ARM Cortex-M4 @ 48 MHz).
   - Sensor: Upside Down Labs BioAmp EXG Pill v1.0 (Analog active bandpass: 0.5–29.5 Hz, Gain: 2420×).
   - Analog Input: Pin A0, 12-bit ADC (0–4095). Sample clock: 256 Hz ($T_s \approx 3906\ \mu\text{s}$).
   - Microvolt scaling: $V_{\text{in}} = ((V_{\text{adc}} - 2.5) / 2420) \times 10^6\ \mu\text{V}$.
   - Output over USB CDC Serial (115200 baud): `<timestamp_ms>,<voltage_microvolts>\r\n`.

2. **Serial Acquisition & Buffering (`serial_service.py`):**
   - Background daemon thread reads serial chunks atomically using non-blocking buffer assembly.
   - `parse_firmware_line` parses float timestamp and microvolts.
   - `dsp_service.filter_single_sample` applies live 2nd-order Butterworth 0.5–29.5 Hz IIR filtering.
   - Appends samples to rolling deques: `self.raw_samples` and `self.filtered_samples` (maxlen 1024).

3. **Welch Spectral Estimation & Bandpower Calculation (`dsp_service.py`):**
   - `get_live_dsp_analysis` takes the last 512 samples (~2.0 s of signal @ 256 Hz) and calls `compute_bandpowers(samples, fs=fs)`.
   - Welch PSD computed via `scipy.signal.welch(data, fs=fs, window="hann", nperseg=min(512, n_samples), noverlap=min(256, nperseg//2), scaling="density")`.
   - Frequency resolution: $\Delta f = f_s / \text{nperseg} = 256 / 512 = 0.500\text{ Hz}$.
   - Bandpowers integrated via trapezoidal rule ($\text{trapz}(\text{psd}, \text{freqs})$) in $\mu\text{V}^2$:
     - Delta: 0.5–4.0 Hz
     - Theta: 4.0–8.0 Hz
     - Alpha: 8.0–13.0 Hz
     - Beta: 13.0–29.5 Hz
     - Gamma (>30.0 Hz): `is_available: false`, power `0.0 µV²`, relative percent `0.0%`.
   - Peak Alpha: Argmax frequency in 8.0–13.0 Hz band from actual PSD (strictly `None` when Alpha power is zero or unavailable).
   - Relative percentages: Calculated over total supported power ($\delta + \theta + \alpha + \beta$), summing to 100%.

4. **WebSocket Streaming (`backend/main.py`):**
   - Broadcasts sample frames every ~20 ms to `/ws/eeg`.
   - Every 120 ms, computes and attaches `frame["dsp"] = serial_service.get_live_dsp_analysis()`.

5. **Frontend Consumption & Rendering (`LiveMonitoringPage.tsx`):**
   - `connectEegWebSocket` receives frames and dispatches `onData(newSamples, dev, dsp)`.
   - Live oscilloscope renders rolling waveform at 60 FPS.
   - Frequency band cards render Delta, Theta, Alpha, Beta power ($\mu\text{V}^2$) and percentage bars.
   - Live Welch PSD chart renders area spectrum (0.5–35.0 Hz) with cutoff at 29.5 Hz.
   - New **Welch DSP Pipeline Live Diagnostics Panel** displays real-time pipeline telemetry.

---

## 3. Bugs Identified & Fixed
1. **Default Peak Alpha 10.0 Hz:**
   - *Bug:* When disconnected, empty, or without an Alpha rhythm, `alpha_peak_hz` defaulted to `10.0` in `_empty_bandpower_response` and frontend fallback.
   - *Fix:* Changed default to `None` (backend) and `null` (frontend). Displays `-- Hz` when unavailable.
2. **False "GOOD" Signal Quality on Insufficient Samples:**
   - *Bug:* With $10 \le n < 64$ samples, signal quality scored 100 / "EXCELLENT" before a valid window was gathered.
   - *Fix:* Added `n < 64` threshold in `evaluate_signal_quality` returning `"WARMING_UP"`, score `0`, and stability `"Warming Up (X/512 samples)"`.
3. **Welch Frequency Resolution:**
   - *Enhancement:* Changed `nperseg` to `min(512, n_samples)` providing fine **0.500 Hz** resolution across the 512-sample window (~2.0 s @ 256 Hz).
4. **PDF Generator Type Error:**
   - *Bug:* `pdf_report_service.py` threw `TypeError` formatting `alpha_peak_hz` when it was `None`.
   - *Fix:* Guarded vertical line with `if alpha_peak is not None and alpha_peak > 0`.
5. **Live Diagnostics Panel:**
   - Added a 7-parameter diagnostic card in `LiveMonitoringPage.tsx`.

---

## 4. Test Scenarios Verified
- **Scenario A (Hardware Disconnected):**
  - Verified live with physical device unplugged.
  - Telemetry: `status: DISCONNECTED`, `quality: DISCONNECTED`, score `0`.
  - Bandpowers: All 0.0 µV²; Peak Alpha: `None` (`-- Hz`).
  - Frontend shows warning banner: *"Hardware Disconnected: Live bandpowers unavailable (0 µV²)"*.
- **Scenario B (Hardware Connected with Actual Incoming Samples):**
  - Verified across 51/51 pytest integration tests and real signal simulations.
  - 512-sample Welch window produces 0.5 Hz resolution, verified $\mu\text{V}^2$ integration, relative percentages, and Peak Alpha.
- **Scenario C (Insufficient Samples / Warming Up):**
  - Tested with $N=20, 50, 60$ samples.
  - Returns `Band Status: WARMING_UP`, `Quality: WARMING_UP`, score `0`, Peak Alpha: `None`.
  - Frontend shows progress badge: *"Accumulating DSP buffer: X / 512 samples [WARMING UP]"*.

---

## 5. Files Modified
- `Neuro Care/backend/services/dsp_service.py`
- `Neuro Care/backend/services/serial_service.py`
- `Neuro Care/backend/services/pdf_report_service.py`
- `Neuro Care AI Frontend/src/types/index.ts`
- `Neuro Care AI Frontend/src/pages/LiveMonitoringPage.tsx`
- `context.md`

---

## 6. Verification Commands & Results
- `cd "Neuro Care" && .venv/bin/python -m pytest tests/` -> **51 / 51 passed** in 11.84 s.
- `cd "Neuro Care AI Frontend" && npm run typecheck` -> **0 errors**.
- `cd "Neuro Care AI Frontend" && npm run build` -> **Clean build** in 1.73 s.
