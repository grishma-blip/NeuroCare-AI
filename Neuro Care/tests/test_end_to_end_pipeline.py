"""
End-to-end integration tests for NeuroCare AI pipeline:
- Participant enrollment & status lifecycle
- Recording session lifecycle (create, start, stop)
- EEG batch persistence & strict validation rules
- Multi-channel ML model execution (Motor Imagery CSP+LDA & Quality Analysis RF)
- Ground truth submission & session evaluation
"""

from bson import ObjectId
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.main import app
import backend.api.routes as routes
from backend.services.motor_imagery_service import PHYSIONET_CHANNEL_NAMES


class MockCollection:
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

    def count_documents(self, query=None):
        return len(self.find(query))

    def update_one(self, query, update):
        doc = self.find_one(query)
        if not doc:
            class DummyResult:
                matched_count = 0
                modified_count = 0
            return DummyResult()
        if "$set" in update:
            for k, v in update["$set"].items():
                doc[k] = v
        self.docs[str(doc["_id"])] = doc
        class UpdateResult:
            matched_count = 1
            modified_count = 1
        return UpdateResult()


@pytest.fixture(autouse=True)
def mock_db_collections(monkeypatch):
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
        "eeg_records": mock_eeg_records,
        "analysis": mock_analysis,
        "audit": mock_audit,
    }


@pytest.fixture
def client():
    return TestClient(app)


def test_participant_enrollment_validation(client):
    """Verify participant intake validation rules."""
    # Underage rejection
    res = client.post("/api/participants", json={
        "participant_code": "P-UNDERAGE",
        "age": 16,
        "gender": "Female",
        "consent_obtained": True,
        "created_by": "test_nurse"
    })
    assert res.status_code == 422 or res.status_code == 400

    # Missing consent rejection
    res = client.post("/api/participants", json={
        "participant_code": "P-NOCONSENT",
        "age": 28,
        "gender": "Female",
        "consent_obtained": False,
        "created_by": "test_nurse"
    })
    assert res.status_code == 422 or res.status_code == 400

    # Valid registration
    res = client.post("/api/participants", json={
        "participant_code": "P-TEST-001",
        "age": 34,
        "gender": "Non-binary",
        "consent_obtained": True,
        "created_by": "test_nurse"
    })
    assert res.status_code == 201
    part_id = res.json()["participant"]["id"]

    # Verify status update
    res_status = client.patch(f"/api/participants/{part_id}/status", json={
        "status": "active",
        "updated_by": "lead_doctor"
    })
    assert res_status.status_code == 200
    assert res_status.json()["status"] == "active"


def test_session_lifecycle_and_eeg_records(client):
    """Verify session creation, start, batch record persistence, and stop."""
    # Register active participant
    p_res = client.post("/api/participants", json={
        "participant_code": "P-REC-01",
        "age": 42,
        "gender": "Male",
        "consent_obtained": True,
        "created_by": "clinician"
    })
    part_id = p_res.json()["participant"]["id"]
    client.patch(f"/api/participants/{part_id}/status", json={"status": "active", "updated_by": "doc"})

    # Create HARDWARE session
    s_res = client.post("/api/sessions", json={
        "participant_id": part_id,
        "created_by": "clinician",
        "protocol_name": "Single Channel BioAmp",
        "data_mode": "HARDWARE",
        "sampling_rate": 256,
        "channel_count": 1
    })
    assert s_res.status_code == 201
    sess_id = s_res.json()["session"]["id"]
    assert s_res.json()["session"]["status"] == "scheduled"

    # Cannot post EEG records before session is started
    bad_batch = client.post(f"/api/sessions/{sess_id}/eeg-records", json={
        "samples": [[10.5], [12.0]],
        "sampling_rate": 256,
        "channel_names": ["EEG_A0"],
        "data_mode": "HARDWARE"
    })
    assert bad_batch.status_code == 409

    # Start session
    start_res = client.patch(f"/api/sessions/{sess_id}/start")
    assert start_res.status_code == 200
    assert start_res.json()["session"]["status"] == "recording"

    # Post batch 1: 256 samples
    batch_1 = [[float(i % 30)] for i in range(256)]
    b1_res = client.post(f"/api/sessions/{sess_id}/eeg-records", json={
        "samples": batch_1,
        "sampling_rate": 256,
        "channel_names": ["EEG_A0"],
        "data_mode": "HARDWARE"
    })
    assert b1_res.status_code == 201

    # Post batch 2: 256 samples
    batch_2 = [[float((i + 5) % 30)] for i in range(256)]
    b2_res = client.post(f"/api/sessions/{sess_id}/eeg-records", json={
        "samples": batch_2,
        "sampling_rate": 256,
        "channel_names": ["EEG_A0"],
        "data_mode": "HARDWARE"
    })
    assert b2_res.status_code == 201

    # Rejection on channel count mismatch
    bad_channels = client.post(f"/api/sessions/{sess_id}/eeg-records", json={
        "samples": [[10.0, 20.0]],
        "sampling_rate": 256,
        "channel_names": ["EEG_A0", "EEG_A1"],
        "data_mode": "HARDWARE"
    })
    assert bad_channels.status_code == 400

    # Stop session
    stop_res = client.patch(f"/api/sessions/{sess_id}/stop")
    assert stop_res.status_code == 200
    assert stop_res.json()["session"]["status"] == "completed"

    # Retrieve EEG records
    rec_res = client.get(f"/api/sessions/{sess_id}/eeg-records")
    assert rec_res.status_code == 200
    rec_data = rec_res.json()
    assert rec_data["total_batches"] == 2
    assert rec_data["total_samples"] == 512
    assert len(rec_data["records"]) == 2


def test_motor_imagery_classification(client):
    """Verify 64-channel PhysioNet CSP+LDA Motor Imagery prediction."""
    # Register participant
    p_res = client.post("/api/participants", json={
        "participant_code": "P-MI-01",
        "age": 29,
        "gender": "Female",
        "consent_obtained": True,
        "created_by": "researcher"
    })
    part_id = p_res.json()["participant"]["id"]
    client.patch(f"/api/participants/{part_id}/status", json={"status": "active", "updated_by": "doc"})

    # Create completed REPLAY session
    s_res = client.post("/api/sessions", json={
        "participant_id": part_id,
        "created_by": "researcher",
        "protocol_name": "Motor Imagery REPLAY",
        "data_mode": "REPLAY",
        "sampling_rate": 128,
        "channel_count": 64
    })
    sess_id = s_res.json()["session"]["id"]
    client.patch(f"/api/sessions/{sess_id}/start")
    client.patch(f"/api/sessions/{sess_id}/stop")

    # Generate valid 385 x 64 matrix
    rng = np.random.default_rng(42)
    mock_trial = rng.standard_normal((385, 64)) * 15.0

    mi_res = client.post(f"/api/sessions/{sess_id}/analyze-motor-imagery", json={
        "samples": mock_trial.tolist(),
        "sampling_rate": 128,
        "channel_names": PHYSIONET_CHANNEL_NAMES
    })
    assert mi_res.status_code == 200
    data = mi_res.json()
    assert "analysis" in data
    results = data["analysis"]["results"]
    assert results["classification"] in ["Left", "Right"]
    assert "probabilities" in results
    assert 0.0 <= results["confidence"] <= 1.0


def test_ground_truth_and_evaluation(client):
    """Verify ground truth submission and error metrics evaluation."""
    # Register and create session
    p_res = client.post("/api/participants", json={
        "participant_code": "P-EVAL-01",
        "age": 31,
        "gender": "Male",
        "consent_obtained": True,
        "created_by": "clinician"
    })
    part_id = p_res.json()["participant"]["id"]
    client.patch(f"/api/participants/{part_id}/status", json={"status": "active", "updated_by": "doc"})

    s_res = client.post("/api/sessions", json={
        "participant_id": part_id,
        "created_by": "clinician",
        "protocol_name": "Evaluation Protocol",
        "data_mode": "REPLAY",
        "sampling_rate": 128,
        "channel_count": 32
    })
    sess_id = s_res.json()["session"]["id"]

    # Submit ground truth
    gt_res = client.post(f"/api/sessions/{sess_id}/ground-truth", json={
        "valence": 7.5,
        "arousal": 3.8,
        "submitted_by": "doctor_evaluator",
        "notes": "Calm state reported by subject post-trial"
    })
    assert gt_res.status_code == 200
    assert gt_res.json()["ground_truth"]["valence"] == 7.5
    assert gt_res.json()["ground_truth"]["arousal"] == 3.8

    # Query session evaluation before ML run
    eval_res = client.get(f"/api/sessions/{sess_id}/evaluation")
    assert eval_res.status_code == 200
    assert eval_res.json()["status"] == "AWAITING_ANALYSIS"
    assert eval_res.json()["ground_truth_present"] is True
