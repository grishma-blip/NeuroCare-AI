import { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from '@/context/AuthContext';
import AppLayout from '@/components/layout/AppLayout';
import LoginPage from '@/pages/LoginPage';
import OverviewPage from '@/pages/OverviewPage';
import LiveMonitoringPage from '@/pages/LiveMonitoringPage';
import RecordingAssistancePage from '@/pages/RecordingAssistancePage';
import SessionsPage from '@/pages/SessionsPage';
import TaskTimelinePage from '@/pages/TaskTimelinePage';
import SignalAnalysisPage from '@/pages/SignalAnalysisPage';
import EmotionAnalysisPage from '@/pages/EmotionAnalysisPage';
import MotorImageryPage from '@/pages/MotorImageryPage';
import CognitiveResponsePage from '@/pages/CognitiveResponsePage';
import ParticipantsPage from '@/pages/ParticipantsPage';
import ReportsPage from '@/pages/ReportsPage';
import DeviceManagementPage from '@/pages/DeviceManagementPage';
import SettingsPage from '@/pages/SettingsPage';
import Logo from '@/components/Logo';

function LoadingScreen() {
  return (
    <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-navy animate-fade-in">
      <div className="animate-pulse-soft">
        <Logo variant="light" size="lg" />
      </div>
      <div className="mt-8 h-1 w-40 rounded-full bg-white/10 overflow-hidden">
        <div
          className="h-full w-1/2 bg-powder rounded-full animate-pulse"
          style={{ animation: 'slide 1.5s ease-in-out infinite' }}
        />
      </div>
      <p className="mt-4 text-xs text-white/40 font-medium">Initializing NeuroCare Research Platform...</p>
      <style>{`@keyframes slide { 0% { transform: translateX(-100%); } 100% { transform: translateX(200%); } }`}</style>
    </div>
  );
}

function ProtectedLayout() {
  const { isAuthenticated } = useAuth();
  if (!isAuthenticated) return <Navigate to="/login" replace />;
  return <AppLayout />;
}

function DoctorRoute({ children }: { children: React.ReactNode }) {
  const { isDoctor } = useAuth();
  if (!isDoctor) {
    return <Navigate to="/recording-assist" replace />;
  }
  return <>{children}</>;
}

function AppRoutes() {
  const { isAuthenticated } = useAuth();
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/login" element={isAuthenticated ? <Navigate to="/overview" replace /> : <LoginPage />} />
        <Route element={<ProtectedLayout />}>
          <Route path="/" element={<Navigate to="/overview" replace />} />
          <Route path="/overview" element={<OverviewPage />} />
          <Route path="/recording-assist" element={<RecordingAssistancePage />} />
          <Route path="/sessions" element={<SessionsPage />} />
          <Route path="/participants" element={<ParticipantsPage />} />
          <Route path="/device" element={<DeviceManagementPage />} />
          <Route path="/settings" element={<SettingsPage />} />

          {/* Doctor Only Routes */}
          <Route path="/live" element={<DoctorRoute><LiveMonitoringPage /></DoctorRoute>} />
          <Route path="/timeline" element={<DoctorRoute><TaskTimelinePage /></DoctorRoute>} />
          <Route path="/analysis" element={<DoctorRoute><SignalAnalysisPage /></DoctorRoute>} />
          <Route path="/emotion" element={<DoctorRoute><EmotionAnalysisPage /></DoctorRoute>} />
          <Route path="/motor-imagery" element={<DoctorRoute><MotorImageryPage /></DoctorRoute>} />
          <Route path="/cognitive" element={<Navigate to="/motor-imagery" replace />} />
          <Route path="/reports" element={<DoctorRoute><ReportsPage /></DoctorRoute>} />
          <Route path="/users" element={<Navigate to="/overview" replace />} />

          <Route path="*" element={<Navigate to="/overview" replace />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default function App() {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const timer = setTimeout(() => setLoading(false), 500);
    return () => clearTimeout(timer);
  }, []);

  if (loading) return <LoadingScreen />;

  return (
    <AuthProvider>
      <AppRoutes />
    </AuthProvider>
  );
}
