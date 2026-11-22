import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Search,
  Filter,
  Download,
  Eye,
  X,
  Calendar,
  CheckCircle2,
  CircleDot,
  XCircle,
  Pause,
  Clock,
  Plus,
  Play,
  FileSpreadsheet,
  BarChart3,
  Brain,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  DisclaimerBar,
  EmptyState,
  SectionHeader,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui';
import { DataTable } from '@/components/ui/DataTable';
import { api } from '@/lib/api';
import { statusColors, qualityColors, formatDuration, formatDateTime, formatNumber, formatDate } from '@/lib/format';
import type { RecordingSession, SessionStatus, Participant } from '@/types';

// Zod Schema for Session Creation
const sessionSchema = z.object({
  participantCode: z.string().min(1, 'Participant is required'),
  taskType: z.string().min(1, 'Protocol is required'),
  notes: z.string().optional(),
});

type SessionFormData = z.infer<typeof sessionSchema>;

export default function SessionsPage() {
  const navigate = useNavigate();
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [loading, setLoading] = useState(true);

  const [statusFilter, setStatusFilter] = useState<SessionStatus | 'all'>('all');
  const [selected, setSelected] = useState<RecordingSession | null>(null);

  // New session modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState('');

  const {
    register,
    handleSubmit,
    setValue,
    reset,
    formState: { errors },
  } = useForm<SessionFormData>({
    resolver: zodResolver(sessionSchema),
    defaultValues: {
      participantCode: 'P-014',
      taskType: 'Motor Imagery Paradigm',
      notes: '',
    },
  });

  const fetchSessions = async () => {
    setLoading(true);
    try {
      const [sessList, partList] = await Promise.all([
        api.getSessions(),
        api.getParticipants(),
      ]);
      setSessions(sessList);
      setParticipants(partList);
      if (partList.length > 0) {
        setValue('participantCode', partList[0].code);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchSessions();
  }, []);

  const onSubmitSession = async (data: SessionFormData) => {
    setCreateError('');
    setCreating(true);
    try {
      const targetParticipant = participants.find(
        (p) => p.code === data.participantCode || p.id === data.participantCode
      );
      if (!targetParticipant) {
        throw new Error('Please select an active enrolled participant.');
      }
      const res = await api.createSession({
        participant_id: targetParticipant.id,
        created_by: 'clinician_01',
        protocol_name: data.taskType,
        data_mode: 'HARDWARE',
      });
      setShowCreateModal(false);
      reset();
      await fetchSessions();
      // Navigate to live monitoring to start recording
      navigate(`/live?session=${res.sessionId}`);
    } catch (err: any) {
      setCreateError(err.message || 'Failed to create session');
    } finally {
      setCreating(false);
    }
  };

  const handleDownload = (sessionId: string) => {
    navigate(`/reports?session=${sessionId}`);
  };

  const filtered = useMemo(() => {
    return sessions.filter((s) => {
      const matchesStatus = statusFilter === 'all' || s.status === statusFilter;
      return matchesStatus;
    });
  }, [sessions, statusFilter]);

  // TanStack column definitions
  const columns: ColumnDef<RecordingSession>[] = [
    {
      accessorKey: 'id',
      header: 'Session ID',
      cell: ({ row }) => <span className="font-mono font-medium text-navy">{row.original.id}</span>,
    },
    {
      accessorKey: 'participantCode',
      header: 'Participant',
      cell: ({ row }) => <span className="text-navy-400 font-medium">{row.original.participantCode}</span>,
    },
    {
      accessorKey: 'date',
      header: 'Date & Time',
      cell: ({ row }) => <span className="text-navy-400">{formatDateTime(row.original.date)}</span>,
    },
    {
      accessorKey: 'taskType',
      header: 'Protocol',
      cell: ({ row }) => <span className="text-navy font-medium">{row.original.taskType}</span>,
    },
    {
      accessorKey: 'duration',
      header: 'Duration',
      cell: ({ row }) => <span className="font-mono text-navy-400">{formatDuration(row.original.duration)}</span>,
    },
    {
      accessorKey: 'sampleCount',
      header: 'Samples',
      cell: ({ row }) => <span className="font-mono text-navy-400">{formatNumber(row.original.sampleCount)}</span>,
    },
    {
      accessorKey: 'signalQuality',
      header: 'Signal Quality',
      cell: ({ row }) => {
        const q = row.original.signalQuality;
        return (
          <Badge className={(qualityColors[q]?.bg || 'bg-navy-50') + ' ' + (qualityColors[q]?.text || 'text-navy')}>
            {q}
          </Badge>
        );
      },
    },
    {
      accessorKey: 'status',
      header: 'Status',
      cell: ({ row }) => {
        const s = row.original.status;
        return (
          <Badge className={(statusColors[s]?.bg || 'bg-navy-50') + ' ' + (statusColors[s]?.text || 'text-navy')}>
            {s}
          </Badge>
        );
      },
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const s = row.original;
        return (
          <div className="flex items-center justify-end gap-1.5">
            <Button size="sm" variant="ghost" onClick={() => setSelected(s)} title="Inspect Session">
              <Eye className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => navigate(`/analysis?session=${s.id}`)}
              title="Signal Analysis"
            >
              <BarChart3 className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => api.downloadSessionPdf(s.id, s.session_code)}
              title="Download Vector PDF Report"
              className="text-error hover:text-error"
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => api.downloadSessionCsv(s.id, s.session_code)}
              title="Download Raw CSV"
              className="text-success hover:text-success"
            >
              <Download className="h-3.5 w-3.5" />
            </Button>
          </div>
        );
      },
    },
  ];

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-fade-in">

      {/* Header and Create Button */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-navy">EEG Recording Sessions</h2>
          <p className="text-xs text-navy-300 mt-0.5">
            Browse, search, and manage experimental EEG time-series sessions and structured task protocols.
          </p>
        </div>

        <Button
          onClick={() => {
            reset();
            setShowCreateModal(true);
          }}
        >
          <Plus className="h-3.5 w-3.5" />
          Create New Session
        </Button>
      </div>

      {/* Status Filter Toolbar */}
      <Card className="p-3">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-navy-300">Status Filter:</span>
          <div className="flex rounded-lg border border-navy-100 p-0.5 bg-navy-50/50">
            {(['all', 'completed', 'in-progress', 'scheduled', 'failed'] as const).map((st) => (
              <button
                key={st}
                onClick={() => setStatusFilter(st)}
                className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors capitalize ${statusFilter === st ? 'bg-white text-navy shadow-soft' : 'text-navy-300 hover:text-navy'
                  }`}
              >
                {st}
              </button>
            ))}
          </div>
        </div>
      </Card>

      {/* Sessions DataTable (TanStack Table) */}
      <DataTable
        columns={columns}
        data={filtered}
        searchPlaceholder="Search by session ID, participant code, or protocol..."
        onRowClick={(row) => setSelected(row)}
        pageSize={10}
      />

      {/* Create New Session Dialog with React Hook Form + Zod */}
      <Dialog open={showCreateModal} onOpenChange={setShowCreateModal}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-powder-600" />
              <DialogTitle>Configure Recording Session</DialogTitle>
            </div>
            <DialogDescription>
              Associate an anonymous participant with a structured EEG research task paradigm.
            </DialogDescription>
          </DialogHeader>

          {createError && (
            <div className="mb-4 p-2.5 rounded-lg bg-error/10 border border-error/20 text-xs text-error">
              {createError}
            </div>
          )}

          <form onSubmit={handleSubmit(onSubmitSession)} className="space-y-4 text-xs">
            <div>
              <label className="block font-medium text-navy mb-1">Participant Code</label>
              <select
                {...register('participantCode')}
                className="w-full px-3 py-2 rounded-lg border border-navy-100 text-navy font-mono bg-white focus:outline-none"
              >
                {participants.map((p) => (
                  <option key={p.id} value={p.code}>
                    {p.code} (Consent: {p.consentStatus})
                  </option>
                ))}
              </select>
              {errors.participantCode && (
                <p className="text-2xs text-error mt-1">{errors.participantCode.message}</p>
              )}
            </div>

            <div>
              <label className="block font-medium text-navy mb-1">Task Protocol / Paradigm</label>
              <select
                {...register('taskType')}
                className="w-full px-3 py-2 rounded-lg border border-navy-100 text-navy bg-white focus:outline-none"
              >
                <option value="Motor Imagery Paradigm">Motor Imagery Paradigm (Tennis / Hand Grasp)</option>
                <option value="Resting State Baseline">Resting State Baseline (Eyes Open / Closed)</option>
                <option value="Auditory Oddball Tone Task">Auditory Oddball Tone Task</option>
                <option value="Affective State Induction">Affective State Induction</option>
              </select>
              {errors.taskType && (
                <p className="text-2xs text-error mt-1">{errors.taskType.message}</p>
              )}
            </div>

            <div>
              <label className="block font-medium text-navy mb-1">Session Protocol Notes</label>
              <textarea
                rows={3}
                {...register('notes')}
                placeholder="Electrode placement notes, room conditions, participant comfort..."
                className="w-full px-3 py-2 rounded-lg border border-navy-100 text-navy focus:outline-none"
              />
            </div>

            <DialogFooter>
              <Button type="button" variant="secondary" onClick={() => setShowCreateModal(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={creating}>
                {creating ? 'Initializing...' : 'Create & Launch Recording'}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Session Details Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        {selected && (
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle className="text-base font-semibold text-navy">{selected.id}</DialogTitle>
              <DialogDescription>
                Participant {selected.participantCode} · Recorded {formatDate(selected.date)}
              </DialogDescription>
            </DialogHeader>

            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 my-4">
              <div className="p-3 rounded-lg bg-navy-50/50">
                <span className="text-2xs text-navy-300 block">Status</span>
                <span className="font-semibold text-navy text-xs capitalize">{selected.status}</span>
              </div>
              <div className="p-3 rounded-lg bg-navy-50/50">
                <span className="text-2xs text-navy-300 block">Duration</span>
                <span className="font-semibold text-navy text-xs font-mono">{formatDuration(selected.duration)}</span>
              </div>
              <div className="p-3 rounded-lg bg-navy-50/50">
                <span className="text-2xs text-navy-300 block">Total Samples</span>
                <span className="font-semibold text-navy text-xs font-mono">{formatNumber(selected.sampleCount)}</span>
              </div>
              <div className="p-3 rounded-lg bg-navy-50/50">
                <span className="text-2xs text-navy-300 block">Signal Quality</span>
                <span className="font-semibold text-navy text-xs capitalize">{selected.signalQuality}</span>
              </div>
            </div>

            <div className="space-y-2 text-xs">
              <span className="font-semibold text-navy">Hardware &amp; Acquisition Parameters</span>
              <div className="p-3 rounded-lg border border-navy-100 bg-lavender-50/30 text-navy-400 space-y-1">
                <div>Board: Arduino UNO R4 WiFi via USB Serial (115200 baud)</div>
                <div>Sensor: BioAmp EXG Pill (Gain ~2420x, 0.5–29.5 Hz Hardware Bandpass)</div>
                <div>Sampling Rate: 256 Hz (interval ~3906 µs)</div>
              </div>
            </div>

            {selected.events && selected.events.length > 0 && (
              <div className="mt-3 text-xs">
                <span className="font-semibold text-navy">Experimental Event Markers ({selected.events.length})</span>
                <div className="flex flex-wrap gap-1.5 mt-1">
                  {selected.events.map((ev: any, i: number) => (
                    <span
                      key={ev.id || i}
                      className="px-2 py-0.5 rounded-full bg-powder-50 border border-powder-200 text-navy font-mono text-2xs"
                    >
                      {ev.relative_time_sec ?? ev.relativeTime ?? 0}s · {ev.label}
                    </span>
                  ))}
                </div>
              </div>
            )}

            {selected.notes && (
              <div className="mt-3 text-xs">
                <span className="font-semibold text-navy">Session Notes</span>
                <p className="mt-1 text-navy-400 p-2.5 rounded-lg bg-navy-50/40 border border-navy-100">{selected.notes}</p>
              </div>
            )}

            <DialogFooter className="flex-wrap gap-2 pt-2">
              <Button
                variant="secondary"
                size="sm"
                className="text-error border-error/20 bg-error/5 hover:bg-error/10"
                onClick={() => api.downloadSessionPdf(selected.id, selected.session_code)}
              >
                <FileSpreadsheet className="h-3.5 w-3.5 mr-1" /> PDF Report
              </Button>
              <Button
                variant="secondary"
                size="sm"
                className="text-success border-success/20 bg-success/5 hover:bg-success/10"
                onClick={() => api.downloadSessionCsv(selected.id, selected.session_code)}
              >
                <Download className="h-3.5 w-3.5 mr-1" /> Raw CSV
              </Button>
              <Button
                variant="secondary"
                size="sm"
                onClick={() => navigate(`/analysis?session=${selected.id}`)}
              >
                <BarChart3 className="h-3.5 w-3.5 mr-1" /> Signal Analysis
              </Button>
              <Button size="sm" onClick={() => setSelected(null)}>
                Close
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
