import serial
import serial.tools.list_ports
from typing import Optional, List, Dict, Any

from backend.core.config import settings
from backend.core.logger import get_logger

logger = get_logger(__name__)


class ArduinoConnection:
    """
    Manages USB CDC Serial connection to Arduino UNO R4 WiFi.
    Safe against reconnects, timeouts, port contention, and missing hardware.
    """
    def __init__(self):
        self.connection: Optional[serial.Serial] = None
        self.connected = False
        self.current_port: Optional[str] = None
        self.current_baud: int = settings.BAUD_RATE
        self.error_message: Optional[str] = None
        self._residual_buffer: str = ""

    def list_available_ports(self) -> List[Dict[str, Any]]:
        """Scans and lists system serial/COM ports with hardware descriptors."""
        port_list = []
        for port in serial.tools.list_ports.comports():
            desc_lower = (port.description or "").lower()
            hwid_lower = (port.hwid or "").lower()
            name_lower = (port.device or "").lower()

            is_arduino = any(k in desc_lower or k in hwid_lower or k in name_lower for k in [
                "arduino", "usbmodem", "usb serial", "ch340", "cp210", "ftdi", "ttyacm", "ttyusb", "uno"
            ])

            port_list.append({
                "port": port.device,
                "description": port.description or "Unknown Serial Device",
                "hwid": port.hwid or "",
                "is_arduino": is_arduino,
            })
        return port_list

    def auto_detect_arduino_port(self) -> Optional[str]:
        """Auto-detects first candidate port for Arduino UNO R4."""
        ports = self.list_available_ports()
        for p in ports:
            if p["is_arduino"]:
                return p["port"]
        return None

    def connect(self, port: Optional[str] = None, baudrate: Optional[int] = None) -> bool:
        """Establishes USB serial connection to the microcontroller with auto-detection."""
        selected_baud = baudrate or settings.BAUD_RATE

        candidate_ports: List[str] = []
        if port and port != "AUTO":
            candidate_ports.append(port)
        if settings.SERIAL_PORT and settings.SERIAL_PORT != "AUTO" and settings.SERIAL_PORT not in candidate_ports:
            candidate_ports.append(settings.SERIAL_PORT)

        # Append auto-detected candidate
        detected = self.auto_detect_arduino_port()
        if detected and detected not in candidate_ports:
            candidate_ports.append(detected)

        # Append any system usbmodem devices
        for p in self.list_available_ports():
            if p["port"] not in candidate_ports and p["is_arduino"]:
                candidate_ports.append(p["port"])

        if not candidate_ports:
            self.error_message = "No Arduino serial port specified or detected"
            logger.warning(self.error_message)
            return False

        # If already connected to an active candidate port, retain connection
        if self.connected and self.connection and self.connection.is_open and self.current_port in candidate_ports:
            return True

        self.disconnect()

        for candidate in candidate_ports:
            try:
                self.connection = serial.Serial(
                    port=candidate,
                    baudrate=selected_baud,
                    timeout=0.05
                )
                self.connected = True
                self.current_port = candidate
                self.current_baud = selected_baud
                self.error_message = None
                logger.info("Arduino successfully connected on %s @ %d baud", candidate, selected_baud)
                return True

            except serial.SerialException as error:
                err_str = str(error)
                if "Resource busy" in err_str or "could not open port" in err_str and "16" in err_str:
                    msg = f"Port {candidate} busy: Close Arduino IDE Serial Monitor or other serial terminals"
                    logger.warning(msg)
                    self.error_message = msg
                else:
                    logger.warning("Failed opening serial port %s: %s", candidate, error)
                    self.error_message = str(error)

            except OSError as error:
                logger.warning("OS error opening serial port %s: %s", candidate, error)
                self.error_message = str(error)

        self.connected = False
        self.connection = None
        return False

    def read_data(self) -> Optional[str]:
        """Reads a single line of decoded text from serial buffer."""
        if not self.connected or self.connection is None:
            return None

        try:
            if self.connection.in_waiting:
                line = self.connection.readline().decode("utf-8", errors="replace").strip()
                return line if line else None
        except (serial.SerialException, OSError) as error:
            logger.error("Serial read failed: %s", error)
            self.disconnect()

        return None

    def read_all_lines(self, max_lines: int = 256) -> List[str]:
        """Reads all pending lines from serial buffer non-blockingly with chunk-split assembly."""
        if not self.connected or self.connection is None:
            return []

        lines: List[str] = []
        try:
            available = self.connection.in_waiting
            if available > 0:
                raw_bytes = self.connection.read(min(available, 8192))
                if raw_bytes:
                    text = self._residual_buffer + raw_bytes.decode("utf-8", errors="replace")
                    split_lines = text.split("\n")
                    self._residual_buffer = split_lines[-1]
                    for raw in split_lines[:-1]:
                        cleaned = raw.strip()
                        if cleaned:
                            lines.append(cleaned)
        except (serial.SerialException, OSError) as error:
            logger.error("Serial batch read error: %s", error)
            self.disconnect()

        return lines[:max_lines]

    def disconnect(self):
        """Safely closes serial port connection."""
        if self.connection:
            try:
                if self.connection.is_open:
                    self.connection.close()
            except Exception as e:
                logger.debug("Serial close exception: %s", e)

        self.connection = None
        self.connected = False
        logger.info("Arduino disconnected")
