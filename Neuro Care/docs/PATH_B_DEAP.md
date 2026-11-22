# Path B — DEAP Emotion Recognition (Valence and Arousal)

## 1. Objective
Develop an EEG-based Emotion Recognition pipeline to estimate continuous Valence and Arousal scores, classify discrete affect states (Low vs. High), and map emotional responses onto Russell's 2D Circumplex Model using the DEAP (*Database for Emotion Analysis using Physiological Signals*) benchmark.

## 2. Dataset Specifications & Acquisition Status
- **Dataset:** DEAP (Database for Emotion Analysis using Physiological Signals, Koelstra et al., 2012)
- **Subjects:** 32 healthy participants (s01 through s32)
- **Trials per Subject:** 40 trials (each trial comprises a 1-minute music video preceded by a 3-second baseline)
- **Channel Configuration:** 40 channels total:
  - Channels 0–31 (32 channels): Standard 10-20 EEG montage
  - Channels 32–39 (8 channels): Peripheral physiological signals (EOG, EMG, GSR, respiration, plethysmograph, temperature)
- **Sampling Rate:** 128 Hz (preprocessed release)
- **Trial Duration:** 63 seconds total ($8,064$ samples):
  - Pre-stimulus baseline: 3 seconds ($384$ samples)
  - Stimulus presentation: 60 seconds ($7,680$ samples)
- **Ratings (Target Variables):** Continuous Self-Assessment Manikin (SAM) ratings from 1.0 to 9.0 for Valence and Arousal.
- **Current Status:** Gated academic dataset. Raw directory `data/raw/deap/` is monitored via `ml/datasets/deap/verify_raw_deap.py`. Pre-flight quality gate enforces zero fabrication.

## 3. Signal Conditioning & Preprocessing
- **Downsampling & Filtering:** Preprocessed DEAP variant is pre-filtered at 4.0–45.0 Hz and downsampled to 128 Hz. Duplicate bandpass filtering is avoided.
- **Channel Partitioning:** The 32 EEG channels are isolated from peripheral signals.
- **Empirical Feature Benchmarking:**
  - **Feature Set A (Stimulus-Only):** Spectral power (Theta, Alpha, Beta, Gamma) and Differential Entropy (DE) across 4s sliding windows (50% overlap).
  - **Feature Set B (Baseline-Corrected):** Event-related relative log-power change:
    $$\Delta \text{Power} = \ln(\text{Power}_{\text{stimulus}}) - \ln(\text{Power}_{\text{3s baseline}})$$
  - Frontal Alpha Asymmetry (FAA): $FAA = \ln(\text{Alpha}_{\text{right}}) - \ln(\text{Alpha}_{\text{left}})$ computed across homologous pairs: (F4, F3), (AF4, AF3), (F8, F7).

## 4. Machine Learning & Validation Architecture
- **Frozen Seed:** `42`
- **Frozen Held-Out Test Subjects (12.5%):** $\mathcal{S}_{\text{test}} = \{\text{s29}, \text{s30}, \text{s31}, \text{s32}\}$ (160 trials) held out untouched.
- **Cross-Validation Split (87.5%):** $\mathcal{S}_{\text{dev}} = \{\text{s01}, \dots, \text{s28}\}$ (1,120 trials) evaluated via 7-fold `GroupKFold` (4 subjects per validation fold).
- **Leakage Prevention:** Normalization (`StandardScaler`) and probability calibration are fitted exclusively inside inner training folds.
- **Dual Formulations:**
  - **Continuous Regression:** Predicts continuous score $\in [1.0, 9.0]$ (evaluated with MAE, RMSE, $R^2$, Pearson $r$).
  - **Binary Classification (Primary):** Low $< 5.0$, High $> 5.0$, exact $5.0$ excluded.
  - **Binary Classification (Margin):** Low $\le 4.5$, High $\ge 5.5$, margin $(4.5, 5.5)$ excluded.
- **Subject-Level Uncertainty:** Conformal prediction quantile $\hat{q}_{90}$ derived from held-out cross-validation residuals.
- **Probability Calibration:** Post-hoc Platt scaling / Isotonic regression fitted on training-side out-of-fold scores.

## 5. Calibration Architecture
- **Tier A (Resting-State Normalization):** Computes mean and standard deviation of baseline power from 30s eyes-open resting EEG to normalize sensor impedance and amplifier gain ($z = (x - \mu) / \sigma$). Technical biophysical normalization only.
- **Tier B (Emotion Adaptation):** Calculates individual affective bias offsets from participant-labelled trials. Versioned calibration profiles (`calibration_profiles`) are tracked in MongoDB.

## 6. Non-Diagnostic Affect Taxonomy
- Affect states are mapped to Russell's 2D Circumplex Model:
  - **HVHA:** High Valence, High Arousal (Pleasant-Activated Affect, e.g., Joy / Excitement)
  - **HVLA:** High Valence, Low Arousal (Pleasant-Deactivated Affect, e.g., Calm / Serenity)
  - **LVHA:** Low Valence, High Arousal (Unpleasant-Activated Affect, e.g., Tension / Frustration)
  - **LVLA:** Low Valence, Low Arousal (Unpleasant-Deactivated Affect, e.g., Lethargy / Boredom)
- **Clinical Safeguard:** LVLA is strictly prohibited from being labeled as "clinical depression". Predictions are flagged `"is_experimental": true` with non-diagnostic disclaimers.

## 7. Role-Based Access Control (RBAC)
- **Doctor:** Patient overview, reports, longitudinal progress review, diagnostic audit inspection.
- **Clinician:** Patient registration, consent logging, hardware verification, session execution, SAM ground-truth submission, calibration execution.
- **Researcher:** Batch model benchmarking and de-identified data analysis.
- **Operator / Nurse:** Session monitoring and consent tracking.
- **Admin:** System configuration and access audits.

## 8. Backend REST APIs
- `POST /api/sessions/{session_id}/ground-truth`: Record SAM ratings ($1.0 - 9.0$).
- `POST /api/sessions/{session_id}/analyze-emotion`: Execute emotion analysis on session EEG data.
- `GET /api/sessions/{session_id}/evaluation`: Compare predictions against ground-truth labels.
- `POST /api/participants/{participant_id}/calibrate-emotion`: Execute participant calibration.
- `GET /api/participants/{participant_id}/calibration`: Retrieve active calibration profile and history.
- `POST /api/sessions/{session_id}/replay-deap`: Automated testing utility to inject a verified 32-channel DEAP mock trial.

## 9. Model Artifacts & Evaluation Results
- **Selected Feature Strategy:** Feature Set B (relative log-power baseline-corrected features + Differential Entropy + Frontal Alpha Asymmetry: 259 features per window).
- **Trained Artifacts:**
  - `ml/models/emotion/valence_model.joblib`: Ridge regression pipeline with StandardScaler.
  - `ml/models/emotion/arousal_model.joblib`: Ridge regression pipeline with StandardScaler.
- **Cross-Validation Benchmarks (Development Subjects s01 - s28, 1,120 Trials):**
  - Valence MAE: $2.316$ | Balanced Accuracy (Exact Split): $50.00\%$
  - Arousal MAE: $2.063$ | Balanced Accuracy (Exact Split): $50.00\%$
- **Frozen Held-Out Evaluation (Subjects s29 - s32, 160 Unseen Trials):**
  - Valence: Continuous MAE = $1.9892$, RMSE = $2.4880$, Binary Balanced Accuracy = $48.74\%$, Macro F1 = $0.4203$
  - Arousal: Continuous MAE = $1.6297$, RMSE = $2.1301$, Binary Balanced Accuracy = $51.81\%$, Macro F1 = $0.4793$
- **Detailed Reports:** Documented in `ml/reports/emotion/valence_evaluation_report.md`, `arousal_evaluation_report.md`, and `held_out_test_report.md`.

## 10. Status
Core Path B implementation is complete:
- Dataset extracted and verified (32 subjects, 1,280 trials).
- 32-channel preprocessing, baseline extraction, and feature pipelines completed.
- Subject-wise GroupKFold training and held-out validation completed.
- Backend `EmotionService`, `CalibrationService`, REST APIs, and MongoDB persistence implemented and tested.
- All 18 unit and API tests passing.
- Real-world physical EEG hardware validation remains a future milestone once physical channel montage is confirmed.

**Path B: Core implementation and laboratory benchmark complete — pending real-world hardware validation.**
