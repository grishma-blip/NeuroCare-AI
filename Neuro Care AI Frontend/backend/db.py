import sqlite3
import os
import json
import hashlib
from datetime import datetime
from typing import List, Dict, Any, Optional

DB_PATH = os.path.join(os.path.dirname(__file__), "neurocare.db")

def hash_password(password: str) -> str:
    """Hash password using SHA-256 with salt."""
    salt = "neurocare_eeg_salt_2026"
    return hashlib.sha256((salt + password).encode("utf-8")).hexdigest()

def get_db():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    """Initialize database tables with complete schema."""
    conn = get_db()
    cursor = conn.cursor()

    # Users table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS users (
        id TEXT PRIMARY KEY,
        email TEXT UNIQUE NOT NULL,
        password_hash TEXT NOT NULL,
        name TEXT NOT NULL,
        role TEXT NOT NULL, -- 'administrator' | 'clinician'
        active INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL
    )
    """)

    # Participants table (anonymous IDs only)
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS participants (
        id TEXT PRIMARY KEY,
        code TEXT UNIQUE NOT NULL, -- e.g. P-001
        consent_status TEXT NOT NULL, -- 'given' | 'pending' | 'withdrawn'
        consent_date TEXT NOT NULL,
        session_count INTEGER NOT NULL DEFAULT 0,
        notes TEXT,
        created_at TEXT NOT NULL
    )
    """)

    # Recording sessions table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS sessions (
        id TEXT PRIMARY KEY, -- e.g. EEG-2024-0312
        participant_code TEXT NOT NULL,
        date TEXT NOT NULL,
        duration INTEGER NOT NULL, -- in seconds
        sample_count INTEGER NOT NULL,
        completeness REAL NOT NULL, -- 0.0 to 1.0
        signal_quality TEXT NOT NULL, -- 'excellent' | 'good' | 'fair' | 'poor'
        status TEXT NOT NULL, -- 'completed' | 'in-progress' | 'scheduled' | 'failed' | 'paused'
        task_type TEXT NOT NULL,
        filter_config TEXT NOT NULL,
        notes TEXT,
        mode TEXT NOT NULL DEFAULT 'demo', -- 'live' | 'replay' | 'demo'
        raw_samples_json TEXT, -- stores sampled points for visualization/replay
        created_at TEXT NOT NULL,
        FOREIGN KEY (participant_code) REFERENCES participants (code)
    )
    """)

    # Task events table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS task_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        label TEXT NOT NULL,
        start_time REAL NOT NULL,
        duration REAL NOT NULL,
        type TEXT NOT NULL, -- 'setup' | 'baseline' | 'instruction' | 'task' | 'rest' | 'completion'
        description TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    )
    """)

    # Emotion analysis records table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS emotion_records (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        predicted_state TEXT NOT NULL,
        confidence REAL NOT NULL,
        probabilities TEXT NOT NULL, -- JSON
        features TEXT NOT NULL, -- JSON
        model_version TEXT NOT NULL,
        status_note TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    )
    """)

    # Cognitive response (CMD) analysis records table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS cmd_records (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        protocol_name TEXT NOT NULL,
        baseline_power REAL NOT NULL,
        task_power REAL NOT NULL,
        power_shift REAL NOT NULL,
        p_value REAL NOT NULL,
        repeatability REAL NOT NULL,
        result_label TEXT NOT NULL, -- 'Experimental task-related EEG response observed' | 'No reliable task-related response detected' | 'Inconclusive'
        notes TEXT,
        FOREIGN KEY (session_id) REFERENCES sessions (id) ON DELETE CASCADE
    )
    """)

    # Device configuration
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS device_configs (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        board TEXT NOT NULL,
        port TEXT NOT NULL,
        baud_rate INTEGER NOT NULL,
        sample_rate INTEGER NOT NULL,
        firmware TEXT NOT NULL,
        auto_reconnect INTEGER NOT NULL DEFAULT 1,
        filter_cutoff TEXT NOT NULL DEFAULT '0.5-29.5 Hz'
    )
    """)

    # Audit logs table
    cursor.execute("""
    CREATE TABLE IF NOT EXISTS audit_logs (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        user_name TEXT NOT NULL,
        action TEXT NOT NULL,
        target_type TEXT NOT NULL,
        target_id TEXT NOT NULL,
        details TEXT,
        timestamp TEXT NOT NULL
    )
    """)

    conn.commit()

    # Seed initial default users if not present
    cursor.execute("SELECT COUNT(*) FROM users")
    if cursor.fetchone()[0] == 0:
        now = datetime.utcnow().isoformat()
        cursor.executemany("""
        INSERT INTO users (id, email, password_hash, name, role, active, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [
            ("u_admin", "admin@neurocare.ai", hash_password("Admin@123"), "Dr. Alex Vance", "administrator", 1, now),
            ("u_clinician", "clinician@neurocare.ai", hash_password("Clinician@123"), "Sarah Chen", "clinician", 1, now),
            ("u_operator", "operator@neurocare.ai", hash_password("Operator@123"), "Marcus Brody", "clinician", 1, now),
        ])
        conn.commit()

    # Seed initial participants if empty
    cursor.execute("SELECT COUNT(*) FROM participants")
    if cursor.fetchone()[0] == 0:
        cursor.executemany("""
        INSERT INTO participants (id, code, consent_status, consent_date, session_count, notes, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, [
            ("p_1", "P-014", "given", "2024-02-15", 3, "Healthy volunteer. Left motor imagery protocol verified.", "2024-02-15T10:00:00"),
            ("p_2", "P-015", "given", "2024-02-20", 2, "Consented under protocol IRB-2024-09.", "2024-02-20T11:30:00"),
            ("p_3", "P-016", "given", "2024-03-01", 1, "Mental arithmetic and imagery pilot.", "2024-03-01T09:15:00"),
            ("p_4", "P-017", "pending", "2023-08-10", 4, "Annual consent renewal pending review.", "2023-08-10T14:00:00"),
            ("p_5", "P-018", "withdrawn", "2023-11-05", 2, "Participant withdrew consent on 2024-01-10.", "2023-11-05T13:45:00"),
        ])
        conn.commit()

    # Seed initial device config
    cursor.execute("SELECT COUNT(*) FROM device_configs")
    if cursor.fetchone()[0] == 0:
        cursor.execute("""
        INSERT INTO device_configs (id, name, board, port, baud_rate, sample_rate, firmware, auto_reconnect, filter_cutoff)
        VALUES ('dev_1', 'BioAmp EXG Pill Acquisition Unit', 'Arduino UNO R4 WiFi', '/dev/tty.usbmodem1101', 115200, 256, 'BioAmp v2.1-UNO_R4', 1, '0.5-29.5 Hz')
        """)
        conn.commit()

    # Seed initial sessions and events if empty
    cursor.execute("SELECT COUNT(*) FROM sessions")
    if cursor.fetchone()[0] == 0:
        _seed_sessions(conn)

    conn.close()

def _seed_sessions(conn):
    cursor = conn.cursor()
    sessions = [
        ("EEG-2024-0312", "P-014", "2024-03-12T14:30:00", 300, 76800, 0.992, "excellent", "completed", "Motor Imagery Paradigm", "0.5–29.5 Hz Bandpass (BioAmp Hardware Filter)", "High SNR, bilateral alpha desynchronization noted during imagery block.", "replay"),
        ("EEG-2024-0311", "P-014", "2024-03-11T10:15:00", 300, 76800, 0.985, "good", "completed", "Baseline Rest & Cognitive Task", "0.5–29.5 Hz Bandpass", "Slight ocular blink artifact in first 30 seconds; clean thereafter.", "replay"),
        ("EEG-2024-0310", "P-015", "2024-03-10T16:00:00", 280, 71680, 0.933, "good", "completed", "Instruction-Following Protocol", "0.5–29.5 Hz Bandpass", "Session concluded normally.", "replay"),
        ("EEG-2024-0308", "P-016", "2024-03-08T11:45:00", 120, 30720, 0.400, "poor", "failed", "Mental Imagery Pilot", "0.5–29.5 Hz Bandpass", "Electrode disconnected at minute 2:00 due to participant movement.", "replay"),
        ("EEG-2024-0305", "P-017", "2024-03-05T09:30:00", 300, 76800, 0.978, "fair", "completed", "Continuous EEG Monitoring", "0.5–29.5 Hz Bandpass", "Elevated 50 Hz ambient line noise; notch filtered successfully.", "replay"),
    ]

    for s in sessions:
        cursor.execute("""
        INSERT INTO sessions (id, participant_code, date, duration, sample_count, completeness, signal_quality, status, task_type, filter_config, notes, mode, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (s[0], s[1], s[2], s[3], s[4], s[5], s[6], s[7], s[8], s[9], s[10], s[11], s[2]))

    # Seed structured task events for EEG-2024-0312
    events = [
        ("ev_1", "EEG-2024-0312", "Setup & Signal Check", 0, 30, "setup", "Electrode impedance check, baseline noise verification"),
        ("ev_2", "EEG-2024-0312", "Baseline Rest (Eyes Open/Closed)", 30, 60, "baseline", "Resting state EEG acquisition for baseline comparison"),
        ("ev_3", "EEG-2024-0312", "Instruction Presentation", 90, 15, "instruction", "Auditory/visual instructions for motor imagery task"),
        ("ev_4", "EEG-2024-0312", "Mental Imagery Task — Trial 1", 105, 60, "task", "Active mental imagery (kinesthetic motor imagery: tennis playing)"),
        ("ev_5", "EEG-2024-0312", "Rest & Recovery", 165, 45, "rest", "Recovery interval to return brainwave activity to baseline"),
        ("ev_6", "EEG-2024-0312", "Mental Imagery Task — Trial 2", 210, 60, "task", "Repeat trial to assess response consistency and repeatability"),
        ("ev_7", "EEG-2024-0312", "Session Completion", 270, 30, "completion", "Final rest, electrode removal, and data verification"),
    ]

    for ev in events:
        cursor.execute("""
        INSERT INTO task_events (id, session_id, label, start_time, duration, type, description)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """, ev)

    # Seed emotion record for EEG-2024-0312
    probs = {"Calm / Relaxed": 0.48, "Focused / Attentive": 0.32, "Positive / Happy": 0.12, "High Arousal / Stressed": 0.05, "Negative / Sad": 0.03}
    feats = {"alpha_beta_ratio": 2.14, "theta_beta_ratio": 1.42, "relative_delta": 0.38, "relative_theta": 0.24, "relative_alpha": 0.26, "relative_beta": 0.12, "signal_variance_uv2": 142.5}
    cursor.execute("""
    INSERT INTO emotion_records (id, session_id, timestamp, predicted_state, confidence, probabilities, features, model_version, status_note)
    VALUES ('em_1', 'EEG-2024-0312', '2024-03-12T14:34:00', 'Calm / Relaxed', 0.68, ?, ?, 'DEAP-RF-v1.2 (Single-Channel Frontal Compatible)', 'Experimental estimation based on single-channel EEG. Not a clinical diagnosis.')
    """, (json.dumps(probs), json.dumps(feats)))

    # Seed CMD record for EEG-2024-0312
    cursor.execute("""
    INSERT INTO cmd_records (id, session_id, timestamp, protocol_name, baseline_power, task_power, power_shift, p_value, repeatability, result_label, notes)
    VALUES ('cmd_1', 'EEG-2024-0312', '2024-03-12T14:35:00', 'Kinesthetic Motor Imagery vs Baseline Rest', 18.4, 11.2, -39.1, 0.008, 0.86, 'Experimental task-related EEG response observed', 'Statistically significant Alpha desynchronization (-39.1%, p=0.008) observed across both trials. Prototype research output only.')
    """)

    conn.commit()

