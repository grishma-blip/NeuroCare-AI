import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams, useNavigate } from 'react-router-dom';
import {
  Play,
  Pause,
  Square,
  Activity,
  AlertTriangle,
  Zap,
  ShieldAlert,
  Cpu,
  Wifi,
  WifiOff,
  Radio,
  Layers,
  Info,
  CheckCircle2,
  BookmarkPlus,
  FileText,
  Download,
  Check,
  RefreshCw,
  Tag,
} from 'lucide-react';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  AreaChart,
  Area,
} from 'recharts';
import { Card, Button, Badge, DisclaimerBar } from '@/components/ui';
import { api, connectEegWebSocket, sendEegWebSocketAction } from '@/lib/api';
import { formatDurationClock } from '@/lib/format';
import type { EEGSample, DeviceInfo, LiveDspAnalysis, OperatingMode, Participant } from '@/types';

const BUFFER_MAX_POINTS = 300;

export default function LiveMonitoringPage() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  // Monitoring Pause State (Suspends waveform & frequency band calculations on frontend)
  const [isPaused, setIsPaused] = useState(false);
  const isPausedRef = useRef(false);
  isPausedRef.current = isPaused;

  const [isRecording, setIsRecording] = useState(false);
  const [sessionPaused, setSessionPaused] = useState(false);
  const [recordTime, setRecordTime] = useState(0);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);

  // Participants & Protocol state
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedParticipantId, setSelectedParticipantId] = useState<string>('');
  const [protocolName, setProtocolName] = useState('Single Channel BioAmp Acquisition');
  const [operatorNotes, setOperatorNotes] = useState('');
  const [customEventMarker, setCustomEventMarker] = useState('');
  const [eventMarkers, setEventMarkers] = useState<Array<{ id: string; label: string; relativeTime: number; notes?: string }>>([]);

  // Session completion feedback
  const [lastSavedSession, setLastSavedSession] = useState<{ id: string; code: string } | null>(null);

  const [wsOnline, setWsOnline] = useState(false);
  const [data, setData] = useState<EEGSample[]>([]);
  const [showRaw, setShowRaw] = useState(false);
  const [showFiltered, setShowFiltered] = useState(true);

  // Live DSP state received from backend
  const [liveDsp, setLiveDsp] = useState<LiveDspAnalysis | null>(null);

  // Device telemetry state
  const [deviceInfo, setDeviceInfo] = useState<DeviceInfo>({
    name: 'BioAmp EXG Pill Acquisition Unit',
    board: 'Arduino UNO R4 WiFi',
    port: 'USB Serial',
    state: 'disconnected',
    mode: 'HARDWARE',
    sampleRate: 256,
    sampleRateMeasured: 256.0,
    firmware: 'BioAmp-v2.1-UNO_R4',
    lastSample: null,
    serialConnection: 'closed',
    channelCount: 1,
    filterCutoff: '0.5–29.5 Hz',
  });

  // Load participants list
  useEffect(() => {
    async function loadParticipants() {
      try {
        const parts = await api.getParticipants();
        setParticipants(parts);
        const queryPart = searchParams.get('participant');
        if (queryPart) {
          const match = parts.find((p) => p.code === queryPart || p.id === queryPart);
          if (match) {
            setSelectedParticipantId(match.id);
            return;
          }
        }
        if (parts.length > 0 && !selectedParticipantId) {
          setSelectedParticipantId(parts[0].id);
        }
      } catch (err) {
        console.error('Failed to load participants:', err);
      }
    }
    loadParticipants();
  }, [searchParams]);

  // Connect to live WebSocket stream
  useEffect(() => {
    const disconnect = connectEegWebSocket(
      (newSamples, dev, dsp) => {
        // When monitoring is paused, freeze waveform updates and freeze DSP calculations!
        if (isPausedRef.current) {
          setDeviceInfo(dev);
          if (dev.isRecording !== undefined) {
            setIsRecording(Boolean(dev.isRecording));
            if (dev.activeSessionId) {
              setActiveSessionId(dev.activeSessionId);
            }
          }
          return;
        }

        if (newSamples.length > 0) {
          setData((prev) => {
            const next = [...prev, ...newSamples];
            return next.slice(-BUFFER_MAX_POINTS);
          });
        }
        setDeviceInfo(dev);
        if (dsp) {
          setLiveDsp(dsp);
        }
        if (dev.isRecording !== undefined) {
          setIsRecording(Boolean(dev.isRecording));
          if (dev.activeSessionId) {
            setActiveSessionId(dev.activeSessionId);
          }
        }
      },
      (online) => {
        setWsOnline(online);
      }
    );

    return () => {
      disconnect();
    };
  }, []);

  // Fetch initial device status
  useEffect(() => {
    async function loadStatus() {
      try {
        const dev = await api.getDeviceStatus();
        setDeviceInfo(dev);
        if (dev.isRecording && dev.activeSessionId) {
          setIsRecording(true);
          setActiveSessionId(dev.activeSessionId);
        }
      } catch (err) {
        console.error('Device status query error:', err);
      }
    }
    loadStatus();
  }, []);

  // Recording timer
  useEffect(() => {
    if (!isRecording || sessionPaused) return;
    const interval = setInterval(() => setRecordTime((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, [isRecording, sessionPaused]);

  const handleConnectDevice = async () => {
    try {
      const res = await api.connectDevice({
        port: deviceInfo.port || 'AUTO',
        baud_rate: 115200,
      });
      if (res.success) {
        setDeviceInfo((prev) => ({
          ...prev,
          state: 'connected',
          serialConnection: 'open',
          port: res.device?.port || prev.port,
        }));
      } else {
        alert(res.device?.error_message || 'Could not connect to Arduino serial port. Check USB connection.');
      }
    } catch (err: any) {
      alert(err.message || 'Connection attempt failed.');
    }
  };

  // Signal quality evaluation from live DSP or recent buffer
  const recentData = data.slice(-50);
  const maxAmp = Math.max(...recentData.map((d) => Math.abs(d.raw || 0)), 0);
  const isFlatline = liveDsp?.quality?.metrics?.flatline ?? (recentData.length >= 20 && maxAmp < 1.0);
  const isClipping = liveDsp?.quality?.metrics?.clipping ?? (maxAmp >= 980);
  const isNoisy = liveDsp?.quality?.metrics?.high_freq_noise ?? false;
  const isDrift = liveDsp?.quality?.metrics?.baseline_drift ?? false;

  const bandAnalysis = liveDsp?.band_analysis;
  const isSignalValid = bandAnalysis?.is_signal_valid ?? (!isClipping && !isFlatline && !isDrift && (liveDsp?.quality?.score ?? 100) >= 50);
  const validityStatus = bandAnalysis?.validity_status || (isClipping ? 'SATURATED_CLIPPING' : isDrift ? 'BASELINE_DRIFT' : isFlatline ? 'FLATLINE' : 'VALID');
  const validityMsg = bandAnalysis?.validity_message || '';

  const deltaPower = bandAnalysis?.bands?.delta?.power_uv2 ?? 0;
  const deltaRel = bandAnalysis?.bands?.delta?.relative_percent ?? 0;
  const thetaPower = bandAnalysis?.bands?.theta?.power_uv2 ?? 0;
  const thetaRel = bandAnalysis?.bands?.theta?.relative_percent ?? 0;
  const alphaPower = bandAnalysis?.bands?.alpha?.power_uv2 ?? 0;
  const alphaRel = bandAnalysis?.bands?.alpha?.relative_percent ?? 0;
  const betaPower = bandAnalysis?.bands?.beta?.power_uv2 ?? 0;
  const betaRel = bandAnalysis?.bands?.beta?.relative_percent ?? 0;
  const alphaPeak = bandAnalysis?.alpha_peak_hz ?? null;
  const psdPoints = bandAnalysis?.psd_points ?? [];

  const hasValidBandPower =
    deviceInfo.state === 'connected' &&
    (bandAnalysis?.total_power_uv2 ?? 0) > 0 &&
    liveDsp?.status !== 'WARMING_UP' &&
    liveDsp?.status !== 'NO_DATA' &&
    liveDsp?.status !== 'DISCONNECTED';

  const handleTogglePauseMonitoring = useCallback(() => {
    setIsPaused((prev) => {
      const next = !prev;
      isPausedRef.current = next;
      if (next) {
        sendEegWebSocketAction('pause_monitoring');
      } else {
        sendEegWebSocketAction('resume_monitoring');
      }
      return next;
    });
  }, []);

  const handleStartRecording = useCallback(async () => {
    try {
      const target = participants.find((p) => p.id === selectedParticipantId) || participants[0];
      if (!target) {
        alert('Please enroll an active participant first before recording.');
        return;
      }
      if (target.status === 'withdrawn') {
        alert('Cannot record session: Selected participant has withdrawn informed consent.');
        return;
      }
      if ((deviceInfo.mode === 'HARDWARE' || deviceInfo.mode === 'HARDWARE_TEST') && deviceInfo.state !== 'connected') {
        alert('Cannot start recording: Arduino serial device is not connected. Connect the Arduino UNO R4 to USB or select PHYSIOLOGICAL DEMO mode.');
        return;
      }
      if (deviceInfo.state === 'connected' && (!isSignalValid || isClipping)) {
        const proceed = window.confirm(
          `Warning: Signal quality is currently UNACCEPTABLE (${validityStatus || 'CONTAMINATED'}).\n\n` +
          `Detected physical artifact: ${validityMsg || 'ADC rail saturation (±1033 µV) or severe baseline drift.'}\n\n` +
          'Data recorded during this period will reflect physical artifacts rather than genuine cortical EEG.\n\n' +
          'Do you wish to start recording anyway for technical/diagnostic analysis?'
        );
        if (!proceed) return;
      }
      const res = await api.createSession({
        participant_id: target.id,
        created_by: 'clinician_01',
        protocol_name: protocolName,
        data_mode: deviceInfo.mode === 'DEMO' ? 'SIMULATION' : 'HARDWARE',
        sampling_rate: 256,
        channel_count: 1,
      });
      setActiveSessionId(res.sessionId);
      await api.startSession(res.sessionId);
      setIsRecording(true);
      setSessionPaused(false);
      setRecordTime(0);
      setEventMarkers([]);
      setLastSavedSession(null);
    } catch (err: any) {
      alert(err.message || 'Error starting session on backend');
    }
  }, [selectedParticipantId, participants, protocolName, deviceInfo.mode, deviceInfo.state, isSignalValid, isClipping, validityStatus, validityMsg]);

  const handleTogglePause = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      if (sessionPaused) {
        await api.resumeSession(activeSessionId);
        setSessionPaused(false);
      } else {
        await api.pauseSession(activeSessionId);
        setSessionPaused(true);
      }
    } catch (err: any) {
      alert(err.message || 'Failed to toggle session recording pause state');
    }
  }, [activeSessionId, sessionPaused]);

  const handleStopRecording = useCallback(async () => {
    if (activeSessionId) {
      try {
        const res = await api.stopSession(activeSessionId);
        const sampleCount = res.session?.sampleCount ?? deviceInfo.samples_received ?? data.length;
        if (sampleCount === 0) {
          alert('Warning: 0 hardware samples were collected during this recording session. Please verify that the Arduino USB serial connection is active.');
        }
        setLastSavedSession({
          id: activeSessionId,
          code: res.session.session_code || activeSessionId,
        });
      } catch (err: any) {
        console.error('Stop session failed:', err);
      }
    }
    setIsRecording(false);
    setSessionPaused(false);
  }, [activeSessionId, deviceInfo.samples_received, data.length]);

  const handleAddEventMarker = async (label: string, notes?: string) => {
    if (!activeSessionId) return;
    try {
      const res = await api.addSessionEvent(activeSessionId, label, recordTime, notes);
      setEventMarkers((prev) => [
        ...prev,
        {
          id: res.event?.id || `evt_${Date.now()}`,
          label,
          relativeTime: recordTime,
          notes,
        },
      ]);
      setCustomEventMarker('');
    } catch (err: any) {
      console.error('Failed to log event marker:', err);
    }
  };

  const handleUpdateNotes = async (notes: string) => {
    setOperatorNotes(notes);
    if (activeSessionId) {
      try {
        await api.updateSessionNotes(activeSessionId, notes);
      } catch (err) {
        console.error('Failed to auto-save notes:', err);
      }
    }
  };

  const handleToggleMode = async (newMode: OperatingMode) => {
    try {
      const res = await api.setDeviceMode(newMode);
      setDeviceInfo((prev) => ({
        ...prev,
        mode: res.mode as OperatingMode,
        state: res.device?.connected ? 'connected' : 'disconnected',
      }));
    } catch (err: any) {
      alert(err.message || 'Failed to switch acquisition mode');
    }
  };

  return (
    <div className="space-y-5 max-w-[1400px] mx-auto animate-fade-in pb-10">

      {/* Top Telemetry & Mode Selector Strip */}
      <div className="flex flex-wrap items-center justify-between gap-3 p-3 bg-white rounded-xl border border-navy-100 shadow-soft">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-2">
            {wsOnline ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
                <Wifi className="h-3.5 w-3.5" /> WebSocket Stream Live
              </span>
            ) : (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                <WifiOff className="h-3.5 w-3.5" /> Connecting to WebSocket...
              </span>
            )}
          </div>
          <span className="text-navy-200">|</span>
          <div className="flex items-center gap-1.5">
            {deviceInfo.state === 'connected' ? (
              <span className="flex items-center gap-1.5 text-xs font-semibold text-success">
                <Radio className="h-3.5 w-3.5" /> Serial Connected ({deviceInfo.port || 'USB CDC'} @ 115200)
              </span>
            ) : (
              <div className="flex items-center gap-2">
                <span className="flex items-center gap-1.5 text-xs font-semibold text-warning">
                  <AlertTriangle className="h-3.5 w-3.5" /> Serial Disconnected
                </span>
                <Button size="sm" variant="secondary" onClick={handleConnectDevice} className="py-0.5 px-2 text-2xs">
                  <RefreshCw className="h-2.5 w-2.5 mr-1" /> Reconnect Port
                </Button>
              </div>
            )}
          </div>
          <span className="text-navy-200">|</span>
          <div className="flex items-center gap-1.5 text-xs text-navy-600">
            <span className="font-medium text-navy-400">Measured fs:</span>
            <span className="font-mono font-bold text-navy">
              {deviceInfo.sampleRateMeasured ? `${deviceInfo.sampleRateMeasured} Hz` : '-- Hz'}
            </span>
          </div>
        </div>

        {/* Operating Mode Selector */}
        <div className="flex items-center gap-2">
          <span className="text-xs text-navy-400 font-medium">Acquisition Mode:</span>
          <div className="flex items-center rounded-lg border border-navy-100 p-0.5 bg-navy-50/50">
            <button
              type="button"
              onClick={() => handleToggleMode('HARDWARE')}
              className={`px-3 py-1 rounded-md text-2xs font-semibold transition-all ${deviceInfo.mode === 'HARDWARE' || deviceInfo.mode === 'HARDWARE_TEST'
                ? 'bg-navy text-white shadow-soft'
                : 'text-navy-400 hover:text-navy'
                }`}
            >
              PHYSICAL HARDWARE
            </button>
            <button
              type="button"
              onClick={() => handleToggleMode('DEMO')}
              className={`px-3 py-1 rounded-md text-2xs font-semibold transition-all ${deviceInfo.mode === 'DEMO'
                ? 'bg-navy text-white shadow-soft'
                : 'text-navy-400 hover:text-navy'
                }`}
            >
              PHYSIOLOGICAL DEMO
            </button>
          </div>
        </div>
      </div>

      {/* Port Contention Warning Banner */}
      {deviceInfo.errorMessage && deviceInfo.state !== 'connected' && (
        <Card className="p-3 bg-warning/10 border border-warning/30 shadow-soft flex items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
            <div>
              <span className="font-semibold text-navy">Serial Port Issue: </span>
              <span className="text-navy-600">{deviceInfo.errorMessage}</span>
            </div>
          </div>
          <Button size="sm" variant="secondary" onClick={handleConnectDevice}>
            <RefreshCw className="h-3 w-3 mr-1" /> Retry Connection
          </Button>
        </Card>
      )}

      {/* Pre-Recording Readiness Checklist Banner */}
      <div className="p-3 bg-white rounded-xl border border-navy-100 shadow-soft flex flex-wrap items-center justify-between gap-3 text-xs">
        <div className="flex items-center gap-2">
          <span className="font-semibold text-navy">Acquisition Readiness:</span>
          <span className="text-navy-400">Pre-recording hardware &amp; subject checklist</span>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            {deviceInfo.state === 'connected' || deviceInfo.mode === 'DEMO' ? (
              <span className="flex items-center gap-1 text-success font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> 1. Device Connected
              </span>
            ) : (
              <span className="flex items-center gap-1 text-warning font-medium">
                <AlertTriangle className="h-3.5 w-3.5" /> 1. Disconnected
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {Math.abs((deviceInfo.sampleRateMeasured || 256) - 256) < 15 ? (
              <span className="flex items-center gap-1 text-success font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> 2. Signal Stream (256 Hz)
              </span>
            ) : (
              <span className="flex items-center gap-1 text-navy-400 font-medium">
                2. Clock: {deviceInfo.sampleRateMeasured || 256} Hz
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {deviceInfo.state !== 'connected' ? (
              <span className="flex items-center gap-1 text-navy-400 font-medium">
                3. Quality: Offline
              </span>
            ) : isClipping ? (
              <span className="flex items-center gap-1 text-error font-medium" title="Raw ADC saturated at ±1033 µV rails. Check electrode contact.">
                <AlertTriangle className="h-3.5 w-3.5" /> 3. ADC Saturated (Check Electrodes)
              </span>
            ) : isFlatline ? (
              <span className="flex items-center gap-1 text-error font-medium" title="Flatline signal (<1 µV). Check electrode leads.">
                <AlertTriangle className="h-3.5 w-3.5" /> 3. Flatline (Check Electrodes)
              </span>
            ) : isDrift ? (
              <span className="flex items-center gap-1 text-warning font-medium" title="DC baseline drift >100 µV. Allow amplifier to settle.">
                <AlertTriangle className="h-3.5 w-3.5" /> 3. Baseline Drift (Settling...)
              </span>
            ) : isNoisy ? (
              <span className="flex items-center gap-1 text-warning font-medium" title="High frequency noise / EMG detected.">
                <AlertTriangle className="h-3.5 w-3.5" /> 3. Muscle / EMG Artifact
              </span>
            ) : isSignalValid ? (
              <span className="flex items-center gap-1 text-success font-medium">
                <CheckCircle2 className="h-3.5 w-3.5" /> 3. Signal Quality Clean
              </span>
            ) : (
              <span className="flex items-center gap-1 text-warning font-medium">
                <AlertTriangle className="h-3.5 w-3.5" /> 3. Check Electrodes ({liveDsp?.quality?.overall_quality || 'Poor'})
              </span>
            )}
          </div>

          <div className="flex items-center gap-1.5">
            {deviceInfo.state === 'connected' && isSignalValid && !sessionPaused ? (
              <span className="flex items-center gap-1 text-success font-bold">
                <CheckCircle2 className="h-3.5 w-3.5" /> 4. Recording Ready
              </span>
            ) : (
              <span className="flex items-center gap-1 text-navy-400 font-medium">
                4. Recording Blocked (Poor Signal)
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Main Oscilloscope Card */}
      <Card className="p-5 shadow-card bg-white border border-navy-100">
        {/* Oscilloscope Header Console */}
        <div className="flex flex-wrap items-center justify-between gap-4 pb-4 mb-4 border-b border-navy-100/80">
          <div>
            <div className="flex items-center gap-2">
              <span
                className={`h-2.5 w-2.5 rounded-full ${deviceInfo.state === 'connected' ? 'bg-success animate-pulse' : 'bg-warning'
                  }`}
              />
              <h2 className="text-base font-bold text-navy tracking-tight">
                Single-Channel Oscilloscope (Ch 1 / BioAmp A0)
              </h2>
              <Badge className="bg-lavender-100 text-navy-700 font-mono text-2xs">
                {deviceInfo.sampleRateMeasured || 256.0} Hz
              </Badge>
              <Badge
                className={
                  deviceInfo.mode === 'DEMO'
                    ? 'bg-peach-100 text-peach-700 font-mono text-2xs'
                    : 'bg-powder-100 text-powder-800 font-mono text-2xs'
                }
              >
                {deviceInfo.mode.toUpperCase()}
              </Badge>
            </div>
            <p className="text-xs text-navy-400 mt-0.5">
              BioAmp EXG Pill · Analog Bandpass Filter 0.5–29.5 Hz · ±1033 µV 12-bit ADC Dynamic Range
            </p>
          </div>

          {/* Console Controls */}
          <div className="flex items-center gap-3">
            {/* Filter Toggle */}
            <div className="flex items-center gap-2 text-xs text-navy-400 bg-navy-50/50 p-1 rounded-lg border border-navy-100">
              <button
                type="button"
                onClick={() => setShowFiltered(!showFiltered)}
                className={`px-2.5 py-1 rounded text-2xs font-medium transition-colors ${showFiltered ? 'bg-white text-navy shadow-soft' : 'text-navy-300'
                  }`}
              >
                Filtered (0.5–29.5 Hz)
              </button>
              <button
                type="button"
                onClick={() => setShowRaw(!showRaw)}
                className={`px-2.5 py-1 rounded text-2xs font-medium transition-colors ${showRaw ? 'bg-white text-navy shadow-soft' : 'text-navy-300'
                  }`}
              >
                Raw Signal
              </button>
            </div>

            {/* Pause / Resume Monitoring button */}
            <Button
              size="sm"
              variant="secondary"
              onClick={handleTogglePauseMonitoring}
              className={isPaused ? 'bg-warning/10 text-warning-700 border-warning/30 font-semibold' : ''}
            >
              {isPaused ? <Play className="h-3 w-3 mr-1" /> : <Pause className="h-3 w-3 mr-1" />}
              {isPaused ? 'Resume Monitoring' : 'Pause Monitoring'}
            </Button>
          </div>
        </div>

        {/* Real-time Oscilloscope Display */}
        <div className="relative h-80 w-full bg-navy-50/20 rounded-xl p-2 border border-navy-50">
          {/* Pause Monitoring Canvas Overlay */}
          {isPaused && (
            <div className="absolute top-4 left-4 z-10 flex items-center gap-2 px-3 py-1.5 rounded-lg bg-warning/95 text-navy font-bold text-2xs shadow-card backdrop-blur-sm border border-warning">
              <Pause className="h-3.5 w-3.5 text-warning-900" />
              <span>MONITORING PAUSED (WAVEFORM &amp; SPECTRUM FROZEN)</span>
            </div>
          )}

          {/* Signal Quality Warnings Overlay */}
          {(isFlatline || isClipping || isNoisy || isDrift) && (
            <div className="absolute top-4 right-4 z-10 flex flex-col gap-1.5">
              {isFlatline && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-error text-white text-2xs font-semibold shadow-soft animate-pulse">
                  <AlertTriangle className="h-3 w-3" /> Flatline Alert (&lt;1.0 µV): Check Electrode Contact
                </div>
              )}
              {isClipping && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-error text-white text-2xs font-semibold shadow-soft animate-pulse">
                  <ShieldAlert className="h-3 w-3" /> ADC Rail Saturation (±1033 µV): Floating Electrode / Check Contact
                </div>
              )}
              {isNoisy && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-peach-600 text-white text-2xs font-semibold shadow-soft">
                  <Zap className="h-3 w-3" /> High Frequency / EMG Muscle Artifact
                </div>
              )}
              {isDrift && (
                <div className="flex items-center gap-1.5 px-2.5 py-1 rounded bg-lavender-500 text-white text-2xs font-semibold shadow-soft">
                  <Activity className="h-3 w-3" /> DC Baseline Drift (&gt;100 µV)
                </div>
              )}
            </div>
          )}

          {data.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-navy-300 text-xs gap-2">
              <Activity className="h-8 w-8 animate-pulse text-navy-200" />
              <span className="font-semibold text-navy-600">
                {deviceInfo.state === 'connected'
                  ? 'Serial Connected — Receiving and rendering microvolt stream...'
                  : 'Serial Disconnected — Waiting for Arduino USB CDC connection'}
              </span>
              <span className="text-2xs text-navy-400">
                {deviceInfo.state === 'connected'
                  ? `Port: ${deviceInfo.port || 'USB'} @ ${deviceInfo.sampleRate || 256} Hz · BioAmp EXG Pill A0`
                  : 'Ensure Arduino UNO R4 WiFi is plugged in and Arduino IDE Serial Monitor is closed'}
              </span>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data} margin={{ top: 15, right: 15, left: -10, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF5" vertical={false} />
                <XAxis dataKey="time" hide />
                <YAxis
                  domain={[-100, 100]}
                  tick={{ fontSize: 10, fill: '#758EC3' }}
                  unit=" µV"
                />
                <Tooltip
                  formatter={(val: any, name: any) => [
                    `${val} µV`,
                    name === 'filtered' ? 'Filtered (0.5–29.5 Hz)' : 'Raw BioAmp'
                  ]}
                  labelFormatter={() => 'Real-Time EEG'}
                  contentStyle={{ borderRadius: 8, borderColor: '#D1DAEB', fontSize: 11 }}
                />
                <ReferenceLine y={0} stroke="#D1DAEB" strokeDasharray="2 2" />
                <ReferenceLine y={50} stroke="#E8EDF5" strokeDasharray="1 1" />
                <ReferenceLine y={-50} stroke="#E8EDF5" strokeDasharray="1 1" />
                {showRaw && (
                  <Line
                    type="monotone"
                    dataKey="raw"
                    stroke="#A3B4D7"
                    strokeWidth={1}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
                {showFiltered && (
                  <Line
                    type="monotone"
                    dataKey="filtered"
                    stroke="#1E3A78"
                    strokeWidth={1.8}
                    dot={false}
                    isAnimationActive={false}
                  />
                )}
              </LineChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bottom Multi-Participant Recording Control Strip */}
        <div className="mt-4 pt-4 border-t border-navy-100 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div className="flex flex-wrap items-center gap-3">
              {/* Participant Selection */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-navy-400 font-medium">Participant:</span>
                <select
                  value={selectedParticipantId}
                  onChange={(e) => setSelectedParticipantId(e.target.value)}
                  disabled={isRecording}
                  className="px-2.5 py-1 text-xs font-mono font-semibold rounded-lg border border-navy-100 bg-white text-navy focus:outline-none"
                >
                  {participants.map((p) => (
                    <option key={p.id} value={p.id} disabled={p.status === 'withdrawn'}>
                      {p.code} {p.name ? `(${p.name})` : ''} {p.status === 'withdrawn' ? '[WITHDRAWN]' : ''}
                    </option>
                  ))}
                  {participants.length === 0 && <option value="">No Participants Enrolled</option>}
                </select>
              </div>

              {/* Protocol Selection */}
              <div className="flex items-center gap-1.5 text-xs">
                <span className="text-navy-400 font-medium">Protocol:</span>
                <select
                  value={protocolName}
                  onChange={(e) => setProtocolName(e.target.value)}
                  disabled={isRecording}
                  className="px-2.5 py-1 text-xs rounded-lg border border-navy-100 bg-white text-navy focus:outline-none"
                >
                  <option value="Single Channel BioAmp Acquisition">Single Channel BioAmp Acquisition</option>
                  <option value="Eyes Open / Closed Baseline">Eyes Open / Closed Baseline</option>
                  <option value="Resting State Protocol">Resting State Protocol</option>
                  <option value="Visual Stimulus Response">Visual Stimulus Response</option>
                  <option value="Motor Imagery Cue Protocol">Motor Imagery Cue Protocol</option>
                </select>
              </div>

              {/* Live Status Indicator */}
              {isRecording && (
                <div
                  className={`flex items-center gap-2 px-3 py-1 rounded-lg text-xs font-mono font-semibold ${sessionPaused
                    ? 'bg-warning/10 text-warning-700 border border-warning/30'
                    : 'bg-error/10 text-error border border-error/20 animate-pulse'
                    }`}
                >
                  <span className={`h-2 w-2 rounded-full ${sessionPaused ? 'bg-warning' : 'bg-error'}`} />
                  <span>{sessionPaused ? 'PAUSED' : 'REC'} {formatDurationClock(recordTime)}</span>
                  <span className="text-2xs opacity-80 font-normal">
                    (Auto-saving 256-sample batches)
                  </span>
                </div>
              )}
            </div>

            {/* Recording Action Buttons */}
            <div className="flex items-center gap-2">
              {!isRecording ? (
                <Button onClick={handleStartRecording}>
                  <Play className="h-3.5 w-3.5 mr-1" /> Start Recording
                </Button>
              ) : (
                <>
                  <Button
                    variant="secondary"
                    onClick={handleTogglePause}
                    className={sessionPaused ? 'bg-warning/10 text-warning-700 border-warning/30' : ''}
                  >
                    {sessionPaused ? (
                      <>
                        <Play className="h-3.5 w-3.5 mr-1" /> Resume
                      </>
                    ) : (
                      <>
                        <Pause className="h-3.5 w-3.5 mr-1" /> Pause
                      </>
                    )}
                  </Button>
                  <Button variant="danger" onClick={handleStopRecording}>
                    <Square className="h-3.5 w-3.5 mr-1" /> Stop &amp; Save
                  </Button>
                </>
              )}
            </div>
          </div>

          {/* Real-time Experimental Event Markers Bar (Active during recording) */}
          {isRecording && (
            <div className="pt-3 border-t border-navy-50 flex flex-wrap items-center justify-between gap-3 text-xs bg-navy-50/30 p-2.5 rounded-lg">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-navy-500 font-semibold flex items-center gap-1">
                  <BookmarkPlus className="h-3.5 w-3.5 text-powder-700" /> Event Markers:
                </span>
                <button
                  type="button"
                  onClick={() => handleAddEventMarker('Eyes Open')}
                  className="px-2.5 py-1 rounded-md bg-white border border-navy-100 hover:border-powder-400 text-navy font-medium text-2xs transition-colors shadow-2xs"
                >
                  + Eyes Open
                </button>
                <button
                  type="button"
                  onClick={() => handleAddEventMarker('Eyes Closed')}
                  className="px-2.5 py-1 rounded-md bg-white border border-navy-100 hover:border-powder-400 text-navy font-medium text-2xs transition-colors shadow-2xs"
                >
                  + Eyes Closed
                </button>
                <button
                  type="button"
                  onClick={() => handleAddEventMarker('Rest')}
                  className="px-2.5 py-1 rounded-md bg-white border border-navy-100 hover:border-powder-400 text-navy font-medium text-2xs transition-colors shadow-2xs"
                >
                  + Rest
                </button>
                <button
                  type="button"
                  onClick={() => handleAddEventMarker('Task Start')}
                  className="px-2.5 py-1 rounded-md bg-white border border-navy-100 hover:border-powder-400 text-navy font-medium text-2xs transition-colors shadow-2xs"
                >
                  + Task Start
                </button>
                <button
                  type="button"
                  onClick={() => handleAddEventMarker('Task End')}
                  className="px-2.5 py-1 rounded-md bg-white border border-navy-100 hover:border-powder-400 text-navy font-medium text-2xs transition-colors shadow-2xs"
                >
                  + Task End
                </button>
              </div>

              {/* Custom Event Input */}
              <div className="flex items-center gap-1.5">
                <input
                  type="text"
                  placeholder="Custom event label..."
                  value={customEventMarker}
                  onChange={(e) => setCustomEventMarker(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && customEventMarker.trim()) {
                      handleAddEventMarker(customEventMarker.trim());
                    }
                  }}
                  className="px-2.5 py-1 text-2xs rounded-md border border-navy-100 bg-white text-navy focus:outline-none w-36"
                />
                <Button
                  size="sm"
                  variant="secondary"
                  disabled={!customEventMarker.trim()}
                  onClick={() => customEventMarker.trim() && handleAddEventMarker(customEventMarker.trim())}
                >
                  Mark
                </Button>
              </div>
            </div>
          )}

          {/* Active Event Markers List */}
          {eventMarkers.length > 0 && (
            <div className="flex flex-wrap items-center gap-1.5 pt-1 text-2xs">
              <span className="text-navy-400 font-medium">Logged Events ({eventMarkers.length}):</span>
              {eventMarkers.map((ev, i) => (
                <span
                  key={ev.id || i}
                  className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-powder-50 border border-powder-200 text-navy font-mono"
                >
                  <Tag className="h-2.5 w-2.5 text-powder-600" />
                  {formatDurationClock(ev.relativeTime)} · {ev.label}
                </span>
              ))}
            </div>
          )}

          {/* Live Operator Notes (Expandable) */}
          {isRecording && (
            <div className="pt-2">
              <input
                type="text"
                placeholder="Live operator notes during recording (auto-saves to MongoDB session)..."
                value={operatorNotes}
                onChange={(e) => handleUpdateNotes(e.target.value)}
                className="w-full px-3 py-1.5 text-2xs rounded-lg border border-navy-100 bg-white text-navy focus:outline-none"
              />
            </div>
          )}
        </div>
      </Card>

      {/* Session Saved Notification with One-Click Report & Export Downloads */}
      {lastSavedSession && (
        <Card className="p-4 bg-success/5 border border-success/30 shadow-soft animate-fade-in flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="h-5 w-5 text-success flex-shrink-0" />
            <div>
              <p className="font-semibold text-navy">
                Recording Session <span className="font-mono">{lastSavedSession.code}</span> Saved Successfully
              </p>
              <p className="text-2xs text-navy-400">
                All raw BioAmp microvolt samples and event markers have been persisted to MongoDB.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              size="sm"
              variant="secondary"
              onClick={() => api.downloadSessionPdf(lastSavedSession.id, lastSavedSession.code)}
            >
              <FileText className="h-3.5 w-3.5 mr-1 text-error" /> Download PDF Report
            </Button>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => api.downloadSessionCsv(lastSavedSession.id, lastSavedSession.code)}
            >
              <Download className="h-3.5 w-3.5 mr-1 text-success" /> Export Raw CSV
            </Button>
            <Button
              size="sm"
              onClick={() => navigate(`/reports?session=${lastSavedSession.id}`)}
            >
              View in Reports
            </Button>
          </div>
        </Card>
      )}

      {/* Real-Time Brainwave Frequency Analysis & Welch PSD Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
        {/* Real-Time Welch Bandpower Breakdown */}
        <Card className="p-5 shadow-card bg-white border border-navy-100">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="text-sm font-bold text-navy flex items-center gap-1.5">
                <Activity className="h-4 w-4 text-powder-600" /> Real-Time Brainwave Frequency Bands
              </h3>
              <p className="text-2xs text-navy-400 mt-0.5">
                Computed via scipy.signal.welch (512-sample sliding window, Hanning taper)
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isPaused && (
                <Badge className="bg-warning/20 text-warning-800 font-mono text-2xs font-bold animate-pulse">
                  PAUSED / STALE
                </Badge>
              )}
              {alphaPeak !== null && alphaPeak !== undefined && alphaPeak > 0 ? (
                <Badge className="bg-lavender-100 text-navy-700 font-mono text-2xs">
                  Peak Alpha: {alphaPeak} Hz
                </Badge>
              ) : liveDsp?.status === 'WARMING_UP' || (liveDsp && liveDsp.sample_count < 128) ? (
                <Badge className="bg-warning/10 text-warning-700 font-mono text-2xs animate-pulse">
                  Warming Up ({liveDsp?.sample_count ?? 0}/512)
                </Badge>
              ) : (
                <Badge className="bg-navy-100 text-navy-400 font-mono text-2xs">
                  Peak Alpha: -- Hz
                </Badge>
              )}
            </div>
          </div>

          {/* Scenario Alerts: Disconnected or Warming Up */}
          {deviceInfo.state !== 'connected' && (
            <div className="mb-3 p-2.5 rounded-lg bg-warning/10 border border-warning/20 text-2xs text-warning-800 flex items-center justify-between">
              <span className="flex items-center gap-1.5 font-semibold">
                <AlertTriangle className="h-3.5 w-3.5 text-warning" /> Hardware Disconnected
              </span>
              <span className="font-mono text-3xs text-navy-500">Spectral bandpowers unavailable (0 µV²)</span>
            </div>
          )}
          {deviceInfo.state === 'connected' && (liveDsp?.status === 'WARMING_UP' || (liveDsp && liveDsp.sample_count < 128)) && (
            <div className="mb-3 p-2.5 rounded-lg bg-powder-50 border border-powder-200 text-2xs text-navy flex items-center justify-between animate-fade-in">
              <span className="flex items-center gap-1.5 font-medium">
                <RefreshCw className="h-3.5 w-3.5 text-powder-600 animate-spin" />
                Accumulating DSP buffer: <strong className="font-mono">{liveDsp?.sample_count ?? 0} / 512 samples</strong>
              </span>
              <Badge className="bg-powder-200 text-navy-800 font-mono text-3xs">WARMING UP</Badge>
            </div>
          )}

          <div className="space-y-3.5">
            {/* Delta Band */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-navy">Delta</span>
                  <span className="text-2xs text-navy-400 font-mono">0.5–4.0 Hz</span>
                  <span className="text-2xs text-navy-300">· Deep sleep, slow-wave</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-navy">
                    {hasValidBandPower ? `${deltaPower} µV²` : '-- µV²'}
                  </span>
                  <span className="font-mono text-xs text-navy-400 w-12 text-right">
                    {hasValidBandPower ? `${deltaRel}%` : '--%'}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full bg-navy-50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-lavender-400 rounded-full transition-all duration-300"
                  style={{ width: `${hasValidBandPower ? Math.min(100, deltaRel) : 0}%` }}
                />
              </div>
            </div>

            {/* Theta Band */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-navy">Theta</span>
                  <span className="text-2xs text-navy-400 font-mono">4.0–8.0 Hz</span>
                  <span className="text-2xs text-navy-300">· Drowsiness, meditation</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-navy">
                    {hasValidBandPower ? `${thetaPower} µV²` : '-- µV²'}
                  </span>
                  <span className="font-mono text-xs text-navy-400 w-12 text-right">
                    {hasValidBandPower ? `${thetaRel}%` : '--%'}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full bg-navy-50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-powder-500 rounded-full transition-all duration-300"
                  style={{ width: `${hasValidBandPower ? Math.min(100, thetaRel) : 0}%` }}
                />
              </div>
            </div>

            {/* Alpha Band */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-navy">Alpha</span>
                  <span className="text-2xs text-navy-400 font-mono">8.0–13.0 Hz</span>
                  <span className="text-2xs text-navy-300">· Relaxed awareness, eyes-closed</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-navy">
                    {hasValidBandPower ? `${alphaPower} µV²` : '-- µV²'}
                  </span>
                  <span className="font-mono text-xs text-navy-400 w-12 text-right">
                    {hasValidBandPower ? `${alphaRel}%` : '--%'}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full bg-navy-50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-navy-600 rounded-full transition-all duration-300"
                  style={{ width: `${hasValidBandPower ? Math.min(100, alphaRel) : 0}%` }}
                />
              </div>
            </div>

            {/* Beta Band */}
            <div>
              <div className="flex items-center justify-between text-xs mb-1">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-navy">Beta</span>
                  <span className="text-2xs text-navy-400 font-mono">13.0–29.5 Hz</span>
                  <span className="text-2xs text-navy-300">· Active focus, cognitive alertness</span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="font-mono text-xs font-semibold text-navy">
                    {hasValidBandPower ? `${betaPower} µV²` : '-- µV²'}
                  </span>
                  <span className="font-mono text-xs text-navy-400 w-12 text-right">
                    {hasValidBandPower ? `${betaRel}%` : '--%'}
                  </span>
                </div>
              </div>
              <div className="h-2 w-full bg-navy-50 rounded-full overflow-hidden">
                <div
                  className="h-full bg-peach-500 rounded-full transition-all duration-300"
                  style={{ width: `${hasValidBandPower ? Math.min(100, betaRel) : 0}%` }}
                />
              </div>
            </div>

            {/* Gamma Band - SCIENTIFIC INTEGRITY CUTOFF BADGE */}
            <div className="p-3 rounded-lg bg-navy-50/60 border border-navy-100/70">
              <div className="flex items-center justify-between text-xs">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-navy-400">Gamma</span>
                  <span className="text-2xs text-navy-400 font-mono">&gt; 30.0 Hz</span>
                </div>
                <Badge className="bg-peach-100 text-peach-700 text-2xs font-semibold">
                  HARDWARE CUTOFF
                </Badge>
              </div>
              <p className="text-2xs text-navy-400 mt-1.5 flex items-start gap-1">
                <Info className="h-3 w-3 text-peach-600 flex-shrink-0 mt-0.5" />
                <span>
                  <strong>Outside hardware bandwidth:</strong> The BioAmp EXG Pill contains an analog active
                  bandpass filter of 0.5–29.5 Hz on the PCB. Frequencies above 29.5 Hz are attenuated at hardware level;
                  Gamma is withheld to maintain scientific integrity.
                </span>
              </p>
            </div>
          </div>
        </Card>

        {/* Live Power Spectral Density (PSD) Chart */}
        <Card className="p-5 shadow-card bg-white border border-navy-100">
          <div className="flex items-center justify-between mb-2">
            <div>
              <h3 className="text-sm font-bold text-navy flex items-center gap-1.5">
                <Radio className="h-4 w-4 text-navy-600" /> Power Spectral Density (Welch PSD)
              </h3>
              <p className="text-2xs text-navy-400 mt-0.5">
                Frequency distribution from 0.5 Hz to 35.0 Hz
              </p>
            </div>
            <div className="flex items-center gap-2">
              {isPaused && (
                <Badge className="bg-warning/20 text-warning-800 font-mono text-2xs font-bold animate-pulse">
                  PAUSED / STALE
                </Badge>
              )}
              <span className="text-2xs text-navy-400 font-mono">Cutoff @ 29.5 Hz</span>
            </div>
          </div>

          <div className="h-64 w-full pt-2">
            {deviceInfo.state !== 'connected' ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-warning/5 rounded-xl border border-dashed border-warning/20">
                <AlertTriangle className="h-7 w-7 text-warning mb-2 opacity-80" />
                <span className="text-xs font-semibold text-warning-800">Hardware Disconnected</span>
                <span className="text-2xs text-navy-400 mt-0.5">
                  Connect Arduino UNO R4 WiFi to USB serial port to stream physical EEG and calculate Welch PSD.
                </span>
              </div>
            ) : liveDsp?.status === 'WARMING_UP' || (liveDsp && liveDsp.sample_count < 128) ? (
              <div className="h-full flex flex-col items-center justify-center text-center p-6 bg-powder-50/50 rounded-xl border border-dashed border-powder-200">
                <RefreshCw className="h-7 w-7 text-powder-600 mb-2 animate-spin" />
                <span className="text-xs font-semibold text-navy">Accumulating DSP Buffer ({liveDsp?.sample_count ?? 0}/512 samples)</span>
                <span className="text-2xs text-navy-400 mt-0.5">
                  Welch PSD requires at least 128 samples (~0.5s) to begin calculating spectral densities.
                </span>
              </div>
            ) : psdPoints.length === 0 ? (
              <div className="h-full flex items-center justify-center text-navy-300 text-xs">
                Accumulating samples for spectral Welch estimation...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={psdPoints} margin={{ top: 10, right: 10, left: -15, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#E8EDF5" vertical={false} />
                  <XAxis
                    dataKey="freq"
                    unit=" Hz"
                    tick={{ fontSize: 10, fill: '#758EC3' }}
                    domain={[0.5, 35]}
                  />
                  <YAxis
                    tick={{ fontSize: 10, fill: '#758EC3' }}
                    unit=" µV²"
                  />
                  <Tooltip
                    formatter={(val: any) => [`${val} µV²/Hz`, 'Power Spectral Density']}
                    labelFormatter={(label: any) => `Frequency: ${label} Hz`}
                    contentStyle={{ borderRadius: 8, borderColor: '#D1DAEB', fontSize: 11 }}
                  />
                  <ReferenceLine x={29.5} stroke="#E07A5F" strokeDasharray="3 3" label={{ value: '29.5 Hz Filter Cutoff', fill: '#E07A5F', fontSize: 9 }} />
                  <Area
                    type="monotone"
                    dataKey="power"
                    stroke="#1E3A78"
                    strokeWidth={1.5}
                    fill="#C0D1EE"
                    fillOpacity={0.4}
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </Card>
      </div>

      {/* Welch DSP Pipeline Live Diagnostics Panel */}
      <Card className="p-4 shadow-card bg-navy-50/40 border border-navy-100">
        <div className="flex flex-wrap items-center justify-between gap-2 mb-3">
          <div className="flex items-center gap-2">
            <Cpu className="h-4 w-4 text-navy-600" />
            <h4 className="text-xs font-bold text-navy">Welch DSP Pipeline Live Diagnostics</h4>
            <Badge
              className={`font-mono text-3xs ${isPaused
                ? 'bg-warning/20 text-warning-800 font-bold'
                : deviceInfo.state !== 'connected'
                  ? 'bg-warning/10 text-warning-700'
                  : liveDsp?.status === 'WARMING_UP'
                    ? 'bg-powder-100 text-navy-700'
                    : 'bg-success/10 text-success'
                }`}
            >
              {isPaused ? 'MONITORING PAUSED' : deviceInfo.state !== 'connected' ? 'DISCONNECTED' : (liveDsp?.status || 'ACTIVE')}
            </Badge>
          </div>
          <span className="text-3xs text-navy-400 font-mono">
            512-sample sliding window @ {deviceInfo.sampleRateMeasured || 256} Hz (~2.0 s window)
          </span>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-7 gap-3 text-xs">
          <div className="p-2.5 rounded-lg bg-white border border-navy-100 shadow-2xs">
            <span className="text-3xs text-navy-400 font-medium block">1. DSP Buffer</span>
            <span className="font-mono font-bold text-navy text-sm block">
              {liveDsp?.sample_count ?? 0} <span className="text-3xs font-normal text-navy-400">/ 512</span>
            </span>
            <span className="text-3xs text-navy-400 block mt-0.5">
              {Math.min(100, Math.round(((liveDsp?.sample_count ?? 0) / 512) * 100))}% filled
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-white border border-navy-100 shadow-2xs">
            <span className="text-3xs text-navy-400 font-medium block">2. Sampling Rate</span>
            <span className="font-mono font-bold text-navy text-sm block">
              {deviceInfo.sampleRateMeasured ? `${deviceInfo.sampleRateMeasured} Hz` : '-- Hz'}
            </span>
            <span className="text-3xs text-success font-medium block mt-0.5">Empirical clock</span>
          </div>

          <div className="p-2.5 rounded-lg bg-white border border-navy-100 shadow-2xs">
            <span className="text-3xs text-navy-400 font-medium block">3. Frequency Res. (Δf)</span>
            <span className="font-mono font-bold text-navy text-sm block">
              {bandAnalysis?.frequency_resolution_hz ? `${bandAnalysis.frequency_resolution_hz} Hz` : deviceInfo.state !== 'connected' ? '-- Hz' : '1.000 Hz'}
            </span>
            <span className="text-3xs text-navy-400 block mt-0.5">
              {bandAnalysis?.window_type === 'FULL' ? 'Full window (512)' : bandAnalysis?.window_type === 'PARTIAL' ? 'Partial window' : 'Welch bin width'}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-white border border-navy-100 shadow-2xs">
            <span className="text-3xs text-navy-400 font-medium block">4. Total Power</span>
            <span className="font-mono font-bold text-navy text-sm block">
              {hasValidBandPower ? `${bandAnalysis?.total_power_uv2} µV²` : '-- µV²'}
            </span>
            <span className="text-3xs text-navy-400 block mt-0.5">
              Sum: 0.5–29.5 Hz
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-white border border-navy-100 shadow-2xs">
            <span className="text-3xs text-navy-400 font-medium block">5. Peak Alpha Freq.</span>
            <span className="font-mono font-bold text-navy text-sm block">
              {alphaPeak !== null && alphaPeak > 0 ? `${alphaPeak} Hz` : '-- Hz'}
            </span>
            <span className="text-3xs text-navy-400 block mt-0.5">
              PSD argmax (8–13 Hz)
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-white border border-navy-100 shadow-2xs">
            <span className="text-3xs text-navy-400 font-medium block">6. Band Powers (µV²)</span>
            <span className="font-mono text-2xs font-semibold text-navy block truncate">
              δ: {hasValidBandPower ? deltaPower : '--'} | θ: {hasValidBandPower ? thetaPower : '--'}
            </span>
            <span className="font-mono text-2xs font-semibold text-navy-600 block truncate">
              α: {hasValidBandPower ? alphaPower : '--'} | β: {hasValidBandPower ? betaPower : '--'}
            </span>
          </div>

          <div className="p-2.5 rounded-lg bg-white border border-navy-100 shadow-2xs">
            <span className="text-3xs text-navy-400 font-medium block">7. Last Sample (A0)</span>
            <span className="font-mono text-2xs font-bold text-navy block truncate">
              {deviceInfo.lastSample ? `${deviceInfo.lastSample.split(',')[1]} µV` : '-- µV'}
            </span>
            <span className="font-mono text-3xs text-navy-400 block truncate mt-0.5">
              t: {deviceInfo.lastSample ? `${deviceInfo.lastSample.split(',')[0]} ms` : '--'}
            </span>
          </div>
        </div>
      </Card>

      {/* Signal Quality & Hardware Diagnostics Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-3 text-xs">
        <div className="p-3 rounded-lg bg-white border border-navy-100 shadow-soft">
          <span className="text-2xs text-navy-300 block">Overall Signal Quality</span>
          <div className="flex items-center gap-1.5 mt-0.5">
            <span
              className={`h-2 w-2 rounded-full ${deviceInfo.state !== 'connected'
                ? 'bg-warning'
                : data.length === 0
                  ? 'bg-navy-300'
                  : isClipping || !isSignalValid
                    ? 'bg-error'
                    : liveDsp?.quality?.overall_quality === 'EXCELLENT' || liveDsp?.quality?.overall_quality === 'GOOD'
                      ? 'bg-success'
                      : 'bg-warning'
                }`}
            />
            <span className="font-bold text-navy">
              {deviceInfo.state !== 'connected'
                ? 'DISCONNECTED'
                : data.length === 0
                  ? 'AWAITING SAMPLES'
                  : isClipping
                    ? 'POOR (ADC SATURATED)'
                    : !isSignalValid
                      ? `POOR (${validityStatus.replace('_', ' ')})`
                      : liveDsp?.quality?.overall_quality || (isFlatline ? 'POOR' : 'GOOD')}
            </span>
          </div>
          <span className="text-2xs text-navy-400 block mt-0.5">
            Score: {data.length > 0 ? (isClipping ? Math.min(liveDsp?.quality?.score ?? 0, 20) : (liveDsp?.quality?.score ?? 0)) : 0}/100
          </span>
        </div>

        <div className="p-3 rounded-lg bg-white border border-navy-100 shadow-soft">
          <span className="text-2xs text-navy-300 block">Electrode Impedance / Contact</span>
          <span
            className={`font-semibold mt-0.5 block ${deviceInfo.state !== 'connected'
              ? 'text-navy-400'
              : data.length === 0
                ? 'text-navy-400'
                : isClipping
                  ? 'text-error font-bold'
                  : isFlatline
                    ? 'text-error'
                    : 'text-success'
              }`}
          >
            {deviceInfo.state !== 'connected'
              ? 'Disconnected'
              : data.length === 0
                ? 'Awaiting Signal'
                : isClipping
                  ? 'ADC Saturated (±1033 µV)'
                  : isFlatline
                    ? 'Flatline Alert'
                    : 'Nominal Contact'}
          </span>
          <span className="text-2xs text-navy-400 block mt-0.5">
            Amplitude: {data.length > 0 ? `${maxAmp.toFixed(1)} µV` : '0.0 µV'}
          </span>
        </div>

        <div className="p-3 rounded-lg bg-white border border-navy-100 shadow-soft">
          <span className="text-2xs text-navy-300 block">ADC Dynamic Range</span>
          <span
            className={`font-semibold mt-0.5 block ${deviceInfo.state !== 'connected' || data.length === 0
              ? 'text-navy-400'
              : isClipping
                ? 'text-warning-600'
                : 'text-navy'
              }`}
          >
            {deviceInfo.state !== 'connected'
              ? 'Offline'
              : data.length === 0
                ? 'Standby'
                : isClipping
                  ? 'Clipping Saturation'
                  : 'Within Linear Range'}
          </span>
          <span className="text-2xs text-navy-400 block mt-0.5">
            Full-Scale: ±1033.0 µV
          </span>
        </div>

        <div className="p-3 rounded-lg bg-white border border-navy-100 shadow-soft">
          <span className="text-2xs text-navy-300 block">Sampling Frequency (fs)</span>
          <span className="font-mono font-bold text-navy mt-0.5 block">
            {deviceInfo.sampleRateMeasured ? `${deviceInfo.sampleRateMeasured} Hz` : '-- Hz'}
          </span>
          <span className="text-2xs text-navy-400 block mt-0.5">
            Nominal: 256 Hz (3906 µs)
          </span>
        </div>

        <div className="p-3 rounded-lg bg-white border border-navy-100 shadow-soft">
          <span className="text-2xs text-navy-300 block">Total Acquired Samples</span>
          <span className="font-mono font-bold text-navy mt-0.5 block">
            {deviceInfo.samples_received ?? data.length}
          </span>
          <span className="text-2xs text-navy-400 block mt-0.5">
            Buffer: {data.length} pts
          </span>
        </div>
      </div>
    </div>
  );
}
