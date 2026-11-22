# Critical Hardware Serial-to-Frontend Streaming Pipeline Fix

- **Task ID:** 13
- **Slug:** `task-13-hardware-serial-pipeline-debug`
- **Recorded Step Indices:** [1876]
- **Status:** COMPLETED / VERIFIED

---

## 1. Objective
Critical Hardware Serial-to-Frontend Streaming Pipeline Fix for the NeuroCare AI platform.

---

## 2. Original User Prompt(s)
### Prompt from Step 1876 (2026-11-21T07:20:24Z)

```text
<USER_REQUEST>
# URGENT: NeuroCare AI — Arduino Data Not Appearing on Frontend

The Arduino UNO R4 WiFi is successfully generating serial data, but the actual EEG signal is still NOT visible on the NeuroCare AI frontend.

## 1. Confirmed Hardware Information

Arduino board: Arduino UNO R4 WiFi  
Serial port: `/dev/cu.usbmodem3CDC75F19EB82`  
Baud rate: `115200`

The Arduino is producing numeric serial readings in this format:

```text
10487.634,383.196
10491.542,213.699
10495.447,-165.398
10499.354,-341.452
10503.259,-213.699
10507.163,362.639
10511.070,227.067
```

The timestamps increase by approximately 3.9 ms, indicating approximately 256 Hz sampling.

The serial output appears compatible with the expected format:

`timestamp_ms,voltage_microvolts`

## 2. Current Frontend Problem

On the Live Monitoring page:

- WebSocket Stream Live is displayed.
- Serial Disconnected is displayed.
- The waveform says: "Waiting for EEG data packets from Arduino USB Serial stream..."
- Raw Signal and Filtered Signal are not displaying actual samples.
- Amplitude remains 0.0 µV.
- Delta, Theta, Alpha and Beta power remain zero.
- The recording timer runs even though no actual hardware samples are visible.

This means the complete hardware-to-frontend pipeline has NOT been verified.

## 3. Debug the Complete Pipeline

Trace the actual data flow:

Arduino USB Serial  
→ FastAPI serial_service.py  
→ EEG sample parser  
→ DSP processing  
→ MongoDB recording buffer  
→ WebSocket `/ws/eeg`  
→ React LiveMonitoringPage.tsx

Check every stage.

### A. Serial connection

1. Check whether FastAPI is opening `/dev/cu.usbmodem3CDC75F19EB82`.
2. Verify baud rate 115200.
3. Check whether another process is occupying the serial port.
4. Verify serial autodetection and manual port selection.
5. Check connection and reconnection handling.
6. Confirm that the serial connection is actually open, not merely that the WebSocket is connected.

### B. Serial parser

1. Inspect the exact parser implementation.
2. Confirm that it correctly parses decimal timestamps and negative microvolt readings.
3. Confirm that startup text/header lines are safely ignored.
4. Check whether the parser expects microseconds instead of milliseconds.
5. Confirm that it does not accidentally discard valid packets.
6. Add useful backend logs for received lines, parsed sample count, invalid packets and parsing errors.

### C. DSP and sampling rate

1. Verify actual measured sampling frequency from incoming timestamps.
2. Ensure that the DSP pipeline receives valid samples.
3. Verify persistent filter state across incoming chunks.
4. Ensure that bandpower calculations start only after enough samples accumulate.
5. Do not display fabricated values or force a GOOD signal-quality status when no samples are arriving.

### D. WebSocket

1. Inspect `/ws/eeg`.
2. Confirm that it broadcasts actual parsed hardware samples.
3. Check the JSON structure expected by the frontend.
4. Check for field-name mismatches, missing arrays or timestamp conversion errors.
5. Confirm that the WebSocket being connected does not falsely imply that hardware is connected.

### E. React Frontend

Inspect `LiveMonitoringPage.tsx` and related components.

1. Confirm that actual incoming WebSocket samples update the waveform state.
2. Verify raw and filtered waveform rendering.
3. Verify that bandpower cards update from actual DSP results.
4. Ensure that hardware connection status comes from the backend serial connection state.
5. Show a clear distinction between WebSocket Connected and Serial Connected.
6. Ensure that recording cannot silently claim successful acquisition when zero hardware samples are received.

## 4. Required Successful Outcome

I want to see:

- Serial Connected status.
- Actual incoming sample count increasing.
- Live raw waveform.
- Live filtered waveform.
- Real-time Delta, Theta, Alpha and Beta calculations.
- Measured sampling rate.
- Accurate signal-quality diagnostics.
- Actual hardware recording saved to MongoDB.
- Working pause, resume and stop functionality.

## 5. Important Instructions

- Do not replace hardware data with synthetic or physiological demo data.
- Do not hardcode sample values, bandpowers, signal quality or connection status.
- Do not change the existing DEAP Emotion Recognition or PhysioNet Motor Imagery modules.
- Preserve the current UI design and existing functionality.
- Do not rewrite the entire project.
- Fix the actual root cause in the existing implementation.
- Add or update tests for the serial parser, WebSocket stream and hardware connection state.

## 6. Final Verification

After fixing, run the backend tests and frontend typecheck/build.

Then test the complete pipeline using the connected Arduino.

Provide a final report containing:

1. Exact root cause.
2. Files modified.
3. Fix implemented.
4. Actual serial sample count received.
5. Measured sampling rate.
6. WebSocket sample count broadcast.
7. Confirmation that actual hardware waveform is visible on the frontend.
8. Confirmation that MongoDB recording contains actual samples.

Do not claim end-to-end success unless real Arduino samples have been traced all the way to the frontend.

**Priority: Make actual Arduino + BioAmp readings visible on the NeuroCare AI Live Monitoring frontend.**
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-11-21T12:50:24+05:30.

The user's current state is as follows:
Other open documents:
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care AI Frontend/src/pages/ParticipantsPage.tsx (LANGUAGE_UNSPECIFIED)
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care AI Frontend/src/pages/ReportsPage.tsx (LANGUAGE_UNSPECIFIED)
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care AI Frontend/src/components/layout/TopBar.tsx (LANGUAGE_UNSPECIFIED)
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care AI Frontend/src/App.tsx (LANGUAGE_UNSPECIFIED)
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care/backend/hardware/arduino.py (LANGUAGE_UNSPECIFIED)
</ADDITIONAL_METADATA>
```


---

## 3. Files Affected
- `Neuro Care/backend/services/serial_service.py`
- `Neuro Care/backend/hardware/arduino.py`
- `Neuro Care/backend/main.py`
- `Neuro Care/backend/services/dsp_service.py`
- `Neuro Care/backend/core/schemas.py`
- `Neuro Care/backend/api/routes.py`
- `Neuro Care AI Frontend/src/lib/api.ts`
- `Neuro Care AI Frontend/src/types/index.ts`
- `Neuro Care AI Frontend/src/pages/LiveMonitoringPage.tsx`
- `Neuro Care/tests/test_dsp_and_streaming.py`
- `Neuro Care/tests/test_serial_and_hardware.py`

---

## 4. Implementation Details
Diagnosed and fixed 4 critical bugs:
1) Decimal timestamp parsing ValueError in parse_firmware_line (ts_ms = float(parts[0].strip())).
2) Serial port contention [Errno 16] Resource busy from Arduino IDE + auto-reconnect retry loop in serial_service.py.
3) Non-blocking atomic serial reads and buffer reassembly in arduino.py.
4) WebSocket JSON serialization TypeError on datetime objects in main.py.
5) Truthful DISCONNECTED/AWAITING_SAMPLES signal quality score 0 on 0 samples.

---

## 5. Outcome & Verification
51/51 pytest tests passed; 0 TypeScript errors; verified 80,000+ live samples acquired at 256.0 Hz; live recording, event markers, CSV and PDF verified.

---
*Maintained as part of the NeuroCare AI Dynamic Project Memory System.*
