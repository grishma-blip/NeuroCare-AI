import time
import math
import threading
import glob
import sys
from typing import Dict, Any, List, Optional, Callable
from collections import deque
import numpy as np
from backend.dsp import apply_bandpass_filter, assess_signal_quality, DEFAULT_FS

# Operating modes
MODE_LIVE = "live"
MODE_REPLAY = "replay"
MODE_DEMO = "demo"

class HardwareManager:
    """
    Manages serial communication with Arduino UNO R4 WiFi and BioAmp EXG Pill,
    stream dispatching, operating modes (Live, Replay, Demo), and health diagnostics.
    """
    def __init__(self):
        self.mode = MODE_DEMO  # default safe fallback until user or hardware attaches
        self.port: Optional[str] = None
        self.baud_rate: int = 115200
        self.serial_handle = None
        self.is_connected = False
        self.serial_state = "closed"  # 'open' | 'closed' | 'error'
        self.last_sample_time: Optional[float] = None
        self.last_sample_iso: Optional[str] = None
        self.packet_count = 0
        self.dropped_count = 0
        self.configured_fs = DEFAULT_FS
        self.measured_fs = DEFAULT_FS
        self.filter_cutoff = "0.5–29.5 Hz (BioAmp Hardware Bandpass Filter)"

        # Rolling buffers for frequency estimation & signal processing
        self._timestamp_window = deque(maxlen=256)
        self.recent_samples = deque(maxlen=1024)
        self.recording_buffer: List[Dict[str, Any]] = []
        self.is_recording = False
        self.is_paused = False
        self.active_session_id: Optional[str] = None

        # Replay storage
        self.replay_samples: List[Dict[str, Any]] = []
        self.replay_index = 0
        self.replay_speed = 1.0

        # Worker thread
        self.running = True
        self.lock = threading.Lock()
        self.subscribers: List[Callable[[Dict[str, Any]], None]] = []
        self.worker_thread = threading.Thread(target=self._acquisition_loop, daemon=True)
        self.worker_thread.start()

    def list_available_ports(self) -> List[Dict[str, Any]]:
        """List serial ports matching Arduino / USB CDC devices."""
        ports = []
        if sys.platform.startswith('darwin'):
            patterns = ['/dev/tty.usbmodem*', '/dev/cu.usbmodem*', '/dev/tty.usbserial*', '/dev/cu.usbserial*']
        elif sys.platform.startswith('linux'):
            patterns = ['/dev/ttyACM*', '/dev/ttyUSB*']
        else:
            patterns = [f'COM{i}' for i in range(1, 32)]

        detected_files = []
        for pat in patterns:
            detected_files.extend(glob.glob(pat))

        # Check pyserial list_ports if available
        try:
            import serial.tools.list_ports
            for p in serial.tools.list_ports.comports():
                ports.append({
                    "port": p.device,
                    "description": p.description,
                    "hwid": p.hwid,
                    "is_arduino": "Arduino" in p.description or "usbmodem" in p.device or "USB" in p.description
                })
        except Exception:
            for f in detected_files:
                ports.append({
                    "port": f,
                    "description": "USB Serial Device (BioAmp / Arduino UNO R4)",
                    "hwid": "USB",
                    "is_arduino": True
                })

        return ports

    def connect_serial(self, port: str, baud_rate: int = 115200) -> bool:
        """Attempt to open physical serial port."""
        with self.lock:
            try:
                import serial
                if self.serial_handle and self.serial_handle.is_open:
                    self.serial_handle.close()

                self.serial_handle = serial.Serial(port, baudrate=baud_rate, timeout=0.1)
                self.port = port
                self.baud_rate = baud_rate
                self.is_connected = True
                self.serial_state = "open"
                self.mode = MODE_LIVE
                return True
            except Exception as e:
                self.serial_handle = None
                self.is_connected = False
                self.serial_state = "error"
                return False

    def disconnect_serial(self):
        """Safely close serial port."""
        with self.lock:
            if self.serial_handle:
                try:
                    self.serial_handle.close()
                except Exception:
                    pass
            self.serial_handle = None
            self.is_connected = False
            self.serial_state = "closed"

    def set_mode(self, mode: str):
        """Set operating mode: 'live', 'replay', 'demo'."""
        if mode in [MODE_LIVE, MODE_REPLAY, MODE_DEMO]:
            with self.lock:
                self.mode = mode
                if mode != MODE_LIVE and self.is_connected:
                    pass  # keep port open if user wishes, but route data appropriately

    def load_replay_data(self, samples: List[Dict[str, Any]]):
        """Load recorded samples for replay mode."""
        with self.lock:
            self.replay_samples = samples
            self.replay_index = 0
            self.mode = MODE_REPLAY

    def start_recording(self, session_id: str):
        with self.lock:
            self.is_recording = True
            self.is_paused = False
            self.active_session_id = session_id
            self.recording_buffer = []

    def pause_recording(self):
        with self.lock:
            self.is_paused = True

    def resume_recording(self):
        with self.lock:
            self.is_paused = False

    def stop_recording(self) -> List[Dict[str, Any]]:
        with self.lock:
            self.is_recording = False
            self.is_paused = False
            buf = list(self.recording_buffer)
            self.recording_buffer = []
            return buf

    def subscribe(self, callback: Callable[[Dict[str, Any]], None]):
        self.subscribers.append(callback)

    def unsubscribe(self, callback: Callable[[Dict[str, Any]], None]):
        if callback in self.subscribers:
            self.subscribers.remove(callback)

    def _broadcast_sample(self, sample_dict: Dict[str, Any]):
        for cb in self.subscribers:
            try:
                cb(sample_dict)
            except Exception:
                pass

    def get_status(self) -> Dict[str, Any]:
        """Return comprehensive hardware and acquisition status."""
        with self.lock:
            state = "connected" if self.is_connected else ("searching" if self.port else "disconnected")
            if self.serial_state == "error":
                state = "error"

            return {
                "name": "BioAmp EXG Pill Acquisition Unit",
                "board": "Arduino UNO R4 WiFi",
                "channel_count": 1,
                "port": self.port or "/dev/tty.usbmodem1101 (Not Connected)",
                "state": state,
                "mode": self.mode,
                "sample_rate_configured": self.configured_fs,
                "sample_rate_measured": round(self.measured_fs, 1),
                "firmware": "BioAmp-v2.1-UNO_R4 (256 Hz, 0.5-29.5 Hz)",
                "last_sample": self.last_sample_iso,
                "serial_connection": self.serial_state,
                "is_recording": self.is_recording,
                "is_paused": self.is_paused,
                "active_session_id": self.active_session_id,
                "filter_cutoff": self.filter_cutoff,
                "gamma_capable": False,
                "gamma_note": "Gamma band (30-100 Hz) cut off by 29.5 Hz hardware filter on BioAmp EXG PCB."
            }

    def _acquisition_loop(self):
        """Continuous background thread handling Live Serial, Replay, or Demo generation."""
        phase = 0.0
        last_tick = time.time()
        sim_sample_rate = 256.0
        interval = 1.0 / sim_sample_rate

        while self.running:
            now = time.time()
            dt = now - last_tick
            last_tick = now

            if self.mode == MODE_LIVE and self.is_connected and self.serial_handle:
                # Read from physical serial
                try:
                    line = self.serial_handle.readline().decode('utf-8', errors='ignore').strip()
                    if line:
                        # Parse either single float or "timestamp,value"
                        parts = line.split(',')
                        val = float(parts[-1])  # in uV or raw ADC
                        self._handle_new_sample(val, now)
                except Exception as e:
                    self.serial_state = "error"
                    self.is_connected = False
                    time.sleep(0.5)

            elif self.mode == MODE_REPLAY:
                # Replay recorded stream
                if self.replay_samples and self.replay_index < len(self.replay_samples):
                    s = self.replay_samples[self.replay_index]
                    self.replay_index = (self.replay_index + 1) % len(self.replay_samples)
                    self._handle_new_sample(s.get("raw", 0.0), now)
                else:
                    # Synthetic physiological replay if no file loaded
                    phase += 0.08
                    val = 25.0 * math.sin(phase * 10.0 * 2 * math.pi / sim_sample_rate)  # Alpha ~ 10 Hz
                    self._handle_new_sample(val, now)
                time.sleep(interval)

            elif self.mode == MODE_DEMO:
                # Synthesize realistic single-channel EEG (0.5 - 29.5 Hz)
                phase += 1.0
                t = phase / sim_sample_rate

                # Physiological components:
                # Delta (1.5 Hz), Theta (6 Hz), Alpha (10 Hz), Beta (20 Hz)
                delta_wave = 18.0 * math.sin(2.0 * math.pi * 1.5 * t)
                theta_wave = 12.0 * math.sin(2.0 * math.pi * 6.0 * t + 0.4)
                alpha_wave = 22.0 * math.sin(2.0 * math.pi * 10.2 * t + 1.2)
                beta_wave = 7.0 * math.sin(2.0 * math.pi * 19.5 * t + 2.5)

                # Simulated pink noise and occasional eye blink artifact
                pink_noise = float(np.random.normal(0, 3.5))
                blink = 0.0
                if int(phase) % 1000 in range(0, 35):
                    blink = 60.0 * math.sin(math.pi * (int(phase) % 1000) / 35.0)

                raw_val = delta_wave + theta_wave + alpha_wave + beta_wave + pink_noise + blink
                self._handle_new_sample(raw_val, now)
                time.sleep(interval)

            else:
                time.sleep(0.05)

    def _handle_new_sample(self, raw_val: float, timestamp: float):
        """Process incoming sample, update buffer, filter, quality check, and broadcast."""
        with self.lock:
            self.packet_count += 1
            self.last_sample_time = timestamp
            self.last_sample_iso = time.strftime('%Y-%m-%dT%H:%M:%S', time.localtime(timestamp))
            self._timestamp_window.append(timestamp)

            # Measure true sampling frequency
            if len(self._timestamp_window) >= 16:
                diffs = np.diff(list(self._timestamp_window))
                mean_dt = np.mean(diffs)
                if mean_dt > 0:
                    self.measured_fs = 1.0 / mean_dt

            self.recent_samples.append(raw_val)

            # Filter single sample with rolling IIR/bandpass window
            recent_arr = np.array(self.recent_samples)
            if len(recent_arr) >= 40:
                filtered_arr = apply_bandpass_filter(recent_arr, fs=self.configured_fs, lowcut=0.5, highcut=29.5)
                filtered_val = float(filtered_arr[-1])
            else:
                filtered_val = raw_val

            quality = assess_signal_quality(recent_arr)

            sample_dict = {
                "time": round(timestamp, 4),
                "raw": round(raw_val, 2),
                "filtered": round(filtered_val, 2),
                "quality": quality["quality"],
                "clipping": quality["clipping"],
                "flatline": quality["flatline"],
                "noise": quality["noise"],
                "fs": round(self.measured_fs, 1),
                "mode": self.mode
            }

            if self.is_recording and not self.is_paused:
                self.recording_buffer.append(sample_dict)

        self._broadcast_sample(sample_dict)

# Global hardware singleton
hardware = HardwareManager()
