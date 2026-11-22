# Task 20: Fix Non-Functional Motor Imagery and Live EEG Monitoring

**Date:** 2026-11-21  
**Status:** IMPLEMENTED, VERIFIED & TESTED  
**Author:** NeuroCare AI Engineering Team  
**Scope:** Backend APIs (`Neuro Care/backend/api/routes.py`, `backend/main.py`), DSP Service (`dsp_service.py`), Serial Service (`serial_service.py`), Frontend UI (`MotorImageryPage.tsx`, `LiveMonitoringPage.tsx`, `api.ts`), Automated Integration Tests (`tests/test_motor_imagery_features.py`)

---

## 1. Executive Summary

This task addressed multiple critical operational issues across two core modules of NeuroCare AI:
1. **Motor Imagery Detection (`/motor-imagery`):** The interface previously presented a static appearance where dataset selection, epoch loading, paradigm countdowns, and upload validation were decoupled from backend inference. The entire workflow has been rebuilt into a functional 6-state paradigm machine backed by dynamic PhysioNet subject discovery (`GET /api/motor-imagery/subjects`), trial enumeration (`GET /api/motor-imagery/dataset-trials`), real epoch preview loading (`GET /api/motor-imagery/sample-epoch`), genuine CSP+LDA classification, multi-format epoch file upload validation (`POST /api/motor-imagery/upload-epoch`), race-condition safe trial cancellation/reset, and automatic MongoDB persistence with history table refresh.
2. **Live EEG Monitoring (`/live`):** Frequency bandpowers and Welch PSD continued calculating and updating even when monitoring/recording was paused. We separated the lifecycle into two explicit controls: **Pause Monitoring** (freezes frontend waveform and suspends DSP/Welch calculations with prominent `PAUSED / STALE` labels, backed by a WebSocket protocol pause mechanism) and **Pause Recording** (pauses MongoDB sample persistence for the active session while live monitoring continues unaffected).
3. **Signal Quality & Artifact Gating:** Resolved an invalid state where the UI could report `Overall Signal Quality: GOOD` while the BioAmp raw signal was saturated against the ADC rails (±1033 µV) or dominated by unphysiological spectral power (>2500 µV²). Enforced strict hard-gating in `evaluate_signal_quality` and corrected the frontend fallback logic.

---

## 2. Root Cause Analysis

### 2.1 Motor Imagery Detection Interface
- **Root Cause of Static Behavior:**
  1. *Hardcoded Subjects:* `selectedSubject` was constrained to a static hardcoded array in JSX without querying available `.npz` subject files from disk.
  2. *Missing Epoch Preview Loading:* When a subject or target trial was selected, the frontend never invoked `GET /api/motor-imagery/sample-epoch`, leaving the input preview and dimensions unpopulated.
  3. *Incomplete State Machine:* The paradigm only possessed binary internal states (`idle`, `prep`, `active`, `rest`) without visible, distinct `LOADING_DATASET`, `EPOCH_RECORDED`, `ANALYSING`, or `RESULT_AVAILABLE` states.
  4. *Non-Functional Upload Card:* The "Uploaded 64-Channel Epoch File" card was purely a radio button with no `<input type="file">` element or matrix validation handler.
  5. *Lack of In-Flight Abort Mechanism:* Stopping or resetting a trial did not cancel asynchronous network requests or prevent stale responses from overwriting the UI.

### 2.2 Live Monitoring DSP Continuing After Pause
- **Root Cause:**
  1. In `LiveMonitoringPage.tsx`, the "Freeze" button only toggled `isPaused`, which gated `setData` (the raw oscilloscope canvas). The WebSocket `onmessage` callback still executed `setLiveDsp(dsp)` unconditionally on every incoming frame.
  2. In `backend/main.py`, the WebSocket streaming loop computed and attached Welch PSD frames every 120 ms regardless of whether the connected client was paused.
  3. Pausing session recording (`api.pauseSession`) was conflated with pausing real-time monitoring; no distinct protocol action existed to suspend spectral calculations.

### 2.3 Signal Quality Showing "GOOD" During ADC Saturation
- **Root Cause:**
  1. `LiveMonitoringPage.tsx` line 1290 had a default fallback expression: `liveDsp?.quality?.overall_quality || (isFlatline ? 'POOR' : 'GOOD')`. If quality metrics were pending or unmapped, the expression defaulted to `GOOD` with a green indicator.
  2. `evaluate_signal_quality()` in `dsp_service.py` evaluated the bandpass-filtered signal where DC clipping was removed, scoring around 60 (category `GOOD`) despite raw ADC saturation.
  3. Total spectral power was not passed into `evaluate_signal_quality()`, allowing unphysiological power (>2500 µV²) to bypass quality scoring.

---

## 3. Implementation Details

### 3.1 Backend Endpoints & Enhancements (`routes.py`, `main.py`, `serial_service.py`, `dsp_service.py`)
1. **Dynamic Subject Discovery:**
   - Endpoint: `GET /api/motor-imagery/subjects`
   - Scans `data/processed/physionet/*.npz` and returns naturally sorted subject identifiers (`["S001", "S002", ..., "S109"]`).
2. **Dataset Trial Enumeration:**
   - Endpoint: `GET /api/motor-imagery/dataset-trials?subject_id=...`
   - Verifies file existence on disk (returns 404 if missing); lists real Left Hand (label 1) and Right Hand (label 2) trials.
3. **Sample Epoch Extraction:**
   - Endpoint: `GET /api/motor-imagery/sample-epoch?subject_id=...&trial_index=...`
   - Validates index bounds, transposes epoch to `(385, 64)`, computes summary statistics (min, max, mean, std), and returns authentic sample matrices.
4. **Multi-Format Epoch File Upload:**
   - Endpoint: `POST /api/motor-imagery/upload-epoch`
   - Accepts both multipart form uploads (`.npz` NumPy archives or `.json` matrices) and JSON body payloads.
   - Enforces strict validation: shape must be exactly `(385, 64)`, and all values must be finite floating-point numbers.
5. **WebSocket Pause Monitoring Protocol:**
   - Handlers in `backend/main.py`:
     - Action `pause_monitoring`: sets `is_monitoring_paused = True` for the client; suspends sample and DSP delivery; sends lightweight heartbeat.
     - Action `resume_monitoring`: sets `is_monitoring_paused = False`; immediately resumes real-time sample streaming and Welch PSD computations.
6. **Strict Signal Quality Hard-Gating:**
   - In `dsp_service.py`:
     - If raw sample magnitude $\ge 980.0\ \mu\text{V}$ (ADC rail saturation), `category` is strictly capped at `POOR`, `score` $\le 20$, and `is_acceptable = False`.
     - If `total_power > 2500.0\ \mu\text{V}^2` or unphysiological amplitude is detected, `category` is strictly capped at `POOR` and `is_acceptable = False`.

### 3.2 Frontend Architecture (`MotorImageryPage.tsx`, `LiveMonitoringPage.tsx`, `api.ts`)
1. **Motor Imagery 6-State Machine:**
   - States: `STANDBY` $\rightarrow$ `PREPARATION` (2.0s countdown) $\rightarrow$ `IMAGERY_ACTIVE` (3.0s countdown) $\rightarrow$ `EPOCH_RECORDED` (400ms visual lock) $\rightarrow$ `ANALYSING` $\rightarrow$ `RESULT_AVAILABLE`.
   - Dynamic subject and trial dropdowns populate on demand; epoch verification badge confirms dimensions (`385 × 64 channels @ 128 Hz`).
   - Stop and Reset buttons cancel active intervals, increment `activeRunIdRef` to invalidate in-flight responses, and clear predictions.
   - Genuine LDA probabilities (`probLeft`, `probRight`), confidence ratings, instruction match badges, and trial provenance metadata are displayed.
   - Dedicated file upload control validates custom `.npz` and `.json` matrices before enabling the paradigm.
2. **Two Separate Live Monitoring Controls:**
   - **Pause Monitoring:** Toggled via button in oscilloscope header. Invokes `sendEegWebSocketAction('pause_monitoring')`, freezes waveform canvas buffer, freezes `liveDsp`, displays `MONITORING PAUSED (WAVEFORM & SPECTRUM FROZEN)` overlay, and tags frequency bands and PSD as `PAUSED / STALE`.
   - **Pause Recording:** Toggled via button in recording control bar. Invokes `api.pauseSession(activeSessionId)`, pauses MongoDB batch accumulation in `serial_service`, while live monitoring continues streaming fresh samples.
3. **Truthful Signal Quality Display:**
   - When ADC clipping occurs ($\ge 980\ \mu\text{V}$), indicator renders a solid RED dot with text `POOR (ADC SATURATED)` and capped score $\le 20/100$.
   - Theta and Delta frequency band subtitles dynamically switch to `· Mains / Clipping Artifact` or `· DC Drift / Artifact` when `isSignalValid` is false, eliminating misleading claims of drowsiness or meditation during physical saturation.

---

## 4. Verification and Test Results

### 4.1 Backend Test Suite (61/61 PASSED)
```text
cd "Neuro Care" && .venv/bin/python -m pytest tests/
======================== 61 passed, 1 warning in 13.60s ========================
```
New test cases added and verified:
- `test_motor_imagery_subjects`: PASS
- `test_motor_imagery_upload_epoch_valid`: PASS
- `test_motor_imagery_upload_epoch_invalid_shape`: PASS
- `test_signal_quality_clipping_gate`: PASS
- `test_signal_quality_unphysiological_power_gate`: PASS
- `test_pause_and_resume_recording_lifecycle`: PASS
- `test_websocket_pause_and_resume_monitoring`: PASS

### 4.2 Frontend Verification (0 Errors)
1. **TypeScript Typecheck:**
   ```text
   cd "Neuro Care AI Frontend" && npm run typecheck
   > tsc --noEmit -p tsconfig.app.json
   # Exited with code 0 (clean)
   ```
2. **Production Bundle Build:**
   ```text
   cd "Neuro Care AI Frontend" && node_modules/.bin/vite build
   ✓ built in 1.92s
   dist/assets/index-DZuygt-r.js   1,145.68 kB
   # Exited with code 0 (clean)
   ```

---

## 5. Files Modified and Created

### Created:
- `project-history/task-20-motor-imagery-and-live-monitoring-fixes.md`

### Modified:
- `Neuro Care/backend/api/routes.py`: Added `GET /motor-imagery/subjects`, enhanced `dataset-trials` and `sample-epoch`, added `POST /motor-imagery/upload-epoch` with multipart and JSON support.
- `Neuro Care/backend/main.py`: Added `pause_monitoring` and `resume_monitoring` actions to WebSocket receiver and sender tasks.
- `Neuro Care/backend/services/dsp_service.py`: Enforced hard clipping gate (score $\le 20$, `POOR`, `is_acceptable=False`) and unphysiological power gate.
- `Neuro Care/backend/services/serial_service.py`: Passed `total_power` to `evaluate_signal_quality`.
- `Neuro Care/tests/test_motor_imagery_features.py`: Added tests for subjects, upload validation, clipping gates, recording pause/resume, and WebSocket monitoring actions.
- `Neuro Care AI Frontend/src/lib/api.ts`: Added `getMotorImagerySubjects`, `uploadMotorImageryEpoch`, and exported `sendEegWebSocketAction`.
- `Neuro Care AI Frontend/src/pages/MotorImageryPage.tsx`: Full dynamic subject/trial selector, functional 6-state paradigm machine, file upload, genuine CSP+LDA inference, race-condition safe abort/reset, MongoDB trial logging.
- `Neuro Care AI Frontend/src/pages/LiveMonitoringPage.tsx`: Distinct Pause Monitoring vs Pause Recording controls, `PAUSED / STALE` labels, strict signal quality gating.
- `context.md`: Updated master project memory, task tables, and known bug logs.
