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
                elif k == "$or":
                    or_match = False
                    for subq in v:
                        sub_ok = True
                        for sk, sv in subq.items():
                            if sk == "participant_id":
                                if str(doc.get("participant_id")) != str(sv):
                                    sub_ok = False
                                    break
                            elif sk == "session_id":
                                if isinstance(sv, dict) and "$in" in sv:
                                    if doc.get("session_id") not in sv["$in"]:
                                        sub_ok = False
                                        break
                                elif doc.get("session_id") != sv:
                                    sub_ok = False
                                    break
                        if sub_ok:
                            or_match = True
                            break
                    if not or_match:
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
                elif k == "assigned_doctor" and isinstance(v, dict) and "$in" in v:
                    if doc.get("assigned_doctor") not in v["$in"]:
                        match = False
                        break
                elif k == "$or":
                    or_match = False
                    for subq in v:
                        sub_ok = True
                        for sk, sv in subq.items():
                            if sk == "participant_id":
                                if str(doc.get("participant_id")) != str(sv):
                                    sub_ok = False
                                    break
                            elif sk == "session_id":
                                if isinstance(sv, dict) and "$in" in sv:
                                    if doc.get("session_id") not in sv["$in"]:
                                        sub_ok = False
                                        break
                                elif doc.get("session_id") != sv:
                                    sub_ok = False
                                    break
                        if sub_ok:
                            or_match = True
                            break
                    if not or_match:
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

    return {
        "participants": mock_participants,
        "sessions": mock_sessions,
        "records": mock_eeg_records,
        "analysis": mock_analysis,
        "audit": mock_audit
    }


client = TestClient(app)


def test_participant_registration_and_review_workflow():
    """
    Verifies:
    1. Clinician registers participant in 'draft' or 'pending_confirmation'.
    2. Unconfirmed participant is hidden from Doctor dashboard.
    3. Clinician reviews and confirms registration -> becomes 'ready_for_testing'.
    4. Only assigned doctor can view and access the participant.
    5. Unrelated doctor receives 403 Forbidden.
    6. Doctor can view profile and start EEG session.
    """
    # 1. Clinician registers participant in pending_confirmation
    p_res = client.post("/api/participants", json={
        "participant_code": "P-TEST-WORKFLOW",
        "name": "Evelyn Reed",
        "age": 32,
        "gender": "Female",
        "consent_obtained": True,
        "assigned_doctor": "dr_neurologist",
        "assigned_tests": ["Live EEG", "Emotion Recognition", "Motor Imagery"],
        "registration_status": "pending_confirmation",
        "notes": "Cognitive cohort subject",
        "created_by": "nurse_patel"
    })
    assert p_res.status_code == 201
    p_data = p_res.json()["participant"]
    part_id = p_data["id"]
    assert p_data["registration_status"] == "pending_confirmation"
    assert p_data["assigned_doctor"] == "dr_neurologist"

    # 2. Unconfirmed participant must NOT appear in doctor's testing dashboard
    doc_view = client.get("/api/participants?role=doctor&user_id=dr_neurologist")
    assert doc_view.status_code == 200
    assert not any(p["id"] == part_id for p in doc_view.json()["participants"])

    # 2b. Attempting direct access as doctor should be 403 Forbidden while unconfirmed
    doc_direct = client.get(f"/api/participants/{part_id}?role=doctor&user_id=dr_neurologist")
    assert doc_direct.status_code == 403
    assert "not confirmed" in doc_direct.json()["detail"].lower()

    # 3. Clinician reviews participant
    rev_res = client.patch(f"/api/participants/{part_id}/review", json={
        "reviewed_by": "nurse_patel",
        "notes": "Demographics and IRB consent verified"
    })
    assert rev_res.status_code == 200
    assert rev_res.json()["participant"]["reviewed_by"] == "nurse_patel"

    # 4. Clinician confirms registration
    conf_res = client.patch(f"/api/participants/{part_id}/confirm", json={
        "confirmed_by": "nurse_patel",
        "assigned_doctor": "dr_neurologist",
        "assigned_tests": ["Live EEG", "Motor Imagery"]
    })
    assert conf_res.status_code == 200
    conf_p = conf_res.json()["participant"]
    assert conf_p["registration_status"] == "ready_for_testing"
    assert conf_p["confirmed_by"] == "nurse_patel"
    assert conf_p["assigned_tests"] == ["Live EEG", "Motor Imagery"]

    # 5. Doctor can now see participant in testing dashboard
    doc_view_after = client.get("/api/participants?role=doctor&user_id=dr_neurologist")
    assert doc_view_after.status_code == 200
    found = any(p["id"] == part_id for p in doc_view_after.json()["participants"])
    assert found

    # 6. Unrelated doctor (dr_patel) CANNOT see participant in their cohort
    other_doc_view = client.get("/api/participants?role=doctor&user_id=dr_patel")
    assert other_doc_view.status_code == 200
    assert not any(p["id"] == part_id for p in other_doc_view.json()["participants"])

    # 7. Unrelated doctor direct profile access is 403 Forbidden
    other_doc_profile = client.get(f"/api/participants/{part_id}/profile?role=doctor&user_id=dr_patel")
    assert other_doc_profile.status_code == 403
    assert "assigned" in other_doc_profile.json()["detail"].lower()

    # 8. Authorized doctor opens profile -> 200 OK
    prof_res = client.get(f"/api/participants/{part_id}/profile?role=doctor&user_id=dr_neurologist")
    assert prof_res.status_code == 200
    prof_data = prof_res.json()
    assert prof_data["participant"]["id"] == part_id
    assert prof_data["participant"]["name"] == "Evelyn Reed"
    assert prof_data["summary"]["total_sessions"] == 0
    assert prof_data["summary"]["is_ready_for_testing"] is True
    assert "sessions" in prof_data
    assert "emotion_history" in prof_data
    assert "motor_imagery_history" in prof_data

    # 9. Doctor starts an EEG session for this participant
    sess_res = client.post("/api/sessions", json={
        "participant_id": part_id,
        "created_by": "dr_neurologist",
        "protocol_name": "Assigned BCI Imagery Battery",
        "data_mode": "REPLAY",
        "sampling_rate": 128,
        "channel_count": 64
    })
    assert sess_res.status_code == 201
    sess_id = sess_res.json()["session"]["id"]

    # 10. Verify session links to participant
    profile_after_sess = client.get(f"/api/participants/{part_id}/profile?role=doctor&user_id=dr_neurologist")
    assert profile_after_sess.status_code == 200
    assert profile_after_sess.json()["summary"]["total_sessions"] == 1
    assert profile_after_sess.json()["sessions"][0]["id"] == sess_id


def test_doctor_cannot_create_session_for_unconfirmed_participant():
    """Verifies that doctor is blocked from creating sessions for unconfirmed participants."""
    # Create draft participant
    p_res = client.post("/api/participants", json={
        "participant_code": "P-DRAFT-ONLY",
        "age": 40,
        "consent_obtained": True,
        "registration_status": "draft",
        "created_by": "nurse"
    })
    part_id = p_res.json()["participant"]["id"]

    # Doctor attempts to create session
    sess_res = client.post("/api/sessions", json={
        "participant_id": part_id,
        "created_by": "dr_neurologist"
    })
    assert sess_res.status_code == 403
    assert "not confirmed" in sess_res.json()["detail"].lower()
