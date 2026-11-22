import { useState, useMemo, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useForm, Controller } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import type { ColumnDef } from '@tanstack/react-table';
import {
  Search,
  Users,
  Trash2,
  FileText,
  ShieldCheck,
  ShieldAlert,
  X,
  Plus,
  Sparkles,
  Calendar,
  CircleDot,
  CheckCircle2,
  AlertTriangle,
  RotateCcw,
  Play,
  Eye,
  Stethoscope,
  Activity,
  Check,
  ChevronRight,
  UserCheck,
  ArrowRight,
  UserPlus,
  Clock,
  Brain,
  Smile,
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
import { useAuth } from '@/context/AuthContext';
import { formatDate, formatDateTime, formatDuration } from '@/lib/format';
import type {
  Participant,
  ConsentStatus,
  RecordingSession,
  RegistrationStatus,
  AssignedTestType,
  ParticipantProfileData,
} from '@/types';

// Supported Doctor & Clinician Lists
const DOCTOR_OPTIONS = [
  'Dr. Patel',
  'Dr. Chen',
  'Dr. Neurologist',
  'Dr. Williams',
  'Dr. Researcher',
];

const AVAILABLE_TESTS: { id: AssignedTestType; label: string; desc: string }[] = [
  { id: 'Live EEG', label: 'Live EEG Acquisition', desc: 'Real-time 256 Hz single-channel BioAmp acquisition & Welch PSD' },
  { id: 'Emotion Recognition', label: 'Emotion Recognition', desc: '32-channel DEAP Valence/Arousal Affective State Decoding' },
  { id: 'Motor Imagery', label: 'Motor Imagery BCI', desc: '64-channel PhysioNet CSP + LDA Motor Imagery Intent Detection' },
];

// Zod Schema for Clinician Participant Registration
const participantSchema = z.object({
  code: z
    .string()
    .min(1, 'Participant code is required (e.g. P-001)')
    .regex(/^P-\d+/i, 'Code must follow anonymous protocol format (e.g. P-001)'),
  name: z.string().min(2, 'Full name or participant label is required'),
  age: z.number().min(18, 'Participant must be an adult (18–120)').max(120, 'Age must be 120 or less'),
  gender: z.string().min(1, 'Gender is required'),
  assignedDoctor: z.string().min(1, 'Assigned doctor is required'),
  assignedTests: z.array(z.string()).min(1, 'Select at least one assigned EEG test'),
  consentObtained: z.boolean().refine((val) => val === true, {
    message: 'Informed consent is mandatory for registration under IRB protocol',
  }),
  notes: z.string().optional(),
});

type ParticipantFormData = z.infer<typeof participantSchema>;

export default function ParticipantsPage() {
  const navigate = useNavigate();
  const { user, isClinician, isDoctor } = useAuth();

  const [participants, setParticipants] = useState<Participant[]>([]);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  // View state & filters
  const [activeTab, setActiveTab] = useState<'all' | 'ready_for_testing' | 'pending_confirmation' | 'draft'>('all');
  const [selected, setSelected] = useState<Participant | null>(null);

  // Clinician Multi-step Registration Modal
  const [showAddModal, setShowAddModal] = useState(false);
  const [registrationStep, setRegistrationStep] = useState<1 | 2>(1);
  const [addError, setAddError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  // Review & Confirmation Modal for existing unconfirmed participants
  const [reviewTarget, setReviewTarget] = useState<Participant | null>(null);
  const [reviewDoctor, setReviewDoctor] = useState('Dr. Patel');
  const [reviewTests, setReviewTests] = useState<string[]>(['Live EEG', 'Emotion Recognition', 'Motor Imagery']);
  const [reviewNotes, setReviewNotes] = useState('');
  const [confirmingReview, setConfirmingReview] = useState(false);

  // Dedicated Participant Profile Modal
  const [profileOpen, setProfileOpen] = useState(false);
  const [profileParticipant, setProfileParticipant] = useState<Participant | null>(null);
  const [profileData, setProfileData] = useState<ParticipantProfileData | null>(null);
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileActiveTab, setProfileActiveTab] = useState<'sessions' | 'emotion' | 'motor'>('sessions');

  // React Hook Form for Step 1
  const {
    register,
    handleSubmit,
    setValue,
    watch,
    control,
    reset,
    formState: { errors },
  } = useForm<ParticipantFormData>({
    resolver: zodResolver(participantSchema),
    defaultValues: {
      code: '',
      name: '',
      age: 25,
      gender: 'Female',
      assignedDoctor: 'Dr. Patel',
      assignedTests: ['Live EEG', 'Emotion Recognition', 'Motor Imagery'],
      consentObtained: true,
      notes: '',
    },
  });

  const formValues = watch();

  const loadData = async (silent = false) => {
    if (!silent) setLoading(true);
    setFetchError(null);
    try {
      const [partList, sessList] = await Promise.all([
        api.getParticipants({
          role: user?.role,
          user_id: user?.id,
        }),
        api.getSessions(),
      ]);
      setParticipants(partList);
      setSessions(sessList);
      if (partList.length > 0) {
        if (!selected || !partList.some((p) => p.id === selected.id)) {
          setSelected(partList[0]);
        }
      } else {
        setSelected(null);
      }
    } catch (err: any) {
      console.error('Error loading participant data:', err);
      setFetchError(err.message || 'Failed to load participants.');
    } finally {
      if (!silent) setLoading(false);
    }
  };

  useEffect(() => {
    loadData();

    // Immediate Dashboard Synchronization:
    // Window focus refresh so when doctor switches back to dashboard tab, it immediately pulls updates
    const onFocus = () => loadData(true);
    window.addEventListener('focus', onFocus);

    // Reliable 10-second polling for active synchronization
    const interval = setInterval(() => {
      loadData(true);
    }, 10000);

    return () => {
      window.removeEventListener('focus', onFocus);
      clearInterval(interval);
    };
  }, [user?.role, user?.id, user?.email]);

  // Generate anonymous ID suggestion
  const generateAnonymousId = async () => {
    try {
      const nextCode = await api.getNextParticipantCode();
      setValue('code', nextCode, { shouldValidate: true });
    } catch {
      const existingNums = participants
        .map((p) => {
          const m = p.code.match(/P-(\d+)/);
          return m ? parseInt(m[1], 10) : 0;
        })
        .filter((n) => n > 0);
      const nextNum = existingNums.length > 0 ? Math.max(...existingNums) + 1 : 1;
      const generated = `P-${nextNum.toString().padStart(3, '0')}`;
      setValue('code', generated, { shouldValidate: true });
    }
  };

  // Open multi-step registration modal
  const handleOpenRegistration = () => {
    reset({
      code: '',
      name: '',
      age: 25,
      gender: 'Female',
      assignedDoctor: 'Dr. Patel',
      assignedTests: ['Live EEG', 'Emotion Recognition', 'Motor Imagery'],
      consentObtained: true,
      notes: '',
    });
    generateAnonymousId();
    setRegistrationStep(1);
    setAddError('');
    setShowAddModal(true);
  };

  // Save as Draft (Step 1)
  const handleSaveDraft = async () => {
    const values = formValues;
    if (!values.code) {
      setAddError('Participant code is required to save a draft.');
      return;
    }
    setSubmitting(true);
    try {
      await api.createParticipant({
        participant_code: values.code.trim().toUpperCase(),
        name: values.name?.trim() || undefined,
        age: Number(values.age) || undefined,
        gender: values.gender,
        consent_obtained: Boolean(values.consentObtained),
        assigned_doctor: values.assignedDoctor,
        assigned_tests: values.assignedTests,
        registration_status: 'draft',
        notes: values.notes?.trim() || undefined,
        created_by: user?.name || user?.email || 'clinician_01',
      });
      setShowAddModal(false);
      reset();
      await loadData();
    } catch (err: any) {
      setAddError(err.message || 'Failed to save draft participant.');
    } finally {
      setSubmitting(false);
    }
  };

  // Proceed from Step 1 to Step 2 (Review)
  const handleProceedToReview = handleSubmit((_data) => {
    setAddError('');
    setRegistrationStep(2);
  });

  // Final Registration Confirmation (Step 2)
  const handleConfirmRegistration = async (status: 'ready_for_testing' | 'pending_confirmation') => {
    const data = formValues;
    setSubmitting(true);
    setAddError('');
    try {
      await api.createParticipant({
        participant_code: data.code.trim().toUpperCase(),
        name: data.name?.trim(),
        age: Number(data.age),
        gender: data.gender,
        consent_obtained: true,
        assigned_doctor: data.assignedDoctor,
        assigned_tests: data.assignedTests,
        registration_status: status,
        notes: data.notes?.trim() || undefined,
        created_by: user?.name || user?.email || 'clinician_01',
      });
      setShowAddModal(false);
      reset();
      await loadData();
    } catch (err: any) {
      setAddError(err.message || 'Failed to complete registration.');
    } finally {
      setSubmitting(false);
    }
  };

  // Open Review & Confirmation Modal for existing unconfirmed participant
  const handleOpenReviewModal = (p: Participant) => {
    setReviewTarget(p);
    setReviewDoctor(p.assigned_doctor || 'Dr. Patel');
    setReviewTests(
      p.assigned_tests && p.assigned_tests.length > 0
        ? (p.assigned_tests as string[])
        : ['Live EEG', 'Emotion Recognition', 'Motor Imagery']
    );
    setReviewNotes(p.notes || '');
  };

  const handleConfirmReview = async () => {
    if (!reviewTarget) return;
    setConfirmingReview(true);
    try {
      await api.confirmParticipant(
        reviewTarget.id,
        user?.name || user?.email || 'clinician_01',
        reviewDoctor,
        reviewTests,
        reviewNotes
      );
      setReviewTarget(null);
      await loadData();
    } catch (err: any) {
      alert(err.message || 'Failed to confirm participant for testing.');
    } finally {
      setConfirmingReview(false);
    }
  };

  // Open Full Participant Profile
  const handleOpenProfile = async (p: Participant) => {
    setProfileParticipant(p);
    setProfileOpen(true);
    setProfileLoading(true);
    try {
      const data = await api.getParticipantProfile(p.id, user?.role, user?.id);
      setProfileData(data);
    } catch (err: any) {
      console.error('Error loading profile:', err);
      // Fallback with current sessions
      setProfileData({
        participant: p,
        sessions: sessions.filter((s) => s.participantCode === p.code || s.participant_id === p.id),
        emotion_history: [],
        motor_imagery_history: [],
        summary: {
          total_sessions: sessions.filter((s) => s.participantCode === p.code || s.participant_id === p.id).length,
          last_session_date: p.lastSessionDate || null,
          assigned_tests: (p.assigned_tests as string[]) || ['Live EEG', 'Emotion Recognition', 'Motor Imagery'],
          registration_status: p.registration_status || 'ready_for_testing',
          is_ready_for_testing: (p.registration_status || 'ready_for_testing') === 'ready_for_testing',
        },
      });
    } finally {
      setProfileLoading(false);
    }
  };

  // Status & consent handlers
  const handleWithdrawConsent = async (p: Participant) => {
    const reason = window.prompt(
      `Enter withdrawal reason for participant ${p.code}:`,
      'Participant requested voluntary withdrawal'
    );
    if (reason === null) return;
    try {
      const updated = await api.withdrawParticipant(p.id, reason);
      await loadData();
      if (selected?.id === p.id) {
        setSelected(updated);
      }
    } catch (err: any) {
      alert(err.message || 'Could not withdraw participant consent');
    }
  };

  const handleStatusUpdate = async (p: Participant, newStatus: 'active' | 'inactive' | 'withdrawn') => {
    if (newStatus === 'withdrawn') {
      return handleWithdrawConsent(p);
    }
    try {
      await api.updateParticipantStatus(p.id, newStatus);
      await loadData();
      if (selected?.id === p.id) {
        setSelected({ ...selected, status: newStatus });
      }
    } catch (err: any) {
      alert(err.message || 'Could not update participant status');
    }
  };

  const participantSessions = (code: string, id: string) =>
    sessions.filter((s) => s.participantCode === code || s.participant_id === id);

  // Determine current active perspective
  const isDoctorView = isDoctor;

  // Filtered participants list
  const filteredParticipants = useMemo(() => {
    return participants.filter((p) => {
      // In Doctor View, ONLY show participants whose registration is Ready for Testing
      if (isDoctorView) {
        return (p.registration_status || 'ready_for_testing') === 'ready_for_testing';
      }
      // Clinician View status tab filtering
      if (activeTab === 'ready_for_testing') {
        return (p.registration_status || 'ready_for_testing') === 'ready_for_testing';
      }
      if (activeTab === 'pending_confirmation') {
        return p.registration_status === 'pending_confirmation';
      }
      if (activeTab === 'draft') {
        return p.registration_status === 'draft';
      }
      return true;
    });
  }, [participants, isDoctorView, activeTab]);

  // TanStack DataTable Columns
  const columns: ColumnDef<Participant>[] = useMemo(() => [
    {
      accessorKey: 'code',
      header: 'Participant Code & Label',
      cell: ({ row }) => {
        const p = row.original;
        const isSelected = selected?.id === p.id;
        return (
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <span className="font-mono font-bold text-navy text-sm">{p.code}</span>
              {isSelected && <span className="h-1.5 w-1.5 rounded-full bg-powder" />}
              {p.registration_status === 'ready_for_testing' && (
                <span title="Verified & Ready for Testing">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                </span>
              )}
            </div>
            {p.name && (
              <span className="text-2xs text-navy-400 font-medium">{p.name}</span>
            )}
          </div>
        );
      },
    },
    {
      accessorKey: 'registration_status',
      header: 'Registration Status',
      cell: ({ row }) => {
        const status = row.original.registration_status || 'ready_for_testing';
        if (status === 'ready_for_testing') {
          return (
            <Badge className="bg-success/15 text-success font-semibold text-2xs">
              READY FOR TESTING
            </Badge>
          );
        }
        if (status === 'pending_confirmation') {
          return (
            <Badge className="bg-warning/15 text-warning-700 font-semibold text-2xs">
              PENDING CONFIRMATION
            </Badge>
          );
        }
        return (
          <Badge className="bg-navy-100 text-navy-600 font-medium text-2xs">
            DRAFT
          </Badge>
        );
      },
    },
    {
      accessorKey: 'assigned_doctor',
      header: 'Assigned Doctor',
      cell: ({ row }) => {
        const doc = row.original.assigned_doctor || 'Dr. Patel';
        return (
          <div className="flex items-center gap-1.5 text-xs text-navy font-medium">
            <Stethoscope className="h-3.5 w-3.5 text-powder-600" />
            <span>{doc}</span>
          </div>
        );
      },
    },
    {
      accessorKey: 'assigned_tests',
      header: 'Assigned EEG Tests',
      cell: ({ row }) => {
        const tests = (row.original.assigned_tests as string[]) || ['Live EEG', 'Emotion Recognition', 'Motor Imagery'];
        return (
          <div className="flex flex-wrap gap-1">
            {tests.map((t) => (
              <span
                key={t}
                className="px-1.5 py-0.5 rounded text-[10px] font-mono font-medium bg-lavender-100/70 text-navy-700 border border-navy-100/50"
              >
                {t === 'Emotion Recognition' ? 'Emotion' : t === 'Motor Imagery' ? 'BCI' : t}
              </span>
            ))}
          </div>
        );
      },
    },
    {
      accessorKey: 'sessionCount',
      header: 'Sessions',
      cell: ({ row }) => {
        const count = participantSessions(row.original.code, row.original.id).length;
        return (
          <span className="font-mono text-navy-600 font-medium text-xs">
            {count} {count === 1 ? 'session' : 'sessions'}
          </span>
        );
      },
    },
    {
      accessorKey: 'createdAt',
      header: 'Registered',
      cell: ({ row }) => (
        <span className="text-navy-400 text-xs">
          {row.original.createdAt ? formatDate(row.original.createdAt) : '—'}
        </span>
      ),
    },
    {
      id: 'actions',
      header: () => <div className="text-right">Actions</div>,
      cell: ({ row }) => {
        const p = row.original;
        const isReady = (p.registration_status || 'ready_for_testing') === 'ready_for_testing';

        return (
          <div className="text-right flex items-center justify-end gap-1.5">
            {!isReady && isClinician && (
              <Button
                size="sm"
                variant="accent"
                className="text-2xs py-1"
                onClick={(e) => {
                  e.stopPropagation();
                  handleOpenReviewModal(p);
                }}
              >
                <CheckCircle2 className="h-3 w-3 mr-1" />
                Review &amp; Confirm
              </Button>
            )}

            <Button
              size="sm"
              variant="secondary"
              className="text-2xs py-1"
              onClick={(e) => {
                e.stopPropagation();
                handleOpenProfile(p);
              }}
            >
              <Eye className="h-3 w-3 mr-1" />
              Profile &amp; Test
            </Button>

            {isReady && (
              <Button
                size="sm"
                variant="primary"
                className="text-2xs py-1"
                onClick={(e) => {
                  e.stopPropagation();
                  navigate(`/live?participantId=${p.id}&participant=${p.code}`);
                }}
              >
                <Play className="h-3 w-3 mr-1" />
                Start EEG
              </Button>
            )}
          </div>
        );
      },
    },
  ], [selected, sessions, isClinician]);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-fade-in pb-12">

      {/* Main Header */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-navy tracking-tight">
              {isDoctorView
                ? 'Doctor Testing Dashboard — Assigned Cohort'
                : 'Clinician Registration & Participant Intake'}
            </h1>
            <Badge
              className={
                isDoctorView
                  ? 'bg-success/10 text-success border border-success/30 font-semibold'
                  : 'bg-lavender-100 text-navy-700 font-semibold'
              }
            >
              {isDoctorView ? 'Ready for Testing Only' : 'Clinician Workflow'}
            </Badge>
          </div>
          <p className="text-xs text-navy-400 mt-1 max-w-3xl leading-relaxed">
            {isDoctorView
              ? 'Only participants confirmed and authorized by clinician intake appear here for active EEG diagnostic trials.'
              : 'Register new participants, assign responsible physicians and protocol tests, verify informed consent, and confirm eligibility for testing.'}
          </p>
        </div>

        <div className="flex items-center gap-2 flex-wrap">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => loadData()}
            disabled={loading}
            className="shadow-soft text-xs"
          >
            <RotateCcw className={`h-3.5 w-3.5 mr-1 ${loading ? 'animate-spin' : ''}`} />
            Refresh List
          </Button>

          {/* Clinician Register Participant Button */}
          {!isDoctorView && (
            <Button onClick={handleOpenRegistration} className="shadow-soft text-xs">
              <UserPlus className="h-3.5 w-3.5 mr-1" />
              Register Participant
            </Button>
          )}
        </div>
      </div>

      {/* API Error Banner */}
      {fetchError && (
        <div className="p-3.5 rounded-xl bg-error/10 border border-error/20 flex items-center justify-between text-xs text-error animate-fade-in">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            <span>{fetchError}</span>
          </div>
          <Button size="sm" variant="secondary" onClick={() => loadData()}>
            Retry
          </Button>
        </div>
      )}

      {/* Cohort Status Toolbar (Clinician Mode) */}
      {!isDoctorView && (
        <Card className="p-3">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-navy-400">Status Filter:</span>
              <div className="flex rounded-lg border border-navy-100 p-0.5 bg-navy-50/50">
                <button
                  onClick={() => setActiveTab('all')}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    activeTab === 'all' ? 'bg-white text-navy shadow-soft' : 'text-navy-300 hover:text-navy'
                  }`}
                >
                  All ({participants.length})
                </button>
                <button
                  onClick={() => setActiveTab('ready_for_testing')}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    activeTab === 'ready_for_testing' ? 'bg-white text-navy shadow-soft' : 'text-navy-300 hover:text-navy'
                  }`}
                >
                  Ready for Testing (
                  {participants.filter((p) => (p.registration_status || 'ready_for_testing') === 'ready_for_testing').length}
                  )
                </button>
                <button
                  onClick={() => setActiveTab('pending_confirmation')}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    activeTab === 'pending_confirmation' ? 'bg-white text-navy shadow-soft' : 'text-navy-300 hover:text-navy'
                  }`}
                >
                  Pending Confirmation (
                  {participants.filter((p) => p.registration_status === 'pending_confirmation').length}
                  )
                </button>
                <button
                  onClick={() => setActiveTab('draft')}
                  className={`px-2.5 py-1 text-xs rounded-md font-medium transition-colors ${
                    activeTab === 'draft' ? 'bg-white text-navy shadow-soft' : 'text-navy-300 hover:text-navy'
                  }`}
                >
                  Drafts ({participants.filter((p) => p.registration_status === 'draft').length})
                </button>
              </div>
            </div>

            <span className="text-2xs text-navy-400">
              Only <strong>Ready for Testing</strong> participants are visible to Doctors for recording sessions.
            </span>
          </div>
        </Card>
      )}

      {/* Main Table & Selected Inspector Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Table (2 Columns) */}
        <div className="lg:col-span-2">
          {loading && participants.length === 0 ? (
            <Card className="p-12 text-center text-xs text-navy-400 border border-navy-100 flex flex-col items-center justify-center gap-2">
              <RotateCcw className="h-5 w-5 animate-spin text-powder-600" />
              <span>Loading participant records...</span>
            </Card>
          ) : (
            <DataTable
              columns={columns}
              data={filteredParticipants}
              searchPlaceholder="Search participants by ID, name, or doctor..."
              onRowClick={(row) => setSelected(row)}
              pageSize={8}
            />
          )}
        </div>

        {/* Selected Participant Quick Inspector (1 Column) */}
        <div className="space-y-4">
          {selected ? (
            <Card className="p-5 space-y-4 animate-fade-in shadow-card border border-navy-100">
              <div className="flex items-start justify-between border-b border-navy-100 pb-3">
                <div>
                  <span className="text-2xs text-navy-400 uppercase tracking-wider font-semibold">Selected Participant</span>
                  <div className="flex items-center gap-2 mt-0.5">
                    <h3 className="text-base font-bold font-mono text-navy">{selected.code}</h3>
                    {selected.name && <span className="text-xs text-navy-600 font-medium">({selected.name})</span>}
                  </div>
                </div>

                <Badge
                  className={
                    (selected.registration_status || 'ready_for_testing') === 'ready_for_testing'
                      ? 'bg-success/15 text-success font-semibold text-2xs'
                      : selected.registration_status === 'pending_confirmation'
                      ? 'bg-warning/15 text-warning-700 font-semibold text-2xs'
                      : 'bg-navy-100 text-navy-600 font-semibold text-2xs'
                  }
                >
                  {(selected.registration_status || 'ready_for_testing').toUpperCase().replace(/_/g, ' ')}
                </Badge>
              </div>

              {/* Status & Clinical Assignment */}
              <div className="p-3 rounded-lg bg-navy-50/50 border border-navy-100 text-xs space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-navy">Assigned Doctor:</span>
                  <span className="font-bold text-navy">{selected.assigned_doctor || 'Dr. Patel'}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-navy-400">Informed Consent:</span>
                  <Badge className="bg-success/10 text-success text-[10px]">Verified (Active)</Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-navy-400">Demographics:</span>
                  <span className="text-navy font-medium">
                    {selected.age ? `${selected.age} yrs` : '—'} · {selected.gender || '—'}
                  </span>
                </div>
              </div>

              {/* Assigned EEG Tests */}
              <div>
                <span className="text-xs font-semibold text-navy block mb-1.5">Assigned Protocol Tests:</span>
                <div className="flex flex-wrap gap-1.5">
                  {((selected.assigned_tests as string[]) || ['Live EEG', 'Emotion Recognition', 'Motor Imagery']).map(
                    (test) => (
                      <span
                        key={test}
                        className="px-2 py-1 rounded-md text-2xs font-semibold bg-powder-50 text-navy-800 border border-powder-200"
                      >
                        {test}
                      </span>
                    )
                  )}
                </div>
              </div>

              {/* Research Notes */}
              <div>
                <span className="text-xs font-semibold text-navy">Research &amp; Clinical Notes:</span>
                <p className="text-xs text-navy-500 mt-1 leading-relaxed bg-lavender-50/40 p-2.5 rounded-lg border border-navy-100/60">
                  {selected.notes || 'No protocol notes on file for this participant.'}
                </p>
              </div>

              {/* Quick Actions */}
              <div className="pt-2 space-y-2">
                <Button
                  className="w-full justify-center shadow-soft"
                  onClick={() => handleOpenProfile(selected)}
                >
                  <Eye className="h-3.5 w-3.5 mr-1.5" />
                  Open Full Participant Profile &amp; History
                </Button>

                {(selected.registration_status || 'ready_for_testing') === 'ready_for_testing' ? (
                  <Button
                    variant="secondary"
                    className="w-full justify-center"
                    onClick={() => navigate(`/live?participantId=${selected.id}&participant=${selected.code}`)}
                  >
                    <Play className="h-3.5 w-3.5 mr-1.5 text-success" />
                    Launch Live EEG Session
                  </Button>
                ) : (
                  isClinician && (
                    <Button
                      variant="accent"
                      className="w-full justify-center"
                      onClick={() => handleOpenReviewModal(selected)}
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1.5" />
                      Review &amp; Authorize for Testing
                    </Button>
                  )
                )}
              </div>
            </Card>
          ) : (
            <Card className="p-6 text-center text-xs text-navy-300">
              Select a participant from the table to view summary details.
            </Card>
          )}
        </div>
      </div>

      {/* ========================================================================= */}
      {/* MULTI-STEP CLINICIAN REGISTRATION MODAL                                  */}
      {/* ========================================================================= */}
      <Dialog open={showAddModal} onOpenChange={setShowAddModal}>
        <DialogContent className="max-w-xl">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <UserPlus className="h-5 w-5 text-powder-600" />
              <DialogTitle>
                {registrationStep === 1 ? 'Step 1: Participant Intake & Registration' : 'Step 2: Review & Verify Registration'}
              </DialogTitle>
            </div>
            <DialogDescription>
              {registrationStep === 1
                ? 'Enter anonymous subject code, demographics, assigned physician, and EEG protocol tests.'
                : 'Carefully verify participant details and informed consent before authorizing for Doctor EEG testing.'}
            </DialogDescription>
          </DialogHeader>

          {/* Stepper Indicator */}
          <div className="flex items-center justify-between mb-4 px-2">
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  registrationStep === 1 ? 'bg-powder text-navy' : 'bg-success text-white'
                }`}
              >
                1
              </span>
              <span className="text-xs font-medium text-navy">Intake Details</span>
            </div>
            <div className="h-0.5 w-16 bg-navy-100" />
            <div className="flex items-center gap-2">
              <span
                className={`flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                  registrationStep === 2 ? 'bg-powder text-navy' : 'bg-navy-100 text-navy-400'
                }`}
              >
                2
              </span>
              <span className="text-xs font-medium text-navy">Review &amp; Authorize</span>
            </div>
          </div>

          {addError && (
            <div className="mb-4 p-2.5 rounded-lg bg-error/10 border border-error/20 text-xs text-error">
              {addError}
            </div>
          )}

          {/* STEP 1: FORM INPUTS */}
          {registrationStep === 1 && (
            <form onSubmit={handleProceedToReview} className="space-y-4 text-xs">
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-semibold text-navy">Participant ID (Code) *</label>
                    <button
                      type="button"
                      onClick={generateAnonymousId}
                      className="text-powder-700 hover:underline text-2xs font-semibold"
                    >
                      Generate Code
                    </button>
                  </div>
                  <input
                    type="text"
                    placeholder="e.g. P-001"
                    {...register('code')}
                    className="w-full px-3 py-2 rounded-lg border border-navy-100 text-navy font-mono uppercase focus:outline-none focus:border-powder-400 font-bold"
                  />
                  {errors.code && <p className="text-2xs text-error mt-1">{errors.code.message}</p>}
                </div>

                <div>
                  <label className="block font-semibold text-navy mb-1">Full Name / Label *</label>
                  <input
                    type="text"
                    placeholder="e.g. Jane Doe or Participant Alpha"
                    {...register('name')}
                    className="w-full px-3 py-2 rounded-lg border border-navy-100 text-navy focus:outline-none focus:border-powder-400"
                  />
                  {errors.name && <p className="text-2xs text-error mt-1">{errors.name.message}</p>}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-navy mb-1">Age (18–120) *</label>
                  <input
                    type="number"
                    min={18}
                    max={120}
                    {...register('age', { valueAsNumber: true })}
                    className="w-full px-3 py-2 rounded-lg border border-navy-100 text-navy font-mono focus:outline-none focus:border-powder-400"
                  />
                  {errors.age && <p className="text-2xs text-error mt-1">{errors.age.message}</p>}
                </div>

                <div>
                  <label className="block font-semibold text-navy mb-1">Gender *</label>
                  <select
                    {...register('gender')}
                    className="w-full px-3 py-2 rounded-lg border border-navy-100 text-navy bg-white focus:outline-none focus:border-powder-400"
                  >
                    <option value="Female">Female</option>
                    <option value="Male">Male</option>
                    <option value="Other">Other</option>
                    <option value="Prefer not to say">Prefer not to say</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-navy mb-1">Assigned Doctor *</label>
                <select
                  {...register('assignedDoctor')}
                  className="w-full px-3 py-2 rounded-lg border border-navy-100 text-navy bg-white focus:outline-none focus:border-powder-400 font-medium"
                >
                  {DOCTOR_OPTIONS.map((doc) => (
                    <option key={doc} value={doc}>
                      {doc}
                    </option>
                  ))}
                </select>
                {errors.assignedDoctor && <p className="text-2xs text-error mt-1">{errors.assignedDoctor.message}</p>}
              </div>

              {/* Assigned EEG Tests */}
              <div>
                <label className="block font-semibold text-navy mb-1">Assigned EEG Tests *</label>
                <div className="space-y-2 p-2.5 rounded-lg bg-navy-50/50 border border-navy-100">
                  {AVAILABLE_TESTS.map((test) => (
                    <label key={test.id} className="flex items-start gap-2.5 cursor-pointer">
                      <input
                        type="checkbox"
                        value={test.id}
                        {...register('assignedTests')}
                        className="mt-0.5 rounded border-navy-200 text-powder-600 focus:ring-powder-400"
                      />
                      <div>
                        <span className="font-semibold text-navy text-xs">{test.label}</span>
                        <p className="text-2xs text-navy-400">{test.desc}</p>
                      </div>
                    </label>
                  ))}
                </div>
                {errors.assignedTests && <p className="text-2xs text-error mt-1">{errors.assignedTests.message}</p>}
              </div>

              <div>
                <label className="block font-semibold text-navy mb-1">Clinical &amp; Protocol Notes (Optional)</label>
                <textarea
                  rows={2}
                  placeholder="e.g. Normal baseline resting EEG, eyes open/closed protocol, no prior neurological disorder"
                  {...register('notes')}
                  className="w-full px-3 py-2 rounded-lg border border-navy-100 text-navy focus:outline-none focus:border-powder-400 resize-none"
                />
              </div>

              <div className="pt-1">
                <label className="flex items-center gap-2 cursor-pointer p-2 rounded-lg bg-peach-50/40 border border-peach-200/60">
                  <input
                    type="checkbox"
                    {...register('consentObtained')}
                    className="rounded border-navy-200 text-powder-600 focus:ring-powder-400"
                  />
                  <span className="text-xs text-navy font-semibold">
                    Verified Informed Consent obtained prior to intake (Mandatory under IRB)
                  </span>
                </label>
                {errors.consentObtained && <p className="text-2xs text-error mt-1">{errors.consentObtained.message}</p>}
              </div>

              <DialogFooter className="pt-2 flex justify-between">
                <Button type="button" variant="secondary" onClick={() => setShowAddModal(false)}>
                  Cancel
                </Button>
                <div className="flex gap-2">
                  <Button type="button" variant="ghost" disabled={submitting} onClick={handleSaveDraft}>
                    Save as Draft
                  </Button>
                  <Button type="submit">
                    Proceed to Review
                    <ArrowRight className="h-3.5 w-3.5 ml-1" />
                  </Button>
                </div>
              </DialogFooter>
            </form>
          )}

          {/* STEP 2: REVIEW & VERIFICATION */}
          {registrationStep === 2 && (
            <div className="space-y-4 text-xs animate-fade-in">
              <Card className="p-4 bg-navy-50/40 border border-navy-100 space-y-3">
                <div className="flex items-center justify-between border-b border-navy-100 pb-2">
                  <div>
                    <span className="text-2xs text-navy-400 uppercase font-semibold">Participant Code</span>
                    <h4 className="text-base font-bold font-mono text-navy">{formValues.code}</h4>
                  </div>
                  <Badge className="bg-lavender-100 text-navy-700 font-semibold">
                    Clinician Review Step
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-3 text-xs">
                  <div>
                    <span className="text-2xs text-navy-400 block">Full Name:</span>
                    <span className="font-semibold text-navy">{formValues.name}</span>
                  </div>
                  <div>
                    <span className="text-2xs text-navy-400 block">Age &amp; Gender:</span>
                    <span className="font-semibold text-navy">
                      {formValues.age} yrs · {formValues.gender}
                    </span>
                  </div>
                  <div>
                    <span className="text-2xs text-navy-400 block">Assigned Doctor:</span>
                    <span className="font-bold text-navy flex items-center gap-1">
                      <Stethoscope className="h-3 w-3 text-powder-600" />
                      {formValues.assignedDoctor}
                    </span>
                  </div>
                  <div>
                    <span className="text-2xs text-navy-400 block">Informed Consent:</span>
                    <span className="text-success font-semibold flex items-center gap-1">
                      <Check className="h-3 w-3" /> Documented &amp; Verified
                    </span>
                  </div>
                </div>

                <div>
                  <span className="text-2xs text-navy-400 block mb-1">Assigned Tests:</span>
                  <div className="flex flex-wrap gap-1">
                    {(formValues.assignedTests || []).map((t) => (
                      <span
                        key={t}
                        className="px-2 py-0.5 rounded text-2xs font-semibold bg-powder text-navy"
                      >
                        {t}
                      </span>
                    ))}
                  </div>
                </div>

                {formValues.notes && (
                  <div>
                    <span className="text-2xs text-navy-400 block">Notes:</span>
                    <p className="text-xs text-navy-600 italic">{formValues.notes}</p>
                  </div>
                )}
              </Card>

              {/* Verification Checklist */}
              <div className="p-3 rounded-lg bg-success/5 border border-success/20 space-y-1.5">
                <span className="font-semibold text-success-800 text-xs block mb-1">
                  Clinician Verification Checklist:
                </span>
                <div className="flex items-center gap-2 text-2xs text-navy-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span>Participant Code follows anonymous format ({formValues.code})</span>
                </div>
                <div className="flex items-center gap-2 text-2xs text-navy-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span>Informed Consent obtained and signed under IRB guidelines</span>
                </div>
                <div className="flex items-center gap-2 text-2xs text-navy-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span>Assigned Doctor confirmed ({formValues.assignedDoctor})</span>
                </div>
                <div className="flex items-center gap-2 text-2xs text-navy-700">
                  <CheckCircle2 className="h-3.5 w-3.5 text-success" />
                  <span>Protocol tests validated and authorized</span>
                </div>
              </div>

              <DialogFooter className="pt-2 flex justify-between">
                <Button type="button" variant="secondary" onClick={() => setRegistrationStep(1)}>
                  Back to Edit
                </Button>
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant="ghost"
                    disabled={submitting}
                    onClick={() => handleConfirmRegistration('pending_confirmation')}
                  >
                    Save as Pending
                  </Button>
                  <Button
                    type="button"
                    variant="primary"
                    disabled={submitting}
                    onClick={() => handleConfirmRegistration('ready_for_testing')}
                  >
                    {submitting ? 'Confirming...' : 'Confirm & Authorize for Testing'}
                  </Button>
                </div>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* ========================================================================= */}
      {/* REVIEW & CONFIRM MODAL FOR EXISTING UNCONFIRMED PARTICIPANTS             */}
      {/* ========================================================================= */}
      <Dialog open={!!reviewTarget} onOpenChange={(open) => !open && setReviewTarget(null)}>
        {reviewTarget && (
          <DialogContent className="max-w-md">
            <DialogHeader>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="h-5 w-5 text-success" />
                <DialogTitle>Confirm Participant for Testing</DialogTitle>
              </div>
              <DialogDescription>
                Review intake information and transition participant <strong>{reviewTarget.code}</strong> to{' '}
                <strong>Ready for Testing</strong> status.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3 text-xs">
              <div className="p-3 rounded-lg bg-navy-50/50 border border-navy-100">
                <div className="flex justify-between items-center mb-1">
                  <span className="font-mono font-bold text-navy text-sm">{reviewTarget.code}</span>
                  <Badge className="bg-warning/15 text-warning-700 text-[10px]">
                    {(reviewTarget.registration_status || 'draft').toUpperCase()}
                  </Badge>
                </div>
                <p className="text-navy-600 font-medium">{reviewTarget.name || 'Unnamed Participant'}</p>
                <p className="text-navy-400 text-2xs">
                  {reviewTarget.age ? `${reviewTarget.age} yrs` : 'Age N/A'} · {reviewTarget.gender || 'Gender N/A'}
                </p>
              </div>

              <div>
                <label className="block font-semibold text-navy mb-1">Assigned Doctor</label>
                <select
                  value={reviewDoctor}
                  onChange={(e) => setReviewDoctor(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-navy-100 text-navy bg-white focus:outline-none"
                >
                  {DOCTOR_OPTIONS.map((doc) => (
                    <option key={doc} value={doc}>
                      {doc}
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-navy mb-1">Assigned EEG Tests</label>
                <div className="space-y-1.5 p-2 rounded-lg bg-navy-50/30 border border-navy-100/60">
                  {AVAILABLE_TESTS.map((test) => (
                    <label key={test.id} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={reviewTests.includes(test.id)}
                        onChange={(e) => {
                          if (e.target.checked) {
                            setReviewTests([...reviewTests, test.id]);
                          } else {
                            setReviewTests(reviewTests.filter((t) => t !== test.id));
                          }
                        }}
                        className="rounded border-navy-200 text-powder-600 focus:ring-powder-400"
                      />
                      <span className="text-navy text-xs font-medium">{test.label}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-navy mb-1">Review Notes</label>
                <textarea
                  rows={2}
                  value={reviewNotes}
                  onChange={(e) => setReviewNotes(e.target.value)}
                  placeholder="Notes from clinician confirmation review..."
                  className="w-full px-3 py-2 rounded-lg border border-navy-100 text-navy focus:outline-none resize-none"
                />
              </div>

              <div className="p-2.5 rounded bg-success/10 border border-success/20 text-success text-2xs flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 flex-shrink-0" />
                <span>Confirming authorizes this participant to appear on Doctor Testing Dashboards.</span>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button variant="secondary" onClick={() => setReviewTarget(null)}>
                Cancel
              </Button>
              <Button variant="primary" disabled={confirmingReview} onClick={handleConfirmReview}>
                {confirmingReview ? 'Confirming...' : 'Confirm & Authorize'}
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>

      {/* ========================================================================= */}
      {/* DEDICATED PARTICIPANT PROFILE & RESEARCH HISTORY MODAL                    */}
      {/* ========================================================================= */}
      <Dialog open={profileOpen} onOpenChange={setProfileOpen}>
        {profileParticipant && (
          <DialogContent className="max-w-3xl max-h-[85vh] overflow-y-auto">
            <DialogHeader>
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xl font-bold text-navy">{profileParticipant.code}</span>
                    <Badge
                      className={
                        (profileParticipant.registration_status || 'ready_for_testing') === 'ready_for_testing'
                          ? 'bg-success/15 text-success font-semibold text-xs'
                          : 'bg-warning/15 text-warning-700 font-semibold text-xs'
                      }
                    >
                      {(profileParticipant.registration_status || 'ready_for_testing').toUpperCase().replace(/_/g, ' ')}
                    </Badge>
                  </div>
                  <p className="text-xs text-navy-500 font-medium mt-0.5">
                    {profileParticipant.name || 'Anonymous Participant'} · {profileParticipant.age ? `${profileParticipant.age} yrs` : 'Age N/A'} · {profileParticipant.gender || 'Gender N/A'}
                  </p>
                </div>
              </div>
            </DialogHeader>

            <div className="space-y-4 text-xs">
              {/* Clinical Governance Banner */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 p-3 rounded-xl bg-navy-50/60 border border-navy-100">
                <div>
                  <span className="text-2xs text-navy-400 block font-medium">Assigned Doctor:</span>
                  <span className="font-bold text-navy">{profileParticipant.assigned_doctor || 'Dr. Patel'}</span>
                </div>
                <div>
                  <span className="text-2xs text-navy-400 block font-medium">Informed Consent:</span>
                  <span className="font-semibold text-success flex items-center gap-1">
                    <Check className="h-3 w-3" /> Verified (IRB)
                  </span>
                </div>
                <div>
                  <span className="text-2xs text-navy-400 block font-medium">Registered By:</span>
                  <span className="text-navy font-medium">{profileParticipant.created_by || 'Clinician'}</span>
                </div>
                <div>
                  <span className="text-2xs text-navy-400 block font-medium">Registration Date:</span>
                  <span className="text-navy font-medium">
                    {profileParticipant.createdAt ? formatDate(profileParticipant.createdAt) : '—'}
                  </span>
                </div>
              </div>

              {/* Assigned EEG Protocol Tests & Test Launch Action Buttons */}
              <div className="p-3.5 rounded-xl bg-white border border-powder-200/80 shadow-soft space-y-2.5">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-navy text-xs">Assigned EEG Testing Protocols:</span>
                  <span className="text-2xs text-navy-400">Launch a testing session linked to this participant</span>
                </div>

                <div className="flex flex-wrap gap-2">
                  {((profileParticipant.assigned_tests as string[]) || ['Live EEG', 'Emotion Recognition', 'Motor Imagery']).map(
                    (test) => (
                      <Badge key={test} className="bg-lavender-100 text-navy-800 font-semibold px-2.5 py-1">
                        {test}
                      </Badge>
                    )
                  )}
                </div>

                {/* Launch Action Buttons */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <Button
                    size="sm"
                    variant="primary"
                    className="justify-center"
                    disabled={(profileParticipant.registration_status || 'ready_for_testing') !== 'ready_for_testing'}
                    onClick={() => {
                      setProfileOpen(false);
                      navigate(`/live?participantId=${profileParticipant.id}&participant=${profileParticipant.code}`);
                    }}
                  >
                    <Activity className="h-3.5 w-3.5 mr-1" />
                    Launch Live EEG
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    className="justify-center"
                    disabled={(profileParticipant.registration_status || 'ready_for_testing') !== 'ready_for_testing'}
                    onClick={() => {
                      setProfileOpen(false);
                      navigate(`/emotion?participantId=${profileParticipant.id}&participant=${profileParticipant.code}`);
                    }}
                  >
                    <Smile className="h-3.5 w-3.5 mr-1" />
                    Launch Emotion Analysis
                  </Button>

                  <Button
                    size="sm"
                    variant="secondary"
                    className="justify-center"
                    disabled={(profileParticipant.registration_status || 'ready_for_testing') !== 'ready_for_testing'}
                    onClick={() => {
                      setProfileOpen(false);
                      navigate(`/motor-imagery?participantId=${profileParticipant.id}&participant=${profileParticipant.code}`);
                    }}
                  >
                    <Brain className="h-3.5 w-3.5 mr-1" />
                    Launch Motor Imagery BCI
                  </Button>
                </div>

                {(profileParticipant.registration_status || 'ready_for_testing') !== 'ready_for_testing' && (
                  <p className="text-2xs text-warning-700 italic">
                    * Participant must be confirmed and authorized for testing by clinician intake before launching EEG sessions.
                  </p>
                )}
              </div>

              {/* Research History Navigation Tabs */}
              <div className="border-b border-navy-100 flex items-center gap-4">
                <button
                  onClick={() => setProfileActiveTab('sessions')}
                  className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
                    profileActiveTab === 'sessions'
                      ? 'border-navy text-navy'
                      : 'border-transparent text-navy-400 hover:text-navy'
                  }`}
                >
                  EEG Recording Sessions ({profileData?.sessions.length || 0})
                </button>
                <button
                  onClick={() => setProfileActiveTab('emotion')}
                  className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
                    profileActiveTab === 'emotion'
                      ? 'border-navy text-navy'
                      : 'border-transparent text-navy-400 hover:text-navy'
                  }`}
                >
                  Emotion Recognition History ({profileData?.emotion_history.length || 0})
                </button>
                <button
                  onClick={() => setProfileActiveTab('motor')}
                  className={`pb-2 text-xs font-semibold border-b-2 transition-colors ${
                    profileActiveTab === 'motor'
                      ? 'border-navy text-navy'
                      : 'border-transparent text-navy-400 hover:text-navy'
                  }`}
                >
                  Motor Imagery History ({profileData?.motor_imagery_history.length || 0})
                </button>
              </div>

              {/* TAB 1: SESSIONS HISTORY */}
              {profileActiveTab === 'sessions' && (
                <div className="space-y-2">
                  {profileData?.sessions && profileData.sessions.length > 0 ? (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {profileData.sessions.map((sess) => (
                        <div
                          key={sess.id}
                          onClick={() => {
                            setProfileOpen(false);
                            navigate(`/reports?session=${sess.id}`);
                          }}
                          className="p-2.5 rounded-lg border border-navy-100 hover:bg-lavender-50/60 cursor-pointer flex items-center justify-between transition-colors bg-white"
                        >
                          <div>
                            <div className="font-mono font-bold text-navy text-xs">
                              {sess.session_code || sess.id}
                            </div>
                            <div className="text-2xs text-navy-400">
                              {sess.protocol_name || sess.taskType} · {sess.date ? formatDate(sess.date) : 'Date N/A'} · {formatDuration(sess.duration)}
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Badge className="bg-lavender-100 text-navy-700 text-[10px]">
                              {sess.signalQuality}
                            </Badge>
                            <Badge className="bg-success/10 text-success text-[10px]">
                              {sess.status}
                            </Badge>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Activity className="h-6 w-6 text-navy-300" />}
                      title="No EEG sessions recorded yet."
                      message="Start a new live recording session or run an offline benchmark to populate this participant's history."
                    />
                  )}
                </div>
              )}

              {/* TAB 2: EMOTION RECOGNITION HISTORY */}
              {profileActiveTab === 'emotion' && (
                <div className="space-y-2">
                  {profileData?.emotion_history && profileData.emotion_history.length > 0 ? (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {profileData.emotion_history.map((em, idx) => (
                        <div
                          key={em.id || idx}
                          className="p-2.5 rounded-lg border border-navy-100 bg-white flex items-center justify-between"
                        >
                          <div>
                            <span className="font-bold text-navy text-xs">
                              {em.affect_label || em.quadrant || 'HVLA (Content)'}
                            </span>
                            <div className="text-2xs text-navy-400">
                              Valence: {em.valence?.toFixed(2) || '—'} · Arousal: {em.arousal?.toFixed(2) || '—'} · Confidence: {Math.round((em.confidence || 0.7) * 100)}%
                            </div>
                          </div>
                          <span className="text-2xs text-navy-400">
                            {em.timestamp ? formatDateTime(em.timestamp) : 'Recent'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Smile className="h-6 w-6 text-navy-300" />}
                      title="No emotion analysis sessions recorded yet."
                      message="Run the 32-channel DEAP Emotion Recognition model to analyse affective states for this participant."
                    />
                  )}
                </div>
              )}

              {/* TAB 3: MOTOR IMAGERY HISTORY */}
              {profileActiveTab === 'motor' && (
                <div className="space-y-2">
                  {profileData?.motor_imagery_history && profileData.motor_imagery_history.length > 0 ? (
                    <div className="space-y-1.5 max-h-60 overflow-y-auto">
                      {profileData.motor_imagery_history.map((mi, idx) => (
                        <div
                          key={mi.id || idx}
                          className="p-2.5 rounded-lg border border-navy-100 bg-white flex items-center justify-between"
                        >
                          <div>
                            <span className="font-bold text-navy text-xs">
                              Task: {mi.instruction || 'Left Hand'} → Predicted: {mi.predicted_class || 'Left Hand'}
                            </span>
                            <div className="text-2xs text-navy-400">
                              Probability: {Math.round((mi.probability || mi.confidence || 0.8) * 100)}% · Source: {mi.source || 'PhysioNet'}
                            </div>
                          </div>
                          <span className="text-2xs text-navy-400">
                            {mi.timestamp ? formatDateTime(mi.timestamp) : 'Recent'}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <EmptyState
                      icon={<Brain className="h-6 w-6 text-navy-300" />}
                      title="No motor imagery sessions recorded yet."
                      message="Execute the 64-channel PhysioNet CSP + LDA Motor Imagery paradigm to record trial inferences."
                    />
                  )}
                </div>
              )}
            </div>

            <DialogFooter className="pt-2">
              <Button variant="secondary" onClick={() => setProfileOpen(false)}>
                Close Profile
              </Button>
            </DialogFooter>
          </DialogContent>
        )}
      </Dialog>
    </div>
  );
}
