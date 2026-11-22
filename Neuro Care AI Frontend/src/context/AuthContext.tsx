import { createContext, useContext, useState, useEffect, type ReactNode } from 'react';
import type { User, UserRole } from '@/types';

interface AuthContextValue {
  user: User | null;
  login: (email: string, password: string, role?: UserRole) => Promise<void>;
  logout: () => void;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isClinician: boolean;
  isDoctor: boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(() => {
    const saved = localStorage.getItem('neurocare_user');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch {
        return null;
      }
    }
    // Default session for smooth initial load
    const defaultSession: User = {
      id: 'u_clinician',
      email: 'clinician@neurocare.ai',
      name: 'Sarah Chen',
      role: 'clinician',
    };
    try {
      localStorage.setItem('neurocare_user', JSON.stringify(defaultSession));
    } catch {
      // ignore
    }
    return defaultSession;
  });

  useEffect(() => {
    if (user) {
      localStorage.setItem('neurocare_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('neurocare_user');
      localStorage.removeItem('neurocare_token');
    }
  }, [user]);

  const login = async (email: string, password: string, role?: UserRole) => {
    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password, role }),
      });

      if (res.ok) {
        const data = await res.json();
        localStorage.setItem('neurocare_token', data.token);
        localStorage.setItem('neurocare_user', JSON.stringify(data.user));
        setUser(data.user);
        return;
      }
    } catch {
      // Backend offline fallback
    }

    // Fallback if backend is not responding
    const namePart = email.split('@')[0].replace(/[._]/g, ' ');
    const name = namePart.split(' ').map((w) => w.charAt(0).toUpperCase() + w.slice(1)).join(' ') || 'Research Operator';
    const fallbackUser: User = {
      id: role === 'doctor' ? 'u_doctor' : 'u_clinician',
      email,
      name,
      role: role || (email.includes('doctor') ? 'doctor' : 'clinician'),
    };
    localStorage.setItem('neurocare_user', JSON.stringify(fallbackUser));
    setUser(fallbackUser);
  };

  const logout = () => {
    localStorage.removeItem('neurocare_user');
    localStorage.removeItem('neurocare_token');
    setUser(null);
  };

  const isClinician = user?.role === 'clinician';
  const isDoctor = user?.role === 'doctor';
  const isAdmin = false;

  return (
    <AuthContext.Provider value={{ user, login, logout, isAuthenticated: !!user, isAdmin, isClinician, isDoctor }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
