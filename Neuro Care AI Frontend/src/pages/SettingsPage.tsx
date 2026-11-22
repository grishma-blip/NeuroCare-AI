import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  User,
  Shield,
  Bell,
  Monitor,
  Cpu,
  Database,
  Info,
  Check,
  LogOut,
  Brain,
  Sliders,
  UserCheck,
} from 'lucide-react';
import { Card, Button, Badge, DisclaimerBar, SectionHeader } from '@/components/ui';
import { useAuth } from '@/context/AuthContext';

type SettingsTab = 'profile' | 'security' | 'notifications' | 'display' | 'device' | 'data' | 'ml_models' | 'about';

export default function SettingsPage() {
  const navigate = useNavigate();
  const { user, logout, isDoctor, login } = useAuth();
  const [activeTab, setActiveTab] = useState<SettingsTab>('profile');
  const [savedMsg, setSavedMsg] = useState(false);

  const [notifPrefs, setNotifPrefs] = useState({
    sessionComplete: true,
    deviceDisconnect: true,
    exportReady: true,
    consentExpiry: true,
    signalQuality: true,
  });

  const [displayPrefs, setDisplayPrefs] = useState({
    compactMode: false,
    showRawByDefault: true,
    waveformSpeed: 'normal',
    theme: 'light',
  });

  const [mlPrefs, setMlPrefs] = useState({
    modelBenchmark: 'DEAP Frontal Single-Channel Projection',
    confidenceThreshold: 0.38,
    autoInferencePeriodSeconds: 3,
  });

  // Role-filtered tabs
  const tabs: { id: SettingsTab; label: string; icon: any; doctorOnly?: boolean }[] = [
    { id: 'profile', label: 'User Profile', icon: User },
    { id: 'security', label: 'Account Security', icon: Shield },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'display', label: 'Display Preferences', icon: Monitor },
    { id: 'device', label: 'Device Configuration', icon: Cpu, doctorOnly: true },
    { id: 'ml_models', label: 'ML Models & Thresholds', icon: Brain, doctorOnly: true },
    { id: 'data', label: 'Data Retention & GDPR', icon: Database, doctorOnly: true },
    { id: 'about', label: 'Application Info', icon: Info },
  ];

  const visibleTabs = tabs.filter((t) => !t.doctorOnly || isDoctor);

  const handleSave = () => {
    setSavedMsg(true);
    setTimeout(() => setSavedMsg(false), 2500);
  };

  const handleRoleSwitch = async (role: 'doctor' | 'clinician') => {
    if (role === 'doctor') {
      await login('dr.patel@neurocare.ai', 'Doctor@123', 'doctor');
    } else {
      await login('clinician@neurocare.ai', 'Clinician@123', 'clinician');
    }
  };

  return (
    <div className="space-y-6 max-w-[1200px] mx-auto animate-fade-in">

      <div className="grid grid-cols-1 lg:grid-cols-[220px_1fr] gap-6">
        {/* Tab sidebar */}
        <Card className="p-2 self-start">
          <div className="px-3 py-2 text-2xs font-semibold text-navy-300 uppercase tracking-wider">
            {isDoctor ? 'Doctor Settings' : 'Clinician Preferences'}
          </div>
          <nav className="space-y-0.5">
            {visibleTabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`flex items-center gap-2.5 w-full rounded-lg px-3 py-2 text-xs transition-all text-left ${
                    activeTab === tab.id
                      ? 'bg-powder text-navy font-semibold shadow-soft'
                      : 'text-navy-400 hover:text-navy hover:bg-lavender-100'
                  }`}
                >
                  <Icon className="h-4 w-4 flex-shrink-0" />
                  <span className="truncate">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </Card>

        {/* Tab content */}
        <Card className="p-6">
          {savedMsg && (
            <div className="mb-4 p-2.5 rounded-lg bg-success/10 border border-success/30 text-xs text-success flex items-center gap-2">
              <Check className="h-4 w-4" />
              <span>Preferences updated successfully.</span>
            </div>
          )}

          {/* User Profile */}
          {activeTab === 'profile' && (
            <div className="space-y-5 animate-fade-in">
              <SectionHeader title="User Profile" subtitle="Your personal credentials and current role assignments" />

              <div className="flex items-center gap-4 pb-4 border-b border-navy-100">
                <div className="h-14 w-14 rounded-full bg-navy text-white text-lg font-bold flex items-center justify-center">
                  {user?.name?.charAt(0) || 'U'}
                </div>
                <div>
                  <h3 className="text-sm font-semibold text-navy">{user?.name || 'Research Operator'}</h3>
                  <p className="text-xs text-navy-300">{user?.email}</p>
                  <Badge className="mt-1 bg-lavender-100 text-navy-600 capitalize">
                    {user?.role === 'doctor' ? 'Doctor / Neurologist' : 'Clinician'}
                  </Badge>
                </div>
              </div>

              {/* Quick Workspace Switcher for Evaluation */}
              <div className="p-4 rounded-xl border border-powder-200 bg-powder-50/40">
                <span className="text-xs font-semibold text-navy block mb-1">
                  Active Portal Workspace Switcher
                </span>
                <p className="text-2xs text-navy-300 mb-3">
                  Toggle your current session role to preview either the Clinician dashboard or the Doctor dashboard:
                </p>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant={user?.role === 'clinician' ? 'primary' : 'secondary'}
                    onClick={() => handleRoleSwitch('clinician')}
                  >
                    Switch to Clinician Portal
                  </Button>
                  <Button
                    size="sm"
                    variant={user?.role === 'doctor' ? 'accent' : 'secondary'}
                    onClick={() => handleRoleSwitch('doctor')}
                  >
                    Switch to Doctor Portal
                  </Button>
                </div>
              </div>

              <div className="pt-2 flex justify-end">
                <Button onClick={handleSave}>Save Changes</Button>
              </div>
            </div>
          )}

          {/* Account Security */}
          {activeTab === 'security' && (
            <div className="space-y-4 animate-fade-in text-xs">
              <SectionHeader title="Account Security" subtitle="Update authentication credentials and session tokens" />
              <div>
                <label className="block font-medium text-navy mb-1">Current Password</label>
                <input
                  type="password"
                  placeholder="••••••••"
                  className="w-full max-w-sm px-3 py-2 rounded-lg border border-navy-100 text-navy focus:outline-none"
                />
              </div>
              <div>
                <label className="block font-medium text-navy mb-1">New Password</label>
                <input
                  type="password"
                  placeholder="Min. 8 characters with numbers"
                  className="w-full max-w-sm px-3 py-2 rounded-lg border border-navy-100 text-navy focus:outline-none"
                />
              </div>
              <div className="pt-3">
                <Button onClick={handleSave}>Update Password</Button>
              </div>
            </div>
          )}

          {/* Notifications */}
          {activeTab === 'notifications' && (
            <div className="space-y-4 animate-fade-in text-xs">
              <SectionHeader title="Notification Preferences" subtitle="Choose what system events trigger audio/visual alerts" />
              {Object.entries(notifPrefs).map(([key, val]) => (
                <label key={key} className="flex items-center justify-between p-3 rounded-lg border border-navy-100 hover:bg-lavender-50/30 cursor-pointer">
                  <span className="text-navy font-medium capitalize">{key.replace(/([A-Z])/g, ' $1')}</span>
                  <input
                    type="checkbox"
                    checked={val}
                    onChange={(e) => setNotifPrefs({ ...notifPrefs, [key]: e.target.checked })}
                    className="rounded text-powder focus:ring-0"
                  />
                </label>
              ))}
              <div className="pt-3 flex justify-end">
                <Button onClick={handleSave}>Save Preferences</Button>
              </div>
            </div>
          )}

          {/* Display */}
          {activeTab === 'display' && (
            <div className="space-y-4 animate-fade-in text-xs">
              <SectionHeader title="Display Preferences" subtitle="Chart refresh rates and layout configuration" />
              <div className="space-y-3">
                <label className="flex items-center justify-between p-3 rounded-lg border border-navy-100">
                  <span className="text-navy font-medium">Show Raw ADC Overlay by Default</span>
                  <input
                    type="checkbox"
                    checked={displayPrefs.showRawByDefault}
                    onChange={(e) => setDisplayPrefs({ ...displayPrefs, showRawByDefault: e.target.checked })}
                    className="rounded text-powder focus:ring-0"
                  />
                </label>
                <div className="p-3 rounded-lg border border-navy-100 flex items-center justify-between">
                  <span className="text-navy font-medium">Theme Styling</span>
                  <Badge className="bg-lavender-100 text-navy-600">Preserved Navy &amp; Light Theme</Badge>
                </div>
              </div>
              <div className="pt-3 flex justify-end">
                <Button onClick={handleSave}>Save Display Settings</Button>
              </div>
            </div>
          )}

          {/* Device Configuration */}
          {activeTab === 'device' && isDoctor && (
            <div className="space-y-4 animate-fade-in text-xs">
              <SectionHeader title="Hardware &amp; Acquisition Configuration" subtitle="Low-level serial port and sampling rate controls" />
              <div className="p-4 rounded-xl border border-navy-100 space-y-3 bg-white">
                <div className="flex justify-between items-center">
                  <span className="text-navy-400">Target Microcontroller:</span>
                  <span className="font-semibold text-navy">Arduino UNO R4 WiFi</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-navy-400">Front-End Circuit:</span>
                  <span className="font-semibold text-navy">BioAmp EXG Pill (1-Channel)</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-navy-400">Hardware Filter Cutoff:</span>
                  <span className="font-mono font-semibold text-navy">0.5 – 29.5 Hz</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-navy-400">Nominal Sampling Rate:</span>
                  <span className="font-mono font-semibold text-navy">256 Hz (~3906 µs)</span>
                </div>
              </div>
              <Button onClick={() => navigate('/device')}>Open Device Diagnostics</Button>
            </div>
          )}

          {/* ML Models & Thresholds */}
          {activeTab === 'ml_models' && isDoctor && (
            <div className="space-y-4 animate-fade-in text-xs">
              <SectionHeader title="Machine Learning &amp; AI Configuration" subtitle="Model calibration and uncertainty thresholds" />
              <div className="space-y-3">
                <div>
                  <label className="block font-medium text-navy mb-1">Emotion Reference Architecture</label>
                  <input
                    type="text"
                    readOnly
                    value={mlPrefs.modelBenchmark}
                    className="w-full px-3 py-2 rounded-lg border border-navy-100 bg-navy-50/50 text-navy font-mono"
                  />
                </div>
                <div>
                  <label className="block font-medium text-navy mb-1">
                    Uncertainty / Inconclusive Threshold (Confidence &lt; {mlPrefs.confidenceThreshold * 100}%)
                  </label>
                  <input
                    type="range"
                    min="0.25"
                    max="0.60"
                    step="0.01"
                    value={mlPrefs.confidenceThreshold}
                    onChange={(e) => setMlPrefs({ ...mlPrefs, confidenceThreshold: parseFloat(e.target.value) })}
                    className="w-full"
                  />
                  <div className="text-2xs text-navy-300 mt-1">
                    Current value: <strong>{Math.round(mlPrefs.confidenceThreshold * 100)}%</strong>. If top class confidence is below this score, output labels as Inconclusive.
                  </div>
                </div>
              </div>
              <div className="pt-3 flex justify-end">
                <Button onClick={handleSave}>Save ML Parameters</Button>
              </div>
            </div>
          )}

          {/* Data Retention */}
          {activeTab === 'data' && isDoctor && (
            <div className="space-y-4 animate-fade-in text-xs">
              <SectionHeader title="Data Retention &amp; GDPR Protocols" subtitle="IRB ethics and anonymous storage lifecycles" />
              <div className="p-4 rounded-xl border border-navy-100 bg-white space-y-2">
                <p className="text-navy-400 leading-relaxed">
                  All recording sessions are linked to anonymous codes (P-xxx). Time-series voltage arrays and PSD features
                  are stored securely in local persistent storage (`backend/neurocare.db`).
                </p>
                <p className="text-navy-400 leading-relaxed">
                  Participant data deletion requests instantly purge all time-series points and task logs.
                </p>
              </div>
              <Button onClick={() => navigate('/participants')}>Manage Subject Records</Button>
            </div>
          )}

          {/* About */}
          {activeTab === 'about' && (
            <div className="space-y-4 animate-fade-in text-xs">
              <SectionHeader title="Application Information" subtitle="Platform version and hardware integration specifications" />
              <div className="p-4 rounded-xl border border-navy-100 bg-white space-y-2 text-navy-400">
                <div className="flex justify-between">
                  <span>Application:</span>
                  <span className="font-bold text-navy">NeuroCare AI — EEG Cognitive Monitoring</span>
                </div>
                <div className="flex justify-between">
                  <span>Version:</span>
                  <span className="font-mono text-navy">2.0.0 (Research Prototype)</span>
                </div>
                <div className="flex justify-between">
                  <span>Hardware Stack:</span>
                  <span className="text-navy">BioAmp EXG Pill + Arduino UNO R4 WiFi (USB Serial)</span>
                </div>
                <div className="flex justify-between">
                  <span>Filter Bandpass:</span>
                  <span className="font-mono text-navy">0.5 – 29.5 Hz (Single Channel A0)</span>
                </div>
                <div className="flex justify-between">
                  <span>Regulatory Status:</span>
                  <span className="text-peach-700 font-medium">Experimental Research Only. Not a Medical Device.</span>
                </div>
              </div>
            </div>
          )}
        </Card>
      </div>
    </div>
  );
}
