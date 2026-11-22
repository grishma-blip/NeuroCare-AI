import { useState, useRef, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Bell, LogOut, ChevronDown, Wifi, WifiOff, Cpu, Radio, PlayCircle, ShieldCheck } from 'lucide-react';
import { useAuth } from '@/context/AuthContext';
import { useClock } from '@/hooks/useClock';
import { mockNotifications } from '@/data/mockData';
import { Badge } from '@/components/ui';
import { api, connectEegWebSocket } from '@/lib/api';
import type { OperatingMode, DeviceInfo } from '@/types';

const pageTitles: Record<string, { title: string; subtitle: string }> = {
  '/overview': { title: 'Overview', subtitle: 'System status and research activity' },
  '/recording-assist': { title: 'Recording Assistance', subtitle: 'Guided 9-step preparation and acquisition workflow' },
  '/live': { title: 'Live Monitoring', subtitle: 'Real-time EEG signal acquisition' },
  '/sessions': { title: 'Recording Sessions', subtitle: 'Browse and manage recorded sessions' },
  '/timeline': { title: 'Task Timeline', subtitle: 'Experimental task event alignment' },
  '/analysis': { title: 'Signal Analysis', subtitle: 'Frequency band and time-domain analysis' },
  '/emotion': { title: 'Emotion Recognition', subtitle: 'EEG-based affective pattern estimation (DEAP Valence-Arousal Model)' },
  '/motor-imagery': { title: 'Motor Imagery Detection', subtitle: 'Imagined movement classification for unresponsive patients (PhysioNet CSP+LDA Model)' },
  '/cognitive': { title: 'Motor Imagery Detection', subtitle: 'Imagined movement classification for unresponsive patients (PhysioNet CSP+LDA Model)' },
  '/participants': { title: 'Participants', subtitle: 'Participant and consent management' },
  '/reports': { title: 'Data & Reports', subtitle: 'Export and data management' },
  '/device': { title: 'Device Management', subtitle: 'Hardware configuration and diagnostics' },
  '/settings': { title: 'Settings', subtitle: 'Application and user preferences' },
};

export default function TopBar() {
  const location = useLocation();
  const { user, logout, login } = useAuth();
  const now = useClock();
  const [notifOpen, setNotifOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [backendOnline, setBackendOnline] = useState(false);
  const [currentMode, setCurrentMode] = useState<OperatingMode>('demo');
  const [deviceState, setDeviceState] = useState<string>('disconnected');

  const notifRef = useRef<HTMLDivElement>(null);
  const profileRef = useRef<HTMLDivElement>(null);
  const modeRef = useRef<HTMLDivElement>(null);

  const unreadCount = mockNotifications.filter((n) => !n.read).length;
  const meta = pageTitles[location.pathname] || { title: 'NeuroCare', subtitle: '' };

  useEffect(() => {
    function handler(e: MouseEvent) {
      if (notifRef.current && !notifRef.current.contains(e.target as Node)) setNotifOpen(false);
      if (profileRef.current && !profileRef.current.contains(e.target as Node)) setProfileOpen(false);
      if (modeRef.current && !modeRef.current.contains(e.target as Node)) setModeOpen(false);
    }
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Poll or stream backend status
  useEffect(() => {
    let mounted = true;

    async function checkStatus() {
      try {
        const status = await api.getDeviceStatus();
        if (mounted) {
          setBackendOnline(true);
          setCurrentMode(status.mode || 'demo');
          setDeviceState(status.state);
        }
      } catch {
        if (mounted) {
          setBackendOnline(false);
        }
      }
    }

    checkStatus();
    const interval = setInterval(checkStatus, 3000);

    const disconnectWs = connectEegWebSocket(
      (_samples, device: DeviceInfo) => {
        if (mounted) {
          setBackendOnline(true);
          setCurrentMode(device.mode);
          setDeviceState(device.state);
        }
      },
      (online) => {
        if (mounted) setBackendOnline(online);
      }
    );

    return () => {
      mounted = false;
      clearInterval(interval);
      disconnectWs();
    };
  }, []);

  const handleModeChange = async (mode: OperatingMode) => {
    try {
      await api.setOperatingMode(mode);
      setCurrentMode(mode);
      setModeOpen(false);
    } catch (e) {
      console.error(e);
    }
  };

  const handleRoleSwitch = async (newRole: 'clinician' | 'doctor') => {
    if (newRole === 'doctor') {
      await login('dr.patel@neurocare.ai', 'Doctor@123', 'doctor');
    } else {
      await login('clinician@neurocare.ai', 'Clinician@123', 'clinician');
    }
    setProfileOpen(false);
  };

  const modeBadgeConfig: Record<OperatingMode, { label: string; bg: string; text: string; icon: any }> = {
    live: {
      label: 'LIVE HARDWARE',
      bg: 'bg-success/15 border-success/30 text-success',
      text: 'text-success',
      icon: Cpu,
    },
    HARDWARE: {
      label: 'LIVE HARDWARE',
      bg: 'bg-success/15 border-success/30 text-success',
      text: 'text-success',
      icon: Cpu,
    },
    HARDWARE_TEST: {
      label: 'HARDWARE TEST',
      bg: 'bg-powder/20 border-powder-400/40 text-navy',
      text: 'text-powder-700',
      icon: Cpu,
    },
    replay: {
      label: 'REPLAY MODE',
      bg: 'bg-powder/20 border-powder-400/40 text-navy',
      text: 'text-powder-700',
      icon: PlayCircle,
    },
    REPLAY: {
      label: 'REPLAY MODE',
      bg: 'bg-powder/20 border-powder-400/40 text-navy',
      text: 'text-powder-700',
      icon: PlayCircle,
    },
    SIMULATION: {
      label: 'SIMULATION',
      bg: 'bg-warning/15 border-warning/30 text-warning-700',
      text: 'text-warning-700',
      icon: Radio,
    },
    demo: {
      label: 'DEMO MODE',
      bg: 'bg-warning/15 border-warning/30 text-warning-700',
      text: 'text-warning-700',
      icon: Radio,
    },
    DEMO: {
      label: 'DEMO MODE',
      bg: 'bg-warning/15 border-warning/30 text-warning-700',
      text: 'text-warning-700',
      icon: Radio,
    },
  };

  const currentModeConfig = modeBadgeConfig[currentMode] || modeBadgeConfig.demo;
  const ModeIcon = currentModeConfig.icon;

  return (
    <header className="sticky top-0 z-20 h-16 bg-white/80 backdrop-blur-md border-b border-navy-100/60 flex items-center justify-between px-6">
      {/* Page title */}
      <div>
        <h1 className="text-base font-semibold text-navy tracking-tight">{meta.title}</h1>
        <p className="text-xs text-navy-300">{meta.subtitle}</p>
      </div>

      {/* Right side controls */}
      <div className="flex items-center gap-3">
        {/* Operating Mode Dropdown */}
        <div ref={modeRef} className="relative">
          <button
            onClick={() => setModeOpen((v) => !v)}
            title="Switch Operating Mode"
            className={`flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-semibold tracking-wide transition-all ${currentModeConfig.bg}`}
          >
            <span className={`h-2 w-2 rounded-full ${backendOnline ? 'bg-success' : 'bg-error'} animate-pulse`} />
            <ModeIcon className="h-3.5 w-3.5" />
            <span>{currentModeConfig.label}</span>
            <ChevronDown className="h-3 w-3 opacity-60 ml-0.5" />
          </button>

          {modeOpen && (
            <div className="absolute right-0 top-11 w-64 rounded-xl bg-white shadow-float border border-navy-100/60 py-2 animate-fade-in-up z-50">
              <div className="px-3 py-1.5 border-b border-navy-50 text-2xs font-semibold text-navy-300 uppercase tracking-wider">
                Select Operating Mode
              </div>
              <button
                onClick={() => handleModeChange('live')}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-lavender-50 transition-colors ${currentMode === 'live' ? 'bg-success/5 font-semibold text-success' : 'text-navy'
                  }`}
              >
                <div className="flex items-center gap-2">
                  <Cpu className="h-3.5 w-3.5 text-success" />
                  <div>
                    <div className="font-medium">Live Hardware Mode</div>
                    <div className="text-2xs text-navy-300">BioAmp EXG Pill via USB Serial</div>
                  </div>
                </div>
                {deviceState === 'connected' && <span className="h-2 w-2 rounded-full bg-success" />}
              </button>

              <button
                onClick={() => handleModeChange('replay')}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-lavender-50 transition-colors ${currentMode === 'replay' ? 'bg-powder/10 font-semibold text-powder-700' : 'text-navy'
                  }`}
              >
                <div className="flex items-center gap-2">
                  <PlayCircle className="h-3.5 w-3.5 text-powder-600" />
                  <div>
                    <div className="font-medium">Replay Mode</div>
                    <div className="text-2xs text-navy-300">Stream recorded EEG sessions</div>
                  </div>
                </div>
              </button>

              <button
                onClick={() => handleModeChange('demo')}
                className={`w-full text-left px-3 py-2 text-xs flex items-center justify-between hover:bg-lavender-50 transition-colors ${currentMode === 'demo' ? 'bg-warning/10 font-semibold text-warning-700' : 'text-navy'
                  }`}
              >
                <div className="flex items-center gap-2">
                  <Radio className="h-3.5 w-3.5 text-warning-600" />
                  <div>
                    <div className="font-medium">Demo Mode</div>
                    <div className="text-2xs text-navy-300">Simulated 256 Hz test signal</div>
                  </div>
                </div>
              </button>
            </div>
          )}
        </div>

        {/* Clock */}
        <div className="hidden md:flex flex-col items-end text-right px-2 border-l border-navy-100/60">
          <span className="text-xs font-semibold text-navy tabular-nums">
            {now.toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
          </span>
          <span className="text-[10px] text-navy-300">
            {now.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' })}
          </span>
        </div>

        {/* Notifications */}
        <div ref={notifRef} className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="relative flex h-9 w-9 items-center justify-center rounded-lg text-navy-400 hover:bg-lavender-100 hover:text-navy transition-colors"
          >
            <Bell className="h-[18px] w-[18px]" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 h-2 w-2 rounded-full bg-peach ring-2 ring-white" />
            )}
          </button>
          {notifOpen && (
            <div className="absolute right-0 top-12 w-80 rounded-xl bg-white shadow-float border border-navy-100/60 animate-fade-in-up overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-navy-100/60 flex items-center justify-between">
                <span className="text-sm font-semibold text-navy">Notifications</span>
                <Badge className="bg-peach-100 text-peach-600">{unreadCount} new</Badge>
              </div>
              <div className="max-h-80 overflow-y-auto scrollbar-thin">
                {mockNotifications.map((n) => (
                  <div key={n.id} className={`px-4 py-3 border-b border-navy-50/40 hover:bg-lavender-50/50 transition-colors ${!n.read ? 'bg-powder-50/30' : ''}`}>
                    <div className="flex items-start gap-3">
                      <span className="mt-1 h-2 w-2 rounded-full flex-shrink-0 bg-powder" />
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-navy">{n.title}</p>
                        <p className="text-xs text-navy-300 mt-0.5 leading-relaxed">{n.message}</p>
                        <p className="text-2xs text-navy-300/60 mt-1">{n.time}</p>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* Profile / Role Selector */}
        <div ref={profileRef} className="relative">
          <button
            onClick={() => setProfileOpen((v) => !v)}
            className="flex items-center gap-2.5 rounded-lg pl-1.5 pr-2 py-1.5 hover:bg-lavender-100 transition-colors"
          >
            <div className={`flex h-7 w-7 items-center justify-center rounded-full text-white text-xs font-semibold ${user?.role === 'doctor' ? 'bg-navy-700 ring-2 ring-lavender-300' : 'bg-navy'
              }`}>
              {user?.name?.charAt(0) || 'R'}
            </div>
            <div className="hidden sm:flex flex-col items-start leading-tight">
              <span className="text-xs font-medium text-navy">{user?.name || 'Operator'}</span>
              <span className="text-2xs text-navy-300 capitalize">{user?.role || 'clinician'}</span>
            </div>
            <ChevronDown className="h-3.5 w-3.5 text-navy-300" />
          </button>

          {profileOpen && (
            <div className="absolute right-0 top-12 w-64 rounded-xl bg-white shadow-float border border-navy-100/60 animate-fade-in-up overflow-hidden z-50">
              <div className="px-4 py-3 border-b border-navy-100/60">
                <p className="text-sm font-medium text-navy">{user?.name}</p>
                <p className="text-xs text-navy-300">{user?.email}</p>
                <div className="mt-2 flex items-center gap-2">
                  <Badge className="bg-lavender-200/60 text-navy-500 capitalize">{user?.role}</Badge>
                </div>
              </div>

              {/* Role Switcher for Testing / Demonstration */}
              <div className="px-3 py-2 border-b border-navy-50 bg-lavender-50/50">
                <div className="text-2xs font-semibold text-navy-400 mb-1.5 uppercase">Switch Role Workspace:</div>
                <div className="grid grid-cols-2 gap-1.5">
                  <button
                    onClick={() => handleRoleSwitch('clinician')}
                    className={`px-2 py-1.5 text-xs rounded font-medium text-center transition-colors ${user?.role === 'clinician' ? 'bg-powder text-navy font-bold shadow-soft' : 'bg-white text-navy-400 hover:bg-white/80'
                      }`}
                  >
                    Clinician
                  </button>
                  <button
                    onClick={() => handleRoleSwitch('doctor')}
                    className={`px-2 py-1.5 text-xs rounded font-medium text-center transition-colors ${user?.role === 'doctor' ? 'bg-lavender-300 text-navy font-bold shadow-soft' : 'bg-white text-navy-400 hover:bg-white/80'
                      }`}
                  >
                    Doctor
                  </button>
                </div>
              </div>

              <button
                onClick={logout}
                className="w-full flex items-center gap-2 px-4 py-2.5 text-sm text-error hover:bg-error/5 transition-colors"
              >
                <LogOut className="h-4 w-4" />
                Sign out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
