# DEAP Emotion Model Evaluation Report: AROUSAL PREDICTION
**Feature Strategy:** Feature Set B (Empirical Validation)

## 1. Continuous Regression Performance (1.0 - 9.0 Rating Scale)
- **Mean Absolute Error (MAE):** 2.0634
- **Root Mean Squared Error (RMSE):** 2.6172
- **Coefficient of Determination (R²):** -0.7935
- **Pearson Correlation (r):** 0.0235
- **Conformal Prediction 90% Error Quantile (q90):** ±4.2259

## 2. Binary Classification Performance

### Primary Formulation: Exact Midpoint Exclusion (Rating < 5.0 vs. > 5.0; == 5.0 Excluded)
- **Total Evaluated Trials:** 1108
- **Class Distribution:** {0: 848, 1: 260}
- **Balanced Accuracy:** 50.00%
- **Macro F1-Score:** 0.4335
- **ROC-AUC:** 0.4836
- **Confusion Matrix [Low, High]:** [[848, 0], [260, 0]]

### Secondary Benchmark: Margin Exclusion (Rating <= 4.5 vs. >= 5.5; 4.5-5.5 Excluded)
- **Total Evaluated Trials:** 1016
- **Class Distribution:** {0: 793, 1: 223}
- **Balanced Accuracy:** 50.00%
- **Macro F1-Score:** 0.4384
- **ROC-AUC:** 0.4367

---
*Note: Results represent subject-wise GroupKFold out-of-fold generalization. Non-diagnostic investigational BCI metric report.*