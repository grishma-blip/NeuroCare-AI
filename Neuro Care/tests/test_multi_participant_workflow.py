"""
Integration tests for NeuroCare AI Multi-Participant Data Collection & Reporting Workflow:
- Login and demonstration role assignment
- Participant auto-ID generation, metadata (name, notes), and consent withdrawal
- Recording session pause, resume, and stop controls
- Experimental event markers and operator session notes
- Downloadable 2-page vector PDF report generation
- Microvolt CSV and metadata JSON exports
- Participant-level partitioned ML dataset export (leakage prevention)
"""

from bson import ObjectId
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
                    if isinstance(v, dict) and "$in" in v:
                        if doc.get("_id") not in v["$in"]:
                            match = False
                            break
                    elif doc.get("_id") != v:
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
        if "$push" in update:
            for k, v in update["$push"].items():
                if k not in doc or not isinstance(doc[k], list):
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


@pytest.fixture
def client():
    return TestClient(app)


def test_auth_login_clinician_and_admin(client):
    """Verifies demonstration login and role assignment."""
    res_clinician = client.post("/api/auth/login", json={
        "email": "sarah.chen@neurocare.ai",
        "password": "password123",
        "role": "clinician"
    })
    assert res_clinician.status_code == 200
    data_c = res_clinician.json()
    assert "token" in data_c
    assert data_c["user"]["role"] == "clinician"
    assert "Sarah Chen" in data_c["user"]["name"]

    res_admin = client.post("/api/auth/login", json={
        "email": "doctor.admin@neurocare.ai",
        "password": "adminpassword",
        "role": "administrator"
    })
    assert res_admin.status_code == 200
    data_a = res_admin.json()
    assert data_a["user"]["role"] == "administrator"


def test_participant_auto_id_and_withdrawal(client):
    """Verifies next-code endpoint, auto-ID generation, metadata, and withdrawal."""
    nc_res = client.get("/api/participants/next-code")
    assert nc_res.status_code == 200
    assert "next_code" in nc_res.json()

    # Register with auto-generated code
    p_res = client.post("/api/participants", json={
        "participant_code": "AUTO",
        "name": "Subject Delta",
        "age": 28,
        "gender": "Female",
        "consent_obtained": True,
        "notes": "Healthy volunteer baseline",
        "created_by": "nurse_patel"
    })
    assert p_res.status_code == 201
    p_data = p_res.json()["participant"]
    assert p_data["participant_code"].startswith("P-")
    assert p_data["name"] == "Subject Delta"
    assert p_data["notes"] == "Healthy volunteer baseline"
    assert p_data["status"] == "active"
    part_id = p_data["id"]

    # Test consent withdrawal
    w_res = client.patch(f"/api/participants/{part_id}/withdraw", json={
        "reason": "Participant requested withdrawal due to fatigue"
    })
    assert w_res.status_code == 200
    w_data = w_res.json()["participant"]
    assert w_data["status"] == "withdrawn"
    assert w_data["withdrawal_reason"] == "Participant requested withdrawal due to fatigue"
    assert w_data["withdrawn_at"] is not None


def test_session_lifecycle_pause_resume_stop(client):
    """Verifies Start -> Pause -> Resume -> Stop state machine."""
    # Register active participant
    p_res = client.post("/api/participants", json={
        "participant_code": "P-REC-STATE",
        "age": 35,
        "gender": "Male",
        "consent_obtained": True,
        "created_by": "clinician"
    })
    part_id = p_res.json()["participant"]["id"]

    # Create session
    s_res = client.post("/api/sessions", json={
        "participant_id": part_id,
        "created_by": "clinician",
        "protocol_name": "Multi-Session BioAmp Trial",
        "data_mode": "HARDWARE",
        "sampling_rate": 256,
        "channel_count": 1
    })
    assert s_res.status_code == 201
    sess_id = s_res.json()["session"]["id"]

    # Start
    start_res = client.patch(f"/api/sessions/{sess_id}/start")
    assert start_res.status_code == 200
    assert start_res.json()["session"]["status"] == "recording"

    # Pause
    pause_res = client.patch(f"/api/sessions/{sess_id}/pause")
    assert pause_res.status_code == 200
    assert pause_res.json()["session"]["status"] == "paused"

    # Resume
    resume_res = client.patch(f"/api/sessions/{sess_id}/resume")
    assert resume_res.status_code == 200
    assert resume_res.json()["session"]["status"] == "recording"

    # Add samples
    client.post(f"/api/sessions/{sess_id}/eeg-records", json={
        "samples": [[15.2], [18.4], [22.1], [19.0]],
        "sampling_rate": 256,
        "channel_names": ["EEG_A0"],
        "data_mode": "HARDWARE"
    })

    # Stop
    stop_res = client.patch(f"/api/sessions/{sess_id}/stop")
    assert stop_res.status_code == 200
    assert stop_res.json()["session"]["status"] == "completed"


def test_session_events_and_notes(client):
    """Verifies adding experimental event markers and updating session notes."""
    p_res = client.post("/api/participants", json={
        "participant_code": "P-EVT-01",
        "age": 25,
        "gender": "Other",
        "consent_obtained": True,
        "created_by": "researcher"
    })
    part_id = p_res.json()["participant"]["id"]

    s_res = client.post("/api/sessions", json={
        "participant_id": part_id,
        "created_by": "researcher",
        "protocol_name": "Eyes Open / Closed Trial"
    })
    sess_id = s_res.json()["session"]["id"]
    client.patch(f"/api/sessions/{sess_id}/start")

    # Add Event 1: Eyes Open
    ev1_res = client.post(f"/api/sessions/{sess_id}/events", json={
        "label": "Eyes Open",
        "relative_time_sec": 5.0,
        "notes": "Operator signaled to open eyes"
    })
    assert ev1_res.status_code == 200
    assert ev1_res.json()["event"]["label"] == "Eyes Open"

    # Add Event 2: Eyes Closed
    ev2_res = client.post(f"/api/sessions/{sess_id}/events", json={
        "label": "Eyes Closed",
        "relative_time_sec": 35.0,
        "notes": "Alpha synchronization expected"
    })
    assert ev2_res.status_code == 200

    # Retrieve events
    events_res = client.get(f"/api/sessions/{sess_id}/events")
    assert events_res.status_code == 200
    assert len(events_res.json()["events"]) == 2

    # Update session notes
    notes_res = client.patch(f"/api/sessions/{sess_id}/notes", json={
        "notes": "Subject remained still throughout the 60s run."
    })
    assert notes_res.status_code == 200
    assert notes_res.json()["notes"] == "Subject remained still throughout the 60s run."


def test_session_report_and_exports(client):
    """Verifies PDF report generation, CSV export, and JSON export."""
    p_res = client.post("/api/participants", json={
        "participant_code": "P-REP-01",
        "name": "Jane Doe",
        "age": 31,
        "gender": "Female",
        "consent_obtained": True,
        "created_by": "operator"
    })
    part_id = p_res.json()["participant"]["id"]

    s_res = client.post("/api/sessions", json={
        "participant_id": part_id,
        "created_by": "operator",
        "protocol_name": "Full Diagnostic Protocol"
    })
    sess_id = s_res.json()["session"]["id"]
    client.patch(f"/api/sessions/{sess_id}/start")

    # Add 256 samples
    batch = [[float(50.0 + 10.0 * (i % 8))] for i in range(256)]
    client.post(f"/api/sessions/{sess_id}/eeg-records", json={
        "samples": batch,
        "sampling_rate": 256,
        "channel_names": ["EEG_A0"],
        "data_mode": "HARDWARE"
    })

    client.post(f"/api/sessions/{sess_id}/events", json={
        "label": "Baseline Rest",
        "relative_time_sec": 0.5
    })
    client.patch(f"/api/sessions/{sess_id}/stop")

    # Test PDF Report
    pdf_res = client.get(f"/api/sessions/{sess_id}/report/pdf")
    assert pdf_res.status_code == 200
    assert pdf_res.headers["content-type"] == "application/pdf"
    assert pdf_res.content.startswith(b"%PDF-")
    assert len(pdf_res.content) > 1000

    # Test CSV Export
    csv_res = client.get(f"/api/sessions/{sess_id}/export/csv")
    assert csv_res.status_code == 200
    assert "text/csv" in csv_res.headers["content-type"]
    csv_text = csv_res.content.decode("utf-8")
    assert "# NeuroCare AI Raw EEG Export" in csv_text
    assert "index,timestamp_ms,voltage_uV,event_marker" in csv_text
    assert "P-REP-01" in csv_text

    # Test JSON Export
    json_res = client.get(f"/api/sessions/{sess_id}/export/json")
    assert json_res.status_code == 200
    assert "application/json" in json_res.headers["content-type"]
    json_data = json_res.json()
    assert json_data["system"] == "NeuroCare AI Research Platform"
    assert json_data["session"]["id"] == sess_id
    assert json_data["participant"]["participant_code"] == "P-REP-01"


def test_dataset_export_no_leakage(client):
    """Verifies that ML dataset export groups by participant to prevent train/test leakage."""
    # Participant 1 with 2 sessions
    p1 = client.post("/api/participants", json={"participant_code": "P-D1", "age": 22, "gender": "F", "consent_obtained": True, "created_by": "doc"}).json()["participant"]
    s1_1 = client.post("/api/sessions", json={"participant_id": p1["id"], "created_by": "doc", "protocol_name": "Task A"}).json()["session"]
    client.patch(f"/api/sessions/{s1_1['id']}/start")
    client.patch(f"/api/sessions/{s1_1['id']}/stop")

    s1_2 = client.post("/api/sessions", json={"participant_id": p1["id"], "created_by": "doc", "protocol_name": "Task B"}).json()["session"]
    client.patch(f"/api/sessions/{s1_2['id']}/start")
    client.patch(f"/api/sessions/{s1_2['id']}/stop")

    # Participant 2 with 1 session
    p2 = client.post("/api/participants", json={"participant_code": "P-D2", "age": 30, "gender": "M", "consent_obtained": True, "created_by": "doc"}).json()["participant"]
    s2_1 = client.post("/api/sessions", json={"participant_id": p2["id"], "created_by": "doc", "protocol_name": "Task A"}).json()["session"]
    client.patch(f"/api/sessions/{s2_1['id']}/start")
    client.patch(f"/api/sessions/{s2_1['id']}/stop")

    export_res = client.post("/api/datasets/export", json={
        "train_split_ratio": 0.5
    })
    assert export_res.status_code == 200
    manifest = export_res.json()
    assert manifest["leakage_prevention"] == "Strict participant-level partitioning"
    assert manifest["summary"]["total_participants"] == 2
    assert manifest["summary"]["total_sessions"] == 3

    train_pids = {s["participant_id"] for s in manifest["train_set"]}
    test_pids = {s["participant_id"] for s in manifest["test_set"]}
    # Verify absolute zero overlap between train and test participant IDs
    assert train_pids.isdisjoint(test_pids)
