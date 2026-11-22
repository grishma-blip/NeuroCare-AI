# Path A — PhysioNet Motor Imagery

## 1. Objective
Develop an EEG-based Motor Imagery classification pipeline to distinguish Left-hand and Right-hand motor imagery using the PhysioNet EEG Motor Movement/Imagery dataset.

## 2. Dataset
- Dataset: PhysioNet EEG Motor Movement/Imagery
- Subjects processed: 109
- EDF recordings audited: 327
- EEG channels: 64
- Sampling frequency: 128 Hz
- Frequency band: 8–30 Hz
- Epoch length: 385 samples
- Classes:
  - Left-hand imagery
  - Right-hand imagery
- Rest trials excluded from binary classification.

## 3. Preprocessing
- Load EDF recordings using MNE.
- Select EEG channels.
- Resample to 128 Hz.
- Apply 8–30 Hz bandpass filtering.
- Apply average reference.
- Extract epochs from 0.5 to 3.5 seconds.
- Store processed epochs as NumPy NPZ files.

## 4. Machine Learning
Final deployed model:
- Common Spatial Patterns (CSP)
- StandardScaler
- Linear Discriminant Analysis (LDA)

CSP configuration:
- Components: 8
- Regularization: Ledoit-Wolf

Model artifact:
`ml/models/motor_imagery/binary_motor_imagery_csp_lda.joblib`

## 5. Evaluation
Subject-wise 5-fold GroupKFold evaluation:

| Metric | Result |
|---|---:|
| Mean Accuracy | 59.99% |
| Mean Balanced Accuracy | 59.98% |
| Mean Macro F1 | 59.18% |
| Pooled OOF Accuracy | 60.04% |

These results represent PhysioNet cross-validation, not real-world hardware accuracy.

## 6. Backend Integration
Implemented Motor Imagery prediction service with:
- Model loading
- Input shape validation
- Channel count and order validation
- Sampling-rate validation
- Epoch-length validation
- NaN and infinity rejection
- Prediction probabilities and confidence

API endpoint:

`POST /api/sessions/{session_id}/analyze-motor-imagery`

The endpoint validates completed REPLAY sessions and stores prediction results in MongoDB.

## 7. Testing
- Valid Left and Right epoch tests: PASS
- Invalid input tests: 10/10 PASS
- API participant/session lifecycle: PASS
- Prediction endpoint: PASS
- MongoDB persistence verification: PASS

The API test used one PhysioNet epoch. Its matching prediction is a pipeline sanity check, not an accuracy measurement.

## 8. Current Limitations
- The model is trained on PhysioNet data.
- Real-world team-member hardware testing is pending.
- Hardware channel mapping and signal compatibility must be verified.
- Individual calibration and model adaptation are future improvements.
- The current model is experimental.

## 9. Future Work
1. Collect EEG data from team members using the actual hardware.
2. Record independent ground-truth labels for each trial.
3. Evaluate subject-independent performance.
4. Evaluate subject-specific calibration.
5. Compare performance on untouched test trials.
6. Improve the model only when improvements are verified on held-out data.

## 10. Status
Core Path A dataset processing, model training, evaluation, service implementation, API integration, and MongoDB persistence have been completed.

Real-world hardware validation remains pending.

**Path A: Core implementation complete — pending real-world validation.**
