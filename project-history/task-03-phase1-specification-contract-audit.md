# Phase 1 Contract Verification Audit

- **Task ID:** 03
- **Slug:** `task-03-phase1-specification-contract-audit`
- **Recorded Step Indices:** [141, 155]
- **Status:** COMPLETED / VERIFIED

---

## 1. Objective
Phase 1 Contract Verification Audit for the NeuroCare AI platform.

---

## 2. Original User Prompt(s)
### Prompt from Step 141 (2026-11-20T05:22:04Z)

```text
<USER_REQUEST>
The Phase 1 specification is directionally correct, but it contains several critical issues. Revise the specification before implementation.

**Architecture remains FINAL:**
- Primary backend: `Neuro Care/`
- Frontend: `Neuro Care AI Frontend/`
- Do not modify the primary backend or its ML models.
- Preserve the frontend UI wherever possible.
- Do not delete or use the embedded legacy backend as the primary backend.

**Re-audit the actual source files and correct these issues:**

1. **No fabricated participant data**
   - Do not silently default age to 28, gender to "Unspecified", or `created_by` to "clinician".
   - Verify the actual participant creation schema and identify which values must come from the UI.
   - Keep consent and participant status as separate concepts.
   - Do not assume `pending` consent means `inactive` participant status.

2. **No fabricated session metrics**
   - Do not calculate sample count as duration × sampling rate.
   - Do not assign arbitrary completeness values such as 50% or 100%.
   - Do not default signal quality to "good".
   - Use actual persisted EEG record information, or represent unavailable values explicitly.
   - Preserve the backend's actual session statuses, including `cancelled` if supported.

3. **Verify MongoDB document serialization**
   - Check whether API responses actually return `id`, `_id`, or another identifier.
   - Verify every participant and session response field against the actual Pydantic serialization.
   - Do not assume internal MongoDB document fields are identical to API response fields.

4. **No fabricated device information**
   - Do not hardcode a serial port, firmware version, board connection, sampling rate, channel count, or measured device state unless the actual backend response or verified configuration supports it.
   - Distinguish backend unreachable from device disconnected.
   - Do not make connect/disconnect or operating-mode methods appear to perform real hardware operations when no such endpoint exists.

5. **No fake analysis results**
   - Remove hardcoded positive CMD results.
   - Remove fake CLEAN signal-quality results and empty DSP responses presented as successful analysis.
   - Do not return invented emotion predictions, probabilities, or model metrics.
   - Return explicit unsupported/unavailable states when no real backend capability exists.
   - Verify every ML request and response against the actual Pydantic schemas.

6. **No false authentication**
   - The backend has no verified authentication or JWT verification endpoints.
   - Do not imply that localStorage users or a locally stored token provide real authentication.
   - Clearly identify local-only user management as demonstration functionality.
   - Do not claim that frontend role values satisfy backend RBAC.

7. **No misleading simulated streaming**
   - A simulated waveform must never report the device as connected or live.
   - Keep simulated and hardware states distinct.
   - Do not write simulated samples to the backend as real hardware EEG.
   - Do not claim WebSocket support.

8. **Reports and overview**
   - Do not invent file sizes, report statuses, or session statistics.
   - Distinguish unavailable data from genuine zero values.
   - If exports are assembled in the browser, specify precisely which real backend data is used.

9. **Type definitions**
   - Separate backend request types from backend response/document types.
   - Preserve existing frontend view models where useful.
   - Add explicit unavailable/unsupported states where needed.
   - Verify `GroundTruthData`, calibration, emotion, motor imagery and signal-quality structures against the actual backend source.
   - Preserve `cancelled` rather than silently converting it to `failed`.

**Required output:**

Return a revised Phase 1 specification only, containing:
- Exact files to change.
- Actual existing code and proposed changes.
- Verified backend request/response schemas.
- Exact endpoint paths and HTTP methods.
- Component dependencies.
- Unsupported capabilities and their honest UI behaviour.
- Unresolved questions that require manual confirmation.
- A revised acceptance checklist.

Do not modify any files. Do not start implementation. Do not mark any field or endpoint as verified unless you inspected its actual source definition.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-11-20T10:52:04+05:30.
</ADDITIONAL_METADATA>
```

### Prompt from Step 155 (2026-11-20T05:26:49Z)

```text
<USER_REQUEST>
# NeuroCare AI — Phase 1 Specification: Final Contract Verification

The revised Phase 1 specification is directionally correct, but it still contains unresolved API-contract and data-integrity issues.

**Architecture remains FINAL:**
- Primary backend: `Neuro Care/`
- Frontend: `Neuro Care AI Frontend/`
- Do not modify the primary backend or its ML models.
- Preserve the existing frontend UI wherever possible.
- Do not delete or use the embedded legacy backend as the primary backend.
- This is a READ-ONLY audit. Do not modify any files.

## 1. Correct the remaining participant issues

- Never map `consent.obtained === false` to participant status `withdrawn`.
- Keep consent and participant status independent.
- Verify whether the backend actually rejects `consent_obtained: false`. A required boolean does not automatically mean it must be true.
- Verify whether `consent.obtained_at` can be null.
- Do not generate participant notes from demographic fields.
- Confirm the exact participant creation response wrapper and serialized document fields.

## 2. Verify Motor Imagery request contract

The current specification assumes that `analyze-motor-imagery` accepts a request body containing `samples`, `sampling_rate`, and `channel_names`.

Do not assume this.

Inspect the complete actual route implementation and every service function it calls.

Establish whether the endpoint:
- Accepts EEG samples in its request body.
- Reads persisted EEG records from the session.
- Loads a replay dataset internally.
- Requires an empty request body.

Only define `MotorImageryRequestPayload` if the actual route accepts that payload.

Also verify the exact requirements for:
- Session status.
- Session data mode.
- Channel count.
- Sampling rate.
- Sample count.
- Channel names.
- Whether the endpoint accepts exactly 385 samples or a different shape.

## 3. Verify all session status values

Inspect the actual session model, status constants/enums, creation logic, and lifecycle update functions.

Preserve `cancelled` if supported.

Do not include `failed` unless the backend explicitly defines or persists it. Do not map unknown statuses to another status.

## 4. Verify serialization end to end

For participant, session, EEG record, analysis, ground truth, and calibration responses, inspect:

1. MongoDB document model.
2. Pydantic response model.
3. Serializer/conversion function.
4. Actual route return statement.

For each response, document:
- Exact field names.
- Nullable fields.
- Nested objects.
- Identifier format (`id`, `_id`, or another field).
- Response wrapper.
- Any fields added or transformed during serialization.

Do not treat MongoDB storage documents as API response schemas without checking the serializer.

## 5. Verify ML response contracts

Inspect the actual Pydantic schemas and service return values for:
- Signal quality.
- Motor imagery.
- Emotion analysis.
- Ground truth.
- Session evaluation.
- Emotion calibration.

Do not copy previously proposed TypeScript interfaces without verifying every field.

Explicitly distinguish:
- Fields required in requests.
- Fields optional in requests.
- Fields returned by the backend.
- Fields that may be null.
- Fields that are conditionally returned.

Do not invent probabilities, confidence fields, nested evaluation objects, or calibration metadata.

## 6. Correct API error handling

- `getDeviceStatus` must distinguish network errors from HTTP errors.
- EEG-record retrieval failures must not silently become an empty successful result.
- Overview statistics must not count only a partial page as database-wide totals.
- Partial dashboard failures must be represented explicitly.
- Do not convert unavailable data into zero.
- Do not generate notes from unrelated metadata.

## 7. Correct authentication and WebSocket descriptions

- Do not claim the backend ignores Authorization headers unless actual middleware or route behavior proves that.
- State only that verified server-side authentication and JWT verification are not available.
- Treat local users and roles as demonstration-only.
- Do not treat request-body role values as authenticated identity.
- Do not claim a WebSocket connection attempt occurred when the endpoint does not exist.
- Keep simulated waveform state separate from hardware connectivity and persisted EEG records.

## 8. Required output

Return a corrected Phase 1 specification containing:

1. Exact files to change.
2. Exact existing functions and types that require changes.
3. Actual source file paths and line ranges supporting each backend contract.
4. Exact request schemas.
5. Exact serialized response schemas.
6. Exact endpoint paths and HTTP methods.
7. Frontend component dependencies.
8. Unsupported capabilities and honest UI behavior.
9. Unresolved questions requiring manual confirmation.
10. Revised acceptance checklist.

For every field and endpoint, provide its actual source definition. If you cannot verify it, explicitly mark it **UNVERIFIED** rather than guessing.

Do not implement anything. Do not modify any files. Do not claim successful compilation unless you actually run the typecheck command.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-11-20T10:56:49+05:30.
</ADDITIONAL_METADATA>
```


---

## 3. Files Affected
- `Neuro Care/backend/core/schemas.py`
- `Neuro Care/backend/models/`

---

## 4. Implementation Details
Audited ParticipantCreate, ParticipantWithdraw, RecordingSession schemas and documented field constraints (participant_code required, age 18-120, consent immutability).

---

## 5. Outcome & Verification
Reconciled data types and API contracts between frontend and backend.

---
*Maintained as part of the NeuroCare AI Dynamic Project Memory System.*
