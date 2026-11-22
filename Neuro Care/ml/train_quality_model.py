import numpy as np
import joblib

from pathlib import Path
from sklearn.ensemble import RandomForestClassifier
from sklearn.model_selection import StratifiedGroupKFold
from sklearn.metrics import (
    accuracy_score,
    classification_report,
    confusion_matrix
)
from sklearn.pipeline import make_pipeline
from sklearn.impute import SimpleImputer


DATASET_PATH = Path("data/eeg_quality_dataset.npz")
MODEL_PATH = Path("ml/eeg_quality_model.joblib")


def main():
    dataset = np.load(DATASET_PATH)

    X = dataset["X"]
    y = dataset["y"]
    groups = dataset["groups"]

    splitter = StratifiedGroupKFold(
        n_splits=5,
        shuffle=True,
        random_state=42
    )

    train_indices, test_indices = next(
        splitter.split(X, y, groups)
    )

    X_train, X_test = X[train_indices], X[test_indices]
    y_train, y_test = y[train_indices], y[test_indices]

    train_groups = set(groups[train_indices])
    test_groups = set(groups[test_indices])

    if train_groups.intersection(test_groups):
        raise RuntimeError("Recording leakage detected!")

    model = make_pipeline(
        SimpleImputer(strategy="median"),
        RandomForestClassifier(
            n_estimators=200,
            max_depth=12,
            class_weight="balanced",
            random_state=42,
            n_jobs=-1
        )
    )

    model.fit(X_train, y_train)

    predictions = model.predict(X_test)

    print("Recording-wise model training completed.")
    print("Training windows:", len(X_train))
    print("Testing windows:", len(X_test))
    print("Training recordings:", len(train_groups))
    print("Testing recordings:", len(test_groups))
    print("Recording overlap:", len(train_groups.intersection(test_groups)))
    print("Accuracy:", round(accuracy_score(y_test, predictions), 4))

    print("\nClassification Report:")
    print(classification_report(
        y_test,
        predictions,
        target_names=["Clean", "Noisy"],
        zero_division=0
    ))

    print("Confusion Matrix:")
    print(confusion_matrix(y_test, predictions))

    joblib.dump(model, MODEL_PATH)
    print("\nModel saved at:", MODEL_PATH)


if __name__ == "__main__":
    main()
