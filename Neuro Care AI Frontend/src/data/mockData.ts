import type {
  RecordingSession,
  Participant,
  DeviceInfo,
  TaskEvent,
  ExportRecord,
  BandPower,
  Notification,
} from '@/types';

export const mockSessions: RecordingSession[] = [
  { id: 'EEG-2024-0312', participantCode: 'P-014', date: '2026-11-12T09:14:00', duration: 842, sampleCount: 211280, completeness: 99.8, signalQuality: 'excellent', status: 'completed', taskType: 'Motor Imagery', filterConfig: '0.5–29.5 Hz BP', notes: 'Clean recording, minimal artifacts.' },
  { id: 'EEG-2024-0311', participantCode: 'P-022', date: '2026-11-12T08:31:00', duration: 615, sampleCount: 154350, completeness: 98.2, signalQuality: 'good', status: 'completed', taskType: 'Visual Imagery', filterConfig: '0.5–29.5 Hz BP' },
  { id: 'EEG-2024-0310', participantCode: 'P-014', date: '2026-11-11T15:22:00', duration: 720, sampleCount: 180480, completeness: 97.5, signalQuality: 'good', status: 'completed', taskType: 'Motor Imagery', filterConfig: '0.5–29.5 Hz BP' },
  { id: 'EEG-2024-0309', participantCode: 'P-031', date: '2026-11-11T14:05:00', duration: 0, sampleCount: 0, completeness: 0, signalQuality: 'poor', status: 'failed', taskType: 'Resting State', filterConfig: '0.5–29.5 Hz BP', notes: 'Device disconnected at sample 1,204.' },
  { id: 'EEG-2024-0308', participantCode: 'P-022', date: '2026-11-11T11:18:00', duration: 530, sampleCount: 132920, completeness: 99.1, signalQuality: 'excellent', status: 'completed', taskType: 'Visual Imagery', filterConfig: '0.5–29.5 Hz BP' },
  { id: 'EEG-2024-0307', participantCode: 'P-019', date: '2026-11-10T16:45:00', duration: 680, sampleCount: 170420, completeness: 96.3, signalQuality: 'fair', status: 'completed', taskType: 'Motor Imagery', filterConfig: '0.5–29.5 Hz BP', notes: 'Some electrode impedance drift.' },
  { id: 'EEG-2024-0306', participantCode: 'P-027', date: '2026-11-10T13:30:00', duration: 490, sampleCount: 122940, completeness: 98.9, signalQuality: 'good', status: 'completed', taskType: 'Resting State', filterConfig: '0.5–29.5 Hz BP' },
  { id: 'EEG-2024-0305', participantCode: 'P-014', date: '2026-11-09T10:12:00', duration: 795, sampleCount: 199380, completeness: 99.5, signalQuality: 'excellent', status: 'completed', taskType: 'Motor Imagery', filterConfig: '0.5–29.5 Hz BP' },
  { id: 'EEG-2024-0304', participantCode: 'P-031', date: '2026-11-09T09:05:00', duration: 310, sampleCount: 77820, completeness: 94.1, signalQuality: 'fair', status: 'completed', taskType: 'Visual Imagery', filterConfig: '0.5–29.5 Hz BP' },
  { id: 'EEG-2024-0303', participantCode: 'P-019', date: '2026-11-08T14:48:00', duration: 560, sampleCount: 140560, completeness: 97.8, signalQuality: 'good', status: 'completed', taskType: 'Resting State', filterConfig: '0.5–29.5 Hz BP' },
  { id: 'EEG-2024-0302', participantCode: 'P-022', date: '2026-11-08T11:20:00', duration: 420, sampleCount: 105420, completeness: 99.3, signalQuality: 'excellent', status: 'completed', taskType: 'Motor Imagery', filterConfig: '0.5–29.5 Hz BP' },
  { id: 'EEG-2024-0301', participantCode: 'P-027', date: '2026-11-07T15:35:00', duration: 650, sampleCount: 163130, completeness: 98.5, signalQuality: 'good', status: 'completed', taskType: 'Visual Imagery', filterConfig: '0.5–29.5 Hz BP' },
];

export const mockParticipants: Participant[] = [
  { id: 'p1', code: 'P-014', consentStatus: 'given', sessionCount: 4, lastSessionDate: '2026-11-12', notes: 'Consistent signal quality across sessions.' },
  { id: 'p2', code: 'P-022', consentStatus: 'given', sessionCount: 3, lastSessionDate: '2026-11-12', notes: 'Left-handed participant. Noted for motor imagery protocol.' },
  { id: 'p3', code: 'P-031', consentStatus: 'given', sessionCount: 2, lastSessionDate: '2026-11-11', notes: 'Session EEG-2024-0309 failed due to USB disconnection.' },
  { id: 'p4', code: 'P-019', consentStatus: 'given', sessionCount: 2, lastSessionDate: '2026-11-10', notes: 'Mild electrode impedance drift noted in later trials.' },
  { id: 'p5', code: 'P-027', consentStatus: 'pending', sessionCount: 2, lastSessionDate: '2026-11-10', notes: 'Consent renewal pending for next cycle.' },
  { id: 'p6', code: 'P-035', consentStatus: 'given', sessionCount: 0, lastSessionDate: '—', notes: 'Enrolled, awaiting first session.' },
  { id: 'p7', code: 'P-041', consentStatus: 'withdrawn', sessionCount: 1, lastSessionDate: '2026-11-04', notes: 'Withdrew consent. Data scheduled for deletion.' },
];

export const mockDevice: DeviceInfo = {
  name: 'BioAmp EXG Pill',
  board: 'Arduino Nano (5V, ATmega328P)',
  port: '/dev/ttyUSB0',
  state: 'disconnected',
  mode: 'demo',
  sampleRate: 250,
  firmware: 'EXG-Pill v2.1 / Serial DAC @ 250 Hz',
  lastSample: null,
  serialConnection: 'closed',
  errors: [],
};

export const mockTaskEvents: TaskEvent[] = [
  { id: 'e1', label: 'Setup & Signal Check', startTime: 0, duration: 120, type: 'setup', description: 'Electrode placement, impedance check, baseline signal verification.' },
  { id: 'e2', label: 'Baseline Rest', startTime: 120, duration: 60, type: 'baseline', description: 'Eyes-closed resting state baseline recording.' },
  { id: 'e3', label: 'Instruction Onset', startTime: 180, duration: 15, type: 'instruction', description: 'Visual instruction: "Imagine opening your right hand."' },
  { id: 'e4', label: 'Mental Imagery Task', startTime: 195, duration: 45, type: 'task', description: 'Motor imagery — repeated hand-opening imagery.' },
  { id: 'e5', label: 'Rest Interval', startTime: 240, duration: 30, type: 'rest', description: 'Inter-trial rest period.' },
  { id: 'e6', label: 'Trial 2 — Instruction', startTime: 270, duration: 15, type: 'instruction', description: 'Visual instruction: "Imagine opening your left hand."' },
  { id: 'e7', label: 'Trial 2 — Imagery Task', startTime: 285, duration: 45, type: 'task', description: 'Motor imagery — repeated hand-opening imagery (left).' },
  { id: 'e8', label: 'Rest Interval', startTime: 330, duration: 30, type: 'rest', description: 'Inter-trial rest period.' },
  { id: 'e9', label: 'Session Completion', startTime: 360, duration: 30, type: 'completion', description: 'Post-task resting state and session wrap-up.' },
];

export const mockExports: ExportRecord[] = [
  { id: 'exp1', sessionId: 'EEG-2024-0312', participantCode: 'P-014', date: '2026-11-12T09:32:00', format: 'CSV', sizeKB: 1842, status: 'ready' },
  { id: 'exp2', sessionId: 'EEG-2024-0311', participantCode: 'P-022', date: '2026-11-12T08:48:00', format: 'CSV', sizeKB: 1345, status: 'ready' },
  { id: 'exp3', sessionId: 'EEG-2024-0310', participantCode: 'P-014', date: '2026-11-11T15:40:00', format: 'CSV', sizeKB: 1572, status: 'ready' },
  { id: 'exp4', sessionId: 'EEG-2024-0308', participantCode: 'P-022', date: '2026-11-11T11:30:00', format: 'CSV', sizeKB: 1158, status: 'ready' },
  { id: 'exp5', sessionId: 'EEG-2024-0307', participantCode: 'P-019', date: '2026-11-10T16:58:00', format: 'CSV', sizeKB: 1486, status: 'ready' },
  { id: 'exp6', sessionId: 'EEG-2024-0305', participantCode: 'P-014', date: '2026-11-09T10:28:00', format: 'CSV', sizeKB: 1738, status: 'ready' },
];

export const mockBandPowers: BandPower[] = [
  { band: 'Delta', baseline: 12.4, task: 10.2, range: '0.5–4 Hz' },
  { band: 'Theta', baseline: 8.1, task: 9.6, range: '4–8 Hz' },
  { band: 'Alpha', baseline: 15.3, task: 11.8, range: '8–13 Hz' },
  { band: 'Beta', baseline: 6.2, task: 9.1, range: '13–30 Hz' },
];

export const mockNotifications: Notification[] = [
  { id: 'n1', title: 'Session Completed', message: 'EEG-2024-0312 (P-014) completed successfully. 211,280 samples recorded.', time: '5 min ago', type: 'success', read: false },
  { id: 'n2', title: 'Device Disconnected', message: 'BioAmp EXG Pill lost connection on /dev/ttyUSB0 during session EEG-2024-0309.', time: '1 hr ago', type: 'error', read: false },
  { id: 'n3', title: 'Export Ready', message: 'CSV export for EEG-2024-0312 is ready for download.', time: '2 hr ago', type: 'info', read: true },
  { id: 'n4', title: 'Consent Renewal', message: 'Participant P-027 consent renewal is pending before the next session.', time: '4 hr ago', type: 'warning', read: true },
];

export function generateLiveEEG(points: number, phase = 0): { time: number; raw: number; filtered: number }[] {
  const data: { time: number; raw: number; filtered: number }[] = [];
  for (let i = 0; i < points; i++) {
    const t = (i + phase) * 0.004;
    const alpha = 25 * Math.sin(t * 2 * Math.PI * 10);
    const beta = 8 * Math.sin(t * 2 * Math.PI * 20);
    const delta = 15 * Math.sin(t * 2 * Math.PI * 2);
    const theta = 10 * Math.sin(t * 2 * Math.PI * 6);
    const noise = (Math.random() - 0.5) * 30;
    const filtered = alpha + beta + delta + theta + (Math.random() - 0.5) * 4;
    const raw = filtered + noise;
    data.push({ time: i, raw, filtered });
  }
  return data;
}

export function generateFrequencySpectrum() {
  const bands = ['0.5', '1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '15', '18', '20', '22', '25', '28'];
  return bands.map((f, i) => {
    const freq = parseFloat(f);
    let power = 5;
    if (freq < 4) power = 30 - freq * 5 + Math.random() * 3;
    else if (freq < 8) power = 15 - freq * 1.2 + Math.random() * 3;
    else if (freq < 13) power = 35 - Math.abs(freq - 10) * 4 + Math.random() * 3;
    else power = 12 - (freq - 13) * 0.4 + Math.random() * 2;
    return { frequency: f, power: Math.max(1, power), band: freq < 4 ? 'Delta' : freq < 8 ? 'Theta' : freq < 13 ? 'Alpha' : 'Beta' };
  });
}

export function generateTrialData(trialCount: number) {
  return Array.from({ length: trialCount }, (_, i) => ({
    trial: `T${i + 1}`,
    baseline: 20 + Math.random() * 8,
    task: 28 + Math.random() * 12,
  }));
}
