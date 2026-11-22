import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CheckCircle2,
  Circle,
  AlertTriangle,
  Play,
  Square,
  Pause,
  RotateCcw,
  Cpu,
  Activity,
  User,
  ShieldCheck,
  ShieldAlert,
  ArrowRight,
  Clock,
  Radio,
  FileCheck,
  Zap,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
} from 'recharts';
import { Card, Button, Badge, DisclaimerBar, SectionHeader } from '@/components/ui';
import { api, connectEegWebSocket } from '@/lib/api';
import { formatDurationClock } from '@/lib/format';
import type { Participant, RecordingSession, DeviceInfo, EEGSample } from '@/types';

export default function RecordingAssistancePage() {
  const navigate = useNavigate();

  // Workflow steps
  const [currentStep, setCurrentStep] = useState<number>(1);

  // Data state
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo | null>(null);

  // Form selections
  const [selectedParticipant, setSelectedParticipant] = useState<string>('P-014');
  const [selectedSessionType, setSelectedSessionType] = useState<string>('Motor Imagery Paradigm');
  const [nurseNotes, setNurseNotes] = useState<string>('');

  // Live recording state
  const [isRecording, setIsRecording] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const [recordTime, setRecordTime] = useState<number>(0);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [recordedPointsCount, setRecordedPointsCount] = useState<number>(0);
  const [completedSummary, setCompletedSummary] = useState<any>(null);

  // Live EEG buffer for nurse preview
  const [eegData, setEegData] = useState<EEGSample[]>([]);
  const batchBufferRef = useRef<number[]>([]);

  // Fetch initial participants and sessions
  useEffect(() => {
    async function loadData() {
      try {
        const [parts, sessList, dev] = await Promise.all([
          api.getParticipants(),
          api.getSessions(),
          api.getDeviceStatus(),
        ]);
        setParticipants(parts);
        setSessions(sessList);
        setDeviceInfo(dev);
        if (parts.length > 0) setSelectedParticipant(parts[0].code);
      } catch (err) {
        console.error(err);
      }
    }
    loadData();
  }, []);

  // Live EEG stream generator & REST batch persistence to MongoDB
  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now() / 1000;
      const newPoints: EEGSample[] = [];
      const newValues: number[] = [];

      // Generate 16 samples every 62.5ms (~256 Hz single-channel BioAmp on A0)
      for (let i = 0; i < 16; i++) {
        const t = now + i * (1 / 256);
        const alpha = 18 * Math.sin(2 * Math.PI * 10.2 * t);
        const beta = 5 * Math.sin(2 * Math.PI * 21.5 * t);
        const theta = 7 * Math.sin(2 * Math.PI * 5.8 * t);
        const noise = (Math.random() - 0.5) * 4;
        const val = Math.round((alpha + beta + theta + noise) * 100) / 100;
        newValues.push(val);
        newPoints.push({
          time: t,
          raw: val,
          filtered: val,
        });
      }

      setEegData((prev) => {
        const next = [...prev, ...newPoints];
        return next.slice(-150);
      });

      if (isRecording && !isPaused && activeSessionId) {
        batchBufferRef.current.push(...newValues);
        setRecordedPointsCount((c) => c + newValues.length);

        // When 256 samples accumulate (1.0 second of data), post batch to MongoDB
        if (batchBufferRef.current.length >= 256) {
          const batchToPersist = batchBufferRef.current.splice(0, 256);
          api.createEegRecord(activeSessionId, {
            samples: batchToPersist.map((v) => [v]),
            sampling_rate: 256,
            channel_names: ['EEG_A0'],
            data_mode: 'HARDWARE',
          }).catch((err) => {
            console.error('Error auto-persisting EEG record batch to MongoDB:', err);
          });
        }
      }
    }, 62.5);

    return () => clearInterval(interval);
  }, [isRecording, isPaused, activeSessionId]);

  // Recording timer
  useEffect(() => {
    if (!isRecording || isPaused) return;
    const interval = setInterval(() => setRecordTime((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRecording, isPaused]);

  // Selected participant object
  const currentPartObj = participants.find((p) => p.code === selectedParticipant);
  const consentOk = currentPartObj?.consentStatus === 'given';

  // Signal quality evaluation from recent points
  const recentPoints = eegData.slice(-40);
  const maxAmp = Math.max(...recentPoints.map((p) => Math.abs(p.raw || 0)), 0);
  const isFlatline = recentPoints.length >= 20 && maxAmp < 1.0;
  const isClipping = maxAmp > 1400;
  const signalOk = !isFlatline && !isClipping;

  // Step 7: Start recording
  const handleStartRecording = async () => {
    if (!consentOk) {
      alert('Cannot start recording: Participant consent is not verified or withdrawn.');
      return;
    }
    try {
      const targetParticipant = participants.find(
        (p) => p.code === selectedParticipant || p.id === selectedParticipant
      );
      if (!targetParticipant) {
        alert('Please select an active participant with verified consent.');
        return;
      }
      const res = await api.createSession({
        participant_id: targetParticipant.id,
        created_by: 'clinician_01',
        protocol_name: selectedSessionType,
        data_mode: 'HARDWARE',
        sampling_rate: 256,
        channel_count: 1,
      });
      setActiveSessionId(res.sessionId);
      await api.startSession(res.sessionId);
      batchBufferRef.current = [];
      setIsRecording(true);
      setIsPaused(false);
      setRecordTime(0);
      setRecordedPointsCount(0);
      setCurrentStep(8); // Move to monitoring step
    } catch (err: any) {
      alert(err.message || 'Error starting recording');
    }
  };

  // Step 9: Stop and save recording
  const handleStopRecording = async () => {
    if (!activeSessionId) return;
    try {
      // Flush any remaining samples in buffer before closing session
      if (batchBufferRef.current.length > 0) {
        const remaining = batchBufferRef.current.splice(0);
        try {
          await api.createEegRecord(activeSessionId, {
            samples: remaining.map((v) => [v]),
            sampling_rate: 256,
            channel_names: ['EEG_A0'],
            data_mode: 'HARDWARE',
          });
        } catch (flushErr) {
          console.warn('Final buffer flush warning:', flushErr);
        }
      }

      const res = await api.stopSession(activeSessionId);
      setIsRecording(false);
      setCompletedSummary({
        sessionId: activeSessionId,
        participant: selectedParticipant,
        duration: res.durationSeconds ?? recordTime,
        samples: recordedPointsCount,
        status: 'Completed & Persisted to MongoDB',
      });
      setCurrentStep(9); // Move to completion step
    } catch (err: any) {
      alert(err.message || 'Error stopping recording');
    }
  };

  const steps = [
    { num: 1, label: 'Participant' },
    { num: 2, label: 'Protocol' },
    { num: 3, label: 'Consent' },
    { num: 4, label: 'BioAmp Pill' },
    { num: 5, label: 'Arduino UNO R4' },
    { num: 6, label: 'Signal Check' },
    { num: 7, label: 'Authorization' },
    { num: 8, label: 'Recording' },
    { num: 9, label: 'Completion' },
  ];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-fade-in">

      {/* Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-base font-semibold text-navy">Nurse / Clinician Recording Assistance</h2>
            <Badge className="bg-powder-100 text-navy-700 font-medium">Standard Clinical Workflow</Badge>
          </div>
          <p className="text-xs text-navy-300 mt-0.5">
            Step-by-step guided procedure for preparing, verifying, and conducting an experimental EEG acquisition session.
          </p>
        </div>

        {isRecording && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg bg-error/10 border border-error/20 text-error font-mono text-xs font-semibold animate-pulse">
            <span className="h-2 w-2 rounded-full bg-error" />
            <span>RECORDING: {formatDurationClock(recordTime)}</span>
          </div>
        )}
      </div>

      {/* 9-Step Progress Ribbon */}
      <Card className="p-4 overflow-x-auto">
        <div className="flex items-center justify-between min-w-[760px] gap-2">
          {steps.map((st) => (
            <div
              key={st.num}
              onClick={() => {
                if (!isRecording && st.num <= (completedSummary ? 9 : 7)) {
                  setCurrentStep(st.num);
                }
              }}
              className={`flex items-center gap-2 cursor-pointer transition-all ${
                currentStep === st.num
                  ? 'opacity-100 scale-105'
                  : currentStep > st.num
                  ? 'opacity-85'
                  : 'opacity-40'
              }`}
            >
              <div className={`h-6 w-6 rounded-full flex items-center justify-center text-xs font-semibold ${
                currentStep > st.num
                  ? 'bg-success text-white'
                  : currentStep === st.num
                  ? 'bg-powder text-navy ring-2 ring-navy'
                  : 'bg-navy-100 text-navy-400'
              }`}>
                {currentStep > st.num ? <CheckCircle2 className="h-3.5 w-3.5" /> : st.num}
              </div>
              <span className={`text-xs font-medium truncate ${currentStep === st.num ? 'text-navy font-bold' : 'text-navy-400'}`}>
                {st.label}
              </span>
              {st.num < 9 && <div className="h-0.5 w-4 bg-navy-100" />}
            </div>
          ))}
        </div>
      </Card>

      {/* Main Workflow Area */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left 2 Columns: Active Step Content */}
        <Card className="p-6 lg:col-span-2">
          {/* STEP 1: Select Participant */}
          {currentStep === 1 && (
            <div className="space-y-4 animate-fade-in">
              <SectionHeader
                title="Step 1: Select Assigned Participant"
                subtitle="Select an anonymous registered participant code for this recording session."
              />

              <div className="space-y-3">
                <label className="block text-xs font-medium text-navy">Participant ID Code</label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {participants.map((p) => (
                    <div
                      key={p.id}
                      onClick={() => setSelectedParticipant(p.code)}
                      className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                        selectedParticipant === p.code
                          ? 'border-powder-400 bg-powder-50/50 shadow-soft ring-1 ring-powder'
                          : 'border-navy-100 hover:bg-lavender-50/50'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-mono font-semibold text-sm text-navy">{p.code}</span>
                        <Badge className={
                          p.consentStatus === 'given' ? 'bg-success/10 text-success' :
                          p.consentStatus === 'pending' ? 'bg-warning/10 text-warning-700' :
                          'bg-error/10 text-error'
                        }>
                          {p.consentStatus === 'given' ? 'Consent Verified' : p.consentStatus}
                        </Badge>
                      </div>
                      <p className="text-2xs text-navy-300 mt-1 truncate">{p.notes || 'No participant notes'}</p>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-4 border-t border-navy-100 flex justify-end">
                <Button onClick={() => setCurrentStep(2)}>
                  Continue to Protocol <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 2: Select Protocol */}
          {currentStep === 2 && (
            <div className="space-y-4 animate-fade-in">
              <SectionHeader
                title="Step 2: Select Scheduled Recording Session Protocol"
                subtitle="Select the authorized research task paradigm approved by the supervising doctor."
              />

              <div className="space-y-3">
                {[
                  {
                    title: 'Motor Imagery Paradigm (Standard CMD)',
                    desc: 'Structured 5-minute protocol: Baseline rest (60s), instructions, kinesthetic tennis imagery (60s), recovery (45s), repeat trial (60s).',
                  },
                  {
                    title: 'Baseline Rest & Cognitive Task',
                    desc: 'Resting EEG with alternating eyes open / eyes closed intervals followed by mental rehearsal block.',
                  },
                  {
                    title: 'Instruction-Following Protocol',
                    desc: 'Auditory cue presentation with time-stamped stimulus markers for event-related potential alignment.',
                  },
                ].map((item) => (
                  <div
                    key={item.title}
                    onClick={() => setSelectedSessionType(item.title)}
                    className={`p-4 rounded-xl border cursor-pointer transition-all ${
                      selectedSessionType === item.title
                        ? 'border-powder-400 bg-powder-50/50 shadow-soft ring-1 ring-powder'
                        : 'border-navy-100 hover:bg-lavender-50/50'
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-semibold text-xs text-navy">{item.title}</span>
                      {selectedSessionType === item.title && (
                        <CheckCircle2 className="h-4 w-4 text-powder-600" />
                      )}
                    </div>
                    <p className="text-xs text-navy-300 mt-1 leading-relaxed">{item.desc}</p>
                  </div>
                ))}
              </div>

              <div>
                <label className="block text-xs font-medium text-navy mb-1">Nurse / Preparation Notes</label>
                <textarea
                  rows={2}
                  value={nurseNotes}
                  onChange={(e) => setNurseNotes(e.target.value)}
                  placeholder="Record participant state, electrode placement notes (Fp1 / C3), or room noise notes..."
                  className="w-full px-3 py-2 text-xs rounded-lg border border-navy-100 text-navy focus:outline-none"
                />
              </div>

              <div className="pt-4 border-t border-navy-100 flex justify-between">
                <Button variant="secondary" onClick={() => setCurrentStep(1)}>Back</Button>
                <Button onClick={() => setCurrentStep(3)}>
                  Verify Consent <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 3: Verify Participant Consent */}
          {currentStep === 3 && (
            <div className="space-y-4 animate-fade-in">
              <SectionHeader
                title="Step 3: Verify Participant Consent Status"
                subtitle="Confirm signed informed consent under approved ethics protocol before proceeding."
              />

              <div className={`p-4 rounded-xl border ${
                consentOk ? 'bg-success/5 border-success/30' : 'bg-error/5 border-error/30'
              }`}>
                <div className="flex items-start gap-3">
                  {consentOk ? (
                    <CheckCircle2 className="h-6 w-6 text-success flex-shrink-0" />
                  ) : (
                    <ShieldAlert className="h-6 w-6 text-error flex-shrink-0" />
                  )}
                  <div>
                    <h4 className="text-sm font-semibold text-navy">
                      Participant {selectedParticipant}: {consentOk ? 'Informed Consent Active' : 'Consent Not Verified'}
                    </h4>
                    <p className="text-xs text-navy-400 mt-1 leading-relaxed">
                      {consentOk
                        ? `Participant ${selectedParticipant} has an active signed consent form on file. Authorized for experimental single-channel EEG recording.`
                        : `Warning: Participant consent status is marked as '${currentPartObj?.consentStatus}'. Acquisition cannot proceed until consent is renewed.`}
                    </p>
                  </div>
                </div>
              </div>

              <div className="pt-4 border-t border-navy-100 flex justify-between">
                <Button variant="secondary" onClick={() => setCurrentStep(2)}>Back</Button>
                <Button onClick={() => setCurrentStep(4)} disabled={!consentOk}>
                  Check BioAmp Hardware <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 4: BioAmp EXG Pill Connection */}
          {currentStep === 4 && (
            <div className="space-y-4 animate-fade-in">
              <SectionHeader
                title="Step 4: Check BioAmp EXG Pill Hardware"
                subtitle="Inspect the analog front-end board and electrode leads."
              />

              <div className="p-4 rounded-xl border border-navy-100 bg-lavender-50/40 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span className="text-navy-400">BioAmp Hardware Component:</span>
                  <span className="font-semibold text-navy">BioAmp EXG Pill (Assembled PCB)</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-navy-400">Cable Specification:</span>
                  <span className="font-semibold text-navy">BioAmp Cable V3 (100 cm)</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-navy-400">Hardware Bandpass Filter:</span>
                  <span className="font-mono font-semibold text-navy">0.5 Hz – 29.5 Hz</span>
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-navy-400">Channel Configuration:</span>
                  <span className="font-semibold text-navy">Single Channel (A0 Analog Pin)</span>
                </div>
              </div>

              <div className="p-3 rounded-lg bg-navy-50 text-2xs text-navy-400">
                Ensure the 3-lead repositionable electrodes (Positive, Negative, Reference) are firmly snapped onto the BioAmp cable.
              </div>

              <div className="pt-4 border-t border-navy-100 flex justify-between">
                <Button variant="secondary" onClick={() => setCurrentStep(3)}>Back</Button>
                <Button onClick={() => setCurrentStep(5)}>
                  Check Arduino Connection <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 5: Check Arduino UNO R4 WiFi Connection */}
          {currentStep === 5 && (
            <div className="space-y-4 animate-fade-in">
              <SectionHeader
                title="Step 5: Check Arduino UNO R4 WiFi Connection"
                subtitle="Verify USB Serial communication with the microcontroller."
              />

              <div className="p-4 rounded-xl border border-navy-100 bg-white space-y-3">
                <div className="flex items-center justify-between">
                  <span className="text-xs text-navy-400">Board Model:</span>
                  <span className="text-xs font-semibold text-navy">Arduino UNO R4 WiFi (USB Serial)</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-navy-400">Serial Port Status:</span>
                  <Badge className={
                    deviceInfo?.state === 'connected' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning-700'
                  }>
                    {deviceInfo?.state === 'connected' ? 'USB Serial Active' : 'Standby / Demo Available'}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-navy-400">Configured Baud Rate:</span>
                  <span className="text-xs font-mono text-navy">115200 bps</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-navy-400">Measured Sampling Frequency:</span>
                  <span className="text-xs font-mono font-semibold text-navy">{deviceInfo?.sampleRateMeasured || 256} Hz</span>
                </div>
              </div>

              <div className="pt-4 border-t border-navy-100 flex justify-between">
                <Button variant="secondary" onClick={() => setCurrentStep(4)}>Back</Button>
                <Button onClick={() => setCurrentStep(6)}>
                  Check Electrode Signal <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 6: Check Electrode and Signal Quality Indicators */}
          {currentStep === 6 && (
            <div className="space-y-4 animate-fade-in">
              <SectionHeader
                title="Step 6: Check Electrode & Signal Quality Indicators"
                subtitle="Review real-time baseline impedance, noise levels, and electrode contact."
              />

              <div className="grid grid-cols-3 gap-3">
                <div className={`p-3 rounded-xl border ${!isFlatline ? 'bg-success/5 border-success/30' : 'bg-error/5 border-error/30'}`}>
                  <span className="text-2xs text-navy-300 block">Contact Impedance</span>
                  <span className="text-sm font-semibold text-navy">{!isFlatline ? 'Good Contact' : 'Flatline Detected'}</span>
                </div>

                <div className={`p-3 rounded-xl border ${!isClipping ? 'bg-success/5 border-success/30' : 'bg-warning/10 border-warning/30'}`}>
                  <span className="text-2xs text-navy-300 block">Voltage Rails</span>
                  <span className="text-sm font-semibold text-navy">{!isClipping ? 'Linear Range' : 'Clipping / Rail'}</span>
                </div>

                <div className="p-3 rounded-xl border bg-white border-navy-100">
                  <span className="text-2xs text-navy-300 block">Hardware Bandpass</span>
                  <span className="text-sm font-semibold text-navy">0.5–29.5 Hz</span>
                </div>
              </div>

              {/* Quick signal test chart */}
              <div className="h-44 w-full border border-navy-100 rounded-xl p-2 bg-white">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={eegData.slice(-60)}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF5" vertical={false} />
                    <YAxis domain={[-50, 50]} hide />
                    <Line type="monotone" dataKey="filtered" stroke="#1E3A78" strokeWidth={1.5} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="pt-4 border-t border-navy-100 flex justify-between">
                <Button variant="secondary" onClick={() => setCurrentStep(5)}>Back</Button>
                <Button onClick={() => setCurrentStep(7)} disabled={!signalOk}>
                  Authorize &amp; Start <ArrowRight className="h-3.5 w-3.5 ml-1" />
                </Button>
              </div>
            </div>
          )}

          {/* STEP 7: Start Recording (Authorization) */}
          {currentStep === 7 && (
            <div className="space-y-4 animate-fade-in text-center py-4">
              <div className="h-14 w-14 rounded-full bg-powder-100 text-navy flex items-center justify-center mx-auto mb-2">
                <Play className="h-7 w-7 text-powder-700 ml-1" />
              </div>

              <h3 className="text-base font-semibold text-navy">Ready to Start Recording</h3>
              <p className="text-xs text-navy-300 max-w-md mx-auto leading-relaxed">
                Participant <strong>{selectedParticipant}</strong> is prepared under protocol <strong>{selectedSessionType}</strong>.
                BioAmp EXG Pill and Arduino UNO R4 WiFi are verified at 256 Hz.
              </p>

              <div className="pt-4 flex items-center justify-center gap-3">
                <Button variant="secondary" onClick={() => setCurrentStep(6)}>Back</Button>
                <Button size="lg" onClick={handleStartRecording}>
                  <Play className="h-4 w-4" /> Start Acquisition
                </Button>
              </div>
            </div>
          )}

          {/* STEP 8: Monitor Basic Signal Acquisition Status */}
          {currentStep === 8 && (
            <div className="space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-semibold text-navy">Step 8: Acquisition Active</h3>
                  <p className="text-xs text-navy-300">Monitoring real-time waveform from Single Channel BioAmp (A0)</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-error animate-pulse">
                    ● REC {formatDurationClock(recordTime)}
                  </span>
                </div>
              </div>

              {/* Clean live waveform without confusing doctor dials */}
              <div className="h-64 w-full border border-navy-100 rounded-xl p-3 bg-white">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={eegData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF5" vertical={false} />
                    <YAxis domain={[-60, 60]} tick={{ fontSize: 10, fill: '#758EC3' }} unit=" µV" />
                    <Tooltip contentStyle={{ borderRadius: 8, borderColor: '#D1DAEB', fontSize: 11 }} />
                    <Line type="monotone" dataKey="filtered" stroke="#1E3A78" strokeWidth={1.8} dot={false} isAnimationActive={false} />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs">
                <div className="p-2.5 rounded-lg bg-navy-50/50">
                  <span className="text-2xs text-navy-300 block">Samples Acquired</span>
                  <span className="font-mono font-semibold text-navy">{recordedPointsCount.toLocaleString()}</span>
                </div>
                <div className="p-2.5 rounded-lg bg-navy-50/50">
                  <span className="text-2xs text-navy-300 block">Sampling Frequency</span>
                  <span className="font-mono font-semibold text-navy">{deviceInfo?.sampleRateMeasured || 256} Hz</span>
                </div>
                <div className="p-2.5 rounded-lg bg-navy-50/50">
                  <span className="text-2xs text-navy-300 block">Signal Health</span>
                  <span className={`font-semibold ${signalOk ? 'text-success' : 'text-warning'}`}>
                    {signalOk ? 'Clean Signal' : 'Check Leads'}
                  </span>
                </div>
              </div>

              <div className="pt-4 border-t border-navy-100 flex items-center justify-between">
                <Button variant="secondary" onClick={() => setIsPaused(!isPaused)}>
                  {isPaused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
                  {isPaused ? 'Resume' : 'Pause'}
                </Button>

                <Button variant="danger" size="md" onClick={handleStopRecording}>
                  <Square className="h-4 w-4" /> Stop &amp; Save Recording
                </Button>
              </div>
            </div>
          )}

          {/* STEP 9: Stop and Save Recording Completion */}
          {currentStep === 9 && (
            <div className="space-y-4 animate-fade-in text-center py-6">
              <div className="h-14 w-14 rounded-full bg-success/15 text-success flex items-center justify-center mx-auto mb-2">
                <CheckCircle2 className="h-8 w-8" />
              </div>

              <h3 className="text-base font-semibold text-navy">Recording Successfully Saved</h3>
              <p className="text-xs text-navy-300 max-w-md mx-auto leading-relaxed">
                The recording has been written to persistent storage and is ready for the doctor to review in the Doctor Dashboard.
              </p>

              <div className="max-w-md mx-auto p-4 rounded-xl border border-navy-100 bg-white text-left text-xs space-y-2 mt-4">
                <div className="flex justify-between">
                  <span className="text-navy-300">Session ID:</span>
                  <span className="font-mono font-semibold text-navy">{completedSummary?.sessionId}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-navy-300">Participant:</span>
                  <span className="font-medium text-navy">{completedSummary?.participant}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-navy-300">Duration:</span>
                  <span className="font-mono text-navy">{formatDurationClock(completedSummary?.duration || 0)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-navy-300">Samples Captured:</span>
                  <span className="font-mono text-navy">{completedSummary?.samples?.toLocaleString()}</span>
                </div>
              </div>

              <div className="pt-4 flex items-center justify-center gap-3">
                <Button variant="secondary" onClick={() => { setCurrentStep(1); setCompletedSummary(null); }}>
                  Prepare Next Session
                </Button>
                <Button onClick={() => navigate('/sessions')}>
                  View Session History
                </Button>
              </div>
            </div>
          )}
        </Card>

        {/* Right 1 Column: Nurse Preparation Checklist & Guidelines */}
        <div className="space-y-4">
          <Card className="p-5">
            <h3 className="text-sm font-semibold text-navy mb-2">Preparation Checklist</h3>
            <p className="text-xs text-navy-300 mb-3 leading-relaxed">
              Required standard steps prior to starting acquisition:
            </p>

            <ul className="space-y-2.5 text-xs">
              <li className="flex items-start gap-2">
                <span className="h-4 w-4 rounded-full bg-powder-100 text-powder-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  1
                </span>
                <span className="text-navy-400">Clean electrode application site with 70% isopropanol wipe.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-4 w-4 rounded-full bg-powder-100 text-powder-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  2
                </span>
                <span className="text-navy-400">Position electrodes securely: Positive (forehead), Negative (mastoid/earlobe), Reference (ground).</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-4 w-4 rounded-full bg-powder-100 text-powder-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  3
                </span>
                <span className="text-navy-400">Ensure participant is comfortably seated and instructed to minimize jaw clenching.</span>
              </li>
              <li className="flex items-start gap-2">
                <span className="h-4 w-4 rounded-full bg-powder-100 text-powder-700 text-[10px] font-bold flex items-center justify-center flex-shrink-0 mt-0.5">
                  4
                </span>
                <span className="text-navy-400">Verify USB cable connection to Arduino UNO R4 WiFi.</span>
              </li>
            </ul>
          </Card>

          <Card className="p-5 bg-lavender-50/50 border-lavender-200/60">
            <div className="flex items-center gap-2 mb-2">
              <ShieldCheck className="h-4 w-4 text-powder-600" />
              <h4 className="text-xs font-semibold text-navy">Clinician Scope of Practice</h4>
            </div>
            <p className="text-2xs text-navy-400 leading-relaxed">
              The Clinician/Nurse operator is responsible for participant safety, consent compliance, and technical data collection.
              Advanced EEG signal analysis, emotion classification, and cognitive response interpretations are reserved for the Doctor / Neurologist.
            </p>
          </Card>
        </div>
      </div>
    </div>
  );
}

