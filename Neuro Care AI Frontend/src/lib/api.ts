import axios, { type AxiosInstance } from 'axios';
import type {
  DeviceInfo,
  Participant,
  RecordingSession,
  EmotionPrediction,
  CmdAnalysisResult,
  ExportRecord,
  OperatingMode,
  User,
  SessionStatus,
  QualityAnalysisResult,
  MotorImageryResult,
  MotorImageryTrial,
  EEGSample,
  LiveDspAnalysis,
  SerialPortInfo,
} from '@/types';

const isDevPort = typeof window !== 'undefined' && window.location.port === '5173';
const BASE_URL = isDevPort ? 'http://127.0.0.1:8000/api' : '/api';

// Create configured Axios client
export const apiClient: AxiosInstance = axios.create({
  baseURL: BASE_URL,
  headers: {
    'Content-Type': 'application/json',
  },
  timeout: 10000,
});

// Request interceptor: Attach demo authentication headers and role context
apiClient.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('neurocare_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
    const savedUser = localStorage.getItem('neurocare_user');
    if (savedUser) {
      try {
        const u = JSON.parse(savedUser);
        if (u.role) config.headers['x-user-role'] = u.role;
        if (u.id) config.headers['x-user-id'] = u.id;
        if (u.email) config.headers['x-user-email'] = u.email;
      } catch {
        // ignore parse error
      }
    }
  }
  return config;
});

// Response interceptor: Standardize error messages
apiClient.interceptors.response.use(
  (response) => response,
  (error) => {
    let message = 'An unexpected error occurred.';
    if (error.response?.data?.detail) {
      if (typeof error.response.data.detail === 'string') {
        message = error.response.data.detail;
      } else if (Array.isArray(error.response.data.detail)) {
        message = error.response.data.detail.map((d: any) => d.msg || JSON.stringify(d)).join('; ');
      }
    } else if (error.response?.data?.message) {
      message = error.response.data.message;
    } else if (error.message) {
      message = error.message;
    }
    return Promise.reject(new Error(message));
  }
);

// Map MongoDB serialized participant into frontend ViewModel
export function mapBackendParticipant(p: any): Participant {
  const code = p.participant_code || p.code || 'P-UNKNOWN';
  const consentObtained = p.consent?.obtained ?? true;
  return {
    id: p.id || p._id || '',
    participant_code: code,
    code,
    name: p.name || undefined,
    age: p.age,
    gender: p.gender,
    demographics: p.demographics || {},
    assigned_doctor: p.assigned_doctor || 'dr_neurologist',
    assigned_tests: p.assigned_tests || ['Live EEG', 'Emotion Recognition', 'Motor Imagery'],
    registration_status: p.registration_status || 'ready_for_testing',
    reviewed_at: p.reviewed_at || null,
    reviewed_by: p.reviewed_by || null,
    confirmed_at: p.confirmed_at || null,
    confirmed_by: p.confirmed_by || null,
    consent: p.consent || { obtained: consentObtained, obtained_at: p.created_at || null },
    consentStatus: p.status === 'withdrawn' ? 'withdrawn' : (consentObtained ? 'given' : 'withdrawn'),
    consentDate: p.consent?.obtained_at || p.created_at || undefined,
    status: p.status || 'active',
    withdrawal_reason: p.withdrawal_reason || null,
    withdrawn_at: p.withdrawn_at || null,
    calibration_profiles: p.calibration_profiles || [],
    created_by: p.created_by || 'system',
    sessionCount: 0,
    lastSessionDate: '—',
    notes: p.notes || '',
    createdAt: p.created_at,
    updatedAt: p.updated_at,
  };
}

// Map MongoDB serialized session into frontend ViewModel
export function mapBackendSession(s: any): RecordingSession {
  const durationSeconds = (s.started_at && s.ended_at)
    ? Math.max(0, Math.round((new Date(s.ended_at).getTime() - new Date(s.started_at).getTime()) / 1000))
    : null;

  return {
    id: s.id || s._id || '',
    session_code: s.session_code,
    participant_id: s.participant_id,
    participantCode: s.participant_id || 'P-UNKNOWN',
    created_by: s.created_by || 'system',
    protocol_name: s.protocol_name || 'Unassigned',
    taskType: s.protocol_name || 'Unassigned',
    data_mode: s.data_mode || 'HARDWARE',
    sampling_rate: s.sampling_rate ?? null,
    channel_count: s.channel_count ?? 1,
    status: (s.status as SessionStatus) || 'scheduled',
    ground_truth: s.ground_truth || null,
    started_at: s.started_at || null,
    paused_at: s.paused_at || null,
    ended_at: s.ended_at || null,
    created_at: s.created_at || new Date().toISOString(),
    updated_at: s.updated_at || new Date().toISOString(),
    duration: durationSeconds,
    sampleCount: null, // Untracked at session document level
    signalQuality: (s.quality_summary?.quality_grade?.toLowerCase() as any) || 'unassessed',
    completeness: null, // Unsupported/untracked on backend
    filterConfig: '0.5–29.5 Hz BP (Hardware)',
    date: s.started_at || s.created_at || new Date().toISOString(),
    notes: s.notes || s.ground_truth?.notes || '',
    events: s.events || [],
    device_info: s.device_info,
    calibration_info: s.calibration_info,
    quality_summary: s.quality_summary,
  };
}

// Typed API interaction layer
export const api = {
  // Device API
  getDeviceStatus: async (): Promise<DeviceInfo> => {
    const res = await apiClient.get<any>('/device/status');
    const d = res.data;
    const isConn = Boolean(d.connected);
    return {
      name: d.device_name || 'Arduino UNO R4 WiFi',
      board: 'Arduino UNO R4 WiFi',
      port: d.port || 'USB Serial',
      state: isConn ? 'connected' : 'disconnected',
      mode: (d.mode || 'HARDWARE') as any,
      sampleRate: 256,
      sampleRateMeasured: d.sample_rate_measured || 256.0,
      firmware: 'BioAmp-v2.1-UNO_R4',
      lastSample: d.latest_data || d.last_updated,
      serialConnection: isConn ? 'open' : 'closed',
      connected: isConn,
      device_name: d.device_name,
      message: d.message,
      last_updated: d.last_updated,
      isRecording: d.is_recording,
      activeSessionId: d.active_session_id,
      samples_received: d.samples_received,
      samplesReceived: d.samples_received,
    };
  },

  // Participants APIs
  getNextParticipantCode: async (): Promise<string> => {
    const res = await apiClient.get<{ next_code: string }>('/participants/next-code');
    return res.data.next_code;
  },

  getParticipants: async (
    filter?: string | { status?: string; registration_status?: string; role?: string; user_id?: string }
  ): Promise<Participant[]> => {
    const params = typeof filter === 'string' ? { status: filter } : filter;
    const res = await apiClient.get<{ total: number; participants: any[] }>('/participants', {
      params,
    });
    return (res.data.participants || []).map(mapBackendParticipant);
  },

  getParticipant: async (id: string, role?: string, user_id?: string): Promise<Participant> => {
    const res = await apiClient.get<any>(`/participants/${id}`, {
      params: (role || user_id) ? { role, user_id } : undefined,
    });
    return mapBackendParticipant(res.data);
  },

  getParticipantProfile: async (id: string, role?: string, user_id?: string): Promise<any> => {
    const res = await apiClient.get<any>(`/participants/${id}/profile`, {
      params: (role || user_id) ? { role, user_id } : undefined,
    });
    return {
      participant: mapBackendParticipant(res.data.participant),
      sessions: (res.data.sessions || []).map(mapBackendSession),
      emotion_history: res.data.emotion_history || [],
      motor_imagery_history: res.data.motor_imagery_history || [],
      summary: res.data.summary || {
        total_sessions: 0,
        last_session_date: null,
        assigned_tests: [],
        registration_status: 'ready_for_testing',
        is_ready_for_testing: true,
      },
    };
  },

  createParticipant: async (payload: {
    participant_code?: string;
    name?: string;
    age?: number;
    gender?: string;
    consent_obtained: boolean;
    assigned_doctor?: string;
    assigned_tests?: string[];
    demographics?: Record<string, any>;
    registration_status?: 'draft' | 'pending_confirmation' | 'ready_for_testing';
    notes?: string;
    created_by?: string;
  }): Promise<Participant> => {
    const res = await apiClient.post<{ message: string; participant: any }>('/participants', payload);
    return mapBackendParticipant(res.data.participant);
  },

  reviewParticipant: async (id: string, reviewed_by: string, notes?: string): Promise<Participant> => {
    const res = await apiClient.patch<{ message: string; participant: any }>(`/participants/${id}/review`, {
      reviewed_by,
      notes,
    });
    return mapBackendParticipant(res.data.participant);
  },

  confirmParticipant: async (
    id: string,
    confirmed_by: string,
    assigned_doctor?: string,
    assigned_tests?: string[],
    notes?: string
  ): Promise<Participant> => {
    const res = await apiClient.patch<{ message: string; participant: any }>(`/participants/${id}/confirm`, {
      confirmed_by,
      assigned_doctor,
      assigned_tests,
      notes,
    });
    return mapBackendParticipant(res.data.participant);
  },

  withdrawParticipant: async (id: string, reason?: string): Promise<Participant> => {
    const res = await apiClient.patch<{ message: string; participant: any }>(`/participants/${id}/withdraw`, { reason });
    return mapBackendParticipant(res.data.participant);
  },

  updateParticipantStatus: async (id: string, status: 'active' | 'inactive' | 'withdrawn'): Promise<{ message: string; status: string }> => {
    const res = await apiClient.patch<{ message: string; status: string }>(`/participants/${id}/status`, { status });
    return res.data;
  },

  // Sessions APIs
  getSessions: async (status?: string): Promise<RecordingSession[]> => {
    const res = await apiClient.get<{ total: number; sessions: any[] }>('/sessions', {
      params: status ? { status } : undefined,
    });
    return (res.data.sessions || []).map(mapBackendSession);
  },

  getSession: async (id: string): Promise<RecordingSession> => {
    const res = await apiClient.get<any>(`/sessions/${id}`);
    return mapBackendSession(res.data);
  },

  createSession: async (payload: {
    participant_id: string;
    created_by: string;
    data_mode?: string;
    sampling_rate?: number;
    channel_count?: number;
    protocol_name?: string;
  }): Promise<{ message: string; session: RecordingSession; sessionId: string }> => {
    const body = {
      participant_id: payload.participant_id,
      created_by: payload.created_by,
      data_mode: payload.data_mode || 'HARDWARE',
      sampling_rate: payload.sampling_rate ?? null,
      channel_count: payload.channel_count ?? 1,
      protocol_name: payload.protocol_name || 'Unassigned',
    };
    const res = await apiClient.post<{ message: string; session: any }>('/sessions', body);
    const mapped = mapBackendSession(res.data.session);
    return {
      message: res.data.message,
      session: mapped,
      sessionId: mapped.id,
    };
  },

  startSession: async (id: string): Promise<{ message: string; session: RecordingSession }> => {
    const res = await apiClient.patch<{ message: string; session: any }>(`/sessions/${id}/start`);
    return {
      message: res.data.message,
      session: mapBackendSession(res.data.session),
    };
  },

  stopSession: async (id: string): Promise<{ message: string; session: RecordingSession; durationSeconds: number | null }> => {
    const res = await apiClient.patch<{ message: string; session: any }>(`/sessions/${id}/stop`);
    const mapped = mapBackendSession(res.data.session);
    return {
      message: res.data.message,
      session: mapped,
      durationSeconds: mapped.duration,
    };
  },

  // EEG Records APIs
  getEegRecords: async (sessionId: string): Promise<{
    session_id: string;
    total_batches: number;
    total_samples: number;
    total_records: number;
    records: any[];
  }> => {
    const res = await apiClient.get<any>(`/sessions/${sessionId}/eeg-records`);
    const d = res.data;
    return {
      session_id: d.session_id,
      total_batches: d.total_batches ?? (d.records?.length || 0),
      total_samples: d.total_samples ?? 0,
      total_records: d.total_batches ?? (d.records?.length || 0),
      records: d.records || [],
    };
  },

  createEegRecord: async (sessionId: string, payload: {
    samples: number[][];
    sampling_rate: number;
    channel_names: string[];
    data_mode: string;
  }): Promise<{ message: string; record_id: string }> => {
    const res = await apiClient.post<{ message: string; record_id: string }>(`/sessions/${sessionId}/eeg-records`, payload);
    return res.data;
  },

  // Signal Quality Analysis
  analyzeQuality: async (sessionId: string, payload?: { requested_by?: string; role?: string }): Promise<QualityAnalysisResult> => {
    const res = await apiClient.post<{ message: string; analysis: any }>(`/sessions/${sessionId}/analyze-quality`, payload || {
      requested_by: 'clinician_01',
      role: 'clinician',
    });
    return res.data.analysis?.results || res.data;
  },

  // Motor Imagery Analysis (CSP + LDA, 64-channel, 128 Hz)
  analyzeMotorImagery: async (sessionId: string, payload?: {
    samples?: number[][];
    sampling_rate?: number;
    channel_names?: string[];
    instruction?: string;
    ground_truth?: string;
    input_source?: string;
    trial_duration_sec?: number;
  }): Promise<MotorImageryResult> => {
    const res = await apiClient.post<{ message: string; analysis: any }>(`/sessions/${sessionId}/analyze-motor-imagery`, {
      sampling_rate: 128,
      ...payload,
    });
    return res.data.analysis?.results || res.data;
  },

  injectPhysioNetReplay: async (sessionId: string, payload?: {
    subject_id?: string;
    movement?: string;
    trial_index?: number;
    instruction?: string;
  }) => {
    const res = await apiClient.post<{
      message: string;
      session_id: string;
      subject_id: string;
      trial_index: number;
      sample_count: number;
      channel_count: number;
      true_label: string;
      instruction: string;
    }>(`/sessions/${sessionId}/replay-physionet`, payload || {});
    return res.data;
  },

  getMotorImagerySubjects: async (): Promise<string[]> => {
    const res = await apiClient.get<{ total: number; subjects: string[] }>('/motor-imagery/subjects');
    return res.data.subjects;
  },

  getMotorImageryHistory: async (limit: number = 50): Promise<MotorImageryTrial[]> => {
    const res = await apiClient.get<{ total: number; trials: MotorImageryTrial[] }>(`/motor-imagery/history?limit=${limit}`);
    return res.data.trials;
  },

  getMotorImageryDatasetTrials: async (subjectId: string = 'S001'): Promise<{
    subject_id: string;
    total_trials: number;
    trials: Array<{ trial_index: number; movement: string; label_code: number }>;
  }> => {
    const res = await apiClient.get<{
      subject_id: string;
      total_trials: number;
      trials: Array<{ trial_index: number; movement: string; label_code: number }>;
    }>(`/motor-imagery/dataset-trials?subject_id=${subjectId}`);
    return res.data;
  },

  getMotorImagerySampleEpoch: async (subjectId: string = 'S001', trialIndex: number = 0, movement?: string): Promise<{
    subject_id: string;
    trial_index: number;
    samples: number[][];
    sampling_rate: number;
    channel_count: number;
    channel_names: string[];
    true_label: string;
    movement?: string;
    shape: number[];
    summary?: { min_uv: number; max_uv: number; mean_uv: number; std_uv: number };
  }> => {
    const url = `/motor-imagery/sample-epoch?subject_id=${subjectId}&trial_index=${trialIndex}${movement ? `&movement=${movement}` : ''}`;
    const res = await apiClient.get<{
      subject_id: string;
      trial_index: number;
      samples: number[][];
      sampling_rate: number;
      channel_count: number;
      channel_names: string[];
      true_label: string;
      movement?: string;
      shape: number[];
      summary?: { min_uv: number; max_uv: number; mean_uv: number; std_uv: number };
    }>(url);
    return res.data;
  },

  uploadMotorImageryEpoch: async (
    fileOrSamples: File | { samples: number[][]; source_name?: string }
  ): Promise<{
    valid: boolean;
    source_name: string;
    shape: number[];
    sampling_rate: number;
    channel_count: number;
    samples: number[][];
    summary: { min_uv: number; max_uv: number; mean_uv: number; std_uv: number };
  }> => {
    if (fileOrSamples instanceof File) {
      const formData = new FormData();
      formData.append('file', fileOrSamples);
      const res = await apiClient.post('/motor-imagery/upload-epoch', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      return res.data;
    } else {
      const res = await apiClient.post('/motor-imagery/upload-epoch', fileOrSamples);
      return res.data;
    }
  },

  // Ground Truth & Emotion Analysis
  submitGroundTruth: async (sessionId: string, payload: {
    valence: number;
    arousal: number;
    dominance?: number;
    liking?: number;
    assessment_method?: string;
    submitted_by: string;
    notes?: string;
  }) => {
    const res = await apiClient.post<{ message: string; session_id: string; ground_truth: any }>(`/sessions/${sessionId}/ground-truth`, payload);
    return res.data;
  },

  analyzeEmotion: async (sessionId: string, payload?: { use_calibration?: boolean; requested_by?: string; role?: string }) => {
    const res = await apiClient.post<{ message: string; analysis: any }>(`/sessions/${sessionId}/analyze-emotion`, payload || {
      use_calibration: true,
      requested_by: 'clinician_01',
      role: 'clinician',
    });
    return res.data;
  },

  getSessionEvaluation: async (sessionId: string) => {
    const res = await apiClient.get<any>(`/sessions/${sessionId}/evaluation`);
    return res.data;
  },

  calibrateParticipantEmotion: async (participantId: string, payload: {
    requested_by: string;
    role?: string;
    resting_session_id?: string;
    calibration_session_ids?: string[];
  }) => {
    const res = await apiClient.post<{ message: string; calibration_profile: any }>(`/participants/${participantId}/calibrate-emotion`, payload);
    return res.data;
  },

  getParticipantCalibration: async (participantId: string) => {
    const res = await apiClient.get<{
      participant_id: string;
      total_versions: number;
      active_profile: any;
      history: any[];
    }>(`/participants/${participantId}/calibration`);
    return res.data;
  },

  injectDeapReplay: async (sessionId: string, subject: string = 's29', trialIndex: number = 0) => {
    const res = await apiClient.post<{
      message: string;
      session_id: string;
      sample_count: number;
      channel_count: number;
      ground_truth?: any;
    }>(`/sessions/${sessionId}/replay-deap?subject=${subject}&trial_index=${trialIndex}`);
    return res.data;
  },

  getDevicePorts: async (): Promise<SerialPortInfo[]> => {
    const res = await apiClient.get<{ ports: SerialPortInfo[]; count: number }>('/device/ports');
    return res.data.ports;
  },
  connectDevice: async (
    portOrPayload?: string | { port?: string; baud_rate?: number; baudRate?: number },
    baudRate: number = 115200
  ): Promise<{ success: boolean; device: any }> => {
    let p: string | undefined;
    let b: number = baudRate;
    if (typeof portOrPayload === 'object' && portOrPayload !== null) {
      p = portOrPayload.port;
      b = portOrPayload.baud_rate ?? portOrPayload.baudRate ?? 115200;
    } else {
      p = portOrPayload;
    }
    const res = await apiClient.post('/device/connect', { port: p, baud_rate: b });
    return res.data;
  },
  disconnectDevice: async (): Promise<{ success: boolean; device: any }> => {
    const res = await apiClient.post('/device/disconnect');
    return res.data;
  },
  setDeviceMode: async (mode: OperatingMode): Promise<{ mode: string; status: string; device: any }> => {
    const res = await apiClient.post('/device/mode', { mode });
    return res.data;
  },
  startHardwareRecording: async (sessionId: string): Promise<any> => {
    const res = await apiClient.post('/device/start-recording', { session_id: sessionId });
    return res.data;
  },
  stopHardwareRecording: async (sessionId: string): Promise<any> => {
    const res = await apiClient.post('/device/stop-recording', { session_id: sessionId });
    return res.data;
  },
  getSessionPsd: async (sessionId: string): Promise<{
    session_id: string;
    total_samples: number;
    sampling_rate: number;
    band_analysis: any;
    quality: any;
    is_live: boolean;
  }> => {
    const res = await apiClient.post(`/sessions/${sessionId}/psd`);
    return res.data;
  },

  // Session Recording Controls & Event Markers
  pauseSession: async (id: string): Promise<{ message: string; session: RecordingSession }> => {
    const res = await apiClient.patch<{ message: string; session: any }>(`/sessions/${id}/pause`);
    return {
      message: res.data.message,
      session: mapBackendSession(res.data.session),
    };
  },

  resumeSession: async (id: string): Promise<{ message: string; session: RecordingSession }> => {
    const res = await apiClient.patch<{ message: string; session: any }>(`/sessions/${id}/resume`);
    return {
      message: res.data.message,
      session: mapBackendSession(res.data.session),
    };
  },

  addSessionEvent: async (sessionId: string, label: string, relativeTimeSec: number, notes?: string): Promise<any> => {
    const res = await apiClient.post(`/sessions/${sessionId}/events`, {
      label,
      relative_time_sec: relativeTimeSec,
      notes,
    });
    return res.data;
  },

  getSessionEvents: async (sessionId: string): Promise<any[]> => {
    const res = await apiClient.get<{ session_id: string; events: any[] }>(`/sessions/${sessionId}/events`);
    return res.data.events || [];
  },

  updateSessionNotes: async (sessionId: string, notes: string): Promise<{ message: string; notes: string }> => {
    const res = await apiClient.patch(`/sessions/${sessionId}/notes`, { notes });
    return res.data;
  },

  // Reports & Data Exports
  downloadSessionPdf: async (sessionId: string, sessionCode?: string) => {
    const res = await apiClient.get(`/sessions/${sessionId}/report/pdf`, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/pdf' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NeuroCare_Report_${sessionCode || sessionId}.pdf`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  downloadSessionCsv: async (sessionId: string, sessionCode?: string) => {
    const res = await apiClient.get(`/sessions/${sessionId}/export/csv`, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NeuroCare_${sessionCode || sessionId}_raw.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  downloadSessionJson: async (sessionId: string, sessionCode?: string) => {
    const res = await apiClient.get(`/sessions/${sessionId}/export/json`, { responseType: 'blob' });
    const blob = new Blob([res.data], { type: 'application/json' });
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `NeuroCare_${sessionCode || sessionId}_metadata.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  },

  exportMlDataset: async (trainSplitRatio: number = 0.8, sessionIds: string[] = []): Promise<any> => {
    const res = await apiClient.post('/datasets/export', {
      train_split_ratio: trainSplitRatio,
      session_ids: sessionIds,
    });
    return res.data;
  },

  // Legacy compat stubs with truthful error notices
  updateConsent: async () => {
    throw new Error('Consent editing is unsupported: Informed consent is recorded at participant intake and immutable.');
  },
  deleteParticipant: async () => {
    throw new Error('Participant deletion is unsupported by primary backend audit policy.');
  },
  setOperatingMode: async (mode?: OperatingMode) => {
    if (mode) {
      return api.setDeviceMode(mode);
    }
    throw new Error('Operating mode cannot be toggled without specifying mode.');
  },
  getReports: async (): Promise<ExportRecord[]> => {
    // Reports table is synthesized client-side from actual sessions
    const sessions = await api.getSessions();
    return sessions.map((s) => ({
      id: s.id,
      sessionId: s.id,
      participantCode: s.participantCode,
      date: s.date,
      format: 'JSON',
      sizeKB: 24,
      status: s.status === 'completed' ? 'ready' : 'processing',
      taskType: s.taskType,
    }));
  },
  getUsers: async (): Promise<User[]> => {
    return [
      { id: 'usr-1', email: 'dr.patel@neurocare.ai', name: 'Dr. Patel', role: 'doctor', active: true },
      { id: 'usr-2', email: 'clinician@neurocare.ai', name: 'Staff Clinician', role: 'clinician', active: true },
    ];
  },
  createUser: async () => {
    throw new Error('Backend user creation is not implemented. User credentials managed via local environment.');
  },
  toggleUserStatus: async () => {
    throw new Error('Backend user status toggle is not implemented.');
  },
  analyzeCmd: async () => {
    throw new Error('CMD Cognitive Motor Dissociation analysis is an experimental paradigm not supported by the primary backend.');
  },
  getCmdHistory: async () => {
    return [];
  },
  getEmotionModelInfo: async () => {
    return {
      version: '1.0.0',
      benchmark_dataset: 'DEAP 32-Channel EEG Dataset (Subjects s01-s32)',
      algorithm: 'Dual Ridge Continuous Regression (32 Ch @ 128 Hz)',
      group_kfold_balanced_accuracy: 0.50,
      held_out_rmse: { valence: 2.49, arousal: 2.13 },
      hardware_channel_limit: 32,
      supported_bandwidth: '4.0 - 45.0 Hz',
      disclaimer: 'Investigational research metric. Non-diagnostic affect categorization.',
    };
  },
  getEmotionHistory: async () => {
    try {
      const res = await apiClient.get<{ total: number; history: any[] }>('/emotion/history');
      return res.data.history || [];
    } catch {
      return [];
    }
  },
  predictEmotion: async () => {
    throw new Error('Real-time 1-channel emotion estimation is unsupported. Backend requires 32-channel DEAP replay.');
  },
  analyzeDsp: async () => {
    throw new Error('Generic DSP analysis endpoint is not implemented on primary backend. Use quality analysis or PSD endpoint instead.');
  },
};

// WebSocket Streaming Bridge: Real-time physical or demo EEG acquisition
let activeEegSocket: WebSocket | null = null;

export function sendEegWebSocketAction(action: string, payload: Record<string, any> = {}): boolean {
  if (activeEegSocket && activeEegSocket.readyState === WebSocket.OPEN) {
    activeEegSocket.send(JSON.stringify({ action, ...payload }));
    return true;
  }
  return false;
}

export function connectEegWebSocket(
  onData: (samples: EEGSample[], device: DeviceInfo, dsp?: LiveDspAnalysis) => void,
  onStatus?: (online: boolean) => void
): () => void {
  let isClosed = false;
  let socket: WebSocket | null = null;
  let reconnectTimer: any = null;

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const host = window.location.port === '5173' ? '127.0.0.1:8000' : window.location.host;
  const wsUrl = `${protocol}//${host}/ws/eeg`;

  function connect() {
    if (isClosed) return;
    try {
      socket = new WebSocket(wsUrl);

      socket.onopen = () => {
        activeEegSocket = socket;
        if (onStatus) onStatus(true);
      };

      socket.onmessage = (event) => {
        try {
          const payload = JSON.parse(event.data);
          if (payload.device) {
            const rawSamples: any[] = payload.samples || [];
            const devRaw = payload.device;
            const devInfo: DeviceInfo = {
              name: devRaw.device_name || 'Arduino UNO R4 WiFi',
              board: 'Arduino UNO R4 WiFi',
              port: devRaw.port || 'USB Serial',
              state: devRaw.connected ? 'connected' : 'disconnected',
              mode: devRaw.mode || 'HARDWARE',
              sampleRate: 256,
              sampleRateMeasured: devRaw.sample_rate_measured ?? 0.0,
              firmware: 'BioAmp-v2.1-UNO_R4',
              lastSample: devRaw.latest_data || null,
              serialConnection: devRaw.connected ? 'open' : 'closed',
              channelCount: 1,
              filterCutoff: '0.5–29.5 Hz',
              isRecording: devRaw.is_recording,
              activeSessionId: devRaw.active_session_id,
              samples_received: devRaw.samples_received ?? 0,
              samplesReceived: devRaw.samples_received ?? 0,
              samples_received_total: devRaw.samples_received_total ?? devRaw.samples_received ?? 0,
              lines_received_total: devRaw.lines_received_total ?? 0,
              invalid_lines_count: devRaw.invalid_lines_count ?? 0,
              status: devRaw.status,
              message: devRaw.message,
              errorMessage: devRaw.error_message,
            };
            const parsedSamples: EEGSample[] = rawSamples.map((s) => ({
              time: s.time,
              raw: s.raw,
              filtered: s.filtered,
            }));
            onData(parsedSamples, devInfo, payload.dsp);
          }
        } catch (parseErr) {
          console.error('Error parsing EEG WebSocket frame:', parseErr);
        }
      };

      socket.onclose = () => {
        if (activeEegSocket === socket) {
          activeEegSocket = null;
        }
        if (onStatus) onStatus(false);
        if (!isClosed) {
          reconnectTimer = setTimeout(connect, 1500);
        }
      };

      socket.onerror = () => {
        if (socket && socket.readyState === WebSocket.OPEN) {
          socket.close();
        }
      };
    } catch (err) {
      if (onStatus) onStatus(false);
      if (!isClosed) {
        reconnectTimer = setTimeout(connect, 2000);
      }
    }
  }

  connect();

  return () => {
    isClosed = true;
    if (activeEegSocket === socket) {
      activeEegSocket = null;
    }
    if (reconnectTimer) clearTimeout(reconnectTimer);
    if (socket) {
      socket.close();
      socket = null;
    }
    if (onStatus) onStatus(false);
  };
}
