import math
import numpy as np
import pytest
from bson import ObjectId
from unittest.mock import patch, MagicMock
from fastapi.testclient import TestClient

from backend.main import app
import backend.api.routes as routes
from backend.services.dsp_service import dsp_service
from backend.services.serial_service import parse_firmware_line, serial_service


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
                if doc.get(k) != v:
                    match = False
                    break
            if match:
                return dict(doc)
        return None

    def find(self, query=None):
        class MockCursor:
            def __init__(self, docs):
                self._docs = list(docs)

            def sort(self, *args, **kwargs):
                return self

            def __iter__(self):
                return iter(self._docs)

            def __list__(self):
                return self._docs

        matched = []
        for doc in self.docs.values():
            if not query:
                matched.append(dict(doc))
                continue
            m = True
            for k, v in query.items():
                if doc.get(k) != v:
                    m = False
                    break
            if m:
                matched.append(dict(doc))
        return MockCursor(matched)


@pytest.fixture(autouse=True)
def mock_routes_db(monkeypatch):
    mock_sessions = MockCollection()
    mock_eeg_records = MockCollection()
    monkeypatch.setattr(routes, "sessions_collection", mock_sessions)
    monkeypatch.setattr(routes, "eeg_records_collection", mock_eeg_records)
    return {
        "sessions": mock_sessions,
        "eeg_records": mock_eeg_records,
    }


@pytest.fixture
def client():
    return TestClient(app)


# ============================================================================
# 1. FIRMWARE SERIAL PARSER TESTS
# ============================================================================

def test_parse_firmware_line_valid():
    assert parse_firmware_line("1000, 25.4") == (1000, 25.4)
    assert parse_firmware_line("0,0\r\n") == (0, 0.0)
    assert parse_firmware_line("523912, -15.82") == (523912, -15.82)
    # Support for decimal millisecond timestamps from BioAmp Uno R4 firmware
    assert parse_firmware_line("10487.634,383.196") == (10487.634, 383.196)
    assert parse_firmware_line("10495.447,-165.398") == (10495.447, -165.398)
    assert parse_firmware_line("10511.070, 227.067\r\n") == (10511.070, 227.067)


def test_parse_firmware_line_invalid():
    assert parse_firmware_line("") is None
    assert parse_firmware_line("corrupt_line_no_comma") is None
    assert parse_firmware_line("not_a_number, 5.0") is None
    assert parse_firmware_line("1000, not_a_float") is None
    assert parse_firmware_line("nan, nan") is None


# ============================================================================
# 2. DSP SERVICE TESTS (Welch Bandpower & Scientific Bandwidth)
# ============================================================================

def test_welch_bandpower_dominant_alpha():
    # 256 Hz sampling rate, 2 seconds of pure 10.0 Hz sine wave (Alpha band: 8-13 Hz)
    fs = 256.0
    t = np.linspace(0, 2.0, int(fs * 2.0), endpoint=False)
    alpha_sine = 25.0 * np.sin(2.0 * np.pi * 10.0 * t)

    res = dsp_service.compute_bandpowers(alpha_sine.tolist(), fs=fs)
    bands = res["bands"]

    assert bands["alpha"]["is_available"] is True
    assert bands["alpha"]["relative_percent"] > 60.0, f"Alpha should dominate, got {bands['alpha']['relative_percent']}%"
    assert abs(res["alpha_peak_hz"] - 10.0) <= 1.0


def test_welch_bandpower_dominant_delta():
    # 256 Hz sampling rate, 2 seconds of pure 2.0 Hz sine wave (Delta band: 0.5-4 Hz)
    fs = 256.0
    t = np.linspace(0, 2.0, int(fs * 2.0), endpoint=False)
    delta_sine = 30.0 * np.sin(2.0 * np.pi * 2.0 * t)

    res = dsp_service.compute_bandpowers(delta_sine.tolist(), fs=fs)
    bands = res["bands"]

    assert bands["delta"]["is_available"] is True
    assert bands["delta"]["relative_percent"] > 60.0, f"Delta should dominate, got {bands['delta']['relative_percent']}%"


def test_gamma_band_hardware_cutoff_enforced():
    # Verify Gamma band (>30 Hz) is explicitly unavailable due to BioAmp 29.5 Hz hardware filter
    samples = [10.0] * 256
    res = dsp_service.compute_bandpowers(samples, fs=256.0)
    gamma = res["bands"]["gamma"]

    assert gamma["is_available"] is False
    assert gamma["power_uv2"] == 0.0
    assert gamma["relative_percent"] == 0.0
    assert "29.5 Hz" in gamma["unavailable_reason"]


def test_dsp_insufficient_samples():
    res = dsp_service.compute_bandpowers([1.0, 2.0, 3.0], fs=256.0)
    assert res["total_power_uv2"] == 0.0
    assert res["window_samples"] == 0


# ============================================================================
# 3. SIGNAL QUALITY DIAGNOSTIC TESTS
# ============================================================================

def test_signal_quality_flatline():
    flat_samples = [0.1] * 128
    res = dsp_service.evaluate_signal_quality(flat_samples, fs=256.0)

    assert res["metrics"]["flatline"] is True
    assert res["overall_quality"] == "POOR"
    assert "FLATLINE_DETECTED" in res["flags"]


def test_signal_quality_clipping_saturation():
    clipped_samples = [20.0] * 120 + [1050.0] * 8
    res = dsp_service.evaluate_signal_quality(clipped_samples, fs=256.0)

    assert res["metrics"]["clipping"] is True
    assert "ADC_RAIL_SATURATION" in res["flags"]


def test_signal_quality_baseline_drift():
    drift_samples = [150.0] * 128
    res = dsp_service.evaluate_signal_quality(drift_samples, fs=256.0)

    assert res["metrics"]["baseline_drift"] is True
    assert "BASELINE_DRIFT" in res["flags"]


def test_signal_quality_nominal():
    # Nominal physiological EEG waveform (~20 uV amplitude, zero-centered)
    t = np.linspace(0, 1.0, 256, endpoint=False)
    eeg = 15.0 * np.sin(2.0 * np.pi * 10.0 * t)
    res = dsp_service.evaluate_signal_quality(eeg.tolist(), fs=256.0)

    assert res["metrics"]["flatline"] is False
    assert res["metrics"]["clipping"] is False
    assert res["overall_quality"] in ("EXCELLENT", "GOOD")
    assert res["is_acceptable"] is True


# ============================================================================
# 4. WEBSOCKET STREAMING & ACTION TESTS
# ============================================================================

def test_websocket_ping_pong(client):
    with client.websocket_connect("/ws/eeg") as ws:
        ws.send_json({"action": "ping"})
        msg = ws.receive_json()
        assert msg["type"] == "pong"
        assert "timestamp" in msg


def test_websocket_get_status(client):
    with client.websocket_connect("/ws/eeg") as ws:
        ws.send_json({"action": "get_status"})
        msg = ws.receive_json()
        assert msg["type"] == "status"
        assert "device" in msg
        assert "mode" in msg["device"]


# ============================================================================
# 5. DEVICE REST API TESTS
# ============================================================================

def test_get_device_ports(client):
    res = client.get("/api/device/ports")
    assert res.status_code == 200
    data = res.json()
    assert "ports" in data
    assert isinstance(data["ports"], list)


def test_device_mode_switch(client):
    res = client.post("/api/device/mode", json={"mode": "DEMO"})
    assert res.status_code == 200
    data = res.json()
    assert data["mode"] == "DEMO"

    # Reset back to HARDWARE_TEST
    res_reset = client.post("/api/device/mode", json={"mode": "HARDWARE_TEST"})
    assert res_reset.status_code == 200


def test_device_mode_invalid(client):
    res = client.post("/api/device/mode", json={"mode": "NONEXISTENT_MODE"})
    assert res.status_code == 400


def test_session_psd_nonexistent(client):
    res = client.post("/api/sessions/000000000000000000000000/psd")
    assert res.status_code == 404


def test_session_psd_with_recorded_samples(client, mock_routes_db):
    sess_id = ObjectId()
    mock_routes_db["sessions"].insert_one({
        "_id": sess_id,
        "participant_id": ObjectId(),
        "status": "completed",
        "created_by": "test",
    })

    # Create 256 samples of 10 Hz alpha wave
    t = np.linspace(0, 1.0, 256, endpoint=False)
    samples = [[float(v)] for v in (20.0 * np.sin(2.0 * np.pi * 10.0 * t))]

    mock_routes_db["eeg_records"].insert_one({
        "_id": ObjectId(),
        "session_id": sess_id,
        "samples": samples,
        "sample_count": 256,
        "sampling_rate": 256,
        "channel_names": ["EEG_A0"],
    })

    res = client.post(f"/api/sessions/{sess_id}/psd")
    assert res.status_code == 200
    data = res.json()
    assert data["session_id"] == str(sess_id)
    assert data["total_samples"] == 256
    assert data["band_analysis"]["bands"]["alpha"]["relative_percent"] > 50.0
    assert data["band_analysis"]["bands"]["gamma"]["is_available"] is False
