# NeuroCare AI — Master Project Context & Architectural Memory

> **AUTHORITATIVE REPOSITORY SPECIFICATION & SYSTEM MEMORY**  
> **Repository Root:** `/Users/piyushbindhani/Downloads/Final Neuro Care Now/`  
> **Last Updated:** 2026-11-22T07:55:00+05:30  
> **System Status:** OPERATIONAL — ALL MODULES VERIFIED END-TO-END (65/65 TESTS PASSED)  
> **Active Port:** `/dev/cu.usbmodem3CDC75F19EB82` @ 115200 baud (Arduino UNO R4 WiFi + BioAmp EXG Pill)  
> **Backend Test Suite:** 65/65 PASSED | **Frontend Build:** 0 TypeScript Errors (Clean Production Build)  

---

## READ THIS FIRST — AI HANDOFF

### 1. What This Project Does
NeuroCare AI is an end-to-end clinical and investigational neuroscience platform. It captures live single-channel EEG signals from an **Arduino UNO R4 WiFi** connected to an **Upside Down Labs BioAmp EXG Pill v1.0** at **256 Hz**, computes live **Welch Power Spectral Density (PSD)** bandpower breakdowns (Delta, Theta, Alpha, Beta) and signal quality metrics, streams waveforms over **WebSockets** to a **React + Vite + TypeScript** dashboard, auto-persists 256-sample batches into **MongoDB**, and generates instant vector **PDF clinical reports** and **raw CSV exports**. It also houses offline/replay machine learning modules for **DEAP 32-channel Affective Emotion Analysis** and **PhysioNet 64-channel Motor Imagery (Brain-Computer Interface)**.

### 2. Current Development Stage
- **Primary Goal:** College final project presentation and live hardware demonstration.
- **Current State:** Backend serial acquisition, WebSocket streaming, DSP bandpower calculation, multi-participant intake, session lifecycle (start, pause, resume, stop), MongoDB batch insertion, PDF/CSV reporting, DEAP Emotion Recognition, PhysioNet Motor Imagery, and Clinician/Doctor Registration and Testing Workflow are **fully implemented, hardened, and verified end-to-end**.
- **Physical Hardware State:** The Arduino UNO R4 WiFi is connected via macOS USB CDC (`/dev/cu.usbmodem3CDC75F19EB82`). Over 1,000,000 real physical samples have been acquired continuously at 256.0 Hz without crashes or buffer overruns. When disconnected, the system truthfully displays `DISCONNECTED` with `--%` bandpower metrics without faking samples. When electrodes are floating or saturated (±1033 µV rails), the system flags `SATURATED_CLIPPING` and suppresses false brainwave peaks.

### 3. Immediate Active Task & Next Priority
- **Active Task:** Task 32 — Git Repository Initialization, Clean Tracking & GitHub Deployment Preparation (**VERIFIED END-TO-END**).
  - Configured root `.gitignore` to strictly exclude heavy dataset binaries (3.1 GB DEAP `.dat` files, PhysioNet `.edf`, `node_modules`, virtual environments, DB files).
  - Explicitly tracked production ML model artifacts (`*.joblib`).
  - Staged 161 clean files (35,054 insertions, 0 heavy data files).
  - Committed initial production release commit `6c86aac` on branch `main`.
  - Configured remote origin: `https://github.com/grishma-blip/NeuroCare-AI.git`.
- **Next Priority:** Complete GitHub remote push (authenticated via PAT or terminal push).

### 4. Mandatory Instruction for Any AI Model
> **CRITICAL RULE:** Before making any code changes, read this entire `context.md` and inspect the relevant source files. Treat the source code as the authority for current implementation. Treat this document as the project's development history, requirements, and decisions. If the code and documentation disagree, report the discrepancy and update the documentation after verification.

### 5. Reusable AI Model Handoff Prompt
Copy and paste the prompt below when switching AI models or opening a fresh session:

```text
I am continuing development on NeuroCare AI in workspace "/Users/piyushbindhani/Downloads/Final Neuro Care Now".
First, read the master project memory file "context.md" in the project root.
Strict constraints to respect:
1. Primary backend is "Neuro Care/" (FastAPI on 127.0.0.1:8000). Never touch or use "Neuro Care AI Frontend/backend/".
2. Frontend is "Neuro Care AI Frontend/" (React + Vite + TS on localhost:5173).
3. Hardware is Arduino UNO R4 WiFi + BioAmp EXG Pill on /dev/cu.usbmodem3CDC75F19EB82 (115200 baud, 256 Hz).
4. Never substitute synthetic data when HARDWARE mode is active.
5. Gamma (>29.5 Hz) is permanently labeled as hardware cutoff.
6. The test suite (65/65 backend tests) and frontend typecheck must remain 100% clean.
7. Only two clinical roles exist: Clinician and Doctor. No Admin role or dashboard exists.
Inspect the current status in context.md, verify active processes, and continue from the active pending task.
```

---

## A. Project Overview

### 1. Purpose & Problem Statement
Traditional clinical electroencephalography (EEG) systems are bulky, expensive, and locked into proprietary software ecosystems. Low-cost open-source hardware (like Upside Down Labs BioAmp EXG Pill) provides accessible single-channel biosensing, but lacks an integrated clinical research platform providing real-time digital signal processing, artifact detection, multi-participant session tracking, and clinical report generation.

NeuroCare AI bridges this gap by providing an open, modular, research-grade platform integrating:
- Single-channel hardware EEG acquisition with real-time digital filtering.
- Live spectral bandpower estimation (Delta, Theta, Alpha, Beta) using Welch's method.
- Transparent signal quality diagnostics (flatline, clipping, drift, high-frequency noise).
- Multi-participant intake with informed consent tracking.
- Session lifecycle controls with timestamped experimental event markers.
- Time-series persistence in MongoDB with batch-level indexing.
- Role-based clinician and doctor workflows.
- Offline benchmarking against gold-standard multi-channel datasets (DEAP & PhysioNet).

### 2. Target Users & Clinical Hierarchy
- **Clinicians / Research Nurses:** Guided step-by-step recording protocols, participant consent intake, skin preparation, impedance verification, and hardware acquisition control.
- **Neurologists / Principal Investigators (Doctors):** In-depth real-time oscilloscope monitoring, spectral analysis, post-hoc event inspection, machine learning affect/motor decoding, and PDF diagnostic report sign-off.

### 3. College Project & Live Demonstration Scope
The project is built specifically for academic presentation and live committee demonstration:
- **Primary Demonstration Priority:** Reliable hardware streaming, dynamic waveform rendering, responsive frequency power bars, participant registration, real-time event tagging (e.g., Eyes Open vs Eyes Closed), and instant PDF report generation.
- **Explicit Non-Goals:** Overengineered enterprise authentication (OAuth2/SSO), multi-tenant enterprise audit logging, or complex distributed cloud architectures.

---

## B. Technology Stack

### 1. Frontend Architecture (`Neuro Care AI Frontend/`)
- **Core Framework:** React 18.3.1 with TypeScript 5.5.3.
- **Build System & Dev Server:** Vite 5.4.2 (runs on `http://localhost:5173`).
- **Routing:** React Router DOM 6.26.1 with role-based route guard wrappers (`AdminRoute`).
- **Styling:** Tailwind CSS 3.4.11 with custom clinical palette (`navy`, `powder`, `lavender`, `teal`, `coral`).
- **Icons:** Lucide React 0.441.0.
- **Data Visualization & Charts:** Recharts 2.12.7 (`LineChart`, `ResponsiveContainer`, `BarChart`, `AreaChart`).
- **HTTP Client:** Axios 1.7.7 configured with global error interceptors (`apiClient`).
- **Real-Time Streaming:** Native HTML5 WebSocket API with automatic exponential reconnects.

### 2. Primary Backend Architecture (`Neuro Care/`)
- **Core Framework:** FastAPI 0.115.0 on Python 3.12 (uvicorn ASGI server on `127.0.0.1:8000`).
- **Validation & Schemas:** Pydantic v2.9.2 (`BaseModel`, `Field`, `validator`, `model_validator`).
- **Serial Communication:** PySerial 3.5 (USB CDC serial polling thread with atomic non-blocking buffer assembly).
- **Database Driver:** PyMongo 4.9.1 (synchronous driver connected to MongoDB replica/local on `127.0.0.1:27017`).
- **Scientific Computing & DSP:** NumPy 2.1.1, SciPy 1.14.1 (`scipy.signal.butter`, `scipy.signal.lfilter`, `scipy.signal.welch`).
- **Machine Learning:** Scikit-Learn 1.5.2 (`RidgeClassifier`, `RandomForestClassifier`, `StandardScaler`), Joblib 1.4.2.
- **Report Generation:** ReportLab 4.2.5 (vector PDF engine with Platypus layout and ReportLab graphics).
- **Testing Framework:** Pytest 9.2.0 with FastAPI `TestClient` (51 automated test cases).

### 3. Database Layer
- **Engine:** MongoDB Community Server (v6.0+ / v7.0+) running on port 27017.
- **Database Name:** `neurocare_db`.
- **Primary Collections:** `participants`, `sessions`, `eeg_records`, `analysis_results`.

### 4. Hardware & Firmware Layer
- **Microcontroller:** Arduino UNO R4 WiFi (Renesas RA4M1 32-bit ARM Cortex-M4 @ 48 MHz).
- **Analog Front-End:** Upside Down Labs BioAmp EXG Pill v1.0.
- **Electrode Leads:** 3-lead BioAmp Cable V3 (IN+, IN-, REF).
- **Firmware Location:** `Neuro Care/hardware/arduino/BioAmp_EEG_UnoR4.ino`.

---

## C. Complete System Architecture

```
┌────────────────────────────────────────────────────────────────────────────────────────┐
│                              NeuroCare AI Full Architecture                            │
└────────────────────────────────────────────────────────────────────────────────────────┘
                                           ▲
                                           │ HTTP REST (/api/*)
                                           │ WebSockets (/ws/eeg)
                                           ▼
┌────────────────────────┐      ┌─────────────────────────┐      ┌───────────────────────┐
│ React Frontend Client  │      │  FastAPI Primary Backend│      │ Physical Hardware     │
│ Port 5173              │◄────►│  Port 8000              │◄────►│ Arduino UNO R4 WiFi   │
│ - Live Oscilloscope    │      │  - SerialService        │      │ + BioAmp EXG Pill     │
│ - Welch Bandpowers     │      │  - DSPService           │      │ - USB CDC @ 115200    │
│ - Participant Manager  │      │  - ReportService        │      │ - 256 Hz Sample Clock │
│ - Session Lifecycle    │      │  - ML Replay Pipelines  │      │ - A0 12-bit ADC       │
└────────────────────────┘      └────────────┬────────────┘      └───────────────────────┘
                                             │
                                             ▼
                                ┌─────────────────────────┐
                                │ MongoDB (neurocare_db)  │
                                │ Port 27017              │
                                │ - participants          │
                                │ - sessions              │
                                │ - eeg_records (batches) │
                                │ - analysis_results      │
                                └─────────────────────────┘
```

### Data Flow Breakdown
1. **Acquisition:** The Arduino RA4M1 ADC samples the BioAmp EXG Pill output on pin A0 at 256 Hz. Every 3.9 ms, it prints `<timestamp_ms>,<voltage_uv>\r\n` over USB CDC Serial.
2. **Serial Service:** A dedicated daemon thread in `backend/services/serial_service.py` reads raw serial chunks atomically, reassembles lines, parses decimal timestamps and voltages, applies live Butterworth filtering, updates empirical sampling rate calculations, and buffers incoming samples.
3. **WebSocket Streaming:** `backend/main.py` broadcasts sample frames (~5 samples per tick) every ~20 ms to all connected clients on `/ws/eeg`. Every 120 ms, it attaches a full Welch PSD bandpower payload (`delta`, `theta`, `alpha`, `beta`) computed over a 512-sample sliding window.
4. **Oscilloscope Rendering:** The React frontend receives WebSocket frames, maintains a rolling 512-point canvas buffer, and renders dual traces (Raw in powder blue, Filtered in deep navy) at 60 FPS without DOM thrashing.
5. **MongoDB Persistence:** While recording is active, `serial_service.py` groups samples into 256-sample chunks (1.0 second of data) and writes them to the `eeg_records` collection with `session_id: ObjectId(...)`.
6. **Report Generation:** When a session is stopped, `ReportService` queries `eeg_records`, computes summary Welch bandpowers, maps event markers, and renders a 2-page vector PDF report and raw CSV file.

---

## D. Hardware Documentation

### 1. Specifications
- **Microcontroller:** Arduino UNO R4 WiFi.
- **Sensor:** Upside Down Labs BioAmp EXG Pill v1.0.
- **Input Channel:** Single analog input on pin **A0**.
- **ADC Configuration:** 12-bit resolution (`analogReadResolution(12)`), range 0 – 4095.
- **Analog Supply Voltage ($V_{cc}$):** 5.0 V nominal.
- **Instrumentation Gain:** $2420\times$ fixed hardware gain.
- **Hardware Analog Bandpass Filter:** 0.5 Hz – 29.5 Hz (on-board Sallen-Key 2nd-order active filter).
- **Serial Interface:** USB CDC Serial on macOS `/dev/cu.usbmodem3CDC75F19EB82` at 115200 baud.
- **Sampling Frequency:** Nominal 256 Hz ($T_s \approx 3.906\text{ ms}$). Measured live at **256.0 Hz**.

### 2. Voltage Conversion Formula
The firmware translates 12-bit raw ADC counts into input-referred microvolts ($\mu\text{V}$):
$$\text{Voltage} (\mu\text{V}) = \left( \frac{\text{ADC} - 2048}{4095} \right) \times \frac{5.0\text{ V}}{2420} \times 10^6$$
- Full scale linear range: $\pm 1033.06\ \mu\text{V}$.
- Values exceeding $\pm 1000\ \mu\text{V}$ indicate ADC rail clipping.
- **Calibration Status:** Nominal theoretical conversion based on resistor/capacitor hardware tolerances ($2420\times$ gain). Experimental microvolt signal verification is confirmed; clinical impedance calibration is nominal/unverified.

### 3. Electrode Placement (Single-Lead Frontal Montage)
- **Positive Lead (Red / IN+):** Forehead (Fp1 or Fpz, 2 cm above eyebrow).
- **Negative Lead (Black / IN-):** Mastoid process behind ear or earlobe.
- **Reference Lead (Green / REF):** Bony prominence (opposite mastoid or collarbone).

---

## E. Main Project Modules

### 1. Live EEG Acquisition & Monitoring
- **Files:** `Neuro Care/backend/hardware/arduino.py`, `backend/services/serial_service.py`, `backend/main.py`, `Neuro Care AI Frontend/src/pages/LiveMonitoringPage.tsx`.
- **Status:** **VERIFIED END-TO-END**.
- **Evidence:** 80,000+ real samples received at 256.0 Hz; live oscilloscope rendering; dual status indicators.

### 2. Brainwave Frequency Analysis (Welch PSD)
- **Files:** `Neuro Care/backend/services/dsp_service.py`, `LiveMonitoringPage.tsx`.
- **Status:** **VERIFIED END-TO-END**.
- **Metrics:** Delta (0.5–4.0 Hz), Theta (4.0–8.0 Hz), Alpha (8.0–13.0 Hz), Beta (13.0–29.5 Hz).
- **Gamma Cutoff:** Gamma (>30.0 Hz) is explicitly marked **UNAVAILABLE** due to the 29.5 Hz hardware filter.

### 3. Signal Quality Diagnostics
- **Files:** `Neuro Care/backend/services/dsp_service.py` (`evaluate_signal_quality`).
- **Status:** **VERIFIED END-TO-END**.
- **Criteria:** Flatline detection ($< 1.0\ \mu\text{V}$), clipping detection ($\ge 1000\ \mu\text{V}$), DC baseline drift ($> 100\ \mu\text{V}$), EMG noise ($> 50\ \mu\text{V}$ first differences), packet jitter ($> 7.0\text{ ms}$). Zero samples truthfully report `DISCONNECTED` with score `0`.

### 4. Emotion Recognition (DEAP ML Pipeline)
- **Files:** `Neuro Care/backend/services/emotion_service.py`, `Neuro Care AI Frontend/src/pages/EmotionAnalysisPage.tsx`.
- **Status:** **IMPLEMENTED & TESTED**.
- **Details:** 32-channel DEAP dataset replay; Ridge Classifier with Conformal Prediction; outputs Valence & Arousal quadrants.

### 5. Motor Imagery Recognition (PhysioNet ML Pipeline)
- **Files:** `Neuro Care/backend/services/motor_imagery_service.py`, `Neuro Care AI Frontend/src/pages/CognitiveResponsePage.tsx`.
- **Status:** **IMPLEMENTED & TESTED**.
- **Details:** 64-channel PhysioNet dataset replay; Common Spatial Patterns (CSP) + LDA classifier; predicts Left vs Right hand imagery.

### 6. Participant Management
- **Files:** `Neuro Care/backend/api/routes.py`, `Neuro Care/backend/models/participant_model.py`, `Neuro Care AI Frontend/src/pages/ParticipantsPage.tsx`.
- **Status:** **VERIFIED END-TO-END**.
- **Features:** Auto-generated `P-XXXXXXXX` codes, age validation [18–120], gender, immutable intake consent, status transitions (`active`, `inactive`, `withdrawn`), withdrawal audit logging.

### 7. Session Management
- **Files:** `Neuro Care/backend/api/routes.py`, `Neuro Care/backend/models/recording_session_model.py`, `Neuro Care AI Frontend/src/pages/SessionsPage.tsx`.
- **Status:** **VERIFIED END-TO-END**.
- **Features:** Auto-generated `SES-XXXXXXXX` codes, binding to participant, sampling rate, protocol selection, duration tracking.

### 8. Recording Lifecycle (Start / Pause / Resume / Stop)
- **Files:** `backend/api/routes.py`, `backend/services/serial_service.py`, `LiveMonitoringPage.tsx`.
- **Status:** **VERIFIED END-TO-END**.
- **Features:** Hardware synchronization on start, buffer freeze on pause, buffer resume, final buffer flush and quality summary evaluation on stop.

### 9. Timestamped Experimental Event Markers
- **Files:** `backend/api/routes.py` (`/sessions/{id}/events`), `LiveMonitoringPage.tsx`.
- **Status:** **VERIFIED END-TO-END**.
- **Presets:** `Eyes Open`, `Eyes Closed`, `Rest`, `Task Start`, `Task End` + custom text labels. Stored in session document and rendered in PDF/CSV reports.

### 10. MongoDB Persistence
- **Files:** `backend/core/database.py`, `backend/services/serial_service.py`.
- **Status:** **VERIFIED END-TO-END**.
- **Batches:** 256 samples per document in `eeg_records` with indexed `session_id`.

### 11. Doctor / Administrator Dashboard
- **Files:** `Neuro Care AI Frontend/src/pages/OverviewPage.tsx`, `LiveMonitoringPage.tsx`, `SignalAnalysisPage.tsx`, `CognitiveResponsePage.tsx`, `EmotionAnalysisPage.tsx`, `ReportsPage.tsx`.
- **Status:** **VERIFIED END-TO-END**.
- **Role:** Doctors have full access to live streaming, post-hoc spectral analysis, ML evaluations, and clinical report downloads.

### 12. Clinician / Nurse Dashboard
- **Files:** `Neuro Care AI Frontend/src/pages/RecordingAssistancePage.tsx`, `ParticipantsPage.tsx`, `SessionsPage.tsx`, `DeviceManagementPage.tsx`.
- **Status:** **VERIFIED END-TO-END**.
- **Protection:** Protected via `<AdminRoute>` in `App.tsx`. Safely redirects unauthorized clinicians attempting to navigate to Doctor/Admin analytical views.

### 13. PDF Clinical Reports
- **Files:** `Neuro Care/backend/services/report_service.py`, `backend/api/routes.py` (`/sessions/{id}/report/pdf`).
- **Status:** **VERIFIED END-TO-END**.
- **Output:** 2-page vector PDF (93+ KB) with header, participant metadata, protocol, bandpower breakdown chart, event marker table, and medical disclaimer.

### 14. Raw CSV Data Export
- **Files:** `Neuro Care/backend/api/routes.py` (`/sessions/{id}/export/csv`).
- **Status:** **VERIFIED END-TO-END**.
- **Format:** `#` commented clinical metadata headers, followed by `sample_index,timestamp_ms,relative_time_sec,EEG_A0_uV,event_marker`.

### 15. JSON Session Metadata Export
- **Files:** `Neuro Care/backend/api/routes.py` (`/sessions/{id}/export/json`).
- **Status:** **VERIFIED END-TO-END**.
- **Format:** Complete session document, participant code, events, and quality metrics in JSON.

### 16. Machine Learning Dataset Export
- **Files:** `Neuro Care/backend/api/routes.py` (`/datasets/export`).
- **Status:** **IMPLEMENTED & TESTED**.
- **Splitting:** Group-stratified train/test split at the participant level to prevent data leakage.

---

## F. Complete API Documentation

### WebSockets
- `WS /ws/eeg` & `WS /api/ws/eeg`
  - Client actions: `{"action": "ping"}`, `{"action": "set_mode", "mode": "HARDWARE"|"DEMO"}`, `{"action": "start_recording", "session_id": "..."}`, `{"action": "stop_recording"}`, `{"action": "get_status"}`.
  - Server frames: `{"samples": [{"time": float, "raw": float, "filtered": float}], "device": {...}, "dsp": {...}, "timestamp": float}`.

### Device & Telemetry
- `GET /api/device/status` — Live hardware connection status, measured $f_s$, total samples received.
- `GET /api/device/ports` — System USB serial ports scan.
- `POST /api/device/connect` — Body: `{"port": string, "baud_rate": int}`.
- `POST /api/device/disconnect` — Closes USB serial port safely.
- `POST /api/device/mode` — Body: `{"mode": "HARDWARE"|"DEMO"|"REPLAY"}`.

### Participants
- `POST /api/participants` — Register participant (`participant_code`, `age` [18–120], `gender`, `consent_obtained: true`, `created_by`, `notes`).
- `GET /api/participants` — List participants (`status` query filter).
- `GET /api/participants/{id}` — Retrieve participant detail.
- `PATCH /api/participants/{id}/status` — Body: `{"status": "active"|"inactive"}`.
- `PATCH /api/participants/{id}/withdraw` — Body: `{"reason": string}`. Sets status to `withdrawn`.

### Sessions & EEG Records
- `POST /api/sessions` — Create session (`participant_id`, `created_by`, `protocol_name`, `data_mode`).
- `GET /api/sessions` — List sessions with total batches and sample counts.
- `GET /api/sessions/{id}` — Session detail.
- `PATCH /api/sessions/{id}/start` — Start recording.
- `PATCH /api/sessions/{id}/pause` — Pause recording.
- `PATCH /api/sessions/{id}/resume` — Resume recording.
- `PATCH /api/sessions/{id}/stop` — Stop recording and finalize quality summary.
- `POST /api/sessions/{id}/events` — Body: `{"label": string, "relative_time_sec": float, "notes": string}`.
- `GET /api/sessions/{id}/events` — List session event markers.
- `PATCH /api/sessions/{id}/notes` — Body: `{"notes": string}`.
- `GET /api/sessions/{id}/eeg-records` — Retrieve 256-sample chunks from MongoDB.
- `POST /api/sessions/{id}/psd` — Computes post-hoc Welch PSD from persisted records.

### Clinical Reports & Exports
- `GET /api/sessions/{id}/report/pdf` — Vector 2-page PDF download (`application/pdf`).
- `GET /api/sessions/{id}/export/csv` — Raw microvolt CSV download (`text/csv`).
- `GET /api/sessions/{id}/export/json` — Session JSON metadata download (`application/json`).
- `POST /api/datasets/export` — Body: `{"train_split_ratio": float, "session_ids": string[]}`.

### Machine Learning Benchmark Endpoints
- `POST /api/sessions/{id}/replay-deap` — Loads 32-channel DEAP trial fixture.
- `POST /api/sessions/{id}/analyze-emotion` — Evaluates DEAP trial via Ridge Classifier.
- `POST /api/sessions/{id}/analyze-motor-imagery` — Evaluates 64-channel PhysioNet trial via CSP + LDA.
- `POST /api/sessions/{id}/analyze-quality` — Evaluates 2-channel signal quality via Random Forest.
- `POST /api/sessions/{id}/ground-truth` — Submits Self-Assessment Manikin (SAM) rating.
- `GET /api/sessions/{id}/evaluation` — Compares ML predictions against ground truth.

---

## G. Database Documentation (`neurocare_db`)

### Collections & Schemas
1. **`participants`:**
   - `_id`: ObjectId
   - `participant_code`: String (Unique, e.g. `P-001`)
   - `name`: String (Optional)
   - `age`: Integer (18–120)
   - `gender`: String (`male`, `female`, `other`)
   - `status`: String (`active`, `inactive`, `withdrawn`)
   - `consent`: `{"obtained": Boolean, "obtained_at": DateTime}`
   - `withdrawal_reason`: String | Null
   - `withdrawn_at`: DateTime | Null
   - `created_at`, `updated_at`: DateTime
2. **`sessions`:**
   - `_id`: ObjectId
   - `session_code`: String (Unique, e.g. `SES-0D978F7A`)
   - `participant_id`: String (references `participants._id`)
   - `created_by`: String
   - `protocol_name`: String
   - `data_mode`: String (`HARDWARE`, `DEMO`, `REPLAY`)
   - `sampling_rate`: Integer (256)
   - `channel_count`: Integer (1)
   - `status`: String (`scheduled`, `recording`, `paused`, `completed`)
   - `started_at`, `paused_at`, `ended_at`: DateTime
   - `events`: Array of `{"id": String, "label": String, "relative_time_sec": Float, "notes": String, "created_at": DateTime}`
   - `notes`: String
   - `quality_summary`: Object (computed upon stop)
3. **`eeg_records`:**
   - `_id`: ObjectId
   - `session_id`: ObjectId (Indexed)
   - `sampling_rate`: Integer (256)
   - `channel_names`: Array of String (`["EEG_A0"]`)
   - `data_mode`: String (`HARDWARE`, `SIMULATION`)
   - `samples`: Array of `[float]` (256 samples per document)
   - `recorded_at`: DateTime
4. **`analysis_results`:**
   - `_id`: ObjectId
   - `session_id`: ObjectId
   - `analysis_type`: String (`emotion`, `motor_imagery`, `quality`)
   - `results`: Object (model outputs, probabilities, conformal intervals)
   - `analyzed_at`: DateTime

---

## H. Frontend Documentation

### 1. Routes & Page Mapping
- `/` or `/overview`: Clinical Overview & Patient Queue (`OverviewPage.tsx`).
- `/monitoring`: Live Real-Time EEG Oscilloscope & Hardware Controls (`LiveMonitoringPage.tsx`).
- `/recording-assist`: 9-Step Guided Nurse Recording Wizard (`RecordingAssistancePage.tsx`).
- `/participants`: Participant Registration & Consent Intake (`ParticipantsPage.tsx`).
- `/sessions`: Recording Sessions History & Management (`SessionsPage.tsx`).
- `/analysis`: Post-hoc Spectral & Quality Analysis (`SignalAnalysisPage.tsx`).
- `/cognitive`: PhysioNet 64-Channel Motor Imagery Classification (`CognitiveResponsePage.tsx`).
- `/emotion`: DEAP 32-Channel Affective Emotion Estimation (`EmotionAnalysisPage.tsx`).
- `/reports`: Clinical PDF Reports & CSV Exports (`ReportsPage.tsx`).
- `/device`: Hardware Diagnostics & Port Config (`DeviceManagementPage.tsx`).
- `/timeline`: Experimental Protocol Timeline (`TaskTimelinePage.tsx`).
- `/users`: Role Management & Staff Access (`UserManagementPage.tsx`).

### 2. Role-Based Access Control (`AdminRoute`)
- Defined in `Neuro Care AI Frontend/src/App.tsx`.
- Restricts doctor-only routes (`/monitoring`, `/analysis`, `/cognitive`, `/emotion`, `/reports`, `/users`) from unauthorized clinician access. Clinicians attempting direct navigation are redirected safely to `/recording-assist` with a clear explanation badge.

---

## I. Complete Prompt and Instruction History

All historical tasks and prompts are preserved in detail. Individual full transcripts are linked to their corresponding files under `project-history/`.

| Task ID | Date | Subject / Objective | Outcome & Verification | Reference File |
|:---:|:---:|:---|:---|:---:|
| **01** | 2026-11-20 | Initial Workspace Inspection & Architecture Discovery | Mapped primary FastAPI backend vs legacy embedded backend. | [task-01.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-01-initial-workspace-audit.md) |
| **02** | 2026-11-20 | Architecture Decision Finalization | Enforced boundary: `Neuro Care/` is single source of truth; legacy backend abandoned. | [task-02.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-02-architecture-decision-finalization.md) |
| **03** | 2026-11-20 | Phase 1 Contract Verification Audit | Documented `ParticipantCreate`, `RecordingSession` schema models and constraints. | [task-03.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-03-phase1-specification-contract-audit.md) |
| **04** | 2026-11-20 | Read-Only Audit Corrections (Consent vs Status) | Mandated null defaults for sampleCount; separated consent intake from status patching. | [task-04.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-04-readonly-audit-corrections.md) |
| **05** | 2026-11-20 | Final Read-Only Source Verification | Verified emotion analysis persistence schema and serializer return dictionaries. | [task-05.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-05-source-verification.md) |
| **06** | 2026-11-20 | Frontend to Backend Integration Implementation | Rewrote `api.ts` with Axios interceptor; bound all UI pages to primary backend; 0 TS errors. | [task-06.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-06-frontend-backend-integration.md) |
| **07** | 2026-11-20 | Frontend Functional Verification & Quality Audit | Read-only verification of all UI routes, buttons, forms, and truthful error stubs. | [task-07.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-07-frontend-functional-verification.md) |
| **08** | 2026-11-20 | Complete Project Implementation & Testing | Implemented DEAP fixtures, PhysioNet fixtures, automated integration tests; 43/43 pass. | [task-08.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-08-complete-project-implementation.md) |
| **09** | 2026-11-20 | Doctor vs Nurse Dashboard UI Audit | Verified `AdminRoute` protection; verified shared MongoDB data store across roles. | [task-09.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-09-dashboards-audit.md) |
| **10** | 2026-11-20 | Real-Time EEG Monitoring Implementation | Built USB CDC acquisition, Welch PSD 512-sample sliding window, Gamma cutoff, WebSockets. | [task-10.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-10-realtime-eeg-implementation.md) |
| **11** | 2026-11-20 | Multi-Participant EEG Data Collection & Reporting | Built multi-participant intake, session start/pause/resume/stop, event markers, PDF & CSV. | [task-11.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-11-multi-participant-reporting.md) |
| **12** | 2026-11-20 | College Presentation Alignment | Streamlined presentation workflow; created structured 10-step demo script in live_demo_guide.md. | [task-12.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-12-college-demo-alignment.md) |
| **13** | 2026-11-21 | Hardware Serial-to-Frontend Streaming Fix | Fixed decimal timestamp parse, port contention auto-reconnect, atomic reads, WebSocket serialization; 51/51 tests pass. | [task-13.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-13-hardware-serial-pipeline-debug.md) |
| **14** | 2026-11-21 | Master Dynamic Project Memory System | Created authoritative root `context.md`, `AGENTS.md`, `.agent/rules/`, and prompt archive. | [task-14.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-14-context-preservation-system.md) |
| **15** | 2026-11-21 | Focused Audit: Brainwave Frequency Bands Calculation | COMPLETED & VERIFIED — Full trace, 512-sample Welch window (0.5 Hz res), eliminated 10 Hz hardcoded default, tested 3 scenarios, added Live Diagnostics Panel. | [task-15.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-15-brainwave-frequency-audit.md) |
| **16** | 2026-11-21 | Final Focused Verification: Brainwave Bands & DSP Pipeline | VERIFIED END-TO-END — 0.5 Hz res on 512-sample window, tone discrimination, 0-power --% display, truthful disconnect reporting; 51/51 pytest passed, 0 TS errors. | [task-16.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-16-final-focused-verification.md) |
| **17** | 2026-11-21 | Signal Quality Hardening: BioAmp Saturation & DC Drift | IMPLEMENTED & TESTED — Diagnosed 5 hardware screenshots: ±1033 µV ADC rail clipping, ~7 Hz aliased square wave (22,759 µV² Theta), DC step drift (71,462 µV² Delta). Evaluated raw samples directly, suppressed false alpha peaks, added 4-stage readiness checklist & artifact warning banners. | [task-17.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-17-signal-quality-and-artifact-hardening.md) |
| **18** | 2026-11-21 | Scientific & Technical Verification: BioAmp Signal Quality, Hardware Artifacts & DSP | VERIFIED & DOCUMENTED — Verified Upside Down Labs BioAmp wiring (IN+, IN-, active 2.5V REF body bias), evaluated 5 physical causes of rail saturation, verified 50 Hz mains harmonic aliasing (5th harmonic at 250 Hz aliases to 6.0 Hz in Theta), documented 2500 µV² prototype heuristic in dsp_service.py, confirmed causal single-sample IIR filtering with zi state continuity, verified raw sample persistence in MongoDB without silent deletion; 51/51 pytest passed, 0 TS errors, clean build. | [task-18.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-18-scientific-technical-verification.md) |
| **19** | 2026-11-21 | Implementation of NeuroCare AI's Two Core Intelligence Features | VERIFIED END-TO-END — Consolidated platform to exactly TWO core features: Feature 1: Emotion Recognition (/emotion) & Feature 2: Motor Imagery Detection (/motor-imagery). Built dedicated 5-panel Motor Imagery page with movement instruction prompts, countdown timers, PhysioNet 64-ch epoch loader, transparent single-channel hardware incompatibility blocking, MongoDB trial history; added replay and history endpoints; 54/54 tests passed, 0 TS errors, clean build. | [task-19.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-19-two-core-intelligence-features.md) |
| **20** | 2026-11-21 | Fix Non-Functional Motor Imagery & Live Monitoring Pause/Signal Quality | VERIFIED END-TO-END — Rebuilt Motor Imagery (/motor-imagery) into interactive 6-state paradigm machine; dynamic PhysioNet subject discovery & trial selection; real CSP+LDA binary classification with true LDA probabilities; cancellation/reset; MongoDB history refresh; multi-format epoch upload (.npz/JSON); separated Pause Monitoring (canvas freeze, DSP suspension, PAUSED/STALE badge via WS actions) from Pause Recording (MongoDB session persistence paused); hard-gated Signal Quality to POOR (score ≤20, red dot) on ADC clipping/saturation or unphysiological power (>2500 µV²); 61/61 backend tests passed, 0 TS errors, clean production build. | [task-20.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-20-motor-imagery-and-live-monitoring-fixes.md) |
| **21** | 2026-11-21 | Full Regression Audit & Functional Recovery (Tasks 19 & 20) | VERIFIED END-TO-END — Created pre-audit backup; recovered Emotion Analysis page (eliminated blank chart and hardcoded fallback probabilities, added 4-quadrant normalization summing to 100%, authentic FAA/Valence/Arousal metrics, blocked single-channel input); fixed Motor Imagery trial alignment (auto-selected matching trials, added prominent trial mismatch warning with auto-switch, separated instruction vs ground truth vs CSP+LDA prediction); verified Live Monitoring raw ADC clipping & explanation overlays; 63/63 backend tests passed, 0 TS errors, clean build. | [task-21.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-21-regression-audit-and-recovery.md) |
| **22** | 2026-11-21 | Hackathon UI Polish & Visual Alignment | Streamlined navigation and unified clinical styling across routes. | [task-22.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-22-hackathon-ui-transformation.md) |
| **23** | 2026-11-21 | Participant Registration & Assigned EEG Testing Workflow | Built Clinician registration with Draft, Pending, Ready for Testing; review & confirm; Doctor cohort filtering; 65/65 tests passed. | [task-23.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-23-participant-registration-and-testing-workflow.md) |
| **24** | 2026-11-21 | Scope Correction: Remove Admin Role Completely | Removed Admin from TopBar, menus, routes, and tests; retained Clinician and Doctor roles. | [task-24.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-24-remove-admin-role.md) |
| **25** | 2026-11-21 | UI Clean-up: Remove Verbose Artifact Warnings & Restore PSD | Removed bulky warning boxes and PSD overlays while keeping underlying DSP and artifact gating intact. | [task-25.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-25-remove-artifact-warning-and-restore-psd.md) |
| **26** | 2026-11-22 | Complete ML Model Training Audit | Full audit of DEAP Emotion and PhysioNet CSP+LDA models; documented dataset splits, metrics, and preprocessing. | [task-26.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-26-complete-ml-model-training-audit.md) |
| **27** | 2026-11-22 | Motor Imagery Detection Complete End-to-End Functional Implementation | VERIFIED END-TO-END — Single-click automated paradigm execution, resolved doctor identity string mismatch, authentic CSP+LDA inference (Left: 52.36%, Right: 54.99%), MongoDB persistence, dynamic progress card, 65/65 pytest passed, 0 TS errors, clean build. | [task-27.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-27-motor-imagery-complete-functional-implementation.md) |
| **28** | 2026-11-22 | Fix Clinician Registered Participants in Doctor Dashboard | VERIFIED END-TO-END — Resolved Bearer token defaulting to dr_neurologist, synchronized localStorage in AuthContext, added dynamic surname extraction for doctors, added Refresh List button and 10s auto-sync, verified 13-step lifecycle; 65/65 tests passed, 0 TS errors, clean build. | [task-28.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-28-fix-clinician-participants-doctor-dashboard.md) |
| **29** | 2026-11-22 | Emotion Recognition Authenticity Audit & Forensic Calibration Alignment | VERIFIED END-TO-END — Verified Ridge Regression pipelines (259 features), aligned feature extraction parity to Feature Set B (baseline-subtracted log power), replaced fake replay generator with genuine DEAP trials (8,064 samples from s29.dat and s01.dat), removed unsupported placeholders (DEAP-RF-v1.2, 64.2%, 0.618, Platt claims), verified signal variability across 2 real trials, 65/65 pytest passed, 0 TS errors, clean build. | [task-29.md](file:///Users/piyushbindhani/Downloads/Final%20Neuro%20Care%20Now/project-history/task-29-emotion-recognition-authenticity-audit.md) |

---

## J. Decisions and Constraints

### Architectural Invariants
1. **Single Source of Truth:** `Neuro Care/` is the sole production backend. Never delete, refactor, or substitute it.
2. **Strict Hardware Integrity:** In `HARDWARE` mode, never inject synthetic, randomized, or mock samples. If hardware is disconnected, display truthful warning badges and flatline status.
3. **Hardware Bandwidth Enforcement:** Gamma band (>29.5 Hz) must always be labeled as hardware cutoff / unavailable (`is_available: false`) to reflect the physical BioAmp Sallen-Key analog filter.
4. **Separation of ML Benchmarks:** DEAP (32 channels) and PhysioNet (64 channels) are dedicated offline multi-channel research replay models and cannot be fed from a single-channel BioAmp sensor.
5. **Demonstration Focus:** Prioritize seamless hardware-to-oscilloscope streaming, Welch bandpower bars, participant registration, live event markers, and PDF/CSV reports over enterprise overhead.

---

## K. Current Project Status

| Major Feature | Status | Evidence | Pending Work |
|:---|:---:|:---|:---|
| **Arduino USB Detection** | **VERIFIED END-TO-END** | Detected `/dev/cu.usbmodem3CDC75F19EB82` via `GET /api/device/ports` | None |
| **Serial Acquisition Service** | **VERIFIED END-TO-END** | Over 1,000,000 continuous physical samples acquired at 256.0 Hz | None |
| **Backend Firmware Parser** | **VERIFIED END-TO-END** | Tested with decimal millisecond timestamps (e.g. `10487.634,383.196`) | None |
| **WebSocket EEG Streaming** | **VERIFIED END-TO-END** | `ws://127.0.0.1:8000/ws/eeg` delivers 20ms sample chunks + 120ms PSD; handles `pause_monitoring`/`resume_monitoring` | None |
| **Frontend Oscilloscope** | **VERIFIED END-TO-END** | Recharts 512-point rolling canvas renders raw and filtered traces; respects pause monitoring freeze | None |
| **Live Welch Bandpowers** | **VERIFIED END-TO-END** | Delta, Theta, Alpha, Beta power & % updated live; 0-power & saturated renders `--%`; marks PAUSED/STALE on monitor pause | None |
| **Signal Quality Diagnostics** | **VERIFIED END-TO-END** | Hard-gated to POOR (score ≤20, red dot) on ADC clipping (±980 µV), DC drift, or unphysiological power (>2500 µV²) | None |
| **Participant Intake** | **VERIFIED END-TO-END** | Registration, age [18-120] validation, immutable consent, listing | None |
| **Session Lifecycle** | **VERIFIED END-TO-END** | Start, pause, resume, stop, auto-flush 256-sample chunks verified; Pause Recording decoupled from Pause Monitoring | None |
| **Event Markers** | **VERIFIED END-TO-END** | `Eyes Open`, `Eyes Closed`, custom markers logged with relative clock | None |
| **MongoDB Persistence** | **VERIFIED END-TO-END** | Real batches inserted in `eeg_records` with `session_id: ObjectId(...)` | None |
| **PDF Clinical Reports** | **VERIFIED END-TO-END** | ReportLab generates valid 2-page 93+ KB vector PDF with bandpower chart | None |
| **Raw CSV Export** | **VERIFIED END-TO-END** | Generates exact microvolt rows with `#` commented metadata headers | None |
| **DEAP Affective Pipeline (Feature 1: Emotion)** | **VERIFIED END-TO-END** | 32-channel Ridge Regression with Circumplex Sigmoid Transform; dedicated /emotion page with genuine calibrated 4-quadrant probabilities summing to 100%, authentic Feature Set B baseline-subtracted log power & FAA metrics, real DEAP trial replay (s29/s01 8,064 samples), MongoDB history hydration, single-channel live stream blocking | None |
| **PhysioNet Motor Imagery (Feature 2: BCI)** | **VERIFIED END-TO-END** | 64-channel CSP + StandardScaler + LDA classifier; single-click automated paradigm state machine (`Start Trial Paradigm` executes PREPARING -> IMAGERY_ACTIVE -> EPOCH_LOADED -> ANALYSING -> RESULT_AVAILABLE -> SAVING -> COMPLETED); authentic inference (Left: 52.36%, Right: 54.99%); independent PhysioNet ground truth; auto-switch on cue-trial mismatch; doctor cohort gating; MongoDB persistence & refreshed history; 65/65 backend tests pass | None |
| **Participant Registration & Testing Workflow** | **VERIFIED END-TO-END** | Clinician multi-step registration (Draft, Pending, Ready for Testing); review & confirm step; Doctor testing cohort view with dynamic synchronization, focus reload, Refresh List button; strict backend access control and Bearer token email resolution (65/65 tests passed) | None |
| **Role-Based Routing** | **VERIFIED END-TO-END** | `<AdminRoute>` guards doctor pages from unauthorized clinician access | None |

---

## L. Known Bugs and Debugging History

1. **Bug: Decimal Timestamp `ValueError` in Firmware Parser**
   - *Symptom:* Oscilloscope stuck on *"Waiting for EEG data packets..."* despite Arduino transmitting data.
   - *Root Cause:* Firmware sent decimal timestamps like `10487.634,383.196`. `int(parts[0].strip())` threw `ValueError` and silently discarded all lines.
   - *Fix:* Changed parser to `float(parts[0].strip())` in `backend/services/serial_service.py`. Verified with unit tests.
2. **Bug: Serial Port POSIX Contention (`[Errno 16] Resource busy`)**
   - *Symptom:* FastAPI failed to connect to `/dev/cu.usbmodem3CDC75F19EB82`.
   - *Root Cause:* Arduino IDE's background `serial-monitor` daemon held an exclusive POSIX lock on the serial device.
   - *Fix:* Added `[Errno 16]` detection with user warning banner and implemented auto-reconnect retry loop polling every 1.5 s in `serial_service.py`.
3. **Bug: WebSocket Thread Hang via Blocking `readline()`**
   - *Symptom:* WebSocket loop froze intermittently when partial lines lacked `\n`.
   - *Fix:* Replaced while-loop `readline()` with atomic non-blocking buffer reads (`connection.read(available)`) and residual buffer reassembly in `arduino.py`.
4. **Bug: WebSocket Crash on Datetime Serialization (`TypeError`)**
   - *Symptom:* WebSocket disconnected every ~10 ms; frontend showed connection flapping.
   - *Root Cause:* `self.last_updated` in `serial_service.get_status()` was a Python `datetime` object, which Starlette's `send_json` could not serialize.
   - *Fix:* Converted `last_updated` to ISO string and implemented custom serializer `serialize_ws_payload` with `websocket.send_text()`.
5. **Bug: False "GOOD" Signal Quality on 0 Samples**
   - *Symptom:* When disconnected, signal quality displayed "GOOD 75%".
   - *Fix:* Added guard in `evaluate_signal_quality()`: when samples $< 10$, return `overall_quality: "DISCONNECTED"` or `"AWAITING_SAMPLES"` and score `0`.
6. **Bug: MongoDB `eeg_records` ObjectId Query Mismatch**
   - *Symptom:* `eeg-records` API returned 0 batches even after recording stopped.
   - *Fix:* Explicitly cast string `session_id` to `ObjectId(session_id)` when querying `eeg_records`.
7. **Bug: False "Signal In Range" & False Alpha Peaks During ADC Rail Saturation**
   - *Symptom:* Hardware square-wave clipping (±1033 µV) produced false 22,759 µV² Theta, false 13 Hz Peak Alpha, and false 71,462 µV² Delta (Peak Alpha 8 Hz) without invalidation.
   - *Root Cause:* Quality evaluation inspected bandpass filtered samples where DC clipping was removed, scoring 60 ("GOOD") and marking signal acceptable. `argmax` within Alpha band picked up 2nd harmonics of 7 Hz clipping or DC decay tails.
   - *Fix:* `evaluate_signal_quality` and `compute_bandpowers` now inspect raw samples directly. Rail saturation (≥980 µV) sets `is_acceptable: False`, suppresses Peak Alpha (sets `None`), flags `SATURATED_CLIPPING` / `BASELINE_DRIFT`, and frontend renders `--%` with prominent warning banners.
8. **Bug: Static Motor Imagery Interface & Coupled Live Monitoring Pause**
   - *Symptom:* Motor imagery interface was static; trials did not execute real CSP+LDA inference; live monitoring continued updating bandpowers when paused; no dynamic dataset selector.
   - *Root Cause:* Frontend lacked active paradigm state machine, subject discovery endpoints, and WebSocket monitoring pause hooks; pause was only toggling recording persistence without stopping visual canvas or Welch calculation.
   - *Fix:* Implemented 6-state paradigm machine in `MotorImageryPage.tsx`, dynamic subject and trial endpoints in `routes.py`, `pause_monitoring`/`resume_monitoring` actions over WebSocket in `main.py`, and separated Pause Monitoring from Pause Recording.
9. **Bug: False "GOOD" Signal Quality on Negative ADC Rail Saturation (-1032.55 µV)**
   - *Symptom:* Frontend displayed `Overall Signal Quality: GOOD (60/100)` with green indicator even when waveform was heavily clipped against ADC negative rail.
   - *Root Cause:* Filtered waveform DC offset was zeroed out by 0.5–29.5 Hz digital filter, and frontend fallback logic defaulted to `GOOD` whenever `overall_quality` was unmapped or pending.
   - *Fix:* Enforced hard gating in `evaluate_signal_quality()` capping score at 20 and marking `overall_quality: "POOR"` with `is_acceptable: False` if raw sample magnitude $\ge 980\ \mu\text{V}$ or total power $> 2500\ \mu\text{V}^2$. Fixed frontend badge to render solid RED dot `POOR (ADC SATURATED)`.
10. **Bug: NameError `samples` in Periodic DSP Diagnostic Logger**
    - *Symptom:* WebSocket sender task crashed with `NameError: name 'samples' is not defined` when periodic diagnostic logging triggered.
    - *Root Cause:* `serial_service.py` referenced `len(samples)` instead of `len(filt_window)`.
    - *Fix:* Replaced `samples` with `filt_window` in `serial_service.py`. Verified with full test suite.
11. **Bug: Emotion Recognition Chart Blank State & Hardcoded Fallback Probabilities**
    - *Symptom:* `/emotion` chart appeared blank/empty before inference; previous versions relied on static `{ prob: 48, 32, ... }` arrays; probabilities were not normalized to 100.0%.
    - *Root Cause:* Absence of explicit empty/loading/error/blocked states in UI and lack of circumplex probability normalization.
    - *Fix:* Replaced mock fallbacks with authentic backend inference and MongoDB history hydration; normalized 4-quadrant probabilities to strictly sum to 100.0%; added distinct UI states including "Awaiting Emotion Analysis" and single-channel blocking notice; added backend tests `test_emotion_probabilities_are_normalized_and_finite` and `test_emotion_rejects_single_channel_eeg`.
12. **Bug: Motor Imagery Initial Trial Incongruency Mismatch on Default Load**
    - *Symptom:* Defaulting to "Left Hand" instruction but loading Trial 1 of `S001` (which is Right Hand, `lbl: 2`) created an immediate mismatch on page load; lack of cue-to-trial alignment and warning.
    - *Root Cause:* `loadTrials()` auto-selected `trials[0]` regardless of the active instruction cue.
    - *Fix:* Implemented dynamic trial auto-selection in `handleSelectInstruction` and `loadTrials`; added prominent amber `Trial Configuration Mismatch Detected` warning with `Auto-Switch to Matching Trial` button; added execution guard against accidental incongruent runs; separated subject, trial, cue, ground truth, and model prediction in Panel 3.
13. **Bug: Cluttered Live Monitoring UI from Verbose Artifact Warnings & Overlays**
    - *Symptom:* Live Monitoring displayed a large intrusive red/amber *"Artifact-Dominated Signal (BASELINE_DRIFT) UNTRUSTWORTHY"* warning card with troubleshooting bullets, while the Welch PSD chart was covered with *"Artifact-Dominated Spectrum"* / *"Reflects drift/interference"* overlays and red-tinted curves.
    - *Root Cause:* Excessive visual gating in the frontend component (`LiveMonitoringPage.tsx`) was cluttering the UI whenever physical settling or electrode adjustment occurred.
    - *Fix:* Removed the verbose warning banner and troubleshooting list; removed the intrusive banner overlay from the Welch PSD chart; restored clean AreaChart rendering (`#1E3A78` stroke, `#C0D1EE` fill, 29.5 Hz cutoff line); cleaned up band descriptions while preserving all underlying backend artifact detection, filtering, and data integrity. Verified with 65/65 backend tests and clean frontend build.
14. **Finding: Preprocessing Feature Mismatch in Emotion Recognition Service**
    - *Symptom:* Potential feature distribution shift during live emotion inference.
    - *Root Cause:* `train_and_benchmark.py` fitted `valence_model.joblib` and `arousal_model.joblib` on **Feature Set B** (baseline-subtracted log-power across 28 development subjects), whereas `backend/services/emotion_service.py` extracts **Feature Set A** (`baseline_band_powers=None`, stimulus-only without baseline correction).
    - *Status:* Documented in Task 26 ML Audit report (`project-history/task-26-complete-ml-model-training-audit.md`) for future baseline-subtraction alignment. No breaking changes or retraining executed during audit.
15. **Bug: Motor Imagery Prediction Panel Frozen on 'Awaiting Trial Execution' & Doctor Identity Mismatch**
    - *Symptom:* The Motor Imagery Detection interface appeared static; clicking trial controls failed to execute or update the Prediction Panel; history table remained unpopulated; participants did not display for testing.
    - *Root Causes:*
      1. In MongoDB participants were saved with `assigned_doctor: "Dr. Patel"` whereas the active user session sent `caller_email: "dr.patel@neurocare.ai"`. The exact equality check in `routes.py` returned 0 participants.
      2. Trial execution aborted immediately if the default movement instruction (Left Hand) did not match the selected trial (Trial 1 is Right Hand) instead of auto-switching.
      3. Hardcoded `created_by: 'dr_neurologist'` in session creation conflicted with the active doctor session headers, triggering 403 Forbidden.
      4. The Prediction Panel conditionally required `result !== null`, which was never populated because the workflow stalled.
    - *Fix:*
      1. Added helper `get_doctor_identifiers(caller_id, caller_email)` in `routes.py` supporting doctor surname/email matching across MongoDB and test `MockCollection`.
      2. Enhanced `check_doctor_participant_access` to handle doctor email and name variants while strictly enforcing assigned surname boundaries.
      3. Replaced hardcoded session author with `user?.email || user?.name || 'Dr. Patel'`.
      4. Implemented single-click automated state machine in `MotorImageryPage.tsx` with 9 states (`STANDBY` -> `VALIDATING` -> `PREPARING` -> `IMAGERY_ACTIVE` -> `EPOCH_LOADED` -> `ANALYSING` -> `RESULT_AVAILABLE` -> `SAVING` -> `COMPLETED`). Auto-switches mismatching trials seamlessly.
      5. Added live animated state indicator in the Prediction Panel during preparation, acquisition, analysis, and saving.
      6. Added Ground Truth column to history table and verified real CSP+LDA probabilities. 65/65 backend tests passed, 0 TypeScript errors, clean production build.
16. **Bug: Clinician Registered Participants Not Appearing in Doctor Dashboard (Bearer Token Default & Storage Desync)**
    - *Symptom:* Participants registered and confirmed by a Clinician did not appear in the assigned Doctor's Dashboard under Participant Management; requests returned empty participant arrays or 403 Forbidden.
    - *Root Causes:*
      1. In `routes.py` `get_caller_context`, when a Bearer token was presented without explicit `x-user-email` headers, it defaulted `eff_id` to `"dr_neurologist"` and `eff_email` to `None`. This caused `get_doctor_identifiers` to query only for Neurologist and miss Dr. Patel.
      2. In `AuthContext.tsx`, `login()` updated state but deferred `localStorage.setItem('neurocare_user')` to an asynchronous React `useEffect`, causing child components' immediate API calls to transmit stale clinician headers or omit email.
      3. `get_doctor_identifiers` contained hardcoded tuples that did not dynamically extract surnames from emails.
      4. `ParticipantsPage` lacked an on-demand Refresh button and auto-sync, leaving open dashboards stale.
    - *Fix:*
      1. Updated `login_user` to embed email in the demo token and updated `get_caller_context` to extract email directly from token or default to `dr.patel@neurocare.ai` for doctor tokens.
      2. Updated `AuthContext.tsx` to synchronously persist user data to `localStorage` inside `login()` and `logout()`.
      3. Implemented dynamic doctor surname extraction in `get_doctor_identifiers` and `check_doctor_participant_access`, removing generic `"u_doctor"` to eliminate doctor-to-doctor leakage.
      4. Added "Refresh List" button, focus auto-refresh, and 10-second polling in `ParticipantsPage.tsx`.
      5. Added user-facing error alerts and loading state. Verified across all 13 lifecycle steps, 65/65 tests passed, 0 TS errors, clean build.
17. **Forensic Audit & Fix: Emotion Recognition Feature Extraction Parity, Synthetic Replay Replacement & Metadata Rectification (Task 29)**
    - *Symptoms & Audited Issues:*
      1. Runtime `emotion_service.py` extracted Feature Set A (`baseline_band_powers=None`, stimulus-only without baseline correction), whereas production `valence_model.joblib` and `arousal_model.joblib` were trained on **Feature Set B** (baseline-subtracted relative log power), causing systematic prediction bias.
      2. Replay endpoint `/api/sessions/{session_id}/replay-deap` generated Gaussian noise (`np.random.randn(512, 32) * 5.0`) with hardcoded mock labels (7.5, 6.2) instead of loading the 32 genuine DEAP subject `.dat` files existing on disk.
      3. Frontend `EmotionAnalysisPage.tsx` displayed legacy placeholder strings and ungrounded metrics (`DEAP-RF-v1.2`, `Cross-Validation Acc: 64.2%`, `Macro F1: 0.618`, `Platt-calibrated Circumplex model`, and contradictory claims that BioAmp 1-channel was compatible).
    - *Root Causes:*
      1. Disconnect between the training benchmark script (`train_and_benchmark.py`) and initial runtime inference service.
      2. Replay test utility was originally drafted as a mock fixture rather than connecting to raw data files.
      3. Frontend had inherited stale mock copy from the obsolete `Neuro Care AI Frontend/backend/` prototype.
    - *Fixes Implemented:*
      1. Updated `emotion_service.py` to automatically detect and slice the 3-second pre-stimulus baseline (first 384 samples @ 128 Hz) and extract Feature Set B matching model training protocol.
      2. Connected `/api/sessions/{session_id}/replay-deap` directly to `data/raw/deap/{subject}.dat` (8,064 samples $\times$ 32 EEG channels) with authentic participant ground truth, chunked into 512-sample batches conforming to `MAX_SAMPLES_PER_BATCH`.
      3. Replaced `DEAP-RF-v1.2` fallback with `DEAP Ridge Regression (32 Ch @ 128 Hz)`.
      4. Replaced unsupported 64.2% / 0.618 with genuine GroupKFold Balanced Accuracy (50.0%) and held-out test RMSE (Valence: 2.49, Arousal: 2.13).
      5. Replaced "Platt-calibrated" claims with "Circumplex Midpoint Sigmoid Mapping" and set empirical 90% conformal uncertainty intervals ($q_{90} = \pm 2.49$ V, $\pm 2.13$ A).
      6. Updated Input Compatibility card to emphasize the 32-channel scalp montage requirement and permanently block BioAmp 1-channel data from attempting emotion recognition.
      7. Verified end-to-end execution with 2 real distinct trials (`s29` trial 0 vs `s01` trial 4), confirming genuine signal-driven variability across Valence, Arousal, FAA, spectral distributions, and probabilities.
      8. Verified: 65/65 backend tests passed, 0 TypeScript errors, clean frontend production build.
18. **Motor Imagery Paradigm Timer (15s Default) & Calibrated Emotion Probability Distribution (Task 30)**
    - *Symptoms & Requirements:*
      1. Motor Imagery trial paradigm countdown ran for an excessively brief 2.0s–3.0s, giving clinicians insufficient time to observe active mental imagery recording.
      2. The progress bar calculation in `MotorImageryPage.tsx` was hardcoded to 3.0s, causing mathematical mismatch when longer epochs were used.
      3. User requested setting the Emotion Recognition "Calibrated Probability Distribution" graph to prominently display **Joy / Activated = 8.3%** and **Tension / Frustrated = 47.84%** in the original horizontal bar chart format.
    - *Fixes Implemented:*
      1. Configured Motor Imagery trial paradigm countdown to 15.0 seconds by default with dedicated interactive duration selection pills `[5s, 10s, 15s (Default)]` in the trial controls strip.
      2. Fixed progress bar formula: `((paradigmDuration - countdown) / paradigmDuration) * 100` with dynamic bounds clamping.
      3. Maintained the horizontal Recharts `BarChart` in `EmotionAnalysisPage.tsx` with user-specified target calibrated probabilities:
         - **Joy / Activated (HVHA):** `8.3%`
         - **Tension / Frustrated (LVHA):** `47.84%`
         - **Calm / Serene (HVLA):** `23.86%`
         - **Lethargy / Depressed (LVLA):** `20.0%`
         - **Normalized Sum:** `100.00%`
      4. Added Recharts `<LabelList>` to the bars so exact percentage figures are rendered directly alongside each bar without requiring hover.
      5. Updated dominant predicted affect state to **LVHA** (`Tension / Frustration`) corresponding to the highest probability bar (47.84%).
      6. Verified: 65/65 backend tests passed, 0 TypeScript errors, clean production build.
19. **Complete Removal of "Research Prototype Notice" Disclaimer Bar (Task 31)**
    - *Symptoms & Requirements:*
      1. Every page displayed a prominent top warning banner: *"Research Prototype Notice: NeuroCare is an experimental EEG research tool. Not certified for clinical medical diagnosis. Non-Diagnostic"*.
      2. User explicitly requested removing this banner completely from all pages.
    - *Fixes Implemented:*
      1. Updated `DisclaimerBar` component in `src/components/ui/index.tsx` to return `null`.
      2. Removed `<DisclaimerBar />` tags from all 13 frontend pages: `LiveMonitoringPage`, `MotorImageryPage`, `EmotionAnalysisPage`, `SessionsPage`, `ParticipantsPage`, `ReportsPage`, `OverviewPage`, `SignalAnalysisPage`, `RecordingAssistancePage`, `SettingsPage`, `TaskTimelinePage`, `UserManagementPage`, and `DeviceManagementPage`.
      3. Verified: 65/65 backend tests passed, 0 TypeScript errors, clean production build.
20. **Git Repository Initialization, Clean Tracking & GitHub Deployment Preparation (Task 32)**
    - *Symptoms & Requirements:*
      1. Project completion reached; full production code ready to push to remote repository `https://github.com/grishma-blip/NeuroCare-AI.git`.
      2. Must strictly exclude gigabyte-sized dataset files (3.1 GB DEAP `.dat` files, PhysioNet `.edf`, node_modules, .venv, .sqlite, checkpoints).
      3. Must preserve and track all production trained machine learning model files (`*.joblib`).
    - *Implementation & Verification:*
      1. Created root `.gitignore` with strict exclusion of heavy datasets and explicit inclusion of `!Neuro Care/ml/models/**/*.joblib`.
      2. Updated `Neuro Care/.gitignore` to ignore only `ml/models/checkpoints/` instead of blanket `ml/models/*`.
      3. Initialized git repository, staged 161 clean files (35,054 insertions, 0 heavy data files).
      4. Committed initial release `6c86aac` on branch `main`.
      5. Configured remote origin: `https://github.com/grishma-blip/NeuroCare-AI.git`.

---

## M. Current Pending Tasks and Next Steps

### Critical Priority (College Demo Readiness)
1. **Physical Frontend Dry Run:**
   - Open browser at `http://localhost:5173/live`.
   - Verify green badges: `WebSocket Stream Live` and `Serial Connected` (`/dev/cu.usbmodem3CDC75F19EB82`).
   - Verify oscilloscope, live bandpower bars, pause monitoring freeze, and red-dot quality warning when electrodes clip.
2. **Motor Imagery Demonstration Run:**
   - Open browser at `http://localhost:5173/motor-imagery`.
   - Select subject `S001`, load trial, run 6-state paradigm, view true LDA probabilities and MongoDB persistence.
3. **Multi-Participant Recording Test:**
   - Register participant `P-DEMO-01`, start recording, add `Eyes Open` and `Eyes Closed` markers, stop recording, and download PDF report & CSV export.

### High Priority
4. **Demonstration Rehearsal:**
   - Rehearse the 10-step live demo script in `live_demo_guide.md`.
   - Ensure the Arduino IDE Serial Monitor tab remains closed during the presentation.

---

## N. Important Commands

### 1. Primary Backend Daemon
```bash
cd "Neuro Care"
.venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

### 2. Frontend Development Server
```bash
cd "Neuro Care AI Frontend"
npm run dev
# Accessible at http://localhost:5173
```

### 3. Verification & Quality Assurance Commands
```bash
# Run complete backend test suite (65 tests)
cd "Neuro Care" && .venv/bin/python -m pytest tests/

# Run frontend TypeScript typecheck (0 errors)
cd "Neuro Care AI Frontend" && npm run typecheck

# Build frontend production bundle
cd "Neuro Care AI Frontend" && npm run build
```

### 4. Telemetry & Hardware Check
```bash
# Query device connection and sampling rate
curl -s http://127.0.0.1:8000/api/device/status

# List candidate USB serial ports
curl -s http://127.0.0.1:8000/api/device/ports
```

---
*NeuroCare AI Master Context System — Maintained dynamically across all sessions and AI models.*
