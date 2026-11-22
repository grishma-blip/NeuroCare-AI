# NeuroCare AI — Autonomous Agent Protocol & Context Preservation Rules

> **CRITICAL INSTRUCTION FOR ALL AI MODELS, ASSISTANTS, AND DEVELOPERS:**
> This repository uses a dynamic, persistent project memory system centered around the root file `context.md`.
> Before executing ANY command, creating/editing ANY file, or proposing ANY changes, you MUST read and follow the instructions below.

---

## 1. Mandatory Workflow Lifecycle

### BEFORE Starting Every New Task:
1. **Read `context.md`** at the workspace root (`/Users/piyushbindhani/Downloads/Final Neuro Care Now/context.md`).
2. **Review `project-history/`** for historical context on previous related decisions or implementations.
3. **Verify Existing Architecture & Invariants**: Understand existing services, schemas, and hardware states before planning edits.
4. **Log the Task**: Add the user's prompt or task objective into the active task section of `context.md` with status `IN PROGRESS`.
5. **Conflict Check**: Ensure the requested task does not violate core invariants (e.g., modifying legacy backend, faking hardware data, deleting primary backend files).

### DURING Implementation:
1. **Preserve Working Code**: Never rewrite functioning modules or break existing features.
2. **Adhere to Boundaries**: Work within the designated directories (`Neuro Care/` for backend, `Neuro Care AI Frontend/` for frontend).
3. **Track Changes**: Maintain a mental or scratch list of exact files created, modified, or deleted.
4. **Log Debugging Insights**: Note any errors, port conflicts, or schema mismatches encountered.
5. **Truthful Progress**: Never declare a feature working until verified by actual tests or physical telemetry.

### AFTER Completing Every Task:
1. **Update `context.md`**:
   - Record what was implemented and why.
   - Record exact file paths modified, created, or removed.
   - Record exact verification commands executed and their output.
   - Update the **Current Project Status** table (`NOT STARTED`, `IN PROGRESS`, `IMPLEMENTED`, `TESTED`, `VERIFIED END-TO-END`, `BLOCKED`).
   - Update **Known Bugs and Debugging History** (mark resolved or document remaining blockers).
   - Update **Current Pending Tasks and Next Steps**.
   - Update the **Last Updated** timestamp.
2. **Update `project-history/`**: If the task was substantial, archive the full prompt and detailed report in `project-history/task-XX-<slug>.md`.
3. **Save `context.md`**: Ensure the file is saved and completely synced.

---

## 2. Core Architectural Invariants

- **Single Authoritative Backend:** `Neuro Care/` is the sole production FastAPI backend.
- **Single Production Frontend:** `Neuro Care AI Frontend/` is the sole React + Vite + TypeScript client.
- **Deprecated / Do Not Use:** `Neuro Care AI Frontend/backend/` is an obsolete legacy backend. Never start, modify, or reference it.
- **Hardware Truth:** The Arduino UNO R4 WiFi + BioAmp EXG Pill v1.0 (`/dev/cu.usbmodem3CDC75F19EB82` @ 115200 baud) streams physical microvolt data.
  - In `HARDWARE` mode, **NEVER substitute synthetic, random, or generated samples**. If disconnected, truthfully report `DISCONNECTED` / `AWAITING_SAMPLES`.
  - In `DEMO` mode, synthetic 256 Hz physiological rhythms are permitted for presentations without hardware.
  - `REPLAY` mode is strictly reserved for DEAP 32-channel and PhysioNet 64-channel ML benchmark files.
- **Scientific Bandwidth Integrity:** The BioAmp EXG Pill has an analog active bandpass filter of 0.5 – 29.5 Hz. Gamma frequencies (>30.0 Hz) are **physically attenuated**. Gamma must ALWAYS be labeled as hardware cutoff / unavailable (`is_available: false`). Never generate fake Gamma bandpowers.
- **College Demo Priority:** Prioritize reliable real-time acquisition, smooth waveform rendering, Welch bandpowers, participant intake, and PDF/CSV downloads over enterprise authentication or complex microservice infrastructure.

---

## 3. Standard Verification Commands

- **Backend Test Suite:** `cd "Neuro Care" && .venv/bin/python -m pytest tests/` (Expect: 51/51 passed).
- **Frontend Typecheck:** `cd "Neuro Care AI Frontend" && npm run typecheck` (Expect: 0 errors).
- **Frontend Production Build:** `cd "Neuro Care AI Frontend" && npm run build` (Expect: 0 errors).
- **Backend API Server:** `cd "Neuro Care" && .venv/bin/python -m uvicorn backend.main:app --host 127.0.0.1 --port 8000`.
- **Frontend Dev Server:** `cd "Neuro Care AI Frontend" && npm run dev` (Runs on `http://localhost:5173`).
- **Device Telemetry Check:** `curl -s http://127.0.0.1:8000/api/device/status`.

---

*This rule is automatically enforced by Antigravity across all workspace turns.*
