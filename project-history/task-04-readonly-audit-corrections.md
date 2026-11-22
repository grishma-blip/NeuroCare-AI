# Read-Only Audit Corrections (Consent vs Status & Sample Counts)

- **Task ID:** 04
- **Slug:** `task-04-readonly-audit-corrections`
- **Recorded Step Indices:** [167, 189]
- **Status:** COMPLETED / VERIFIED

---

## 1. Objective
Read-Only Audit Corrections (Consent vs Status & Sample Counts) for the NeuroCare AI platform.

---

## 2. Original User Prompt(s)
### Prompt from Step 167 (2026-11-20T05:31:07Z)

```text
<USER_REQUEST>
The Final Contract Verification report is much improved, but it is not approved for implementation yet.

Perform one final STRICTLY READ-ONLY audit. Do not modify, create, delete, rename, or format any files.

Resolve these remaining points:

1. PARTICIPANT REGISTRATION
- The current frontend registration modal reportedly lacks age and gender.
- Explain exactly how Phase 1 will prevent invalid registration attempts without inventing defaults.
- If the UI cannot register participants until a later phase, explicitly state that registration is temporarily unavailable.
- Do not change the consent or participant-status semantics.

2. TWO-FILE IMPLEMENTATION SCOPE
- Inspect every existing caller of the functions and types being changed in src/lib/api.ts and src/types/index.ts.
- Identify every incompatible function signature, return type, property access, and component dependency.
- Establish whether the two-file scope can compile without modifying other frontend files.
- If not, list the additional files required. Do not claim compatibility without checking actual callers.

3. MOTOR IMAGERY
- Show the complete Pydantic validation and service validation separately.
- Verify outer matrix dimensions, per-row dimensions, channel-name ordering, sampling rate, and model preprocessing.
- Trace the exact request body through the route and service into model inference.
- Clarify whether a PhysioNet JSON test dataset already exists and whether its format is compatible. Do not create one.

4. SERIALIZATION
For ground truth, calibration, session evaluation, and emotion analysis, show the complete chain:
MongoDB document/model → serializer or conversion → Pydantic response model, if present → route return statement.
List exact fields, nullable values, optional values, wrappers, and transformations.
Mark anything not established by source as UNVERIFIED.

5. REPORT EXPORT AND ERROR HANDLING
- Inspect the actual export implementation and all API calls it depends on.
- Explain behavior when session retrieval succeeds but EEG-record retrieval fails.
- Establish whether ground truth, analysis and evaluation are available for export and how each is retrieved.
- Verify list endpoint pagination/limits and whether total represents the full matching database count.
- Never convert a failed request into an empty successful result.

6. SOURCE EVIDENCE
For every claim, provide the actual source path, exact line range, relevant function/class name, and a short explanation of what the source proves.
Check complete route registration and middleware/dependencies before claiming that WebSocket or server-side authentication is absent.
Verify whether 'failed' is actually assigned or persisted, not merely declared.
Verify exact calibration and device-status response serialization.

7. FINAL RESULT
Return:
- Confirmed contracts.
- Corrected Phase 1 file scope.
- Exact frontend caller compatibility findings.
- Remaining unresolved items.
- A revised acceptance checklist.

Use UNVERIFIED wherever the source does not establish a claim.

Do not implement anything.
Do not run formatting or file-writing commands.
Do not claim a successful typecheck unless you actually execute it.

The primary backend must remain untouched. The embedded legacy backend must remain untouched. The existing frontend UI must be preserved wherever possible.

Wait for explicit approval before making any changes.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-11-20T11:01:07+05:30.
</ADDITIONAL_METADATA>
```

### Prompt from Step 189 (2026-11-20T05:37:44Z)

```text
<USER_REQUEST>
The latest audit is much closer, but it still contains contradictions and incomplete frontend compatibility findings.

Perform a final READ-ONLY correction. No file modifications, creations, deletions, formatting, or implementation.

Resolve these exact issues:

1. CONSENT VS PARTICIPANT STATUS
The existing updateConsent(p.id, status) function must NOT call PATCH /participants/{id}/status. ConsentStatus ('given', 'pending', 'withdrawn') is not the same as participant status ('active', 'inactive', 'withdrawn').
Inspect every caller and propose a safe behavior. Consent editing must be marked unsupported if no backend endpoint exists.

2. NO ZERO DEFAULTS
Do not use sampleCount = 0 when the value has not been retrieved. Use null or an explicit unavailable state. Inspect every component consuming sampleCount and durationSeconds and identify the required changes.

3. COMPLETE FRONTEND SCOPE
Inspect every affected caller and determine the actual files requiring changes. Specifically inspect:
- ParticipantsPage.tsx
- SessionsPage.tsx
- RecordingAssistancePage.tsx
- LiveMonitoringPage.tsx
- DeviceManagementPage.tsx
- OverviewPage.tsx
- CognitiveResponsePage.tsx
- EmotionAnalysisPage.tsx
- ReportsPage.tsx
- src/lib/format.ts
- TopBar.tsx
- All shared components consuming changed types or API methods.

Do not preserve fake properties merely to satisfy TypeScript. Unsupported hardware fields, metrics, authentication, streaming, CMD analysis and emotion predictions must be represented honestly.

4. EMOTION AND CALIBRATION SERIALIZATION
Complete the route-to-storage-to-response trace. Identify every field added by route-level processing, every field stored in analysis.results, and the exact response from the calibration history endpoint. Mark unsupported claims UNVERIFIED.

5. EXPORT IMPLEMENTATION
Inspect the actual existing ReportsPage export handler and every function it calls. Determine whether export is currently real, mocked, partial, or unsupported. Show exact failure handling for session, EEG, analysis, ground truth and evaluation retrieval.

6. ROUTER AND SECURITY AUDIT
Inspect all routers registered by main.py, all middleware, route dependencies and token-validation utilities before concluding whether WebSocket routes or server-side authentication exist.

7. SESSION STATUS
Confirm whether cancelled and failed are only declared or actually assigned/persisted anywhere. Do not claim users can trigger these transitions unless an endpoint or service does so.

8. TYPECHECK SCOPE
List every frontend file requiring edits. Do not claim the three-file scope is sufficient if actual callers need changes. Do not claim typecheck success without executing the actual typecheck command.

Return a corrected implementation blueprint with:
- Exact file list
- Exact functions and types
- Source paths and line ranges
- Confirmed request and response contracts
- Every affected component
- Unsupported UI behavior
- Unresolved questions
- Acceptance checklist

Use UNVERIFIED wherever source does not prove a claim.

No files may be changed. Wait for my explicit approval before implementation.
</USER_REQUEST>
<ADDITIONAL_METADATA>
The current local time is: 2026-11-20T11:07:44+05:30.
</ADDITIONAL_METADATA>
```


---

## 3. Files Affected
- `Neuro Care AI Frontend/src/types/`
- `Neuro Care AI Frontend/src/pages/ParticipantsPage.tsx`

---

## 4. Implementation Details
Clarified that updateConsent must not call status patch endpoint. Mandated null defaults (not 0) for unretrieved sampleCount and durationSeconds.

---

## 5. Outcome & Verification
Audited all components consuming sampleCount and durationSeconds to prevent false 0-sample displays.

---
*Maintained as part of the NeuroCare AI Dynamic Project Memory System.*
