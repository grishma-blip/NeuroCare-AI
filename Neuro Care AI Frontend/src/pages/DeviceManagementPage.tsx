import { useState, useEffect } from 'react';
import {
  Cpu,
  Usb,
  Zap,
  Activity,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Info,
  Wrench,
  Power,
  ShieldCheck,
  Radio,
} from 'lucide-react';
import { Card, Button, Badge, DisclaimerBar, SectionHeader } from '@/components/ui';
import { api } from '@/lib/api';
import type { DeviceInfo, OperatingMode } from '@/types';

export default function DeviceManagementPage() {
  const [device, setDevice] = useState<DeviceInfo | null>(null);
  const [ports, setPorts] = useState<Array<{ port: string; description: string; hwid: string; is_arduino: boolean }>>([]);
  const [selectedPort, setSelectedPort] = useState<string>('');
  const [selectedBaud, setSelectedBaud] = useState<number>(115200);
  const [scanning, setScanning] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [statusMsg, setStatusMsg] = useState<{ text: string; error?: boolean } | null>(null);

  const fetchStatusAndPorts = async () => {
    setScanning(true);
    try {
      const [devStatus, portList] = await Promise.all([
        api.getDeviceStatus(),
        api.getDevicePorts().catch(() => []),
      ]);
      setDevice(devStatus);
      setPorts(portList);
      if (!selectedPort && portList.length > 0) {
        const arduinoPort = portList.find((p) => p.is_arduino);
        setSelectedPort(arduinoPort ? arduinoPort.port : portList[0].port);
      }
    } catch {
      setStatusMsg({ text: 'Unable to connect to backend service on port 8000.', error: true });
    } finally {
      setScanning(false);
    }
  };

  useEffect(() => {
    fetchStatusAndPorts();
    const interval = setInterval(fetchStatusAndPorts, 4000);
    return () => clearInterval(interval);
  }, []);

  const handleConnect = async () => {
    setConnecting(true);
    setStatusMsg(null);
    try {
      const res = await api.connectDevice(selectedPort, selectedBaud);
      if (res.success) {
        setStatusMsg({ text: `Connected to ${selectedPort} successfully.` });
        await fetchStatusAndPorts();
      } else {
        setStatusMsg({ text: `Failed to open ${selectedPort}. Ensure device is connected and port is not in use.`, error: true });
      }
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Error connecting to device', error: true });
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    setStatusMsg(null);
    try {
      await api.disconnectDevice();
      setStatusMsg({ text: 'Hardware serial port disconnected.' });
      await fetchStatusAndPorts();
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Error disconnecting device', error: true });
    }
  };

  const handleModeChange = async (mode: OperatingMode) => {
    setStatusMsg(null);
    try {
      const res = await api.setDeviceMode(mode);
      setStatusMsg({ text: `Acquisition mode switched to ${res.mode}.` });
      await fetchStatusAndPorts();
    } catch (err: any) {
      setStatusMsg({ text: err.message || 'Error switching mode', error: true });
    }
  };

  const diagnostics = [
    {
      label: 'Serial Interface',
      value: device?.port || 'Not connected',
      status: device?.state === 'connected' ? ('ok' as const) : ('warning' as const),
      detail: device?.state === 'connected' ? 'USB CDC Serial connection active' : 'Device waiting for USB connection',
    },
    {
      label: 'Baud Rate',
      value: `${selectedBaud} bps`,
      status: 'ok' as const,
      detail: 'Standard high-speed UART rate for Arduino UNO R4 WiFi',
    },
    {
      label: 'Target Microcontroller',
      value: 'Arduino UNO R4 WiFi (Renesas RA4M1 ARM Cortex-M4)',
      status: 'ok' as const,
      detail: '14-bit ADC / 12-bit configured resolution',
    },
    {
      label: 'BioAmp Front-End',
      value: 'BioAmp EXG Pill (Assembled PCB)',
      status: 'ok' as const,
      detail: 'Analog instrumentation amplifier gain ~2420x, single-channel',
    },
    {
      label: 'Sampling Frequency',
      value: `${device?.sampleRateMeasured || 256.0} Hz`,
      status: 'ok' as const,
      detail: 'Empirically calculated from incoming packet timestamps',
    },
    {
      label: 'Hardware Bandpass',
      value: '0.5 Hz – 29.5 Hz',
      status: 'ok' as const,
      detail: 'Hardware analog bandpass filter on PCB. Gamma (30–100 Hz) cut off.',
    },
  ];

  const troubleshooting = [
    {
      step: '1',
      title: 'Verify USB Serial Cable',
      description: 'Connect the Arduino UNO R4 WiFi using a USB-C data cable (ensure it supports data transfer, not charge-only).',
    },
    {
      step: '2',
      title: 'Upload BioAmp Firmware Sketch',
      description: 'Open `backend/arduino/BioAmp_EEG_UnoR4.ino` in Arduino IDE, select board "Arduino UNO R4 WiFi", and flash at 115200 baud.',
    },
    {
      step: '3',
      title: 'Check Electrode Leads & Skin Prep',
      description: 'Connect BioAmp Cable V3 (100 cm) to repositionable gel electrodes. Clean forehead or scalp with alcohol wipe to ensure low impedance.',
    },
    {
      step: '4',
      title: 'No Wi-Fi Connection Needed',
      description: 'The Arduino UNO R4 communicates directly via USB CDC Serial. Wi-Fi configuration is not required for acquisition.',
    },
  ];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-fade-in">

      {/* Status banner message */}
      {statusMsg && (
        <div className={`p-3 rounded-lg border text-xs flex items-center justify-between ${
          statusMsg.error ? 'bg-error/10 border-error/20 text-error' : 'bg-success/10 border-success/20 text-success'
        }`}>
          <span>{statusMsg.text}</span>
          <button onClick={() => setStatusMsg(null)} className="ml-4 font-bold">✕</button>
        </div>
      )}

      {/* Main Hardware Configuration Card */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-start justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-navy text-powder shadow-soft">
                <Cpu className="h-6 w-6" />
              </div>
              <div>
                <h2 className="text-base font-semibold text-navy tracking-tight">
                  {device?.name || 'BioAmp EXG Pill Acquisition Unit'}
                </h2>
                <p className="text-xs text-navy-300 mt-0.5">
                  {device?.board || 'Arduino UNO R4 WiFi'} · Single Channel (A0)
                </p>
              </div>
            </div>

            <Badge className={
              device?.state === 'connected' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning-700'
            }>
              {device?.state === 'connected' ? 'Connected' : 'Disconnected / Standby'}
            </Badge>
          </div>

          {/* Operating Mode Selector inside Device Management */}
          <div className="mt-4 p-3 rounded-xl bg-lavender-50/50 border border-lavender-200/60">
            <div className="text-2xs font-semibold text-navy-400 uppercase tracking-wider mb-2">
              Operating Mode Configuration
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button
                onClick={() => handleModeChange('live')}
                className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-all ${
                  device?.mode === 'live'
                    ? 'bg-success text-white border-success shadow-soft'
                    : 'bg-white border-navy-100 text-navy hover:bg-lavender-50'
                }`}
              >
                Live Hardware
              </button>
              <button
                onClick={() => handleModeChange('replay')}
                className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-all ${
                  device?.mode === 'replay'
                    ? 'bg-powder text-navy border-powder-400 shadow-soft'
                    : 'bg-white border-navy-100 text-navy hover:bg-lavender-50'
                }`}
              >
                Replay Mode
              </button>
              <button
                onClick={() => handleModeChange('demo')}
                className={`px-3 py-2 rounded-lg text-xs font-medium border text-center transition-all ${
                  device?.mode === 'demo'
                    ? 'bg-warning text-navy border-warning shadow-soft'
                    : 'bg-white border-navy-100 text-navy hover:bg-lavender-50'
                }`}
              >
                Demo Mode
              </button>
            </div>
          </div>

          {/* Serial Port Connection Toolbar */}
          <div className="mt-5 pt-4 border-t border-navy-100 flex flex-wrap items-end gap-3">
            <div className="flex-1 min-w-[200px]">
              <label className="block text-2xs font-semibold text-navy-400 mb-1">
                Detected USB Serial Port
              </label>
              <select
                value={selectedPort}
                onChange={(e) => setSelectedPort(e.target.value)}
                disabled={device?.state === 'connected'}
                className="w-full px-3 py-2 text-xs font-mono font-medium rounded-lg border border-navy-100 bg-navy-50/40 text-navy focus:outline-none"
              >
                {ports.map((p) => (
                  <option key={p.port} value={p.port}>
                    {p.port} ({p.description})
                  </option>
                ))}
                {ports.length === 0 && <option value="">No USB serial devices detected</option>}
              </select>
            </div>

            <div className="w-32">
              <label className="block text-2xs font-semibold text-navy-400 mb-1">
                Baud Rate
              </label>
              <select
                value={selectedBaud}
                onChange={(e) => setSelectedBaud(Number(e.target.value))}
                disabled={device?.state === 'connected'}
                className="w-full px-3 py-2 text-xs font-mono font-medium rounded-lg border border-navy-100 bg-navy-50/40 text-navy focus:outline-none"
              >
                <option value={115200}>115200 bps</option>
                <option value={230400}>230400 bps</option>
                <option value={57600}>57600 bps</option>
                <option value={9600}>9600 bps</option>
              </select>
            </div>

            <div className="flex items-center gap-2">
              <Button
                variant="secondary"
                size="md"
                onClick={fetchStatusAndPorts}
                disabled={scanning}
                title="Scan USB ports"
              >
                <RefreshCw className={`h-4 w-4 ${scanning ? 'animate-spin' : ''}`} />
                Scan Ports
              </Button>

              {device?.state !== 'connected' ? (
                <Button size="md" onClick={handleConnect} disabled={connecting || !selectedPort}>
                  <Power className="h-4 w-4" />
                  {connecting ? 'Connecting...' : 'Connect Hardware'}
                </Button>
              ) : (
                <Button size="md" variant="danger" onClick={handleDisconnect}>
                  <Power className="h-4 w-4" />
                  Disconnect
                </Button>
              )}
            </div>
          </div>
        </Card>

        {/* Hardware Specifications Card */}
        <Card className="p-5 flex flex-col justify-between">
          <div>
            <h3 className="text-sm font-semibold text-navy mb-2">Hardware Specifications</h3>
            <p className="text-xs text-navy-300 mb-4 leading-relaxed">
              BioAmp EXG Pill single-channel analog front-end specifications:
            </p>

            <div className="space-y-2.5 text-xs">
              <div className="flex items-center justify-between pb-1.5 border-b border-navy-50">
                <span className="text-navy-400">Microcontroller</span>
                <span className="font-semibold text-navy">Arduino UNO R4 WiFi</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-navy-50">
                <span className="text-navy-400">Front-End Circuit</span>
                <span className="font-semibold text-navy">BioAmp EXG Pill</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-navy-50">
                <span className="text-navy-400">Channels</span>
                <span className="font-semibold text-navy">1 Channel (A0)</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-navy-50">
                <span className="text-navy-400">Sampling Rate</span>
                <span className="font-mono font-semibold text-navy">256 Hz (~3.9 ms)</span>
              </div>
              <div className="flex items-center justify-between pb-1.5 border-b border-navy-50">
                <span className="text-navy-400">Filter Passband</span>
                <span className="font-mono font-semibold text-navy">0.5 – 29.5 Hz</span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-navy-400">Gamma Band (30–100Hz)</span>
                <span className="text-peach-600 font-semibold text-[11px]">Cut off by filter</span>
              </div>
            </div>
          </div>

          <div className="mt-4 p-2.5 rounded-lg bg-peach-50/60 border border-peach-200/60 text-2xs text-navy-400">
            <strong>Important Filter Limitation:</strong> The 0.5–29.5 Hz hardware filter does not preserve Gamma band brainwaves.
            Delta, Theta, Alpha, and Beta bands are fully supported.
          </div>
        </Card>
      </div>

      {/* Diagnostic parameters table */}
      <Card className="p-5">
        <SectionHeader
          title="Hardware Connection Diagnostics"
          subtitle="Real-time verification of communication pipeline and ADC parameters"
        />

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-4">
          {diagnostics.map((diag, i) => (
            <div key={i} className="p-4 rounded-xl border border-navy-100 bg-white">
              <div className="flex items-start justify-between">
                <span className="text-xs font-semibold text-navy">{diag.label}</span>
                <Badge className={diag.status === 'ok' ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning-700'}>
                  {diag.status === 'ok' ? 'Verified' : 'Standby'}
                </Badge>
              </div>
              <div className="text-sm font-mono font-medium text-navy mt-2 truncate">{diag.value}</div>
              <div className="text-2xs text-navy-300 mt-1">{diag.detail}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* Troubleshooting guide */}
      <Card className="p-5">
        <div className="flex items-center gap-2 mb-4">
          <Wrench className="h-4 w-4 text-powder-600" />
          <h3 className="text-sm font-semibold text-navy">Hardware Setup &amp; Troubleshooting Guide</h3>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {troubleshooting.map((t) => (
            <div key={t.step} className="p-3.5 rounded-xl border border-navy-50 bg-lavender-50/40 flex items-start gap-3">
              <div className="h-6 w-6 rounded-full bg-navy text-white text-xs font-semibold flex items-center justify-center flex-shrink-0">
                {t.step}
              </div>
              <div>
                <h4 className="text-xs font-semibold text-navy">{t.title}</h4>
                <p className="text-2xs text-navy-300 mt-1 leading-relaxed">{t.description}</p>
              </div>
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}
