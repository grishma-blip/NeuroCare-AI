# Multi-Participant EEG Data Collection & Reporting System

- **Task ID:** 11
- **Slug:** `task-11-multi-participant-reporting`
- **Recorded Step Indices:** [1286]
- **Status:** COMPLETED / VERIFIED

---

## 1. Objective
Multi-Participant EEG Data Collection & Reporting System for the NeuroCare AI platform.

---

## 2. Original User Prompt(s)
### Prompt from Step 1286 (2026-11-20T16:26:09Z)

```text
<USER_REQUEST>
# NeuroCare AI — Multi-Participant EEG Data Collection & Reporting System

Act as a senior full-stack engineer, biomedical signal-processing engineer, and software architect.

Extend my EXISTING NeuroCare AI project to make it ready for a real multi-participant EEG data collection session tomorrow.

## 1. First inspect the existing project

Before changing anything:
- Inspect the existing FastAPI backend, React + Vite + TypeScript frontend, MongoDB integration, Arduino serial service, DSP service, WebSocket streaming, authentication and dashboards.
- Identify existing APIs, schemas, components and working functionality.
- Reuse existing implementations wherever possible.
- Do not create a second backend or duplicate serial connection.
- Do not break the existing DEAP Emotion Recognition or PhysioNet Motor Imagery modules.
- Provide an implementation plan before making changes.

Existing hardware:
- Arduino UNO R4 WiFi
- Upside Down Labs BioAmp EXG Pill
- Single-channel EEG acquisition
- Existing firmware and serial communication implementation

Do not assume the firmware sampling rate, voltage calibration or signal units. Verify the actual code and document what is confirmed.

## 2. Participant Management

Build a complete participant registration workflow.

Required fields:
- Automatically generated unique Participant ID
- Optional participant name or pseudonym
- Age, only if necessary and consented
- Session date
- Consent confirmation
- Optional research notes

Privacy:
- Do not require unnecessary personal information.
- Store participant data separately from EEG signal data.
- Restrict access according to existing roles.
- Never expose participant personal information in public exports.
- Provide a way to withdraw a participant and handle their associated research data according to the project's data policy.

## 3. Multi-Session Recording

A participant must be able to have multiple recording sessions.

Each session should include:
- Unique Session ID
- Participant ID
- Recording start and end timestamps
- Hardware/device information
- Actual measured sampling rate
- Signal calibration information, if verified
- Recording status
- Session notes
- Recording operator
- Data quality summary

Implement:
- Start recording
- Pause recording
- Resume recording
- Stop recording
- Save recording
- View previous sessions

Prevent duplicate sessions and accidental overwriting.

## 4. Live EEG Monitoring

Extend the existing Live Monitoring dashboard.

Display:
- Live raw waveform
- Live filtered waveform
- Delta power
- Theta power
- Alpha power
- Beta power
- Relative bandpower percentages
- Welch PSD
- Alpha peak frequency
- Actual measured sampling rate
- Device connection status
- Signal quality diagnostics

Gamma must be explicitly unavailable if the verified acquisition bandwidth does not support it.

Important:
- Only display real physical hardware data in Hardware mode.
- Never silently substitute synthetic/demo data.
- Clearly label Demo, Replay and Physical Hardware modes.
- If the device disconnects, show disconnected status.
- Do not continue showing stale data as live data.
- Use correct timestamps and units.
- Preserve filter state across streaming chunks.
- Clearly indicate when signal calibration is unverified.

## 5. Recording Conditions and Event Markers

During a recording, allow the operator to insert timestamped event markers.

Provide configurable labels such as:
- Eyes Open
- Eyes Closed
- Rest
- Task Start
- Task End
- Custom Event

These labels must be stored as operator-entered experimental metadata.

Do not infer a participant's emotional state, diagnosis, or mental condition from these markers.

Allow the operator to add notes during the recording.

## 6. Signal Quality and Recording Validation

Before starting a recording, show a hardware readiness checklist:
- Device connected
- Incoming samples detected
- Sampling rate measured
- Signal is not flatlined
- No persistent clipping
- No excessive noise
- Electrode/contact setup checked by operator

During recording, monitor:
- Flatline
- Clipping
- Baseline drift
- High-frequency noise
- Packet timing irregularities
- Missing samples
- Actual recording duration

Show a quality status:
- Good
- Warning
- Poor
- Disconnected

Do not discard poor-quality recordings automatically. Preserve them with quality flags so the researcher can decide whether to exclude them.

## 7. MongoDB Data Persistence

Persist:
- Participant records
- Session metadata
- Timestamped raw EEG samples
- Filtered samples, where required
- Bandpower summaries
- PSD summaries
- Event markers
- Quality diagnostics
- Recording metadata

Use appropriate indexes for Participant ID, Session ID and timestamps.

Use batched writes for high-frequency samples rather than one database write per sample.

Ensure:
- Recording is flushed safely when stopped.
- Incomplete sessions are identifiable after interruption.
- Duplicate samples are not silently introduced.
- Session data can be retrieved accurately.
- Large recordings can be paginated or streamed.

## 8. Research Dashboard

Build a participant/session research view.

Show:
- Total participants
- Total recording sessions
- Total recording duration
- Recent sessions
- Device status
- Recording quality distribution
- Participant-wise session history

When opening a participant:
- Show their session history.
- Allow selection of a session.
- Show that session's EEG waveform.
- Show frequency band analysis.
- Show PSD.
- Show event markers.
- Show signal quality.
- Compare multiple sessions only when their acquisition settings and units are sufficiently comparable.

## 9. Downloadable Reports

Generate a downloadable PDF report for every completed session.

The PDF should include:

A. Session Summary
- NeuroCare AI branding
- Participant ID
- Session ID
- Recording date
- Duration
- Device information
- Sampling rate
- Acquisition/calibration metadata

B. EEG Signal Analysis
- Raw waveform chart
- Filtered waveform chart
- PSD chart
- Delta, Theta, Alpha and Beta power
- Relative bandpower percentages
- Alpha peak frequency

C. Signal Quality
- Flatline diagnostics
- Clipping diagnostics
- Baseline drift
- Noise diagnostics
- Packet irregularities
- Missing samples
- Overall quality assessment

D. Experimental Timeline
- Timestamped event markers
- Operator notes

E. Research Disclaimer
- Experimental research output
- Not a medical diagnosis
- No clinical conclusions
- Unverified calibration or missing measurements must be clearly disclosed

Also provide:
- Download raw EEG data as CSV
- Download session metadata as JSON
- Export selected sessions for future ML experimentation

Never put fabricated data or fabricated model accuracy into a report.

## 10. ML Dataset Preparation

Create a separate dataset preparation workflow.

Requirements:
- Export only selected, quality-reviewed sessions.
- Keep participant IDs and session IDs traceable.
- Preserve original timestamps and acquisition metadata.
- Allow researcher-entered labels.
- Do not automatically assign emotion labels from brainwave frequencies.
- Do not mix single-channel BioAmp recordings with 32-channel DEAP or 64-channel PhysioNet inputs.
- Do not duplicate channels or fabricate missing channels.
- Keep participant-level train/test separation to avoid data leakage.
- Report model accuracy only after proper evaluation on held-out data.

Do not retrain existing models automatically when a new session is recorded.

## 11. Role-Based Access

Nurse/Clinician:
- Register participants
- Confirm consent
- Connect hardware
- Start and manage recordings
- Add event markers and notes
- View permitted session history
- Generate permitted session reports

Doctor/Admin:
- View research dashboard
- Analyse recordings
- Compare sessions
- Review data quality
- Export research datasets
- Manage users and permissions
- Generate research reports

Enforce permissions in the FastAPI backend, not only in React route guards.

## 12. Frontend Design

Maintain the existing premium NeuroCare AI design language.

The interface should be:
- Professional
- Clean
- Research-oriented
- Responsive
- Easy for nurses to operate during repeated recordings

Add clear loading, empty, disconnected, error and success states.

Avoid mock statistics and fake live values.

## 13. Testing

Write automated tests for:
- Participant creation
- Consent validation
- Session creation
- Start/pause/resume/stop recording
- Serial disconnection
- Sample persistence
- Missing sample handling
- Event markers
- Session retrieval
- PDF generation
- CSV export
- Role-based authorization
- Dataset export
- Participant-level data separation

Run all existing tests as well.

Do not claim physical hardware tests have passed unless the hardware was actually tested.

## 14. Final Deliverables

At completion, provide:
1. Files created and modified.
2. APIs added or updated.
3. MongoDB schema changes.
4. Frontend pages and components added.
5. Tests executed and actual results.
6. Commands to start the backend and frontend.
7. Exact instructions for tomorrow's data collection.
8. Any remaining limitations or hardware validation requirements.

IMPORTANT:
Preserve existing functionality. Do not replace real hardware data with synthetic signals. Do not claim clinical validity. Do not claim increased ML accuracy merely because more samples were collected.

The final result must be a functional multi-participant EEG research data collection and reporting platform, not just a visual prototype.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-11-20T21:56:09+05:30.

The user's current state is as follows:
Active Document: /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care AI Frontend/src/components/layout/TopBar.tsx (LANGUAGE_UNSPECIFIED)
Cursor is on line: 1
Other open documents:
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care AI Frontend/src/App.tsx (LANGUAGE_UNSPECIFIED)
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care/backend/hardware/arduino.py (LANGUAGE_UNSPECIFIED)
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care/backend/main.py (LANGUAGE_UNSPECIFIED)
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/Neuro Care/backend/services/serial_service.py (LANGUAGE_UNSPECIFIED)
- /Users/piyushbindhani/Downloads/Final Neuro Care Now/README.md (LANGUAGE_UNSPECIFIED)
</ADDITIONAL_METADATA>
```


---

## 3. Files Affected
- `Neuro Care/backend/api/routes.py`
- `Neuro Care/backend/services/report_service.py`
- `Neuro Care AI Frontend/src/pages/LiveMonitoringPage.tsx`
- `Neuro Care AI Frontend/src/pages/ReportsPage.tsx`

---

## 4. Implementation Details
Implemented multi-participant selection, session start/pause/resume/stop, experimental event markers (Eyes Open, Eyes Closed, Rest, Task Start/End), ReportLab vector PDF reports, and raw CSV exports.

---

## 5. Outcome & Verification
End-to-end data collection, batch persistence, and export workflows operational.

---
*Maintained as part of the NeuroCare AI Dynamic Project Memory System.*
