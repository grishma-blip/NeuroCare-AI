# Real-Time EEG Brainwave Monitoring Implementation

- **Task ID:** 10
- **Slug:** `task-10-realtime-eeg-implementation`
- **Recorded Step Indices:** [931]
- **Status:** COMPLETED / VERIFIED

---

## 1. Objective
Real-Time EEG Brainwave Monitoring Implementation for the NeuroCare AI platform.

---

## 2. Original User Prompt(s)
### Prompt from Step 931 (2026-11-20T15:17:52Z)

```text
<USER_REQUEST>
# NeuroCare AI — Real-Time EEG Brainwave Monitoring Implementation

I want to take NeuroCare AI beyond a basic recording dashboard and make it a proper real-time EEG monitoring and brainwave analysis platform.

My primary objective:

When the Arduino UNO R4 WiFi connected to the BioAmp EXG Pill captures EEG signals, the actual readings must flow continuously through the backend and appear on the frontend in real time.

## 1. Real Hardware Acquisition

- Use the actual Arduino USB CDC serial stream.
- Implement reliable serial acquisition in the primary FastAPI backend.
- Parse the actual firmware output format.
- Maintain accurate timestamps and sampling-rate measurements.
- Support connection, disconnection and reconnection.
- Clearly distinguish HARDWARE, DEMO and REPLAY modes.
- Never substitute generated samples when hardware mode is selected.
- Persist actual acquired samples to MongoDB.

First inspect the existing firmware, serial service and parser. Do not assume a 256 Hz sampling rate. Use the actual verified firmware configuration.

## 2. Real-Time Live EEG Waveform

Upgrade Doctor/Admin → Live Monitoring.

Display:
- Continuously scrolling EEG waveform.
- Actual signal amplitude in microvolts.
- Time axis in seconds.
- Live measured sampling frequency.
- Connection status.
- Recording timer.
- Start, Pause, Resume and Stop controls.
- Total samples received.
- Signal disconnection and flatline warnings.

The waveform must be sourced from the actual backend acquisition stream, not random numbers, mathematical simulations or frontend-generated samples.

Use an efficient streaming approach such as WebSocket or another suitable existing architecture.

## 3. Real-Time Brainwave Frequency Analysis

Implement actual signal-processing calculations on incoming EEG samples.

Calculate bandpower using scipy.signal.welch or an equivalent validated DSP implementation.

Frequency bands:
- Delta: 0.5–4 Hz
- Theta: 4–8 Hz
- Alpha: 8–13 Hz
- Beta: 13–29.5 Hz
- Gamma: Above 30 Hz

Display:
- Live bandpower values in µV².
- Continuously updating frequency-band charts.
- Relative bandpower percentages where mathematically appropriate.
- Frequency spectrum / PSD chart.
- Raw versus filtered waveform.
- Clear units, axis labels and update timestamps.

IMPORTANT:
The existing BioAmp hardware bandpass is reported as 0.5–29.5 Hz. Confirm this against actual hardware specifications. Do not display Gamma as a measured live band if the hardware filters it out. Show it as unavailable or outside the supported bandwidth.

Do not fabricate brainwave values or use arbitrary numbers.

## 4. Signal Quality Monitoring

Implement:
- Flatline detection.
- Clipping / ADC rail detection.
- Missing-sample detection.
- Sampling-rate stability.
- Baseline drift.
- High-frequency noise assessment within the acquired bandwidth.

Make clear which diagnostics are actual measurements and which are heuristic indicators.

## 5. Doctor/Admin Dashboard

Integrate these components into Live Monitoring:
- Live EEG waveform.
- Brainwave frequency-band chart.
- PSD spectrum.
- Signal-quality metrics.
- Hardware telemetry.
- Recording controls.

Keep Signal Analysis (DSP) as a detailed post-recording analysis page using persisted MongoDB samples.

## 6. Clinician/Nurse Dashboard

Keep the existing nine-step Recording Assistant workflow.

When recording begins:
- Read actual hardware samples.
- Display the actual incoming waveform.
- Persist actual samples to MongoDB.
- Save accurate timestamps and recording metadata.
- Show a completion summary using real recorded sample counts.

The Doctor/Admin dashboard must be able to inspect the same saved recording.

## 7. Preserve Existing ML Modules

Do not break or replace:
- DEAP 32-channel Emotion Recognition.
- PhysioNet 64-channel Motor Imagery Recognition.
- Existing signal-quality model.

Keep dataset-based benchmark inference separate from live single-channel BioAmp analysis.

Do not duplicate a single channel to create fake 32-channel or 64-channel inputs.

## 8. Backend and Data Architecture

- Preserve the primary FastAPI backend and MongoDB database.
- Preserve existing API contracts unless changes are necessary.
- Add streaming endpoints and DSP endpoints only where required.
- Make hardware acquisition a single shared service so the Nurse and Doctor dashboards do not independently open the same serial port.
- Prevent duplicate serial connections and duplicate recordings.
- Handle errors and reconnection safely.

## 9. Security and Role Permissions

Fix direct URL access to administrator-only pages.

- Clinician/Nurse: recording, participant care, consent and session history.
- Doctor/Administrator: research overview, monitoring, signal analysis, AI modules, reports and administration.

Enforce authorization on the backend, not only by hiding frontend navigation links.

## 10. Testing and Scientific Integrity

Test:
- Serial parser using representative firmware output.
- Sampling frequency measurement.
- DSP bandpower calculations using known test signals.
- Streaming and reconnection behavior.
- MongoDB persistence.
- Nurse-to-Doctor recording visibility.
- Role-based route and API authorization.
- Hardware mode versus demo/replay mode.

Do not claim physical hardware testing unless the Arduino and BioAmp are actually connected and tested.

Clearly document any limitations.

## 11. Implementation Rules

1. Audit the existing source before making changes.
2. Preserve all working features and existing project structure.
3. Do not rebuild the project from scratch.
4. Do not replace real acquisition with simulation.
5. Do not remove existing ML modules.
6. Implement incrementally and test after each major change.
7. Update README with the actual setup, firmware, data flow and hardware limitations.
8. Provide a final report listing changed files, APIs, tests, and remaining hardware verification steps.

The final goal is a functional NeuroCare AI platform with genuine real-time single-channel EEG monitoring, live Delta/Theta/Alpha/Beta analysis, recording persistence, and separate dataset-based ML research modules.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-11-20T20:47:52+05:30.

The user's current state is as follows:
Active Document: /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care AI Frontend/src/components/layout/TopBar.tsx (LANGUAGE_UNSPECIFIED)
Cursor is on line: 1
Other open documents:
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care AI Frontend/src/lib/api.ts (LANGUAGE_UNSPECIFIED)
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care AI Frontend/src/lib/format.ts (LANGUAGE_UNSPECIFIED)
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care AI Frontend/src/pages/CognitiveResponsePage.tsx (LANGUAGE_UNSPECIFIED)
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care AI Frontend/src/pages/DeviceManagementPage.tsx (LANGUAGE_UNSPECIFIED)
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care AI Frontend/src/pages/EmotionAnalysisPage.tsx (LANGUAGE_UNSPECIFIED)
</ADDITIONAL_METADATA>
```


---

## 3. Files Affected
- `Neuro Care/backend/hardware/arduino.py`
- `Neuro Care/backend/services/serial_service.py`
- `Neuro Care/backend/services/dsp_service.py`
- `Neuro Care/backend/main.py`
- `Neuro Care AI Frontend/src/pages/LiveMonitoringPage.tsx`

---

## 4. Implementation Details
Built real USB CDC acquisition for Arduino UNO R4 WiFi + BioAmp EXG Pill; implemented Welch PSD calculation across 512-sample sliding window; labeled Gamma (>29.5 Hz) as hardware cutoff; streamed via WebSockets (/ws/eeg).

---

## 5. Outcome & Verification
Oscilloscope and bandpower cards bound to live WebSocket frames.

---
*Maintained as part of the NeuroCare AI Dynamic Project Memory System.*
