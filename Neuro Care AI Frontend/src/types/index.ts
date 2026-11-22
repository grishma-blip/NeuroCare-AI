export type SessionStatus = 'scheduled' | 'recording' | 'completed' | 'cancelled' | 'failed' | 'in-progress' | 'paused';
export type ConsentStatus = 'given' | 'pending' | 'withdrawn';
export type SignalQuality = 'excellent' | 'good' | 'fair' | 'poor' | 'unassessed';
export type DeviceConnectionState = 'connected' | 'disconnected' | 'error' | 'searching';
export type UserRole = 'clinician' | 'doctor';
export type OperatingMode = 'live' | 'replay' | 'demo' | 'HARDWARE' | 'REPLAY' | 'SIMULATION' | 'HARDWARE_TEST' | 'DEMO';
export type ParticipantStatus = 'active' | 'inactive' | 'withdrawn';
export type RegistrationStatus = 'draft' | 'pending_confirmation' | 'ready_for_testing';
export type AssignedTestType = 'Live EEG' | 'Emotion Recognition' | 'Motor Imagery';

export interface User {
  id: string;
  email: string;
  name: string;
  role: UserRole;
  active?: boolean;
  createdAt?: string;
}

export interface GroundTruth {
  valence: number;
  arousal: number;
  dominance?: number;
  liking?: number;
  valence_discrete?: 'HIGH' | 'LOW';
  arousal_discrete?: 'HIGH' | 'LOW';
  quadrant?: string;
  assessment_method?: string;
  submitted_by: string;
  notes?: string;
  submitted_at: string;
}

export interface CalibrationProfile {
  version: number;
  participant_id: string;
  resting_session_id: string | null;
  resting_profile: Record<string, any>;
  valence_bias: number;
  arousal_bias: number;
  calibrated_trial_count: number;
  source_session_ids: string[];
  created_at: string;
  is_active: boolean;
}

export interface RecordingSession {
  id: string;
  session_code?: string;
  participant_id?: string;
  participantCode: string;
  created_by?: string;
  date: string;
  duration: number | null;
  sampleCount: number | null;
  completeness: number | null;
  signalQuality: SignalQuality;
  status: SessionStatus;
  taskType: string;
  protocol_name?: string;
  data_mode?: 'HARDWARE' | 'REPLAY' | 'SIMULATION';
  sampling_rate?: number | null;
  channel_count?: number;
  filterConfig: string;
  notes?: string;
  mode?: OperatingMode;
  ground_truth?: GroundTruth | null;
  started_at?: string | null;
  paused_at?: string | null;
  ended_at?: string | null;
  created_at?: string;
  updated_at?: string;
  events?: any[];
  device_info?: any;
  calibration_info?: any;
  quality_summary?: any;
}

export interface ParticipantConsent {
  obtained: boolean;
  obtained_at: string | null;
}

export interface Participant {
  id: string;
  participant_code?: string;
  code: string;
  name?: string;
  age?: number;
  gender?: string;
  demographics?: Record<string, any>;
  assigned_doctor?: string;
  assigned_tests?: AssignedTestType[] | string[];
  registration_status?: RegistrationStatus;
  reviewed_at?: string | null;
  reviewed_by?: string | null;
  confirmed_at?: string | null;
  confirmed_by?: string | null;
  consent?: ParticipantConsent;
  consentStatus: ConsentStatus;
  consentDate?: string;
  status?: ParticipantStatus;
  withdrawal_reason?: string | null;
  withdrawn_at?: string | null;
  calibration_profiles?: CalibrationProfile[];
  created_by?: string;
  sessionCount: number;
  lastSessionDate: string;
  notes: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface ParticipantProfileData {
  participant: Participant;
  sessions: RecordingSession[];
  emotion_history: any[];
  motor_imagery_history: any[];
  summary: {
    total_sessions: number;
    last_session_date: string | null;
    assigned_tests: string[];
    registration_status: RegistrationStatus;
    is_ready_for_testing: boolean;
  };
}

export interface DeviceInfo {
  name: string;
  board: string;
  port: string;
  state: DeviceConnectionState;
  mode: OperatingMode;
  sampleRate: number;
  sampleRateMeasured?: number;
  channelCount?: number;
  firmware: string;
  lastSample: string | null;
  serialConnection: 'open' | 'closed' | 'error';
  filterCutoff?: string;
  gammaCapable?: boolean;
  gammaNote?: string;
  samples_received?: number;
  samplesReceived?: number;
  errors?: string[];
  isRecording?: boolean;
  isPaused?: boolean;
  activeSessionId?: string | null;
  connected?: boolean;
  device_name?: string | null;
  message?: string;
  errorMessage?: string;
  status?: string;
  samples_received_total?: number;
  lines_received_total?: number;
  invalid_lines_count?: number;
  last_updated?: string | null;
}

export interface TaskEvent {
  id: string;
  label: string;
  startTime: number;
  duration: number;
  type: 'setup' | 'baseline' | 'instruction' | 'task' | 'rest' | 'completion';
  description: string;
}

export interface ExportRecord {
  id?: string;
  sessionId: string;
  participantCode: string;
  date: string;
  format: 'CSV' | 'JSON' | 'EDF';
  sizeKB: number;
  status: 'ready' | 'processing' | 'failed';
  taskType?: string;
}

export interface EEGSample {
  time: number;
  raw: number;
  filtered: number;
  quality?: SignalQuality;
  clipping?: boolean;
  flatline?: boolean;
  noise?: boolean;
  fs?: number;
  mode?: OperatingMode;
}

export interface BandPower {
  band: string;
  baseline: number;
  task: number;
  range: string;
  relative?: number;
  disabled?: boolean;
  note?: string;
}

export interface LiveBandInfo {
  name: string;
  range_hz: string;
  power_uv2: number;
  relative_percent: number;
  is_available: boolean;
  unavailable_reason?: string | null;
}

export interface LiveDspBandAnalysis {
  status?: string;
  window_type?: string;
  is_full_window?: boolean;
  is_signal_valid?: boolean;
  validity_status?: string;
  validity_message?: string;
  clipping_count?: number;
  clipping_ratio?: number;
  sampling_rate_used: number;
  window_samples: number;
  buffer_capacity?: number;
  total_power_uv2: number;
  alpha_peak_hz: number | null;
  frequency_resolution_hz?: number;
  bands: {
    delta: LiveBandInfo;
    theta: LiveBandInfo;
    alpha: LiveBandInfo;
    beta: LiveBandInfo;
    gamma: LiveBandInfo;
  };
  psd_points: Array<{ freq: number; power: number }>;
}

export interface LiveSignalQuality {
  overall_quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR' | 'DISCONNECTED' | 'WARMING_UP';
  score: number;
  is_acceptable: boolean;
  clipping?: boolean;
  clipping_count?: number;
  is_pop?: boolean;
  is_unphysiological?: boolean;
  metrics: {
    snr_db?: number;
    flatline: boolean;
    clipping: boolean;
    clipping_count?: number;
    baseline_drift: boolean;
    high_freq_noise: boolean;
    is_pop?: boolean;
    is_unphysiological?: boolean;
    gap_count: number;
    mean_uv: number;
    std_uv: number;
    max_uv: number;
    min_uv: number;
  };
  flags: string[];
}

export interface LiveDspAnalysis {
  band_analysis: LiveDspBandAnalysis;
  quality: LiveSignalQuality;
  fs_measured: number;
  sample_count: number;
  buffer_capacity?: number;
  latest_sample?: string | null;
  status?: string;
}

export interface SerialPortInfo {
  port: string;
  description: string;
  hwid: string;
  is_arduino: boolean;
}

export interface EmotionPrediction {
  status: 'success' | 'insufficient_data' | 'unconfigured' | 'inconclusive';
  predicted_state: string;
  confidence: number;
  probabilities: Record<string, number>;
  features: Record<string, number>;
  model_version?: string;
  benchmark_dataset?: string;
  message?: string;
  valence?: {
    continuous_score: number;
    classification: string;
    calibrated_probability: number;
    confidence: number;
    conformal_interval_90?: [number, number];
  };
  arousal?: {
    continuous_score: number;
    classification: string;
    calibrated_probability: number;
    confidence: number;
    conformal_interval_90?: [number, number];
  };
  quadrant?: string;
  affect_label?: string;
  frontal_alpha_asymmetry?: number;
  timestamp?: string;
  session_id?: string;
  calibration_applied?: boolean;
  compatibility?: {
    compatible: boolean;
    channel_count: number;
    warnings: string[];
    caveat: string;
  };
}

export interface CmdAnalysisResult {
  result_label: 'Experimental task-related EEG response observed' | 'No reliable task-related response detected' | 'Inconclusive';
  protocol_name: string;
  target_band: string;
  baseline_power_uv2: number;
  task_power_uv2: number;
  power_shift_percent: number;
  p_value: number;
  repeatability: number;
  trials_analyzed: number;
  significant: boolean;
  details: string;
  disclaimer: string;
}

export interface MotorImageryResult {
  predicted_class?: 'LEFT_HAND' | 'RIGHT_HAND';
  classification?: string;
  confidence: number;
  probabilities: {
    LEFT_HAND?: number;
    RIGHT_HAND?: number;
    left?: number;
    right?: number;
  };
  model_name: string;
  csp_components?: number;
  sampling_rate: number;
  instruction?: string;
  input_source?: string;
  trial_duration_sec?: number;
  is_match?: boolean | null;
  is_experimental?: boolean;
}

export interface MotorImageryTrial {
  id: string;
  session_id: string;
  session_code: string;
  participant_code: string;
  timestamp: string;
  instruction: string;
  input_source: string;
  duration_seconds: number;
  predicted_movement: string;
  confidence: number;
  probabilities: {
    left?: number;
    right?: number;
  };
  model_name: string;
  is_match?: boolean | null;
  ground_truth?: string;
  is_accuracy_match?: boolean | null;
  is_experimental: boolean;
}

export interface QualityAnalysisResult {
  overall_quality: 'EXCELLENT' | 'GOOD' | 'FAIR' | 'POOR';
  quality_score: number;
  is_acceptable: boolean;
  channel_metrics?: Record<string, any>;
  artifacts_detected?: string[];
  snr_db?: number;
}

export interface Notification {
  id: string;
  title: string;
  message: string;
  time: string;
  type: 'info' | 'warning' | 'error' | 'success';
  read: boolean;
}
