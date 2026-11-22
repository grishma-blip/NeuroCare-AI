
from pathlib import Path

PROJECT_ROOT = Path(__file__).resolve().parents[2]


class Settings:
    APP_NAME = "NeuroCare AI"
    APP_VERSION = "1.0.0"
    API_PREFIX = "/api"

    HOST = "127.0.0.1"
    PORT = 8000

    # Hardware Configuration
    DEVICE_MODE = "HARDWARE_TEST"
    SERIAL_PORT = "/dev/cu.usbmodem3CDC75F19EB82"
    BAUD_RATE = 115200

    # MongoDB Configuration
    MONGODB_URI = "mongodb://127.0.0.1:27017/"
    MONGODB_DATABASE = "neurocare_db"

    # Data Directories
    DATA_DIR = PROJECT_ROOT / "data"
    RAW_DATA_DIR = DATA_DIR / "raw"
    PROCESSED_DATA_DIR = DATA_DIR / "processed"
    RECORDINGS_DIR = DATA_DIR / "recordings"


settings = Settings()
