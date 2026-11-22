# DEAP Emotion Held-Out Evaluation Report (Frozen Subjects s29 - s32)

## 1. Experimental Protocol
- **Frozen Random Seed:** 42
- **Quarantined Held-Out Test Subjects:** ['s29', 's30', 's31', 's32'] (160 unseen trials)
- **Training Partition:** s01 - s28 (1,120 trials)
- **Selected Feature Strategy:** Feature Set B

## 2. Held-Out Generalization Results

| Dimension | Continuous MAE | Continuous RMSE | Binary Balanced Accuracy | Binary Macro F1 |
|---|---|---|---|---|
| **Valence** | 1.9892 | 2.4880 | 48.74% | 0.4203 |
| **Arousal** | 1.6297 | 2.1301 | 51.81% | 0.4793 |

---
*Note: Evaluated on untouched subjects strictly after model selection.*
