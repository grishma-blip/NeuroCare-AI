# Master Task: Dynamic Project Memory & Context Preservation System

- **Task ID:** 14
- **Slug:** `task-14-context-preservation-system`
- **Recorded Step Indices:** [2421]
- **Status:** COMPLETED / VERIFIED

---

## 1. Objective
Master Task: Dynamic Project Memory & Context Preservation System for the NeuroCare AI platform.

---

## 2. Original User Prompt(s)
### Prompt from Step 2421 (2026-11-21T08:02:22Z)

```text
<USER_REQUEST>
# MASTER TASK: Build a Dynamic Project Memory & Context Preservation System for NeuroCare AI

## 1. Objective

I want to establish a permanent, dynamically maintained project memory system for my entire NeuroCare AI project.

The primary objective is to ensure that no important project context, previous instructions, implementation decisions, debugging history, completed work, pending tasks, architectural information, or future requirements are lost when:

- Antigravity runs out of tokens.
- I switch to another AI model.
- I start a new conversation.
- I close and reopen the workspace.
- Another developer or AI agent takes over the project.

The system must maintain one authoritative master file named:

`context.md`

This file must be created in the ROOT DIRECTORY of the existing NeuroCare AI project.

Do not create it inside the frontend, backend, or any nested folder.

First inspect the actual workspace root and existing project structure. Confirm the root directory before creating files.

---

# 2. Create the Master context.md

Create a comprehensive `context.md` containing the complete available project context.

It must be useful enough that a completely new AI model, with no access to our previous conversations, can understand the project and continue development without repeatedly asking me basic questions.

Organize the document using the following sections.

## A. Project Overview

Include:

- Project name: NeuroCare AI.
- Project purpose and problem statement.
- Target users.
- Main objectives.
- College project and live demonstration requirements.
- Current development stage.
- Expected final demonstration workflow.

## B. Technology Stack

Document the actual technologies discovered in the existing codebase.

Include:

- Frontend framework and libraries.
- Backend framework and libraries.
- Database.
- WebSocket implementation.
- EEG signal processing libraries.
- Machine learning frameworks.
- Hardware and firmware.
- Development tools.
- Ports and local URLs.

Do not guess versions or technologies. Inspect package files, requirements, configuration and source code.

## C. Complete System Architecture

Document the actual architecture and data flow.

Include:

- React frontend.
- FastAPI backend.
- MongoDB.
- Arduino UNO R4 WiFi.
- BioAmp EXG Pill.
- USB serial communication.
- Serial parser.
- DSP pipeline.
- WebSocket EEG streaming.
- Recording persistence.
- Reporting services.
- ML inference endpoints.

Clearly identify which connections are implemented, tested, and physically verified.

## D. Hardware Documentation

Document:

- Arduino UNO R4 WiFi.
- BioAmp EXG Pill v1.0.
- Electrode setup.
- Analog input pin.
- ADC configuration.
- Sampling rate.
- Serial baud rate.
- Serial port detection on macOS.
- Firmware filename and location.
- Exact serial output format.
- Voltage conversion formula and its assumptions.
- Hardware analog bandwidth.
- Calibration status.
- Hardware debugging history.

Keep nominal/unverified calibration separate from experimentally calibrated values.

Never document synthetic demo data as real hardware data.

## E. Main Project Modules

Create individual subsections for:

1. Live EEG acquisition and monitoring.
2. Brainwave frequency analysis.
3. Signal processing and signal quality.
4. Emotion Recognition using DEAP.
5. Motor Imagery Recognition using PhysioNet.
6. Participant management.
7. Session management.
8. Recording lifecycle.
9. Event markers.
10. MongoDB persistence.
11. Doctor/Admin dashboard.
12. Clinician/Nurse dashboard.
13. PDF reporting.
14. CSV export.
15. JSON export.
16. ML dataset export and participant-level splitting.

For every module, document:

- Purpose.
- Implementation location.
- Main files.
- APIs/endpoints.
- Input and output.
- Current implementation status.
- Verified functionality.
- Known issues.
- Pending work.

Do not assume a feature is working merely because it exists in the code.

## F. API Documentation

Inspect the backend and document:

- REST API endpoints.
- HTTP methods.
- Request parameters and bodies.
- Response structures.
- WebSocket endpoints.
- Authentication requirements.
- Relevant frontend consumers.

Use actual endpoint definitions from source code.

## G. Database Documentation

Document:

- MongoDB database name.
- Collections.
- Important document fields.
- Relationships between participants and sessions.
- EEG sample storage.
- Event markers.
- Analysis results.
- Report metadata.

Inspect the actual schemas and database services.

## H. Frontend Documentation

Document:

- All major routes.
- Pages and components.
- Role-based views.
- Dashboard functionality.
- Live monitoring UI.
- Hardware connection UI.
- Participant and session workflows.
- Reporting pages.
- Known UI issues.

## I. Complete Prompt and Instruction History

This section is extremely important.

Maintain a chronological record of the instructions and prompts given to Antigravity throughout the project.

For every task, record:

1. Date and time.
2. Original user prompt or a faithful complete representation.
3. Objective of the prompt.
4. Requested changes.
5. Files affected.
6. Implementation performed.
7. Tests performed.
8. Actual outcome.
9. Errors or blockers.
10. Pending follow-up work.

Preserve important technical requirements and exact constraints.

Do not reduce detailed technical instructions to vague summaries.

When practical, store the original prompt text in the history section. If the history becomes too large, maintain detailed chronological entries and create additional files under a `project-history/` directory, with `context.md` linking to them.

Do not remove older history just to make the file shorter.

## J. Decisions and Constraints

Maintain a separate record of important decisions.

Examples:

- Preserve the existing project architecture.
- Do not unnecessarily rewrite the frontend or backend.
- Real hardware data must remain separate from synthetic demo data.
- DEAP and PhysioNet are separate dataset-based ML pipelines.
- Never fabricate EEG samples or analysis outputs.
- Preserve existing working functionality.
- Keep the system focused on the college project demonstration.
- Prioritize working features over unnecessary enterprise infrastructure.
- Clearly label experimental and non-diagnostic outputs.

Record future decisions as they happen.

## K. Current Project Status

Maintain a live status table.

Use these statuses:

- NOT STARTED
- IN PROGRESS
- IMPLEMENTED
- TESTED
- VERIFIED END-TO-END
- BLOCKED

Track each major feature separately.

For example:

| Feature | Status | Evidence | Pending work |
|---|---|---|---|
| Arduino USB detection | | | |
| Serial acquisition | | | |
| Backend serial parser | | | |
| WebSocket streaming | | | |
| Frontend waveform | | | |
| DSP bandpowers | | | |
| MongoDB persistence | | | |
| Participant management | | | |
| Session lifecycle | | | |
| PDF reports | | | |
| DEAP inference | | | |
| PhysioNet inference | | | |

Do not mark anything VERIFIED END-TO-END without actual evidence.

## L. Known Bugs and Debugging History

Maintain:

- Bug description.
- Root cause.
- Files involved.
- Fix attempted.
- Fix verified or unverified.
- Remaining issues.

Never silently remove unresolved bugs.

## M. Current Pending Tasks and Next Steps

Maintain a prioritized task list:

- Critical.
- High priority.
- Medium priority.
- Optional.

Update it after every completed task.

## N. Important Commands

Document frequently used commands for:

- Starting the backend.
- Starting the frontend.
- Running backend tests.
- Running frontend typecheck.
- Building the frontend.
- Starting MongoDB if applicable.
- Detecting Arduino USB ports.
- Uploading/testing Arduino firmware.
- Debugging serial communication.

Only document commands verified against the actual project setup.

---

# 3. DYNAMIC UPDATE SYSTEM — MANDATORY

This is the most important requirement.

I do not want to manually remind Antigravity to update context.md every time.

I want future project prompts and their implementation history to be recorded automatically as part of the normal development workflow.

Investigate which persistent project-level instruction, rule, workflow, or hook mechanism the current Antigravity environment actually supports.

Implement the most reliable supported solution.

Do not invent unsupported Antigravity APIs or claim that a feature is automatic if it is not.

The persistent instructions must enforce the following workflow.

### BEFORE starting every new task:

1. Read the root `context.md`.
2. Read the relevant project history if referenced.
3. Understand existing architecture and previous decisions.
4. Identify related files and existing implementations.
5. Record the new user request in the task history.
6. Update the current task status to IN PROGRESS.
7. Check whether the request conflicts with existing decisions.

### DURING implementation:

1. Preserve existing working functionality.
2. Follow existing architecture unless a change is necessary.
3. Record important technical decisions.
4. Track files created, modified and deleted.
5. Record errors, blockers and debugging discoveries.
6. Do not mark unfinished functionality as complete.
7. Avoid unnecessary duplicate documentation entries.

### AFTER completing every task:

1. Update the corresponding task history.
2. Record what was implemented.
3. Record exact files modified.
4. Record commands and tests executed.
5. Record actual test results.
6. Update feature statuses.
7. Update known bugs and unresolved issues.
8. Update next steps.
9. Update the Last Updated timestamp.
10. Save all changes to the root `context.md`.

If a task fails or is interrupted, record its partial progress and remaining work.

If a user submits multiple prompts in one session, maintain separate chronological task entries.

Do not wait until the end of the conversation to update the context.

---

# 4. Make Future Model Handoffs Easy

Create a separate section at the TOP of context.md called:

## READ THIS FIRST — AI HANDOFF

This must contain:

- What the project does.
- Current development stage.
- Current active task.
- Current blockers.
- Important technical decisions.
- Exact commands to start the project.
- Important file paths.
- Current hardware connection details.
- What the next AI model should do first.

Add this instruction prominently:

"Before making any code changes, read this entire context.md and inspect the relevant source files. Treat the source code as the authority for current implementation. Treat this document as the project's development history, requirements and decisions. If the code and documentation disagree, report the discrepancy and update the documentation after verification."

Also include a ready-to-use handoff prompt that I can copy into another AI model.

---

# 5. Avoid Documentation Problems

The context system must follow these rules:

- Never delete important historical information.
- Never invent implementation status.
- Never claim tests passed without executing them.
- Never claim hardware works without physical verification.
- Never store API keys, passwords, access tokens or other secrets.
- Never duplicate the entire context unnecessarily.
- Keep technical information accurate.
- Preserve important exact commands, endpoint names and file paths.
- Keep the document readable and well-organized.
- Use chronological history entries.
- Keep older decisions available even when newer decisions supersede them.
- Clearly mark superseded decisions.

If the master file becomes too large, split detailed history into linked Markdown files while retaining `context.md` as the single entry point.

---

# 6. Initial Context Population

Before declaring the system complete:

1. Inspect the complete existing project structure.
2. Inspect backend and frontend source code.
3. Inspect firmware.
4. Inspect API definitions.
5. Inspect database models and services.
6. Inspect tests and configuration.
7. Use all currently available project conversation context and requirements supplied in this task.
8. Populate context.md with the known NeuroCare AI development history.

Include the recent hardware debugging situation:

- Arduino UNO R4 WiFi detected on macOS.
- USB serial port: `/dev/cu.usbmodem3CDC75F19EB82`.
- Serial baud rate: 115200.
- Arduino is producing numeric timestamp and signal readings.
- Example serial data format: `timestamp_ms,voltage_microvolts`.
- Approximately 3.9 ms timestamp spacing was observed.
- Frontend Live Monitoring shows WebSocket Stream Live but Serial Disconnected.
- Waveform is waiting for EEG packets.
- Amplitude and bandpowers remain zero.
- The actual root cause of the frontend hardware connection issue is still unresolved.
- Backend serial connection and complete hardware-to-frontend streaming still need verification.

Also document the earlier requested debugging task and its expected outcome.

Important: The current project source code and actual test results must be inspected. Do not copy unverified claims from old implementation summaries into the verified status section.

---

# 7. Verification of the Context System

After implementing everything:

1. Confirm `context.md` exists in the project root.
2. Confirm it contains all required sections.
3. Confirm the initial project history has been populated.
4. Confirm persistent project instructions have been installed using a supported mechanism.
5. Test the workflow with a small documentation-only test task.
6. Confirm that the task prompt and result are recorded.
7. Start a fresh Antigravity conversation or perform a simulated handoff.
8. Confirm that the new session can understand the project by reading context.md.

If automatic prompt capture cannot be guaranteed by the environment, clearly explain the limitation and implement the closest reliable supported workflow. Do not falsely promise that prompts are captured outside Antigravity or when the agent is not running.

---

# 8. Final Deliverables

I expect:

1. Root-level `context.md`.
2. Persistent project-level agent instructions or rules.
3. Additional history files only if necessary.
4. A reusable AI handoff prompt.
5. A verified initial project context.
6. A demonstration that future tasks update the documentation.

Do not modify unrelated application functionality while implementing this system.

Do not rewrite the application.

This task is about preserving project knowledge and ensuring seamless continuity across AI models and conversations.

**The final goal: Any new AI model should be able to open the NeuroCare AI root folder, read context.md, understand everything important about the project, and continue development from exactly where the previous model stopped.**


Update the root context.md immediately with this latest Real-Time EEG Pipeline Verification & Status Report.

Record:
- All four serial-to-frontend pipeline fixes.
- Arduino serial port and baud rate.
- Empirically reported 256 Hz sampling rate.
- Reported 80,000+ acquired samples.
- WebSocket endpoint and streaming details.
- 51/51 backend tests.
- Frontend typecheck and build results.
- MongoDB persistence and PDF/CSV export verification.
- Remaining requirement: independent physical frontend verification and actual multi-person recording workflow.

Update the chronological prompt/task history, implementation status, resolved bugs, and pending tasks.

Do not mark features as physically verified beyond the evidence available. Preserve all earlier history. Save context.md in the project root.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-11-21T13:32:22+05:30.

The user's current state is as follows:
Active Document: /Users/piyushbindhani/Downloads/Final Neuro Care Now/README.md (LANGUAGE_UNSPECIFIED)
Cursor is on line: 1
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
- `context.md`
- `AGENTS.md`
- `GEMINI.md`
- `.agent/rules/context_preservation.md`
- `project-history/`

---

## 4. Implementation Details
Created authoritative root-level context.md, project-level AGENTS.md rules, and structured historical prompt archives.

---

## 5. Outcome & Verification
Permanent memory and seamless AI handoff system established.

---
*Maintained as part of the NeuroCare AI Dynamic Project Memory System.*
