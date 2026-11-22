# Task 26: Complete ML Model Training Audit

**Date:** 2026-11-22T02:18:00+05:30  
**Status:** COMPLETED & VERIFIED  
**Auditor:** NeuroCare AI Engineering Agent  
**Mandate:** Zero speculation, zero synthetic data, empirical inspection of model artifacts, training code, and datasets.

---

## Executive Summary

A complete empirical audit was conducted on the two core intelligence models of NeuroCare AI:
1. **Emotion Recognition Pipeline:** Trained on the **DEAP 32-channel** affective EEG dataset (Valence & Arousal continuous regression using `StandardScaler + Ridge(alpha=10.0)`).
2. **Motor Imagery Pipeline:** Trained on the **PhysioNet 64-channel** motor movement/imagery dataset (Left vs. Right hand motor imagery classification using `CSP(8) + StandardScaler + LDA(lsqr, shrinkage='auto')`).

All model artifacts (`valence_model.joblib`, `arousal_model.joblib`, `binary_motor_imagery_csp_lda.joblib`), dataset archives, feature extraction pipelines, and evaluation scripts were inspected. No code or model artifacts were modified or retrained.

---

## 1. Model 1: Emotion Recognition (DEAP Dataset)

### A. Dataset & Sample Breakdown
- **Source Dataset:** DEAP (Database for Emotion Analysis using Physiological Signals).
- **Subjects:** 32 healthy participants (`s01` through `s32`).
- **Trials per Subject:** 40 one-minute music video trials with subjective ratings (1.0 to 9.0) for Valence, Arousal, Dominance, and Liking.
- **Total Dataset Size:** 1,280 trials.
- **Channel Configuration:** Exactly 32 EEG channels placed according to the 10-20 international system.
- **Sampling Rate:** Downsampled to 128 Hz.
- **Windowing:** 4.0-second sliding windows with 50% overlap (512 samples per window, 256 sample hop, 29 windows per 60-second trial = 37,120 total windows).
- **Trial-Level Aggregation:** Window-level features are averaged across each trial to yield one 259-dimensional vector per trial.

### B. Partitioning & Split Methodology
- **Split Strategy:** Subject-wise quarantined partitioning.
- **Development Set (Training & Cross-Validation):** Subjects `s01` – `s28` (28 subjects, **1,120 trials** = 87.5% of dataset).
- **Inner Validation:** 7-fold GroupKFold on `s01 - s28` (4 subjects / 160 trials per fold; scalers fitted strictly inside training folds).
- **Frozen Held-Out Test Set:** Subjects `s29`, `s30`, `s31`, `s32` (4 subjects, **160 unseen trials** = 12.5% of dataset). Strictly quarantined from model fitting and hyperparameter selection.

### C. Architecture & Hyperparameters
- **Artifact Files:**
  - `ml/models/emotion/valence_model.joblib`
  - `ml/models/emotion/arousal_model.joblib`
- **Scikit-learn Pipeline:**
  1. `StandardScaler()`: Zero-mean, unit-variance feature standardization.
  2. `Ridge(alpha=10.0, random_state=42)`: L2-regularized linear ridge regression.
- **Feature Vector (259 features):**
  - 128 Power Spectral Density (PSD) features: 32 channels × 4 bands (Theta 4–8 Hz, Alpha 8–12 Hz, Beta 13–30 Hz, Gamma 30–45 Hz).
  - 128 Differential Entropy (DE) features: $DE = \frac{1}{2}\ln(2\pi e \cdot \text{power})$.
  - 3 Frontal Alpha Asymmetry (FAA) features: $\ln(\text{Right Alpha}) - \ln(\text{Left Alpha})$ for pairs (F4–F3, AF4–AF3, F8–F7).
- **Training Strategy:** Feature Set B (baseline-corrected relative log-power, subtracting pre-stimulus 3s baseline log-power).
- **Training Procedure & Iterations:** Exact analytical closed-form solution via $(X^T X + \alpha I)^{-1} X^T y$. **0 iterative epochs** (deterministic linear algebraic solver).

### D. Verified Performance Metrics

#### 1. Training Re-substitution Performance (s01–s28, 1,120 trials)
| Metric | Valence Model | Arousal Model |
| :--- | :--- | :--- |
| **MAE** | 1.3657 | 1.3206 |
| **RMSE** | 1.7082 | 1.6583 |
| **$R^2$ Score** | +0.2855 | +0.2799 |
| **Binary Balanced Accuracy (>5.0)** | 58.91% | 58.37% |
| **Binary Macro F1** | 0.6036 | 0.5908 |

#### 2. Cross-Validation Performance (7-Fold GroupKFold on s01–s28, Out-of-Subject Generalization)
| Metric | Valence Model | Arousal Model |
| :--- | :--- | :--- |
| **Pooled Out-of-Fold MAE** | 2.3160 | 2.0634 |
| **Pooled Out-of-Fold RMSE** | 2.9615 | 2.6172 |
| **Coefficient of Determination ($R^2$)** | -1.1476 | -0.7935 |
| **Pearson Correlation ($r$)** | -0.0365 | +0.0235 |
| **Conformal 90% Error Quantile ($q_{90}$)** | ±4.9220 | ±4.2259 |
| **Binary Balanced Accuracy (Exact Midpoint)** | 50.00% | 50.00% |
| **Binary Macro F1** | 0.4426 | 0.4335 |
| **Binary ROC-AUC** | 0.5500 | 0.4836 |

#### 3. Genuine Frozen Held-Out Test Generalization (s29–s32, 160 unseen trials)
| Metric | Valence Model | Arousal Model |
| :--- | :--- | :--- |
| **Continuous MAE** | 1.9892 | 1.6297 |
| **Continuous RMSE** | 2.4880 | 2.1301 |
| **Continuous MSE** | 6.1901 | 4.5373 |
| **Continuous $R^2$ Score** | -0.6990 | -0.0023 |
| **Binary Raw Accuracy (>5.0)** | 72.50% (skewed) | 76.25% (skewed) |
| **Binary Balanced Accuracy** | **48.74%** | **51.81%** |
| **Binary Macro F1** | 0.4203 | 0.4793 |
| **Confusion Matrix [Low, High]** | `[[116, 3], [41, 0]]` | `[[120, 2], [36, 2]]` |

### E. Subject Dependency & Held-Out Validity
- **Generalization Type:** **Subject-Independent (Cross-Subject)**. Models were fitted on 28 subjects and evaluated on 4 completely unseen test subjects.
- **Held-Out Integrity:** **VERIFIED**. Subjects `s29 - s32` were strictly held out and never seen during training or feature selection.
- **Critical Architectural Discrepancy Found:**
  - The production model artifacts (`valence_model.joblib` and `arousal_model.joblib`) were fitted on **Feature Set B** (baseline-subtracted log-power).
  - In `backend/services/emotion_service.py` (line 132), inference calls `extract_features_from_windows(eeg_stim, baseline_band_powers=None)`, which returns **Feature Set A** (stimulus-only, non-baseline-corrected).
  - This induces a distribution shift during live inference.

---

## 2. Model 2: Motor Imagery Detection (PhysioNet BCI Dataset)

### A. Dataset & Sample Breakdown
- **Source Dataset:** PhysioNet EEG Motor Movement/Imagery Dataset (Gold-standard BCI benchmark).
- **Subjects:** 109 healthy participants (`S001` through `S109`).
- **Target Tasks:** Motor imagery of Left Hand vs. Right Hand (Runs 04, 08, 12).
- **Raw Total Epochs:** 9,835 epochs across all 109 subjects (4,918 Rest, 2,479 Left Hand, 2,438 Right Hand).
- **Filtered Binary Dataset (Left vs. Right):** **4,917 epochs** across 109 subjects:
  - Class 0 (Left Hand): 2,479 epochs (50.4%).
  - Class 1 (Right Hand): 2,438 epochs (49.6%).
- **Channel Configuration:** Exactly 64 EEG channels (standard 10-10 international montage).
- **Sampling Rate:** Downsampled from original 160 Hz to 128 Hz.
- **Epoch Duration:** 0.5 s to 3.5 s post-visual-cue (3.0 seconds duration = exactly 385 samples per epoch).

### B. Preprocessing & Channel Selection
- **Digital Filter:** Zero-phase 4th-order Butterworth bandpass filter from **8.0 Hz to 30.0 Hz** (Mu and Beta sensorimotor rhythm passband).
- **Referencing:** Common Average Reference (CAR, `set_eeg_reference("average")`).
- **Data Shape:** `(epochs, 64, 385)` float32.

### C. Architecture & Hyperparameters
- **Artifact File:** `ml/models/motor_imagery/binary_motor_imagery_csp_lda.joblib`.
- **Scikit-learn Pipeline:**
  1. `mne.decoding.CSP`:
     - `n_components = 8` (4 spatial filter pairs maximizing/minimizing class covariance ratio).
     - `reg = "ledoit_wolf"` (Ledoit-Wolf covariance shrinkage regularization).
     - `log = True` (log-variance feature projection).
     - `norm_trace = False`.
     - `transform_into = "average_power"`.
     - Output dimension: 8 features per epoch.
  2. `StandardScaler()`: Standardizes the 8 log-power CSP features.
  3. `LinearDiscriminantAnalysis`:
     - `solver = "lsqr"` (Least squares solver).
     - `shrinkage = "auto"` (Automatic Ledoit-Wolf shrinkage).
     - Classes: `[0, 1]` (0 = Left Hand, 1 = Right Hand).

### D. Training vs. Test Split in Saved Artifact
- **Saved Model File Training (`train_final_binary.py`):**
  - **Trained on:** 100% of data (**4,917 epochs across all 109 subjects**).
  - **Held-out Split in Saved Artifact:** **0% (no held-out test split in the final production artifact)**.
  - The final `.joblib` file was trained on the entire dataset to maximize cross-subject representation for deployment.

### E. Verified Performance Metrics

#### 1. Re-substitution Training Performance (Full 109 Subjects, 4,917 Epochs)
- **Training Accuracy:** **61.93%**
- **Balanced Accuracy:** **61.93%**
- **Macro Precision:** 61.93% (Left = 62.34%, Right = 61.51%)
- **Macro Recall:** 61.93% (Left = 61.84%, Right = 62.02%)
- **Macro F1-Score:** **0.6193**
- **Confusion Matrix [Left, Right]:**
  ```
  [[1533,  946],
   [ 926, 1512]]
  ```

#### 2. Cross-Subject 5-Fold GroupKFold Cross-Validation (`cv_binary_motor.py`, 109 Subjects)
*Subjects are strictly partitioned so no subject appears in both train and validation in any fold.*
- **Mean Accuracy:** **59.99% ± 3.43%**
- **Mean Balanced Accuracy:** **59.98% ± 3.43%**
- **Mean Macro Precision:** **60.09% ± 4.28%**
- **Mean Macro Recall:** **59.12% ± 8.61%**
- **Mean Macro F1-Score:** **59.18% ± 4.71%**
- **Fold-by-Fold Accuracies:** Fold 1 = 62.74%, Fold 2 = 53.50%, Fold 3 = 62.22%, Fold 4 = 59.49%, Fold 5 = 62.01%.
- **Pooled Out-of-Fold Accuracy:** **60.04%** (2,952 / 4,917 correct).
- **Pooled Out-of-Fold Confusion Matrix [Left, Right]:**
  ```
  [[1509,  970],
   [ 995, 1443]]
  ```

#### 3. Holdout 80/20 Subject Split (`train_binary_motor.py`)
- **Train Partition:** 87 subjects, 3,927 epochs.
- **Held-Out Test Partition:** 22 subjects, 990 epochs.
- **Test Accuracy:** **58.08%**
- **Test Balanced Accuracy:** **58.11%**
- **Test Macro Precision:** 0.58 (Left = 0.57, Right = 0.59)
- **Test Macro Recall:** 0.58 (Left = 0.68, Right = 0.48)
- **Test Macro F1-Score:** **0.58** (Left = 0.62, Right = 0.53)
- **Test Confusion Matrix [Left, Right]:**
  ```
  [[338, 162],
   [253, 237]]
  ```

### F. Preprocessing Alignment Between Training and Inference
- **Alignment:** **100% IDENTICAL & VERIFIED**.
- The inference service (`backend/services/motor_imagery_service.py`) uses the exact same channel list (64 channels), sampling rate (128 Hz), Butterworth bandpass filter (8.0–30.0 Hz), common average referencing (CAR), and window length (385 samples = 3.0 s from 0.5 s to 3.5 s post-cue) as `physionet_loader.py` and `train_final_binary.py`.

---

## 3. Comprehensive Model Comparison Table

| Attribute | Model 1: Emotion Recognition (Valence / Arousal) | Model 2: Motor Imagery Detection (Left vs. Right) |
| :--- | :--- | :--- |
| **Dataset** | DEAP (32-channel EEG) | PhysioNet Motor Movement/Imagery (64-channel EEG) |
| **Total Available Dataset** | 1,280 trials (32 subjects × 40 trials) | 4,917 binary trials (109 subjects × ~45 trials) |
| **Samples Used for Model Artifact** | 1,120 trials (28 subjects, s01–s28) | 4,917 trials (109 subjects, S001–S109) |
| **Held-Out Test Samples** | 160 trials (4 subjects, s29–s32) | 990 trials (22 subjects, in 80/20 holdout benchmark) |
| **Model Architecture** | `StandardScaler + Ridge(alpha=10.0)` | `CSP(8) + StandardScaler + LDA(lsqr, auto shrinkage)` |
| **Feature Extraction** | 259 features: 128 PSD, 128 DE, 3 Frontal Asymmetries | 8 spatial log-power features via Common Spatial Patterns |
| **Training Methodology** | Analytical L2-regularized linear regression (0 epochs) | Supervised spatial covariance decomposition + regularized LDA |
| **Evaluation Strategy** | Subject-wise GroupKFold (7-fold) + Quarantined Test | Subject-wise GroupKFold (5-fold) + 80/20 Holdout Split |
| **Training Re-substitution Accuracy** | Valence: 58.91% BAcc, $R^2=0.286$ \| Arousal: 58.37% BAcc, $R^2=0.280$ | Binary Accuracy: **61.93%**, Macro F1: **0.6193** |
| **Cross-Subject Test / CV Accuracy** | Valence: **48.74%** BAcc, $R^2=-0.699$ \| Arousal: **51.81%** BAcc, $R^2=-0.002$ | 5-Fold CV: **59.99% ± 3.43%** \| 80/20 Test: **58.08%** |
| **Subject Dependency** | Subject-Independent (cross-subject generalized model) | Subject-Independent (cross-subject generalized model) |
| **Held-Out Generalization Verified?** | **YES** (160 genuine unseen trials from s29–s32) | **YES** (990 unseen trials in 80/20 split; 4,917 pooled in CV) |
| **Preprocessing In-Service Match?** | **DISCREPANCY**: Model trained on baseline-subtracted (Set B); Service feeds stimulus-only (Set A) | **MATCHED**: 100% identical 64-channel, 128 Hz, 8-30 Hz CAR pipeline |
| **Key Scientific Limitations** | 1. Linear model cannot bridge cross-subject affective variability (chance level generalization).<br>2. Severe majority class bias toward Low Valence / Low Arousal.<br>3. In-service feature mismatch (Set A vs. Set B). | 1. CSP spatial filters are inherently subject-specific; cross-subject accuracy is bounded at ~58–60%.<br>2. High inter-subject variability across the 109 subjects.<br>3. Requires full 64-channel cap (cannot run on single-channel BioAmp). |

---

## 4. Key Recommendations for Future Work
1. **Emotion Service Feature Alignment:** Update `backend/services/emotion_service.py` to either extract baseline-corrected Feature Set B or retrain the Ridge pipeline on stimulus-only Feature Set A so inference and training match.
2. **Subject Calibration:** For college demonstration, emphasize that both models are research-grade offline benchmarks operating in **Subject-Independent mode**. Per-subject calibration (transfer learning / fine-tuning) is required to reach 75%+ accuracies reported in literature for individual users.
3. **Hardware Truth Preservation:** Reiterate that single-channel BioAmp EXG hardware (frontal A0 lead) cannot execute 32-channel DEAP or 64-channel PhysioNet models directly, preserving scientific honesty during presentations.
