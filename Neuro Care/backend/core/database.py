
from pymongo import MongoClient, ASCENDING, DESCENDING
from pymongo.errors import PyMongoError

from .config import settings


# MongoDB Client
client = MongoClient(
    settings.MONGODB_URI,
    serverSelectionTimeoutMS=5000
)

# Database
database = client[settings.MONGODB_DATABASE]


# Collection References
users_collection = database["users"]
participants_collection = database["participants"]
recording_sessions_collection = database["recording_sessions"]
eeg_records_collection = database["eeg_records"]
analysis_results_collection = database["analysis_results"]
audit_logs_collection = database["audit_logs"]


def check_database_connection():
    try:
        client.admin.command("ping")
        return True
    except PyMongoError as error:
        print(f"MongoDB connection failed: {error}")
        return False


def initialize_database():
    """
    Create required collections and indexes.
    MongoDB creates collections automatically
    when indexes are created on them.
    """

    try:
        # Users
        users_collection.create_index(
            [("email", ASCENDING)],
            unique=True,
            name="unique_user_email"
        )

        # Participants
        participants_collection.create_index(
            [("participant_code", ASCENDING)],
            unique=True,
            name="unique_participant_code"
        )

        participants_collection.create_index(
            [("registration_status", ASCENDING)],
            name="participant_registration_status_index"
        )

        participants_collection.create_index(
            [("assigned_doctor", ASCENDING)],
            name="participant_assigned_doctor_index"
        )

        # Recording Sessions
        recording_sessions_collection.create_index(
            [("session_code", ASCENDING)],
            unique=True,
            name="unique_session_code"
        )

        recording_sessions_collection.create_index(
            [("participant_id", ASCENDING)],
            name="participant_session_index"
        )

        # EEG Records
        eeg_records_collection.create_index(
            [("session_id", ASCENDING)],
            name="eeg_session_index"
        )

        eeg_records_collection.create_index(
            [("recorded_at", DESCENDING)],
            name="eeg_recorded_at_index"
        )

        # Analysis Results
        analysis_results_collection.create_index(
            [("session_id", ASCENDING)],
            name="analysis_session_index"
        )

        analysis_results_collection.create_index(
            [("participant_id", ASCENDING)],
            name="analysis_participant_index"
        )

        # Audit Logs
        audit_logs_collection.create_index(
            [("user_id", ASCENDING), ("created_at", DESCENDING)],
            name="audit_user_created_index"
        )

        print("MongoDB collections and indexes initialized successfully.")

        return True

    except PyMongoError as error:
        print(f"Database initialization failed: {error}")
        return False


def close_database_connection():
    client.close()
