"""
Tests for Arduino hardware bridge, serial acquisition service,
and device status API endpoints.
"""

from unittest.mock import MagicMock, patch
import pytest
from fastapi.testclient import TestClient

from backend.main import app
from backend.hardware.arduino import ArduinoConnection
from backend.services.serial_service import SerialService


@pytest.fixture
def client():
    return TestClient(app)


def test_arduino_connection_disconnected_state():
    """Verify ArduinoConnection handles disconnected state gracefully."""
    conn = ArduinoConnection()
    assert not conn.connected
    assert conn.connection is None
    assert conn.read_data() is None

    # Connect with an invalid dummy port fails safely without throwing
    success = conn.connect(port="/dev/nonexistent_test_port_12345")
    assert not success
    assert not conn.connected
    assert conn.read_data() is None

    conn.disconnect()
    assert not conn.connected


def test_arduino_connection_mock_serial():
    """Verify ArduinoConnection reads and decodes serial lines when connected."""
    conn = ArduinoConnection()
    mock_serial = MagicMock()
    mock_serial.is_open = True
    mock_serial.in_waiting = 20
    mock_serial.readline.return_value = b"12450,23.45\r\n"

    with patch("serial.Serial", return_value=mock_serial):
        success = conn.connect(port="/dev/mock_port")
        assert success
        assert conn.connected

        line = conn.read_data()
        assert line == "12450,23.45"

        mock_serial.read.return_value = b"10487.634,383.196\r\n10491.542,213.699\r\n"
        lines = conn.read_all_lines()
        assert len(lines) == 2
        assert lines[0] == "10487.634,383.196"
        assert lines[1] == "10491.542,213.699"

        conn.disconnect()
        assert not conn.connected


def test_serial_service_lifecycle():
    """Verify SerialService start, status reporting, and clean shutdown."""
    service = SerialService()
    status = service.get_status()
    assert "connected" in status
    assert "status" in status
    assert "mode" in status
    assert status["status"] == "DISCONNECTED"

    # Start with unconnectable port - background thread stays alive for auto-reconnect
    with patch.object(service.device, "connect", return_value=False):
        service.start()
        assert service.running
        assert service.status == "DISCONNECTED"
        service.stop()
        assert not service.running

    # Start with mock connected port
    def mock_connect(*args, **kwargs):
        service.device.connected = True
        return True

    with patch.object(service.device, "connect", side_effect=mock_connect):
        with patch.object(service.device, "read_all_lines", return_value=["10487.634,383.196"]):
            service.start()
            assert service.running
            assert service.status == "CONNECTED"
            service.stop()
            assert not service.running
            assert service.status == "DISCONNECTED"


def test_arduino_connection_resource_busy_handling():
    """Verify ArduinoConnection detects and flags port busy / resource contention."""
    import serial
    conn = ArduinoConnection()
    busy_err = serial.SerialException("[Errno 16] could not open port /dev/cu.usbmodem3CDC75F19EB82: [Errno 16] Resource busy")
    with patch("serial.Serial", side_effect=busy_err):
        success = conn.connect(port="/dev/cu.usbmodem3CDC75F19EB82")
        assert not success
        assert not conn.connected
        assert conn.error_message is not None
        assert "busy" in conn.error_message.lower()


def test_serial_service_decimal_sample_stream():
    """Verify SerialService processes real Uno R4 float samples and calculates sampling rate."""
    service = SerialService()
    service.mode = "HARDWARE_TEST"
    service.device.connected = True

    mock_lines = [
        "10487.634,383.196",
        "10491.542,213.699",
        "10495.447,-165.398",
        "10499.354,-341.452",
        "10503.259,-213.699",
        "10507.163,362.639",
        "10511.070,227.067",
    ]

    with patch.object(service.device, "read_all_lines", return_value=mock_lines):
        service._handle_hardware_read()
        assert service.samples_received_total == 7
        assert service.lines_received_total == 7
        assert len(service.raw_samples) == 7
        assert len(service.filtered_samples) == 7
        assert service.latest_data is not None
        assert "10511.070" in service.latest_data


def test_device_status_endpoint(client):
    """Verify GET /api/device/status endpoint returns valid structure."""
    response = client.get("/api/device/status")
    assert response.status_code == 200
    data = response.json()
    assert "connected" in data
    assert "mode" in data
    assert "message" in data
    assert isinstance(data["connected"], bool)
