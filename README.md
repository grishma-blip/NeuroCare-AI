# NeuroCare AI — Real-Time EEG Brainwave Monitoring & Analysis Platform

Welcome to **NeuroCare AI**, an advanced clinical and investigational neuroscience platform integrating single-channel hardware EEG acquisition from the Arduino UNO R4 WiFi + BioAmp EXG Pill, real-time WebSocket waveform streaming, real-time Welch power spectral density (PSD) bandpower analysis, signal quality diagnostics, MongoDB time-series persistence, role-based clinician/doctor workflows, and multi-channel machine learning pipelines (PhysioNet Motor Imagery and DEAP Affective Valence/Arousal estimation).

---

## 1. System Architecture

NeuroCare AI is organized into a single authoritative backend, a modern React research frontend, and embedded Arduino firmware:

```
┌─────────────────────────────────────────────────────────────────────────────────────────┐
│                                NeuroCare AI Platform                                    │
└─────────────────────────────────────────────────────────────────────────────────────────┘
         ▲                                                           ▲
         │ HTTP / REST (/api) & WebSockets (/ws/eeg)                 │ USB CDC Serial
         ▼                                                           ▼ (115200 baud)
┌─────────────────────────┐       ┌───────────────────────────┐   ┌───────────────────────┐
│ Neuro Care AI Frontend  │       │  Neuro Care Backend       │   │ Hardware:             │
│ (React + Vite + TS)     │◄─────►│  (FastAPI + DSP + ML)     │◄──┤ Arduino UNO R4 WiFi   │
│ Port: 5173              │       │  Port: 8000               │   │ + BioAmp EXG Pill v1.0│
└─────────────────────────┘       └─────────────┬─────────────┘   └───────────────────────┘
                                                │
                                                ▼
                                  ┌───────────────────────────┐
                                  │  MongoDB Replica/Local    │
                                  │  (Database: neurocare_db) │
                                  │  Port: 27017              │
                                  └───────────────────────────┘
```

- **Primary Backend (`Neuro Care/`):** FastAPI application with bidirectional WebSocket streaming (`/ws/eeg`), Pydantic v2 schemas, PyMongo repository layer, hardware serial singleton (`ArduinoConnection` / `SerialService`), digital signal processing (`DSPService`), and scikit-learn / MNE scientific machine learning models.
- **Frontend Dashboard (`Neuro Care AI Frontend/`):** React 18 application with TypeScript, Tailwind CSS, Lucide icons, Recharts oscilloscope, and role-based route guards (`AdminRoute`).
- **Hardware Layer (`Neuro Care/hardware/arduino/`):** Arduino UNO R4 WiFi microcontroller with Upside Down Labs BioAmp EXG Pill v1.0 analog front-end.

---

## 2. Hardware Specification & Wiring Guide

### Hardware Components
1. **Microcontroller:** Arduino UNO R4 WiFi (Renesas RA4M1 32-bit ARM Cortex-M4 @ 48 MHz).
2. **Sensor Shield:** Upside Down Labs BioAmp EXG Pill v1.0.
3. **Electrode Cable:** BioAmp Cable V3 (3-lead snap connector, 100 cm).
4. **Electrodes:** Standard pre-gelled Ag/AgCl disposable or repositionable gel electrodes.

### Pin Connections
| BioAmp EXG Pill Pin | Arduino UNO R4 WiFi Pin | Description |
|:-------------------|:-----------------------|:------------|
| **VCC**            | **5V** (or 3.3V)       | Regulated analog power supply |
| **GND**            | **GND**                | Analog ground plane |
| **OUT**            | **A0**                 | Input-referred pre-amplified analog signal |

### Electrode Placement (Standard Single-Lead Frontal Montage)
- **Positive Lead (Red / IN+):** Forehead (Fp1 or Fpz, 2 cm above eyebrow after isopropanol skin prep).
- **Negative Lead (Black / IN-):** Mastoid process behind ear or earlobe.
- **Reference / Ground (Green / REF):** Bony prominence (opposite mastoid or collarbone).

### Analog Signal Specifications
- **Hardware Gain:** 2420× nominal instrumentation amplifier gain.
- **Hardware Analog Bandpass Filter:** 0.5 Hz – 29.5 Hz (on-board active filters).
- **Sampling Frequency:** 256 Hz nominal ($T_s = 3906.25\ \mu\text{s}$). Measured empirically live.
- **ADC Resolution:** 12-bit (0 – 4095) on Renesas RA4M1 ADC.
- **Linear Dynamic Range:** Full-scale saturation at $\pm 2.5\text{V} / 2420 \approx \pm 1033.06\ \mu\text{V}$. Samples $\ge 1000\ \mu\text{V}$ reliably indicate ADC rail clipping.
- **Serial Transmission:** 115200 baud over USB CDC Serial. Format: `<timestamp_ms>,<voltage_microvolts>\r\n`.

### Arduino Firmware
The complete firmware sketch is located at:
[BioAmp_EEG_UnoR4.ino](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/Neuro%20Care/hardware/arduino/BioAmp_EEG_UnoR4.ino)

---

## 3. Real-Time Digital Signal Processing (DSP) & Bandpower Analysis

NeuroCare AI implements rigorous scientific signal processing via `DSPService` (`Neuro Care/backend/services/dsp_service.py`):

1. **Digital Butterworth Filtering:** 2nd-order bandpass filter (0.5 – 29.5 Hz) complementing the analog front-end.
2. **Welch Power Spectral Density (PSD):** Computed using `scipy.signal.welch` across a 512-sample sliding window with Hanning windowing and 50% overlap.
3. **Frequency Band Integration:**
   - **Delta Band (0.5 – 4.0 Hz):** Slow-wave / deep sleep oscillations. Power in $\mu\text{V}^2$ and relative %.
   - **Theta Band (4.0 – 8.0 Hz):** Drowsiness, meditation, and memory encoding. Power in $\mu\text{V}^2$ and relative %.
   - **Alpha Band (8.0 – 13.0 Hz):** Relaxed alertness and posterior rhythm. Power in $\mu\text{V}^2$, relative %, and dominant alpha peak frequency (Hz).
   - **Beta Band (13.0 – 29.5 Hz):** Active concentration and motor engagement. Power in $\mu\text{V}^2$ and relative %.
   - **Gamma Band (> 30.0 Hz) — SCIENTIFIC INTEGRITY CUTOFF:** Explicitly marked as **UNAVAILABLE** (`is_available: false`) with UI badge *"Outside hardware bandwidth (0.5–29.5 Hz bandpass)"*. Fabricated values are strictly avoided because the BioAmp EXG Pill analog filter hardware attenuates frequencies > 29.5 Hz.

### Real-Time Signal Quality Diagnostics
- **Flatline Alert:** Evaluates peak-to-peak amplitude $< 1.0\ \mu\text{V}$ and standard deviation $< 0.5\ \mu\text{V}$ to detect electrode disconnection.
- **Clipping / Rail Saturation:** Detects samples $\ge 1000.0\ \mu\text{V}$ indicating 12-bit ADC ceiling saturation.
- **DC Baseline Drift:** Detects mean DC offset $> 100.0\ \mu\text{V}$.
- **High-Frequency Noise:** Evaluates standard deviation of first differences $> 50.0\ \mu\text{V}$ to detect EMG / muscle tension artifacts.
- **Packet Jitter / Missing Samples:** Detects timestamp intervals exceeding $1.8 \times T_s$ ($> 7.0\text{ ms}$).

---

## 4. Operating Modes

The acquisition subsystem supports 3 distinct, mutually exclusive operating modes:
- **`HARDWARE` / `HARDWARE_TEST`:** Connects to the physical USB CDC serial port of the Arduino UNO R4 WiFi. Reads actual microvolt lines. If disconnected, reports `DISCONNECTED` and flatline warning — **never substitutes simulated or mock samples**.
- **`DEMO`:** For offline verification and presentations without hardware. Generates physiological 256 Hz single-channel EEG waveforms with distinct Alpha (10.2 Hz), Theta (5.8 Hz), Delta (2.1 Hz), and Beta (18.4 Hz) components and realistic Gaussian microvolt noise through the complete DSP pipeline.
- **`REPLAY`:** For benchmark dataset analysis (DEAP 32-channel affect trials and PhysioNet 64-channel motor imagery trials).

---

## 5. Role-Based Access Control (RBAC) & Dashboard Workflows

NeuroCare AI maintains a clear clinical hierarchy:
1. **Clinician / Nurse Dashboard:**
   - 9-step guided Recording Assistant (`/recording-assist`): Participant selection, protocol assignment, consent verification, BioAmp placement instructions, electrode impedance check, recording authorization, live hardware recording, and completion summary.
   - Sessions list (`/sessions`), Participant intake (`/participants`), and Device diagnostics (`/device`).
   - Protected by route guards (`<AdminRoute>`) in `App.tsx` that safely redirect nurses attempting direct URL navigation to Doctor/Admin pages.
2. **Doctor / Administrator Dashboard:**
   - Real-Time Single-Channel Oscilloscope (`/live`): Live streaming waveform ($\mu\text{V}$), Welch bandpower breakdown, live PSD spectrum, physical telemetry, and hardware recording controls.
   - Spectral & Signal Analysis (`/analysis`): Post-recording PSD analysis connected to `POST /sessions/{id}/psd` calculating bandpowers directly from persisted MongoDB EEG records.
   - Motor Imagery / Cognitive Response (`/cognitive`): PhysioNet 64-channel CSP + LDA analysis.
   - Affective Emotion Analysis (`/emotion`): DEAP 32-channel Ridge Classification with Conformal Prediction.
   - Clinical Reports (`/reports`) and User Management (`/users`).

---

## 6. Machine Learning Models & Channel Compatibility Matrix

| Pipeline | Model Architecture | Training Dataset | Required Channels | Sampling Rate | Input Window / Epoch | Supported Mode |
|:---|:---|:---|:---:|:---:|:---:|:---:|
| **Signal Quality Analysis** | Random Forest Classifier (`eeg_quality_model.joblib`) | Synthetic / Pre-calibrated | **2 Channels** (Fp1, Fp2) | 250 Hz | 500 samples (2.0s) | Replay / Dual-Channel |
| **Motor Imagery (CMD)** | CSP + StandardScaler + LDA (`binary_motor_imagery_csp_lda.joblib`) | PhysioNet EEG Motor Movement/Imagery | **64 Channels** (10-20 standard) | 128 Hz | 385 samples (3.0s) | REPLAY |
| **Affective Emotion Analysis** | Ridge Classifier + Conformal Prediction (`valence_arousal_ridge_v1.joblib`) | DEAP 32-Channel Dataset | **32 Channels** (10-20 standard) | 128 Hz | 512 samples (4.0s) | REPLAY |
| **Live BioAmp Acquisition** | Live Oscilloscope + Welch PSD + Batch Persistence | Physical BioAmp Sensor | **1 Channel** (EEG_A0) | 256 Hz | Continuous (256 samples/batch) | HARDWARE / DEMO |

---

## 7. API Endpoint Reference

All endpoints are served under `/api` alongside WebSocket routes:

### WebSockets
- `WS /ws/eeg` & `WS /api/ws/eeg` — Bidirectional WebSocket streaming raw & filtered sample batches, live Welch bandpowers, PSD spectrum points, and telemetry every ~120ms. Accepts client command actions (`ping`, `set_mode`, `start_recording`, `stop_recording`, `get_status`).

### Device & Telemetry
- `GET /api/health` — Backend and MongoDB health verification.
- `GET /api/device/status` — Live hardware telemetry, connection state, measured $f_s$, total samples received, and recording state.
- `GET /api/device/ports` — Scans system serial/COM ports identifying candidate Arduino devices.
- `POST /api/device/connect` — Connects USB serial interface to specified port and baud rate.
- `POST /api/device/disconnect` — Safely closes serial port.
- `POST /api/device/mode` — Dynamically switches acquisition mode (`HARDWARE`, `HARDWARE_TEST`, `DEMO`, `REPLAY`).
- `POST /api/device/start-recording` — Binds hardware acquisition to active recording session.
- `POST /api/device/stop-recording` — Stops recording and flushes pending samples to MongoDB.

### Participants
- `POST /api/participants` — Register participant (`participant_code`, `age` [18–120], `gender`, `consent_obtained: true`, `created_by`).
- `GET /api/participants` — List registered participants (optional filter by `status`).
- `GET /api/participants/{id}` — Retrieve participant detail.
- `PATCH /api/participants/{id}/status` — Update participant status (`active`, `inactive`, `withdrawn`).
- `POST /api/participants/{id}/calibrate-emotion` — Create baseline calibration profile.
- `GET /api/participants/{id}/calibration` — Retrieve active calibration profile.

### Recording Sessions & EEG Data
- `POST /api/sessions` — Create session (`participant_id`, `created_by`, `protocol_name`, `data_mode`, `sampling_rate`, `channel_count`).
- `GET /api/sessions` — List sessions with total batches and sample counts.
- `GET /api/sessions/{id}` — Retrieve session document.
- `PATCH /api/sessions/{id}/start` — Transition session status from `scheduled` to `recording` and initiate hardware acquisition.
- `PATCH /api/sessions/{id}/stop` — Transition session status from `recording` to `completed`, calculate duration, and flush final buffer.
- `POST /api/sessions/{id}/eeg-records` — Persist raw microvolt batch (`samples: number[][]`, `sampling_rate`, `channel_names`, `data_mode`).
- `GET /api/sessions/{id}/eeg-records` — Retrieve recorded microvolt batches from MongoDB.
- `POST /api/sessions/{id}/psd` — Computes rigorous Welch PSD and bandpowers directly from persisted MongoDB EEG records.
- `POST /api/sessions/{id}/replay-deap` — Inject 512 samples × 32 channels of benchmark DEAP trial data.

### Machine Learning Analysis & Evaluation
- `POST /api/sessions/{id}/analyze-quality` — 2-channel Random Forest signal quality evaluation.
- `POST /api/sessions/{id}/analyze-motor-imagery` — 64-channel PhysioNet CSP + LDA hand movement classification.
- `POST /api/sessions/{id}/analyze-emotion` — 32-channel DEAP Ridge Classifier affect estimation with conformal prediction.
- `POST /api/sessions/{id}/ground-truth` — Submit Self-Assessment Manikin (SAM) valence/arousal ratings.
- `GET /api/sessions/{id}/evaluation` — Evaluate ML predictions against ground truth with absolute error metrics.

---

## 8. Quality Assurance & Verification Results

| Test Category | Target Component | Result | Details |
|:---|:---|:---:|:---|
| **Python Unit & Integration Tests** | `Neuro Care/tests/` | **PASS (43/43)** | 100% test pass rate across hardware, DSP, WebSockets, API, and ML modules |
| **Frontend TypeScript Typecheck** | `Neuro Care AI Frontend/` | **PASS (0 errors)** | `npm run typecheck` exited with code 0 |
| **Frontend Production Build** | `Neuro Care AI Frontend/` | **PASS (1.75s)** | `npm run build` generated production bundle cleanly |
| **Real-Time WebSocket Streaming** | `/ws/eeg` & `/api/ws/eeg` | **PASS** | Continuous bidirectional streaming with client action handlers |
| **Welch Bandpower & Gamma Cutoff** | `DSPService` & Live Monitoring | **PASS** | Validated Delta/Theta/Alpha/Beta powers; Gamma explicitly disabled |
| **MongoDB Auto-Persistence** | `SerialService` Batching | **PASS** | 256-sample batches automatically inserted into `eeg_records` |
| **Role-Based Access Guards** | `App.tsx` `<AdminRoute>` | **PASS** | Restricts doctor-only routes from unauthorized clinician access |

---

*NeuroCare AI is an investigational research platform. Non-diagnostic. Designed for ethical neuroscience inquiry and brain-computer interface research.*
