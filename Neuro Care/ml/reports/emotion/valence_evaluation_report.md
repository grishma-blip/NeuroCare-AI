# DEAP Emotion Model Evaluation Report: VALENCE PREDICTION
**Feature Strategy:** Feature Set B (Empirical Validation)

## 1. Continuous Regression Performance (1.0 - 9.0 Rating Scale)
- **Mean Absolute Error (MAE):** 2.3160
- **Root Mean Squared Error (RMSE):** 2.9615
- **Coefficient of Determination (R²):** -1.1476
- **Pearson Correlation (r):** -0.0365
- **Conformal Prediction 90% Error Quantile (q90):** ±4.9220

## 2. Binary Classification Performance

### Primary Formulation: Exact Midpoint Exclusion (Rating < 5.0 vs. > 5.0; == 5.0 Excluded)
- **Total Evaluated Trials:** 1107
- **Class Distribution:** {0: 879, 1: 228}
- **Balanced Accuracy:** 50.00%
- **Macro F1-Score:** 0.4426
- **ROC-AUC:** 0.5500
- **Confusion Matrix [Low, High]:** [[879, 0], [228, 0]]

### Secondary Benchmark: Margin Exclusion (Rating <= 4.5 vs. >= 5.5; 4.5-5.5 Excluded)
- **Total Evaluated Trials:** 972
- **Class Distribution:** {0: 801, 1: 171}
- **Balanced Accuracy:** 50.00%
- **Macro F1-Score:** 0.4518
- **ROC-AUC:** 0.4802

---
*Note: Results represent subject-wise GroupKFold out-of-fold generalization. Non-diagnostic investigational BCI metric report.*