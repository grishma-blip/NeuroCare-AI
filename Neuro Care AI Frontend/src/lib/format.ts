import { format, parseISO, isValid, formatDistanceToNow } from 'date-fns';
import type { SessionStatus, SignalQuality, ConsentStatus } from '@/types';

export function formatDuration(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '—';
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function formatDurationClock(seconds: number | null | undefined): string {
  if (seconds == null || seconds <= 0) return '00:00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
}

export function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput || dateInput === '—') return '—';
  try {
    const d = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
    if (!isValid(d)) return typeof dateInput === 'string' ? dateInput : '—';
    return format(d, 'MMM d, yyyy');
  } catch {
    return String(dateInput);
  }
}

export function formatDateTime(dateInput: string | Date | null | undefined): string {
  if (!dateInput || dateInput === '—') return '—';
  try {
    const d = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
    if (!isValid(d)) return typeof dateInput === 'string' ? dateInput : '—';
    return format(d, 'MMM d, yyyy · HH:mm');
  } catch {
    return String(dateInput);
  }
}

export function formatTimeRelative(dateInput: string | Date | null | undefined): string {
  if (!dateInput || dateInput === '—') return '—';
  try {
    const d = typeof dateInput === 'string' ? parseISO(dateInput) : dateInput;
    if (!isValid(d)) return '—';
    return formatDistanceToNow(d, { addSuffix: true });
  } catch {
    return '—';
  }
}

export function formatNumber(n: number | null | undefined): string {
  if (n == null) return '—';
  return n.toLocaleString('en-US');
}

export function formatSize(kb: number | null | undefined): string {
  if (!kb || kb <= 0) return '0 KB';
  if (kb < 1024) return `${Math.round(kb)} KB`;
  return `${(kb / 1024).toFixed(1)} MB`;
}

export const statusColors: Record<SessionStatus, { bg: string; text: string; dot: string; label: string }> = {
  'completed': { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success', label: 'Completed' },
  'recording': { bg: 'bg-powder/15', text: 'text-powder-600', dot: 'bg-powder animate-pulse', label: 'Recording' },
  'scheduled': { bg: 'bg-lavender-300/30', text: 'text-navy-500', dot: 'bg-navy-300', label: 'Scheduled' },
  'failed': { bg: 'bg-error/10', text: 'text-error', dot: 'bg-error', label: 'Failed' },
  'cancelled': { bg: 'bg-navy-100', text: 'text-navy-400', dot: 'bg-navy-300', label: 'Cancelled' },
  'in-progress': { bg: 'bg-powder/15', text: 'text-powder-600', dot: 'bg-powder', label: 'In Progress' },
  'paused': { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning', label: 'Paused' },
};

export const qualityColors: Record<SignalQuality, { bg: string; text: string; dot: string; label: string }> = {
  'excellent': { bg: 'bg-success/10', text: 'text-success', dot: 'bg-success', label: 'Excellent' },
  'good': { bg: 'bg-powder/15', text: 'text-powder-600', dot: 'bg-powder', label: 'Good' },
  'fair': { bg: 'bg-warning/10', text: 'text-warning', dot: 'bg-warning', label: 'Fair' },
  'poor': { bg: 'bg-error/10', text: 'text-error', dot: 'bg-error', label: 'Poor' },
  'unassessed': { bg: 'bg-navy-50', text: 'text-navy-400', dot: 'bg-navy-200', label: 'Unassessed' },
};

export const consentColors: Record<ConsentStatus, { bg: string; text: string; label: string }> = {
  'given': { bg: 'bg-success/10', text: 'text-success', label: 'Consent Given' },
  'pending': { bg: 'bg-warning/10', text: 'text-warning', label: 'Pending Renewal' },
  'withdrawn': { bg: 'bg-error/10', text: 'text-error', label: 'Withdrawn' },
};

export const taskEventColors: Record<string, { bg: string; border: string; text: string }> = {
  'setup': { bg: 'bg-navy-50', border: 'border-navy-200', text: 'text-navy-600' },
  'baseline': { bg: 'bg-lavender-200', border: 'border-lavender-400', text: 'text-navy-500' },
  'instruction': { bg: 'bg-peach-50', border: 'border-peach-200', text: 'text-peach-600' },
  'task': { bg: 'bg-powder-100', border: 'border-powder-300', text: 'text-powder-600' },
  'rest': { bg: 'bg-gray-50', border: 'border-gray-200', text: 'text-gray-500' },
  'completion': { bg: 'bg-success/10', border: 'border-success/30', text: 'text-success' },
};
