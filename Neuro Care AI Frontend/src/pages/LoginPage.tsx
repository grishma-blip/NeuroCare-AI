import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Mail, Lock, Eye, EyeOff, ShieldCheck, Loader2, AlertCircle } from 'lucide-react';
import Logo from '@/components/Logo';
import { useAuth } from '@/context/AuthContext';
import type { UserRole } from '@/types';

export default function LoginPage() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [remember, setRemember] = useState(true);
  const [role, setRole] = useState<UserRole>('clinician');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!email || !password) {
      setError('Please enter both email and password.');
      return;
    }
    if (!email.includes('@')) {
      setError('Please enter a valid email address.');
      return;
    }
    if (password.length < 6) {
      setError('Password must be at least 6 characters.');
      return;
    }

    setLoading(true);
    try {
      await login(email, password, role);
      navigate('/overview');
    } catch {
      setError('Authentication failed. Please check your credentials.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex">
      {/* Left panel — brand */}
      <div className="hidden lg:flex lg:w-[44%] bg-navy relative overflow-hidden flex-col justify-between p-12">
        {/* Decorative grid pattern */}
        <div
          className="absolute inset-0 opacity-[0.04]"
          style={{
            backgroundImage: `linear-gradient(rgba(141,185,240,1) 1px, transparent 1px), linear-gradient(90deg, rgba(141,185,240,1) 1px, transparent 1px)`,
            backgroundSize: '40px 40px',
          }}
        />
        {/* Glow */}
        <div className="absolute -top-24 -right-24 h-96 w-96 rounded-full bg-powder/10 blur-3xl" />
        <div className="absolute bottom-0 left-1/4 h-64 w-64 rounded-full bg-peach/5 blur-3xl" />

        <div className="relative z-10">
          <Logo variant="light" size="lg" />
        </div>

        <div className="relative z-10 max-w-md">
          <h1 className="text-3xl font-semibold text-white tracking-tight leading-tight">
            EEG-Based Cognitive Response Monitoring
          </h1>
          <p className="text-white/50 mt-4 leading-relaxed">
            A research-oriented platform for real-time EEG signal acquisition, task-aligned analysis, and experimental data management.
          </p>
          <div className="mt-8 flex items-center gap-3 text-white/40 text-sm">
            <ShieldCheck className="h-4 w-4 text-powder" />
            <span>Secure access for authorized research operators</span>
          </div>
        </div>

        <div className="relative z-10 text-2xs text-white/30">
          NeuroCare is an experimental prototype. Not a medical device.
        </div>
      </div>

      {/* Right panel — form */}
      <div className="flex-1 flex items-center justify-center p-6 bg-lavender-50/30">
        <div className="w-full max-w-md animate-fade-in-up">
          {/* Mobile logo */}
          <div className="lg:hidden mb-8 flex justify-center">
            <Logo size="md" />
          </div>

          <div className="bg-white rounded-2xl shadow-elevated border border-navy-100/50 p-8">
            <h2 className="text-xl font-semibold text-navy tracking-tight">Welcome back</h2>
            <p className="text-sm text-navy-300 mt-1">Sign in to access the NeuroCare dashboard.</p>

            {error && (
              <div className="mt-5 flex items-start gap-2.5 rounded-lg bg-error/5 border border-error/20 px-3.5 py-2.5 animate-fade-in">
                <AlertCircle className="h-4 w-4 text-error flex-shrink-0 mt-0.5" />
                <p className="text-xs text-error leading-relaxed">{error}</p>
              </div>
            )}

            <form onSubmit={handleSubmit} className="mt-6 space-y-4">
              {/* Role selector */}
              <div>
                <label className="block text-xs font-medium text-navy-400 mb-1.5">Access Role Workspace</label>
                <div className="grid grid-cols-2 gap-2">
                  {(['clinician', 'doctor'] as UserRole[]).map((r) => (
                    <button
                      key={r}
                      type="button"
                      onClick={() => {
                        setRole(r);
                        if (r === 'clinician') {
                          setEmail('clinician@neurocare.ai');
                          setPassword('Clinician@123');
                        } else {
                          setEmail('dr.patel@neurocare.ai');
                          setPassword('Doctor@123');
                        }
                      }}
                      className={`rounded-lg border px-3 py-2 text-xs transition-all text-center ${
                        role === r
                          ? 'border-powder bg-powder/15 text-navy font-semibold shadow-soft'
                          : 'border-navy-100 text-navy-300 hover:border-navy-200'
                      }`}
                    >
                      {r === 'clinician' ? 'Clinician' : 'Doctor'}
                    </button>
                  ))}
                </div>
              </div>

              {/* Email */}
              <div>
                <label className="block text-xs font-medium text-navy-400 mb-1.5">Email Address</label>
                <div className="relative">
                  <Mail className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-300" />
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="operator@neurocare.lab"
                    className="w-full rounded-lg border border-navy-100 bg-white pl-10 pr-3 py-2.5 text-sm text-navy placeholder:text-navy-200 focus:outline-none focus:ring-2 focus:ring-powder/30 focus:border-powder transition-all"
                  />
                </div>
              </div>

              {/* Password */}
              <div>
                <label className="block text-xs font-medium text-navy-400 mb-1.5">Password</label>
                <div className="relative">
                  <Lock className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-300" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-navy-100 bg-white pl-10 pr-10 py-2.5 text-sm text-navy placeholder:text-navy-200 focus:outline-none focus:ring-2 focus:ring-powder/30 focus:border-powder transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-navy-300 hover:text-navy-500 transition-colors"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              {/* Remember + forgot */}
              <div className="flex items-center justify-between">
                <label className="flex items-center gap-2 cursor-pointer">
                  <button
                    type="button"
                    onClick={() => setRemember((v) => !v)}
                    className={`flex h-4 w-4 items-center justify-center rounded border transition-all ${
                      remember ? 'bg-powder border-powder' : 'border-navy-200 bg-white'
                    }`}
                  >
                    {remember && (
                      <svg className="h-3 w-3 text-navy" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={3}>
                        <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
                      </svg>
                    )}
                  </button>
                  <span className="text-xs text-navy-400">Remember me</span>
                </label>
                <button type="button" className="text-xs text-powder-600 hover:text-powder-700 font-medium transition-colors">
                  Forgot password?
                </button>
              </div>

              {/* Submit */}
              <button
                type="submit"
                disabled={loading}
                className="w-full flex items-center justify-center gap-2 rounded-lg bg-powder text-navy font-medium py-2.5 text-sm hover:bg-powder-300 transition-all shadow-soft disabled:opacity-60 disabled:cursor-not-allowed"
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Authenticating...
                  </>
                ) : (
                  'Sign in'
                )}
              </button>
            </form>

            <div className="mt-6 pt-5 border-t border-navy-50/60 flex items-center justify-between text-xs text-navy-300">
              <div className="flex items-center gap-1.5">
                <ShieldCheck className="h-3.5 w-3.5 text-success" />
                <span>FastAPI + SQLite persistent authentication active.</span>
              </div>
              <span className="font-mono text-[10px] text-navy-400">BioAmp v2.1</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
