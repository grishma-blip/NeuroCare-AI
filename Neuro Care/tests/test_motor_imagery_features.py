from bson import ObjectId
import numpy as np
import pytest
from fastapi.testclient import TestClient

from backend.main import app
import backend.api.routes as routes


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
            def limit(self, n):
                return MockCursor(self[:n])
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
        if "$push" in update:
            for k, v in update["$push"].items():
                if k not in doc:
                    doc[k] = []
                doc[k].append(v)
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


client = TestClient(app)


def test_motor_imagery_dataset_trials():
    """Verify listing of PhysioNet dataset trials."""
    response = client.get("/api/motor-imagery/dataset-trials?subject_id=S001")
    assert response.status_code == 200
    data = response.json()
    assert data["subject_id"] == "S001"
    assert data["total_trials"] > 0
    assert len(data["trials"]) > 0
    first = data["trials"][0]
    assert "trial_index" in first
    assert first["movement"] in ["Left Hand", "Right Hand"]


def test_motor_imagery_sample_epoch():
    """Verify fetching a real 64-channel 385-sample epoch from PhysioNet dataset."""
    response = client.get("/api/motor-imagery/sample-epoch?subject_id=S001&movement=left")
    assert response.status_code == 200
    data = response.json()
    assert data["sampling_rate"] == 128
    assert len(data["channel_names"]) == 64
    assert len(data["samples"]) == 385
    assert len(data["samples"][0]) == 64
    assert data["true_label"] in ["Left", "Right"]


def test_motor_imagery_session_replay_and_history():
    """Verify end-to-end PhysioNet replay injection, inference, and trial history retrieval."""
    # 1. Create active participant
    p_res = client.post("/api/participants", json={
        "participant_code": "P-MI-TEST-01",
        "age": 28,
        "gender": "Female",
        "consent_obtained": True,
        "created_by": "researcher"
    })
    assert p_res.status_code == 201
    part_id = p_res.json()["participant"]["id"]
    client.patch(f"/api/participants/{part_id}/status", json={"status": "active", "updated_by": "doc"})

    # 2. Create REPLAY session
    s_res = client.post("/api/sessions", json={
        "participant_id": part_id,
        "created_by": "researcher",
        "protocol_name": "Motor Imagery BCI Paradigm",
        "data_mode": "REPLAY",
        "sampling_rate": 128,
        "channel_count": 64
    })
    assert s_res.status_code == 201
    sess_id = s_res.json()["session"]["id"]

    # 3. Start session and inject PhysioNet replay data
    client.patch(f"/api/sessions/{sess_id}/start")
    replay_res = client.post(f"/api/sessions/{sess_id}/replay-physionet", json={
        "subject_id": "S001",
        "movement": "left",
        "instruction": "Imagine Left Hand"
    })
    assert replay_res.status_code == 200
    rep_data = replay_res.json()
    assert rep_data["sample_count"] == 385
    assert rep_data["channel_count"] == 64

    # 4. Stop session
    client.patch(f"/api/sessions/{sess_id}/stop")

    # 5. Run Motor Imagery Analysis with instruction and metadata (reading from session records)
    mi_res = client.post(f"/api/sessions/{sess_id}/analyze-motor-imagery", json={
        "sampling_rate": 128,
        "instruction": "Imagine Left Hand",
        "input_source": "PhysioNet Dataset (Subject S001)",
        "trial_duration_sec": 3.0
    })
    assert mi_res.status_code == 200
    mi_data = mi_res.json()
    assert "analysis" in mi_data
    results = mi_data["analysis"]["results"]
    assert results["classification"] in ["Left", "Right"]
    assert "probabilities" in results
    assert results["instruction"] == "Imagine Left Hand"
    assert results["input_source"] == "PhysioNet Dataset (Subject S001)"

    # 6. Verify that trial history contains the newly completed trial
    hist_res = client.get("/api/motor-imagery/history?limit=10")
    assert hist_res.status_code == 200
    hist_data = hist_res.json()
    assert hist_data["total"] >= 1
    found = any(t["session_id"] == sess_id for t in hist_data["trials"])
    assert found


def test_motor_imagery_subjects():
    """Verify listing of PhysioNet subjects found on disk."""
    response = client.get("/api/motor-imagery/subjects")
    assert response.status_code == 200
    data = response.json()
    assert "subjects" in data
    assert data["total"] > 0
    assert "S001" in data["subjects"]


def test_motor_imagery_upload_epoch_valid():
    """Verify validation of an uploaded 385x64 preprocessed epoch."""
    samples = np.random.randn(385, 64).tolist()
    response = client.post("/api/motor-imagery/upload-epoch", json={
        "samples": samples,
        "source_name": "Test Uploaded Epoch"
    })
    assert response.status_code == 200
    data = response.json()
    assert data["valid"] is True
    assert data["shape"] == [385, 64]
    assert data["channel_count"] == 64
    assert len(data["samples"]) == 385


def test_motor_imagery_upload_epoch_invalid_shape():
    """Verify rejection of invalid matrix shapes (e.g. 100x64)."""
    samples = np.random.randn(100, 64).tolist()
    response = client.post("/api/motor-imagery/upload-epoch", json={
        "samples": samples
    })
    assert response.status_code == 400
    assert "Invalid matrix shape" in response.json()["detail"]


def test_signal_quality_clipping_gate():
    """Verify that ADC rail saturation (magnitude >= 980 uV) guarantees POOR quality and is_acceptable=False."""
    from backend.services.dsp_service import dsp_service

    # Normal baseline with ADC rail saturation spike
    raw = np.full(512, -1032.55)
    filtered = np.random.randn(512) * 20.0
    quality = dsp_service.evaluate_signal_quality(filtered, fs=256.0, raw_samples=raw)

    assert quality["is_acceptable"] is False
    assert quality["overall_quality"] == "POOR"
    assert quality["score"] <= 20
    assert quality["clipping"] is True


def test_signal_quality_unphysiological_power_gate():
    """Verify that unphysiological spectral power (> 2500 uV^2) enforces POOR quality."""
    from backend.services.dsp_service import dsp_service

    samples = np.random.randn(512) * 50.0
    quality = dsp_service.evaluate_signal_quality(samples, fs=256.0, total_power=41595.8)

    assert quality["is_acceptable"] is False
    assert quality["overall_quality"] == "POOR"
    assert quality["is_unphysiological"] is True


def test_pause_and_resume_recording_lifecycle():
    """Verify that Pause Recording suspends sample persistence without killing serial acquisition."""
    from backend.services.serial_service import serial_service

    test_sess_id = str(ObjectId())
    # 1. Start recording
    start_res = serial_service.start_recording(test_sess_id)
    assert start_res["is_recording"] is True
    assert start_res["is_paused"] is False

    # 2. Pause recording
    pause_res = serial_service.pause_recording(test_sess_id)
    assert pause_res["is_recording"] is True
    assert pause_res["is_paused"] is True
    assert serial_service.is_paused is True

    # 3. Resume recording
    resume_res = serial_service.resume_recording(test_sess_id)
    assert resume_res["is_recording"] is True
    assert resume_res["is_paused"] is False
    assert serial_service.is_paused is False

    # 4. Stop recording
    stop_res = serial_service.stop_recording(test_sess_id)
    assert serial_service.is_recording is False


def test_websocket_pause_and_resume_monitoring():
    """Verify that the WebSocket EEG endpoint supports pause_monitoring and resume_monitoring actions."""
    with client.websocket_connect("/ws/eeg") as ws:
        # Send pause monitoring command
        ws.send_json({"action": "pause_monitoring"})
        res = ws.receive_json()
        assert res.get("type") == "monitoring_paused"
        assert res.get("is_monitoring_paused") is True

        # Send resume monitoring command
        ws.send_json({"action": "resume_monitoring"})
        res = ws.receive_json()
        assert res.get("type") == "monitoring_resumed"
        assert res.get("is_monitoring_paused") is False
