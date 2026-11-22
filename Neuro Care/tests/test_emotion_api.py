"""
Integration and API tests for Path B Emotion Recognition, Ground Truth,
Session Evaluation, and Participant Calibration endpoints.

Uses FastAPI TestClient with in-memory collection mocking so tests run
reliably in all environments without requiring a live external MongoDB process.
"""

from datetime import datetime, timezone
from bson import ObjectId
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.main import app
import backend.api.routes as routes
from ml.datasets.deap.deap_loader import DEAP_EEG_CHANNELS


class MockCollection:
    """In-memory collection mock for PyMongo operations."""
    def __init__(self):
        self.docs = {}

    def insert_one(self, doc):
        doc_copy = dict(doc)
        if "_id" not in doc_copy:
            doc_copy["_id"] = ObjectId()
        self.docs[str(doc_copy["_id"])] = doc_copy
        class InsertResult:
            def __init__(self, inserted_id):
                self.inserted_id = inserted_id
        return InsertResult(doc_copy["_id"])

    def find_one(self, query, sort=None):
        for doc in self.docs.values():
            match = True
            for k, v in query.items():
                if k == "_id":
                    if doc.get("_id") != v:
                        match = False
                        break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                return dict(doc)
        return None

    def find(self, query=None, sort=None):
        query = query or {}
        matches = []
        for doc in self.docs.values():
            match = True
            for k, v in query.items():
                if k == "_id":
                    if doc.get("_id") != v:
                        match = False
                        break
                elif doc.get(k) != v:
                    match = False
                    break
            if match:
                matches.append(dict(doc))
        class MockCursor(list):
            def sort(self, *args, **kwargs):
                return self
        return MockCursor(matches)

    def update_one(self, query, update, array_filters=None):
        target = self.find_one(query)
        if not target:
            class MockUpdateResult:
                matched_count = 0
                modified_count = 0
            return MockUpdateResult()

        target_id = str(target["_id"])
        doc = self.docs[target_id]

        if "$set" in update:
            for k, v in update["$set"].items():
                if "$[].is_active" in k:
                    # Specific handler for calibration_profiles.$[].is_active
                    for prof in doc.get("calibration_profiles", []):
                        prof["is_active"] = False
                else:
                    doc[k] = v

        if "$push" in update:
            for k, v in update["$push"].items():
                if k not in doc:
                    doc[k] = []
                doc[k].append(v)

        class MockUpdateResult:
            matched_count = 1
            modified_count = 1
        return MockUpdateResult()


@pytest.fixture(autouse=True)
def mock_db_collections(monkeypatch):
    """Mocks MongoDB collections in routes module for the duration of tests."""
    import backend.main as main_mod

    monkeypatch.setattr(main_mod, "check_database_connection", lambda: True)
    monkeypatch.setattr(main_mod, "initialize_database", lambda: True)
    monkeypatch.setattr(main_mod, "close_database_connection", lambda: None)

    mock_participants = MockCollection()
    mock_sessions = MockCollection()
    mock_eeg_records = MockCollection()
    mock_analysis = MockCollection()
    mock_audit = MockCollection()

    monkeypatch.setattr(routes, "participants_collection", mock_participants)
    monkeypatch.setattr(routes, "sessions_collection", mock_sessions)
    monkeypatch.setattr(routes, "eeg_records_collection", mock_eeg_records)
    monkeypatch.setattr(routes, "analysis_results_collection", mock_analysis)
    monkeypatch.setattr(routes, "audit_logs_collection", mock_audit)

    return {
        "participants": mock_participants,
        "sessions": mock_sessions,
        "records": mock_eeg_records,
        "analysis": mock_analysis,
        "audit": mock_audit
    }


@pytest.fixture
def client():
    # Bypass lifespan database connection check during API test client runs
    with TestClient(app, raise_server_exceptions=True) as c:
        yield c


def test_ground_truth_submission(client, mock_db_collections):
    """Test submitting SAM ground-truth ratings."""
    session_id = str(ObjectId())
    mock_db_collections["sessions"].insert_one({
        "_id": ObjectId(session_id),
        "status": "recording",
        "created_by": "test-operator",
        "protocol_name": "Emotion-Video-01"
    })

    payload = {
        "valence": 7.5,
        "arousal": 6.0,
        "dominance": 5.0,
        "liking": 8.0,
        "assessment_method": "SAM_SLIDER",
        "submitted_by": "clinician-alice",
        "notes": "Stimulus video: Happy"
    }

    res = client.post(f"/api/sessions/{session_id}/ground-truth", json=payload)
    assert res.status_code == 200
    data = res.json()
    assert data["ground_truth"]["valence"] == 7.5
    assert data["ground_truth"]["arousal"] == 6.0
    assert data["ground_truth"]["valence_discrete"] == "HIGH"
    assert data["ground_truth"]["arousal_discrete"] == "HIGH"
    assert data["ground_truth"]["quadrant"] == "HVHA"

    # Verify invalid ratings (> 9.0) rejected
    bad_payload = dict(payload, valence=10.5)
    bad_res = client.post(f"/api/sessions/{session_id}/ground-truth", json=bad_payload)
    assert bad_res.status_code == 422


def test_emotion_analysis_and_evaluation(client, mock_db_collections):
    """Test full cycle: Replay EEG injection -> Emotion analysis -> Ground-truth evaluation."""
    part_id = str(ObjectId())
    session_id = str(ObjectId())

    mock_db_collections["participants"].insert_one({
        "_id": ObjectId(part_id),
        "participant_code": "P-TEST-001",
        "calibration_profiles": []
    })

    mock_db_collections["sessions"].insert_one({
        "_id": ObjectId(session_id),
        "participant_id": part_id,
        "data_mode": "REPLAY",
        "status": "completed",
        "sampling_rate": 128,
        "channel_count": 32,
        "ground_truth": {
            "valence": 7.5,
            "arousal": 6.5,
            "valence_discrete": "HIGH",
            "arousal_discrete": "HIGH",
            "quadrant": "HVHA"
        }
    })

    # Inject 512 samples of 32-channel EEG
    np.random.seed(42)
    eeg_samples = (np.random.randn(512, 32) * 5.0).tolist()
    mock_db_collections["records"].insert_one({
        "_id": ObjectId(),
        "session_id": ObjectId(session_id),
        "samples": eeg_samples,
        "sampling_rate": 128,
        "channel_names": DEAP_EEG_CHANNELS,
        "data_mode": "REPLAY"
    })

    # Test RBAC rejection of unauthorized role
    res_unauth = client.post(
        f"/api/sessions/{session_id}/analyze-emotion",
        json={"role": "unauthorized_role"}
    )
    assert res_unauth.status_code == 403

    # Test authorized analysis by Doctor
    res_doc = client.post(
        f"/api/sessions/{session_id}/analyze-emotion",
        json={"role": "doctor", "requested_by": "dr_smith"}
    )
    assert res_doc.status_code == 200
    doc_data = res_doc.json()["analysis"]
    assert doc_data["analysis_type"] == "VALENCE_AROUSAL"
    assert "valence" in doc_data["results"]
    assert "arousal" in doc_data["results"]
    assert "evaluation" in doc_data["results"]
    assert doc_data["results"]["evaluation"]["evaluation_status"] == "EVALUATED"
    assert "valence_absolute_error" in doc_data["results"]["evaluation"]

    # Test GET evaluation endpoint
    eval_res = client.get(f"/api/sessions/{session_id}/evaluation")
    assert eval_res.status_code == 200
    eval_data = eval_res.json()
    assert eval_data["status"] == "EVALUATED"
    assert eval_data["ground_truth"]["valence"] == 7.5
    assert "prediction" in eval_data


def test_participant_calibration_lifecycle(client, mock_db_collections):
    """Test participant calibration workflow and version tracking."""
    part_id = str(ObjectId())
    mock_db_collections["participants"].insert_one({
        "_id": ObjectId(part_id),
        "participant_code": "P-CALIB-01",
        "calibration_profiles": []
    })

    # Nurse role is restricted from calibration
    res_nurse = client.post(
        f"/api/participants/{part_id}/calibrate-emotion",
        json={"role": "nurse", "requested_by": "nurse_bob"}
    )
    assert res_nurse.status_code == 403

    # Clinician role executes calibration v1
    res_v1 = client.post(
        f"/api/participants/{part_id}/calibrate-emotion",
        json={"role": "clinician", "requested_by": "clinician_alice"}
    )
    assert res_v1.status_code == 200
    v1_data = res_v1.json()
    assert v1_data["calibration_profile"]["version"] == 1
    assert v1_data["calibration_profile"]["is_active"] is True

    # Retrieve calibration endpoint
    get_res = client.get(f"/api/participants/{part_id}/calibration")
    assert get_res.status_code == 200
    get_data = get_res.json()
    assert get_data["total_versions"] == 1
    assert get_data["active_profile"]["version"] == 1


def test_deap_replay_injection_and_evaluation_states(client, mock_db_collections):
    """Test injecting mock DEAP trial and inspecting evaluation status before and after analysis."""
    session_id = str(ObjectId())
    mock_db_collections["sessions"].insert_one({
        "_id": ObjectId(session_id),
        "data_mode": "REPLAY",
        "status": "completed",
        "sampling_rate": 128,
        "channel_count": 32
    })

    # 1. Check evaluation status when awaiting analysis
    eval_pre = client.get(f"/api/sessions/{session_id}/evaluation")
    assert eval_pre.status_code == 200
    assert eval_pre.json()["status"] == "AWAITING_ANALYSIS"

    # 2. Inject DEAP replay data
    replay_res = client.post(f"/api/sessions/{session_id}/replay-deap")
    assert replay_res.status_code == 200
    assert replay_res.json()["sample_count"] in [512, 8064]
    assert replay_res.json()["channel_count"] == 32

    # Verify EEG records collection has the batch
    records = mock_db_collections["records"].find({"session_id": ObjectId(session_id)})
    assert len(records) >= 1

    # 3. Analyze emotion
    analyze_res = client.post(f"/api/sessions/{session_id}/analyze-emotion", json={"role": "doctor"})
    assert analyze_res.status_code == 200

    # 4. Check evaluation status now evaluated
    eval_post = client.get(f"/api/sessions/{session_id}/evaluation")
    assert eval_post.status_code == 200
    assert eval_post.json()["status"] == "EVALUATED"


def test_emotion_probabilities_are_normalized_and_finite(client, mock_db_collections):
    """Verify that backend emotion analysis outputs strictly normalized, finite 4-quadrant probabilities."""
    session_id = str(ObjectId())
    mock_db_collections["sessions"].insert_one({
        "_id": ObjectId(session_id),
        "status": "completed",
        "data_mode": "REPLAY",
        "sampling_rate": 128,
        "channel_count": 32
    })
    # Inject valid 32-channel records
    np.random.seed(99)
    samples = (np.random.randn(512, 32) * 5.0).tolist()
    mock_db_collections["records"].insert_one({
        "_id": ObjectId(),
        "session_id": ObjectId(session_id),
        "samples": samples,
        "sampling_rate": 128,
        "channel_names": DEAP_EEG_CHANNELS,
        "data_mode": "REPLAY"
    })

    res = client.post(f"/api/sessions/{session_id}/analyze-emotion", json={"role": "doctor"})
    assert res.status_code == 200
    results = res.json()["analysis"]["results"]
    probs = results["probabilities"]

    assert set(probs.keys()) == {"HVHA", "HVLA", "LVHA", "LVLA"}
    for k, v in probs.items():
        assert isinstance(v, float)
        assert np.isfinite(v)
        assert 0.0 <= v <= 1.0

    total_prob = sum(probs.values())
    assert abs(total_prob - 1.0) < 0.005, f"Probabilities do not sum to 1.0: {total_prob}"


def test_emotion_rejects_single_channel_eeg(client, mock_db_collections):
    """Verify that single-channel BioAmp EEG is truthfully blocked from 32-channel DEAP model."""
    session_id = str(ObjectId())
    mock_db_collections["sessions"].insert_one({
        "_id": ObjectId(session_id),
        "status": "completed",
        "data_mode": "HARDWARE",
        "sampling_rate": 256,
        "channel_count": 1
    })
    # Inject single-channel data
    samples = (np.random.randn(512, 1) * 10.0).tolist()
    mock_db_collections["records"].insert_one({
        "_id": ObjectId(),
        "session_id": ObjectId(session_id),
        "samples": samples,
        "sampling_rate": 256,
        "channel_names": ["A0"],
        "data_mode": "HARDWARE"
    })

    res = client.post(f"/api/sessions/{session_id}/analyze-emotion", json={"role": "doctor"})
    assert res.status_code == 400
    assert "channel" in res.json()["detail"].lower()
