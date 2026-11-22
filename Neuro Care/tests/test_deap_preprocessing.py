"""
Unit tests for DEAP dataset pre-flight verification infrastructure.
"""

import pickle
from pathlib import Path
import tempfile
import numpy as np
import pytest

from ml.datasets.deap.verify_raw_deap import (
    verify_deap_dataset,
    EXPECTED_SUBJECT_COUNT,
    EXPECTED_DATA_SHAPE,
    EXPECTED_LABELS_SHAPE
)


def test_verify_empty_raw_directory(tmp_path):
    """Quality gate must fail when data/raw/deap directory is empty."""
    empty_dir = tmp_path / "raw_deap_empty"
    empty_dir.mkdir()

    results = verify_deap_dataset(empty_dir, verbose=False)
    assert results["status"] == "DATASET_NOT_FOUND"
    assert len(results["missing_files"]) == EXPECTED_SUBJECT_COUNT
    assert results["verified_subjects"] == 0


def test_verify_nonexistent_directory(tmp_path):
    """Quality gate must report DIRECTORY_NOT_FOUND if path does not exist."""
    missing_dir = tmp_path / "does_not_exist"
    results = verify_deap_dataset(missing_dir, verbose=False)
    assert results["status"] == "DIRECTORY_NOT_FOUND"
    assert not results["raw_dir_exists"]


def test_verify_partial_dataset(tmp_path):
    """Quality gate must fail if any subject file (e.g. s01..s32) is missing."""
    partial_dir = tmp_path / "raw_deap_partial"
    partial_dir.mkdir()

    # Create only s01.dat
    sample_content = {
        "data": np.zeros(EXPECTED_DATA_SHAPE, dtype=np.float32),
        "labels": np.ones(EXPECTED_LABELS_SHAPE, dtype=np.float32) * 5.0
    }
    with open(partial_dir / "s01.dat", "wb") as f:
        pickle.dump(sample_content, f)

    results = verify_deap_dataset(partial_dir, verbose=False)
    assert results["status"] == "INCOMPLETE_DATASET"
    assert "s01.dat" in results["present_files"]
    assert len(results["missing_files"]) == EXPECTED_SUBJECT_COUNT - 1


def test_verify_rejects_corrupted_shapes(tmp_path):
    """Quality gate must reject files with incorrect channel/sample dimensions."""
    corrupt_dir = tmp_path / "raw_deap_corrupt"
    corrupt_dir.mkdir()

    # Create all 32 files, but with s01 having wrong data shape
    valid_content = {
        "data": np.zeros(EXPECTED_DATA_SHAPE, dtype=np.float32),
        "labels": np.ones(EXPECTED_LABELS_SHAPE, dtype=np.float32) * 5.0
    }
    for i in range(1, 33):
        with open(corrupt_dir / f"s{i:02d}.dat", "wb") as f:
            if i == 1:
                # Wrong channel count (32 instead of 40)
                bad_content = {
                    "data": np.zeros((40, 32, 8064), dtype=np.float32),
                    "labels": np.ones(EXPECTED_LABELS_SHAPE, dtype=np.float32) * 5.0
                }
                pickle.dump(bad_content, f)
            else:
                pickle.dump(valid_content, f)

    results = verify_deap_dataset(corrupt_dir, verbose=False)
    assert results["status"] == "CORRUPTED_FILES_FOUND"
    assert len(results["corrupted_files"]) == 1
    assert results["corrupted_files"][0]["file"] == "s01.dat"


def test_verify_rejects_nan_values(tmp_path):
    """Quality gate must reject files containing NaN values."""
    nan_dir = tmp_path / "raw_deap_nan"
    nan_dir.mkdir()

    for i in range(1, 33):
        data = np.zeros(EXPECTED_DATA_SHAPE, dtype=np.float32)
        if i == 5:
            data[0, 0, 0] = np.nan
        content = {
            "data": data,
            "labels": np.ones(EXPECTED_LABELS_SHAPE, dtype=np.float32) * 5.0
        }
        with open(nan_dir / f"s{i:02d}.dat", "wb") as f:
            pickle.dump(content, f)

    results = verify_deap_dataset(nan_dir, verbose=False)
    assert results["status"] == "CORRUPTED_FILES_FOUND"
    assert any(c["file"] == "s05.dat" for c in results["corrupted_files"])
