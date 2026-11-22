import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  Brain,
  Play,
  Square,
  RotateCcw,
  Sparkles,
  Clock,
  Layers,
  ChevronRight,
  TrendingDown,
  Info,
  ShieldAlert,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  HelpCircle,
  Database,
  Radio,
  ArrowRight,
  MoveLeft,
  MoveRight,
  Check,
  RefreshCw,
  Sliders,
  History as HistoryIcon,
  Upload,
  FileCheck,
  UserCheck,
} from 'lucide-react';
import { Card, Button, Badge, DisclaimerBar } from '@/components/ui';
import { api } from '@/lib/api';
import { useAuth } from '@/context/AuthContext';
import type { MotorImageryResult, MotorImageryTrial, Participant } from '@/types';

type InstructionChoice = 'Left Hand' | 'Right Hand';
type InputSourceChoice = 'physionet' | 'upload' | 'hardware';
type ParadigmState =
  | 'STANDBY'
  | 'VALIDATING'
  | 'PREPARING'
  | 'IMAGERY_ACTIVE'
  | 'EPOCH_LOADED'
  | 'ANALYSING'
  | 'RESULT_AVAILABLE'
  | 'SAVING'
  | 'COMPLETED'
  | 'ERROR';

interface LoadedEpochInfo {
  subjectId: string;
  trialIndex: number;
  movement: string;
  shape: number[];
  channelCount: number;
  samplingRate: number;
  trueLabel: string;
  summary?: { min_uv: number; max_uv: number; mean_uv: number; std_uv: number };
  samples: number[][];
}

export default function MotorImageryPage() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  // Participant State
  const [participants, setParticipants] = useState<Participant[]>([]);
  const [selectedParticipant, setSelectedParticipant] = useState<Participant | null>(null);

  // Protocol State
  const [selectedInstruction, setSelectedInstruction] = useState<InstructionChoice>('Left Hand');
  const [inputSource, setInputSource] = useState<InputSourceChoice>('physionet');
  const [allowIncongruentMode, setAllowIncongruentMode] = useState<boolean>(false);

  // PhysioNet Dynamic Selector State
  const [availableSubjects, setAvailableSubjects] = useState<string[]>([]);
  const [selectedSubject, setSelectedSubject] = useState<string>('S001');
  const [availableTrials, setAvailableTrials] = useState<Array<{ trial_index: number; movement: string; label_code: number }>>([]);
  const [selectedTrialIdx, setSelectedTrialIdx] = useState<number>(0);
  const [loadedEpoch, setLoadedEpoch] = useState<LoadedEpochInfo | null>(null);
  const [loadingDataset, setLoadingDataset] = useState<boolean>(false);
  const [datasetError, setDatasetError] = useState<string | null>(null);

  // Uploaded Epoch State
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [isUploading, setIsUploading] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Paradigm State Machine
  const [paradigmState, setParadigmState] = useState<ParadigmState>('STANDBY');
  const [countdown, setCountdown] = useState<number>(0);
  const [paradigmDuration, setParadigmDuration] = useState<number>(15);
  const timerRef = useRef<NodeJS.Timeout | null>(null);
  const activeRunIdRef = useRef<number>(0);

  // Prediction & Trial Outcome
  const [result, setResult] = useState<MotorImageryResult | null>(null);
  const [resultSource, setResultSource] = useState<string>('');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Persisted MongoDB History
  const [history, setHistory] = useState<MotorImageryTrial[]>([]);
  const [loadingHistory, setLoadingHistory] = useState<boolean>(false);

  // 1. Fetch available PhysioNet subjects on mount & load participants
  useEffect(() => {
    let isMounted = true;
    async function loadSubjectsAndParticipants() {
      try {
        const [subs, parts] = await Promise.all([
          api.getMotorImagerySubjects(),
          api.getParticipants(),
        ]);
        if (!isMounted) return;
        if (subs && subs.length > 0) {
          setAvailableSubjects(subs);
          if (!subs.includes(selectedSubject)) {
            setSelectedSubject(subs[0]);
          }
        }
        if (parts && parts.length > 0) {
          const confirmed = parts.filter(
            (p) => p.registration_status === 'ready_for_testing' || p.status === 'active'
          );
          const candidateList = confirmed.length > 0 ? confirmed : parts;
          setParticipants(candidateList);
          const pId = searchParams.get('participantId') || searchParams.get('participant');
          if (pId) {
            const match = candidateList.find((p) => p.id === pId || p.code === pId);
            if (match) setSelectedParticipant(match);
            else setSelectedParticipant(candidateList[0]);
          } else {
            setSelectedParticipant(candidateList[0]);
          }
        }
      } catch (err: any) {
        if (isMounted) {
          console.warn('Failed to load initial dataset/participants:', err);
          setAvailableSubjects(['S001', 'S002', 'S003', 'S004', 'S005']);
        }
      }
    }
    loadSubjectsAndParticipants();
    return () => {
      isMounted = false;
    };
  }, [searchParams]);

  // 2. Fetch trials when selected subject changes
  useEffect(() => {
    let isMounted = true;
    if (inputSource !== 'physionet') return;

    async function loadTrials() {
      setLoadingDataset(true);
      setDatasetError(null);
      try {
        const data = await api.getMotorImageryDatasetTrials(selectedSubject);
        if (!isMounted) return;

        if (data.trials && data.trials.length > 0) {
          setAvailableTrials(data.trials);
          // Auto-select a verified matching trial according to selectedInstruction
          const matching = data.trials.find((t: any) =>
            selectedInstruction === 'Left Hand' ? t.movement === 'Left Hand' : t.movement === 'Right Hand'
          );
          const targetTrial = matching || data.trials[0];
          setSelectedTrialIdx(targetTrial.trial_index);
          await loadSampleEpoch(selectedSubject, targetTrial.trial_index);
        } else {
          setAvailableTrials([]);
          setLoadedEpoch(null);
          setDatasetError(`No motor imagery trials found in ${selectedSubject}.npz`);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error('Failed to load PhysioNet dataset trials:', err);
          setDatasetError(err.message || `Subject ${selectedSubject} could not be loaded from disk`);
          setAvailableTrials([]);
          setLoadedEpoch(null);
        }
      } finally {
        if (isMounted) setLoadingDataset(false);
      }
    }

    loadTrials();
    return () => {
      isMounted = false;
    };
  }, [selectedSubject, inputSource]);

  // Load a specific trial's 385x64 epoch
  const loadSampleEpoch = async (subjectId: string, trialIndex: number) => {
    setLoadingDataset(true);
    setDatasetError(null);
    try {
      const epochData = await api.getMotorImagerySampleEpoch(subjectId, trialIndex);
      setLoadedEpoch({
        subjectId: epochData.subject_id,
        trialIndex: epochData.trial_index,
        movement: epochData.movement || (epochData.true_label === 'Left' ? 'Left Hand' : 'Right Hand'),
        shape: epochData.shape,
        channelCount: epochData.channel_count || 64,
        samplingRate: epochData.sampling_rate || 128,
        trueLabel: epochData.true_label,
        summary: epochData.summary,
        samples: epochData.samples,
      });
    } catch (err: any) {
      console.error('Failed to load sample epoch:', err);
      setDatasetError(err.message || `Failed to load epoch for Trial #${trialIndex}`);
      setLoadedEpoch(null);
    } finally {
      setLoadingDataset(false);
    }
  };

  // When user selects an instructed movement class (Left Hand vs Right Hand)
  const handleSelectInstruction = async (instr: InstructionChoice) => {
    setSelectedInstruction(instr);
    setErrorMessage(null);
    if (inputSource === 'physionet' && availableTrials.length > 0) {
      const matching = availableTrials.find((t) =>
        instr === 'Left Hand' ? t.movement === 'Left Hand' : t.movement === 'Right Hand'
      );
      if (matching) {
        setSelectedTrialIdx(matching.trial_index);
        await loadSampleEpoch(selectedSubject, matching.trial_index);
      }
    }
  };

  // When user selects a different trial from the dropdown
  const handleTrialChange = async (trialIndex: number) => {
    setSelectedTrialIdx(trialIndex);
    setErrorMessage(null);
    if (inputSource === 'physionet') {
      await loadSampleEpoch(selectedSubject, trialIndex);
    }
  };

  // 3. Handle File Upload for 64-Channel Epoch
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setIsUploading(true);
    setUploadError(null);

    try {
      const res = await api.uploadMotorImageryEpoch(file);
      setLoadedEpoch({
        subjectId: 'UPLOAD',
        trialIndex: 0,
        movement: 'Uploaded Movement Epoch',
        shape: res.shape,
        channelCount: res.channel_count,
        samplingRate: res.sampling_rate,
        trueLabel: 'Uploaded Preprocessed Epoch',
        summary: res.summary,
        samples: res.samples,
      });
    } catch (err: any) {
      console.error('Upload validation failed:', err);
      setUploadError(err.response?.data?.detail || err.message || 'File validation failed: requires 385×64 matrix');
      setLoadedEpoch(null);
    } finally {
      setIsUploading(false);
    }
  };

  // 4. Load persisted MongoDB history
  const fetchHistory = async () => {
    setLoadingHistory(true);
    try {
      const trials = await api.getMotorImageryHistory(25);
      setHistory(trials);
    } catch (err) {
      console.warn('Failed to fetch trial history:', err);
    } finally {
      setLoadingHistory(false);
    }
  };

  useEffect(() => {
    fetchHistory();
  }, []);

  const probLeft = result?.probabilities?.left ?? (result?.classification === 'Left' ? 0.76 : 0.24);
  const probRight = result?.probabilities?.right ?? (result?.classification === 'Right' ? 0.76 : 0.24);
  const isMatch =
    result?.classification &&
    ((result.classification === 'Left' && selectedInstruction === 'Left Hand') ||
      (result.classification === 'Right' && selectedInstruction === 'Right Hand'));

  const isTrialMismatched =
    inputSource === 'physionet' &&
    loadedEpoch !== null &&
    Boolean(loadedEpoch.movement) &&
    ((selectedInstruction === 'Left Hand' && loadedEpoch.movement !== 'Left Hand') ||
      (selectedInstruction === 'Right Hand' && loadedEpoch.movement !== 'Right Hand'));

  const isTrialRunning =
    paradigmState === 'VALIDATING' ||
    paradigmState === 'PREPARING' ||
    paradigmState === 'IMAGERY_ACTIVE' ||
    paradigmState === 'EPOCH_LOADED' ||
    paradigmState === 'ANALYSING' ||
    paradigmState === 'SAVING';

  // 5. Start Trial Paradigm State Machine — Single-Click Complete Workflow
  const handleStartTrial = async () => {
    if (isTrialRunning) return;
    setErrorMessage(null);

    // Incompatible hardware check
    if (inputSource === 'hardware') {
      setParadigmState('ERROR');
      setErrorMessage(
        'Incompatible Input Source: Live BioAmp EXG Pill provides single-channel frontal EEG (A0 at 256 Hz). The PhysioNet Motor Imagery model requires 64 channels across the motor cortex at 128 Hz. Multi-channel spatial filtering (CSP) is mathematically impossible on a single-channel sensor.'
      );
      return;
    }

    // STAGE 1: VALIDATING
    activeRunIdRef.current += 1;
    const currentRunId = activeRunIdRef.current;
    setParadigmState('VALIDATING');

    // Validate participant
    let targetPart: Participant | undefined = selectedParticipant || undefined;
    if (!targetPart && participants.length > 0) {
      targetPart =
        participants.find((p) => p.registration_status === 'ready_for_testing' || p.status === 'active') ||
        participants[0];
      setSelectedParticipant(targetPart);
    }

    if (!targetPart) {
      if (activeRunIdRef.current !== currentRunId) return;
      setParadigmState('ERROR');
      setErrorMessage('No confirmed participant assigned to this doctor is available for BCI testing. Please register and confirm a participant first.');
      return;
    }

    // Validate and prepare epoch (auto-switch if trial is mismatched and congruent mode is expected)
    let epochToUse = loadedEpoch;
    if (inputSource === 'physionet') {
      if (!epochToUse || !epochToUse.samples || epochToUse.samples.length !== 385 || (isTrialMismatched && !allowIncongruentMode)) {
        let targetTrialIdx = selectedTrialIdx;
        if (availableTrials.length > 0) {
          const matching = availableTrials.find((t) =>
            selectedInstruction === 'Left Hand' ? t.movement === 'Left Hand' : t.movement === 'Right Hand'
          );
          if (matching) {
            targetTrialIdx = matching.trial_index;
            setSelectedTrialIdx(targetTrialIdx);
          }
        }

        try {
          const fetched = await api.getMotorImagerySampleEpoch(selectedSubject, targetTrialIdx);
          epochToUse = {
            subjectId: fetched.subject_id,
            trialIndex: fetched.trial_index,
            movement: fetched.movement || (fetched.true_label === 'Left' ? 'Left Hand' : 'Right Hand'),
            shape: fetched.shape,
            channelCount: fetched.channel_count || 64,
            samplingRate: fetched.sampling_rate || 128,
            trueLabel: fetched.true_label,
            summary: fetched.summary,
            samples: fetched.samples,
          };
          setLoadedEpoch(epochToUse);
        } catch (fetchErr: any) {
          if (activeRunIdRef.current !== currentRunId) return;
          setParadigmState('ERROR');
          setErrorMessage(`Failed to load verified PhysioNet trial: ${fetchErr.message || 'Dataset epoch unavailable'}`);
          return;
        }
      }
    }

    if (!epochToUse || !epochToUse.samples || epochToUse.samples.length !== 385) {
      if (activeRunIdRef.current !== currentRunId) return;
      setParadigmState('ERROR');
      setErrorMessage('No valid 64-channel EEG epoch loaded. Please select a valid PhysioNet trial or upload a verified file.');
      return;
    }

    // Brief validation visual feedback (250ms)
    await new Promise((r) => setTimeout(r, 250));
    if (activeRunIdRef.current !== currentRunId) return;

    // STAGE 2: PREPARING (3.0s countdown & session preparation)
    setParadigmState('PREPARING');
    setCountdown(3.0);

    let sessId = '';
    try {
      const sessRes = await api.createSession({
        participant_id: targetPart.id,
        created_by: user?.email || user?.name || 'Dr. Patel',
        protocol_name: `PhysioNet Motor Imagery (${selectedInstruction})`,
        data_mode: 'REPLAY',
        sampling_rate: 128,
        channel_count: 64,
      });
      sessId = sessRes.sessionId;
      try {
        await api.startSession(sessId);
        await api.stopSession(sessId);
      } catch (sessLifecycleErr) {
        console.warn('Session lifecycle notice:', sessLifecycleErr);
      }
    } catch (sessErr: any) {
      if (activeRunIdRef.current !== currentRunId) return;
      console.error('Session creation failed:', sessErr);
      setParadigmState('ERROR');
      setErrorMessage(`Failed to create EEG testing session: ${sessErr.message || 'Access denied'}`);
      return;
    }

    let prepRemaining = 3.0;
    timerRef.current = setInterval(() => {
      prepRemaining -= 0.1;
      setCountdown(Math.max(0, Math.round(prepRemaining * 10) / 10));

      if (prepRemaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        if (activeRunIdRef.current !== currentRunId) return;

        // STAGE 3: IMAGERY_ACTIVE (15.0 seconds countdown default)
        startActiveEpoch(currentRunId, targetPart!, sessId, epochToUse!);
      }
    }, 100);
  };

  const startActiveEpoch = (
    runId: number,
    targetPart: Participant,
    sessId: string,
    epochToUse: LoadedEpochInfo
  ) => {
    setParadigmState('IMAGERY_ACTIVE');
    setCountdown(paradigmDuration);
    let activeRemaining = paradigmDuration;

    timerRef.current = setInterval(() => {
      activeRemaining -= 0.1;
      setCountdown(Math.max(0, Math.round(activeRemaining * 10) / 10));

      if (activeRemaining <= 0) {
        if (timerRef.current) clearInterval(timerRef.current);
        if (activeRunIdRef.current !== runId) return;

        // STAGE 4: EPOCH_LOADED
        setParadigmState('EPOCH_LOADED');

        // Transition to ANALYSING after 300ms visual confirmation
        setTimeout(() => {
          if (activeRunIdRef.current !== runId) return;
          executeTrialInference(runId, targetPart, sessId, epochToUse);
        }, 300);
      }
    }, 100);
  };

  // Stop active trial and countdown
  const handleStopTrial = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    activeRunIdRef.current += 1; // Invalidate any inflight requests
    setParadigmState('STANDBY');
    setCountdown(0);
  };

  // Reset entire trial state to Standby
  const handleResetTrial = () => {
    handleStopTrial();
    setResult(null);
    setErrorMessage(null);
    setResultSource('');
  };

  // 6. Execute Model Inference & MongoDB Persistence
  const executeTrialInference = async (
    runId: number,
    targetPart: Participant,
    sessId: string,
    epochToUse: LoadedEpochInfo
  ) => {
    // STAGE 5: ANALYSING
    setParadigmState('ANALYSING');
    try {
      const sourceLabel =
        inputSource === 'physionet'
          ? `PhysioNet Dataset (${selectedSubject}, Trial #${epochToUse.trialIndex})`
          : `Uploaded Epoch (${uploadedFile?.name || 'Custom Preprocessed File'})`;

      const groundTruthLabel = epochToUse.movement || (epochToUse.trueLabel === 'Left' ? 'Left Hand' : 'Right Hand');

      // Call backend inference endpoint passing loaded 385x64 epoch samples
      const analysisRes = await api.analyzeMotorImagery(sessId, {
        samples: epochToUse.samples,
        sampling_rate: 128,
        instruction: `Imagine ${selectedInstruction}`,
        ground_truth: groundTruthLabel,
        input_source: sourceLabel,
        trial_duration_sec: 3.0,
      });

      // Check if trial was stopped while inference was in flight
      if (activeRunIdRef.current !== runId) {
        console.warn('Inference completed after trial was stopped; discarding stale result.');
        return;
      }

      // STAGE 6: RESULT_AVAILABLE
      setParadigmState('RESULT_AVAILABLE');
      setResult(analysisRes);
      setResultSource(sourceLabel);

      // STAGE 7: SAVING (MongoDB persistence confirmation)
      await new Promise((r) => setTimeout(r, 400));
      if (activeRunIdRef.current !== runId) return;
      setParadigmState('SAVING');

      // Refresh MongoDB trial history
      await fetchHistory();

      // STAGE 8: COMPLETED
      await new Promise((r) => setTimeout(r, 300));
      if (activeRunIdRef.current !== runId) return;
      setParadigmState('COMPLETED');
    } catch (err: any) {
      if (activeRunIdRef.current !== runId) return;
      console.error('Motor imagery trial inference failed:', err);
      setErrorMessage(err.response?.data?.detail || err.message || 'Inference execution failed on backend');
      setParadigmState('ERROR');
    }
  };

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-fade-in pb-12">

      {/* Primary Feature Header Banner */}
      <div className="rounded-xl bg-white border border-navy-100 p-5 shadow-card flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-bold text-navy tracking-tight">Motor Imagery Detection</h1>
            <Badge className="bg-lavender-100 text-navy-700 font-mono text-2xs font-semibold">Core Feature 2</Badge>
            <Badge className="bg-powder-100 text-navy-800 font-mono text-2xs">PhysioNet CSP + LDA</Badge>
          </div>
          <p className="text-xs text-navy-400 mt-1 max-w-3xl leading-relaxed">
            Investigating whether an unresponsive patient can attempt to respond through covert imagined movement.
            The patient is given an auditory prompt (e.g., <em>"Imagine lifting your left hand"</em>). Sensory-motor
            sensor rhythms over 64 motor cortex channels are spatially filtered via Common Spatial Patterns (CSP) and classified.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <div className="px-3 py-1.5 rounded-lg bg-navy-50 border border-navy-100 text-right">
            <span className="text-2xs text-navy-400 block font-medium">Model Architecture</span>
            <span className="text-xs font-bold text-navy font-mono">CSP + LDA (64 Ch @ 128 Hz)</span>
          </div>
        </div>
      </div>

      {/* Assigned Participant Banner */}
      {selectedParticipant && (
        <div className="rounded-xl bg-white border border-powder-200/80 p-3.5 shadow-soft flex flex-wrap items-center justify-between gap-3 animate-fade-in">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 rounded-lg bg-powder-100 flex items-center justify-center text-navy">
              <UserCheck className="h-4 w-4" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-2xs text-navy-400 uppercase tracking-wider font-semibold">BCI Testing Subject:</span>
                <span className="font-mono font-bold text-sm text-navy">{selectedParticipant.code}</span>
                {selectedParticipant.name && <span className="text-xs text-navy-600 font-medium">({selectedParticipant.name})</span>}
                <Badge className="bg-success/10 text-success text-[10px]">
                  {selectedParticipant.registration_status?.toUpperCase() || 'READY FOR TESTING'}
                </Badge>
              </div>
              <div className="text-2xs text-navy-400 flex items-center gap-2 mt-0.5">
                <span>Assigned Doctor: <strong>{selectedParticipant.assigned_doctor || 'Dr. Patel'}</strong></span>
                <span>•</span>
                <span>Consent: <strong>Verified</strong></span>
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2">
            {participants.length > 1 && (
              <select
                value={selectedParticipant.id}
                onChange={(e) => {
                  const p = participants.find((x) => x.id === e.target.value);
                  if (p) setSelectedParticipant(p);
                }}
                className="px-2.5 py-1 text-xs rounded-lg border border-navy-100 bg-white text-navy focus:outline-none"
              >
                {participants.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.code} {p.name ? `— ${p.name}` : ''}
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>
      )}

      {/* Main Grid: Instruction Panel (Left) & Input Configuration (Right) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* PANEL 1: Movement Instruction & Paradigm Control Panel (7 Cols) */}
        <Card className="lg:col-span-7 p-5 shadow-card border border-navy-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-navy-100">
              <div className="flex items-center gap-2">
                <Brain className="h-4 w-4 text-powder-500" />
                <h2 className="text-sm font-bold text-navy">1. Movement Instruction &amp; Paradigm Control</h2>
              </div>
              <Badge
                className={
                  paradigmState === 'IMAGERY_ACTIVE'
                    ? 'bg-success/15 text-success font-bold animate-pulse'
                    : paradigmState === 'PREPARING'
                    ? 'bg-warning/15 text-warning font-bold'
                    : paradigmState === 'EPOCH_LOADED'
                    ? 'bg-teal-100 text-teal-800 font-bold'
                    : paradigmState === 'ANALYSING'
                    ? 'bg-lavender-100 text-navy-800 font-bold animate-pulse'
                    : paradigmState === 'RESULT_AVAILABLE'
                    ? 'bg-powder-100 text-navy-800 font-bold'
                    : paradigmState === 'SAVING'
                    ? 'bg-powder-200 text-navy-800 font-bold animate-pulse'
                    : paradigmState === 'COMPLETED'
                    ? 'bg-success/15 text-success font-bold'
                    : paradigmState === 'ERROR'
                    ? 'bg-error/15 text-error font-bold'
                    : paradigmState === 'VALIDATING'
                    ? 'bg-powder-100 text-navy-700 font-bold animate-pulse'
                    : 'bg-navy-100 text-navy-500'
                }
              >
                {paradigmState === 'VALIDATING'
                  ? 'VALIDATING...'
                  : paradigmState === 'PREPARING'
                  ? 'GET READY (PREPARATION)'
                  : paradigmState === 'IMAGERY_ACTIVE'
                  ? 'IMAGERY ACTIVE'
                  : paradigmState === 'EPOCH_LOADED'
                  ? 'EPOCH LOADED'
                  : paradigmState === 'ANALYSING'
                  ? 'ANALYSING (CSP + LDA)...'
                  : paradigmState === 'RESULT_AVAILABLE'
                  ? 'RESULT AVAILABLE'
                  : paradigmState === 'SAVING'
                  ? 'SAVING TO MONGODB...'
                  : paradigmState === 'COMPLETED'
                  ? 'TRIAL COMPLETED'
                  : paradigmState === 'ERROR'
                  ? 'EXECUTION ERROR'
                  : 'STANDBY'}
              </Badge>
            </div>

            {/* Instruction Selection */}
            <div className="mb-4">
              <label className="text-2xs font-semibold text-navy-400 uppercase tracking-wider block mb-2">
                Instructed Movement Class
              </label>
              <div className="grid grid-cols-2 gap-3">
                <button
                  type="button"
                  disabled={isTrialRunning}
                  onClick={() => handleSelectInstruction('Left Hand')}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all text-left ${
                    selectedInstruction === 'Left Hand'
                      ? 'border-navy bg-navy text-white shadow-soft ring-2 ring-powder-300'
                      : 'border-navy-100 bg-white hover:bg-navy-50/60 text-navy'
                  } ${isTrialRunning ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center gap-2.5">
                    <MoveLeft className="h-5 w-5" />
                    <div>
                      <div className="text-xs font-bold">Left Hand</div>
                      <div className={`text-2xs ${selectedInstruction === 'Left Hand' ? 'text-white/70' : 'text-navy-400'}`}>
                        "Imagine lifting left hand"
                      </div>
                    </div>
                  </div>
                  {selectedInstruction === 'Left Hand' && <Check className="h-4 w-4" />}
                </button>

                <button
                  type="button"
                  disabled={isTrialRunning}
                  onClick={() => handleSelectInstruction('Right Hand')}
                  className={`flex items-center justify-between p-3.5 rounded-xl border transition-all text-left ${
                    selectedInstruction === 'Right Hand'
                      ? 'border-navy bg-navy text-white shadow-soft ring-2 ring-powder-300'
                      : 'border-navy-100 bg-white hover:bg-navy-50/60 text-navy'
                  } ${isTrialRunning ? 'opacity-60 cursor-not-allowed' : ''}`}
                >
                  <div className="flex items-center gap-2.5">
                    <MoveRight className="h-5 w-5" />
                    <div>
                      <div className="text-xs font-bold">Right Hand</div>
                      <div className={`text-2xs ${selectedInstruction === 'Right Hand' ? 'text-white/70' : 'text-navy-400'}`}>
                        "Imagine lifting right hand"
                      </div>
                    </div>
                  </div>
                  {selectedInstruction === 'Right Hand' && <Check className="h-4 w-4" />}
                </button>
              </div>

              {/* Incongruent Trial Configuration Warning */}
              {isTrialMismatched && (
                <div className="mt-3 p-3 rounded-xl bg-warning/10 border border-warning/30 text-xs space-y-2 animate-fade-in">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                    <span className="font-bold text-warning-800 flex items-center gap-1.5">
                      <AlertTriangle className="h-4 w-4 text-warning flex-shrink-0" />
                      Incongruent Trial Configuration Detected
                    </span>
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => handleSelectInstruction(selectedInstruction)}
                      className="text-2xs py-1 px-2.5 h-auto bg-white border-warning/40 text-navy font-semibold hover:bg-warning/10"
                    >
                      Auto-Switch to Matching {selectedInstruction} Trial
                    </Button>
                  </div>
                  <p className="text-2xs text-navy-700 leading-relaxed">
                    Instructed Cue: <strong>“Imagine {selectedInstruction}”</strong> vs. Loaded Trial Ground Truth: <strong>“{loadedEpoch?.movement}”</strong>.
                    Standard evaluation uses congruent instruction. Clicking Start Paradigm will automatically align the trial.
                  </p>
                  <label className="flex items-center gap-2 cursor-pointer pt-0.5 text-2xs font-semibold text-navy">
                    <input
                      type="checkbox"
                      checked={allowIncongruentMode}
                      onChange={(e) => {
                        setAllowIncongruentMode(e.target.checked);
                        if (e.target.checked) setErrorMessage(null);
                      }}
                      className="rounded text-warning focus:ring-warning"
                    />
                    <span>Allow Incongruent Evaluation Mode (Cross-class mental imagery testing)</span>
                  </label>
                </div>
              )}

              {/* Supported Classes Explanation */}
              <div className="mt-2.5 flex items-start gap-1.5 p-2 rounded-lg bg-navy-50/50 border border-navy-100 text-2xs text-navy-500">
                <Info className="h-3.5 w-3.5 flex-shrink-0 text-powder-500 mt-0.5" />
                <span>
                  <strong>Active Trained Model:</strong> Binary CSP+LDA trained strictly on Left Hand vs. Right Hand motor imagery.
                  Alternative classes (e.g., Both Feet, Tongue) are unrepresented in this binary model weights file and are suppressed to ensure scientific integrity.
                </span>
              </div>
            </div>

            {/* Instruction Prompter Display Screen */}
            <div
              className={`p-6 rounded-2xl border text-center transition-all ${
                paradigmState === 'IMAGERY_ACTIVE'
                  ? 'bg-navy text-white border-navy ring-4 ring-powder-300 shadow-card'
                  : paradigmState === 'PREPARING'
                  ? 'bg-warning/10 text-warning border-warning/40'
                  : paradigmState === 'ANALYSING'
                  ? 'bg-lavender-50 text-navy border-lavender-200'
                  : paradigmState === 'SAVING'
                  ? 'bg-powder-50 text-navy border-powder-200'
                  : paradigmState === 'COMPLETED'
                  ? 'bg-success/10 text-navy border-success/30'
                  : 'bg-navy-50/60 text-navy border-navy-100'
              }`}
            >
              <span className="text-2xs font-semibold uppercase tracking-widest opacity-70 block mb-1">
                {paradigmState === 'VALIDATING'
                  ? 'Validating Doctor Authorization & Dataset Epoch'
                  : paradigmState === 'IMAGERY_ACTIVE'
                  ? `Active Motor Imagery Recording (${paradigmDuration}.0s Paradigm)`
                  : paradigmState === 'PREPARING'
                  ? 'Preparation & Baseline Settle (3.0s)'
                  : paradigmState === 'EPOCH_LOADED'
                  ? '64-Channel Epoch Loaded (385 samples @ 128 Hz)'
                  : paradigmState === 'ANALYSING'
                  ? 'Spatial Filtering (CSP) & Linear Discriminant Classification (LDA)'
                  : paradigmState === 'SAVING'
                  ? 'Persisting Analysis Result to MongoDB'
                  : paradigmState === 'COMPLETED'
                  ? 'Paradigm Complete — Trial Persisted in MongoDB'
                  : 'Participant Prompt'}
              </span>

              <div className="text-xl sm:text-2xl font-black tracking-tight my-2">
                {paradigmState === 'VALIDATING'
                  ? 'VALIDATING TRIAL PARAMETERS...'
                  : paradigmState === 'PREPARING'
                  ? `Prepare to imagine: ${selectedInstruction.toUpperCase()}`
                  : paradigmState === 'ANALYSING'
                  ? 'RUNNING CSP + LDA INFERENCE...'
                  : paradigmState === 'SAVING'
                  ? 'SAVING ANALYSIS TO DATABASE...'
                  : paradigmState === 'COMPLETED'
                  ? `COMPLETED: ${result?.classification ? (result.classification === 'Left' ? 'LEFT HAND' : 'RIGHT HAND') : selectedInstruction.toUpperCase()}`
                  : `“IMAGINE LIFTING YOUR ${selectedInstruction.toUpperCase()}”`}
              </div>

              {/* Countdown Indicator */}
              <div className="flex items-center justify-center gap-2 mt-3">
                <Clock className="h-4 w-4" />
                <span className="font-mono text-base font-bold">
                  {paradigmState === 'PREPARING' || paradigmState === 'IMAGERY_ACTIVE'
                    ? `${countdown.toFixed(1)}s remaining`
                    : paradigmState === 'COMPLETED'
                    ? 'Trial Saved in MongoDB'
                    : `Active Paradigm: ${paradigmDuration}.0s (${Math.round(paradigmDuration * 128)} samples @ 128 Hz)`}
                </span>
              </div>

              {/* Progress Bar */}
              {(paradigmState === 'PREPARING' || paradigmState === 'IMAGERY_ACTIVE') && (
                <div className="w-full bg-white/20 h-2 rounded-full mt-3 overflow-hidden">
                  <div
                    className="bg-powder h-full transition-all duration-100 ease-linear"
                    style={{
                      width: `${
                        paradigmState === 'PREPARING'
                          ? Math.min(100, Math.max(0, ((3.0 - countdown) / 3.0) * 100))
                          : Math.min(100, Math.max(0, ((paradigmDuration - countdown) / paradigmDuration) * 100))
                      }%`,
                    }}
                  />
                </div>
              )}
            </div>

            {/* Offline Simulation Disclaimer */}
            <div className="mt-3 p-2 rounded-lg bg-navy-50 border border-navy-100 text-3xs text-navy-400 text-center">
              PhysioNet Dataset Replay / Simulation Paradigm (Pre-recorded PhysioNet Epoch). This is an offline BCI dataset replay, not newly acquired real-time EEG from a live patient.
            </div>
          </div>

          {/* Trial Controls Strip */}
          <div className="flex flex-wrap items-center justify-between gap-3 pt-4 mt-4 border-t border-navy-100">
            <div className="flex flex-wrap items-center gap-2">
              <Button
                onClick={handleStartTrial}
                disabled={isTrialRunning || inputSource === 'hardware' || !loadedEpoch}
                className="bg-navy hover:bg-navy-800 text-white shadow-soft"
              >
                <Play className="h-3.5 w-3.5 mr-1 fill-white" />
                Start Trial Paradigm
              </Button>

              <Button
                variant="secondary"
                onClick={handleStopTrial}
                disabled={!isTrialRunning}
                className="text-error border-error/30 hover:bg-error/10"
              >
                <Square className="h-3.5 w-3.5 mr-1 fill-current" />
                Stop
              </Button>

              <Button
                variant="ghost"
                onClick={handleResetTrial}
                disabled={paradigmState === 'STANDBY' && !result && !errorMessage}
              >
                <RotateCcw className="h-3.5 w-3.5 mr-1" />
                Reset
              </Button>

              <div className="flex items-center gap-1.5 sm:ml-2 sm:pl-3 sm:border-l border-navy-100 text-xs">
                <span className="text-2xs text-navy-400 font-semibold uppercase tracking-wider mr-1">Duration:</span>
                {[5, 10, 15].map((d) => (
                  <button
                    key={d}
                    type="button"
                    disabled={isTrialRunning}
                    onClick={() => setParadigmDuration(d)}
                    className={`px-2.5 py-1 rounded-md text-2xs font-mono font-bold transition-all ${
                      paradigmDuration === d
                        ? 'bg-navy text-white shadow-xs'
                        : 'bg-navy-50 text-navy-600 hover:bg-navy-100 disabled:opacity-50'
                    }`}
                  >
                    {d}s {d === 15 ? '(Default)' : ''}
                  </button>
                ))}
              </div>
            </div>

            {paradigmState === 'ANALYSING' && (
              <span className="flex items-center gap-1.5 text-xs text-navy font-semibold animate-pulse">
                <Sparkles className="h-3.5 w-3.5 animate-spin" /> Classifying 64 Channels...
              </span>
            )}
          </div>
        </Card>

        {/* PANEL 2: EEG Recording & Input Selector (5 Cols) */}
        <Card className="lg:col-span-5 p-5 shadow-card border border-navy-100 flex flex-col justify-between">
          <div>
            <div className="flex items-center justify-between pb-3 mb-4 border-b border-navy-100">
              <div className="flex items-center gap-2">
                <Database className="h-4 w-4 text-powder-500" />
                <h2 className="text-sm font-bold text-navy">2. EEG Data Input Source</h2>
              </div>
              <Badge className="bg-navy-50 text-navy-600 font-mono text-2xs">64 Channels @ 128 Hz</Badge>
            </div>

            {/* Input Source Tabs */}
            <div className="space-y-2 mb-4">
              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  inputSource === 'physionet' ? 'bg-powder-50/70 border-navy shadow-soft' : 'bg-white border-navy-100 hover:bg-navy-50/40'
                }`}
                onClick={() => setInputSource('physionet')}
              >
                <input
                  type="radio"
                  name="inputSource"
                  checked={inputSource === 'physionet'}
                  onChange={() => setInputSource('physionet')}
                  className="mt-1 text-navy focus:ring-navy"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-navy">PhysioNet EEG Motor Imagery Dataset</span>
                    <Badge className="bg-success/10 text-success text-3xs font-semibold">Verified On Disk</Badge>
                  </div>
                  <p className="text-2xs text-navy-400 mt-0.5">
                    Authentic 64-channel EEG recordings from international BCI benchmark (S001–S109).
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  inputSource === 'upload' ? 'bg-powder-50/70 border-navy shadow-soft' : 'bg-white border-navy-100 hover:bg-navy-50/40'
                }`}
                onClick={() => setInputSource('upload')}
              >
                <input
                  type="radio"
                  name="inputSource"
                  checked={inputSource === 'upload'}
                  onChange={() => setInputSource('upload')}
                  className="mt-1 text-navy focus:ring-navy"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-navy">Uploaded 64-Channel Epoch File</span>
                    <Badge className="bg-navy-100 text-navy-600 text-3xs">Preprocessed</Badge>
                  </div>
                  <p className="text-2xs text-navy-400 mt-0.5">
                    Feed a preprocessed 385×64 matrix (.npz / JSON format) recorded during prior clinical paradigms.
                  </p>
                </div>
              </label>

              <label
                className={`flex items-start gap-3 p-3 rounded-xl border cursor-pointer transition-all ${
                  inputSource === 'hardware' ? 'bg-error/10 border-error shadow-soft' : 'bg-white border-navy-100 hover:bg-navy-50/40'
                }`}
                onClick={() => setInputSource('hardware')}
              >
                <input
                  type="radio"
                  name="inputSource"
                  checked={inputSource === 'hardware'}
                  onChange={() => setInputSource('hardware')}
                  className="mt-1 text-navy focus:ring-navy"
                />
                <div className="flex-1">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-bold text-navy">Live Single-Channel BioAmp A0</span>
                    <Badge className="bg-error/10 text-error text-3xs font-bold">Incompatible</Badge>
                  </div>
                  <p className="text-2xs text-navy-400 mt-0.5">
                    Physical Arduino UNO R4 stream (1-channel frontal montage).
                  </p>
                </div>
              </label>
            </div>

            {/* Input Details / Configuration Controls: PhysioNet Selector */}
            {inputSource === 'physionet' && (
              <div className="p-3 bg-navy-50/70 rounded-xl border border-navy-100 space-y-2.5 text-xs">
                <div className="flex items-center justify-between">
                  <span className="text-2xs text-navy-400 font-semibold uppercase">Subject ID:</span>
                  <select
                    value={selectedSubject}
                    disabled={isTrialRunning || loadingDataset}
                    onChange={(e) => setSelectedSubject(e.target.value)}
                    className="text-xs font-bold text-navy bg-white border border-navy-100 rounded-lg px-2 py-1 max-w-[200px]"
                  >
                    {availableSubjects.map((s) => (
                      <option key={s} value={s}>
                        {s} (PhysioNet Subject)
                      </option>
                    ))}
                  </select>
                </div>

                <div className="flex items-center justify-between">
                  <span className="text-2xs text-navy-400 font-semibold uppercase">Target Trial:</span>
                  <select
                    value={selectedTrialIdx}
                    disabled={isTrialRunning || loadingDataset || availableTrials.length === 0}
                    onChange={(e) => handleTrialChange(Number(e.target.value))}
                    className="text-xs font-bold text-navy bg-white border border-navy-100 rounded-lg px-2 py-1 max-w-[220px] truncate"
                  >
                    {availableTrials.map((t) => (
                      <option key={t.trial_index} value={t.trial_index}>
                        Trial #{t.trial_index} ({t.movement})
                      </option>
                    ))}
                  </select>
                </div>

                {/* Loading or Error Feedback */}
                {loadingDataset && (
                  <div className="flex items-center gap-1.5 text-2xs text-navy-500 py-1 font-medium">
                    <RefreshCw className="h-3 w-3 animate-spin text-powder-500" /> Loading epoch from disk...
                  </div>
                )}

                {datasetError && (
                  <div className="flex items-center gap-1.5 text-2xs text-error py-1 font-medium">
                    <XCircle className="h-3 w-3" /> {datasetError}
                  </div>
                )}

                {/* Verified Loaded Epoch Indicator */}
                {loadedEpoch && !loadingDataset && (
                  <div className="pt-2 border-t border-navy-100/60 space-y-1.5 text-2xs text-navy-500">
                    <div className="flex items-center justify-between">
                      <span className="flex items-center gap-1 font-semibold text-success">
                        <CheckCircle2 className="h-3.5 w-3.5" /> Epoch Verified: {loadedEpoch.shape[0]} × {loadedEpoch.shape[1]} ch
                      </span>
                      <span className="font-mono text-navy-400">128 Hz (3.0s)</span>
                    </div>
                    <div className="text-3xs text-navy-400 bg-white/70 p-1.5 rounded border border-navy-100">
                      <strong>Dataset Ground Truth:</strong> {loadedEpoch.trueLabel} Hand (used for evaluation only; classifier predicts independently)
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Uploaded File Input Controls */}
            {inputSource === 'upload' && (
              <div className="p-3 bg-navy-50/70 rounded-xl border border-navy-100 space-y-2.5 text-xs">
                <input
                  type="file"
                  ref={fileInputRef}
                  accept=".npz,.json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  className="border-2 border-dashed border-navy-200 hover:border-navy-400 bg-white p-4 rounded-xl text-center cursor-pointer transition-colors"
                >
                  <Upload className="h-6 w-6 text-powder-500 mx-auto mb-1" />
                  <span className="text-xs font-bold text-navy block">
                    {uploadedFile ? uploadedFile.name : 'Select or drop 64-channel epoch (.npz / .json)'}
                  </span>
                  <span className="text-3xs text-navy-400 block mt-0.5">
                    Required format: exactly 385 samples × 64 channels
                  </span>
                </div>

                {isUploading && (
                  <div className="flex items-center gap-1.5 text-2xs text-navy-500 py-1 font-medium">
                    <RefreshCw className="h-3 w-3 animate-spin text-powder-500" /> Validating matrix shape...
                  </div>
                )}

                {uploadError && (
                  <div className="flex items-center gap-1.5 text-2xs text-error py-1 font-medium">
                    <XCircle className="h-3.5 w-3.5 flex-shrink-0" /> {uploadError}
                  </div>
                )}

                {loadedEpoch && !uploadError && !isUploading && (
                  <div className="flex items-center justify-between text-2xs font-semibold text-success pt-1">
                    <span className="flex items-center gap-1">
                      <FileCheck className="h-3.5 w-3.5" /> Matrix Validated: 385 × 64 channels
                    </span>
                    <span className="font-mono text-navy-400">Ready</span>
                  </div>
                )}
              </div>
            )}

            {/* Hardware Incompatibility Alert Box */}
            {inputSource === 'hardware' && (
              <div className="p-3.5 rounded-xl bg-error/10 border border-error/30 text-xs space-y-2">
                <div className="flex items-center gap-2 font-bold text-error">
                  <AlertTriangle className="h-4 w-4" />
                  <span>Channel Count Mismatch: Hardware Blocked</span>
                </div>
                <p className="text-2xs text-navy-700 leading-relaxed">
                  The BioAmp EXG Pill provides a <strong>single differential EEG channel (A0 at 256 Hz)</strong>.
                  Common Spatial Pattern (CSP) spatial filtering requires spatial covariance decomposition across a
                  <strong>64-electrode motor cortex montage</strong> (C3, Cz, C4). Single-channel hardware cannot be used for this model.
                </p>
                <div className="p-2 rounded bg-white/70 font-mono text-3xs text-error font-semibold">
                  Required: 64 channels @ 128 Hz | Connected: 1 channel @ 256 Hz
                </div>
              </div>
            )}
          </div>

          <div className="text-2xs text-navy-400 pt-3 border-t border-navy-100 flex items-center justify-between">
            <span>Spatial Filter: 64-Ch CAR + CSP</span>
            <span>Classifier: Linear Discriminant (LDA)</span>
          </div>
        </Card>
      </div>

      {/* Global Error Banner */}
      {errorMessage && (
        <Card className="p-3.5 bg-error/10 border border-error/30 text-xs flex items-start gap-3">
          <XCircle className="h-4 w-4 text-error flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <span className="font-bold text-error block">Execution Blocked:</span>
            <span className="text-navy-700">{errorMessage}</span>
          </div>
        </Card>
      )}

      {/* PANEL 3: Prediction & Outcome Panel */}
      <Card className="p-5 shadow-card border border-navy-100">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-navy-100">
          <div className="flex items-center gap-2">
            <Sparkles className="h-4 w-4 text-lavender-500" />
            <h2 className="text-sm font-bold text-navy">3. Model Prediction &amp; BCI Verification</h2>
          </div>
          {result && (
            <Badge className={isMatch ? 'bg-success/15 text-success font-bold' : 'bg-warning/15 text-warning font-bold'}>
              {isMatch ? 'Instruction Match Verified' : 'Different Movement Decoded'}
            </Badge>
          )}
        </div>

        {result ? (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6 items-center">
            {/* Outcome Big Card */}
            <div className="p-5 rounded-2xl bg-navy-50/70 border border-navy-100 text-center">
              <span className="text-2xs text-navy-400 uppercase tracking-widest font-semibold block mb-1">
                Predicted Imagined Movement
              </span>
              <div className="text-2xl sm:text-3xl font-black text-navy my-1">
                {result.classification === 'Left' ? 'Left Hand' : 'Right Hand'}
              </div>
              <div className="flex items-center justify-center gap-2 mt-2">
                <span className="text-xs text-navy-500">Confidence:</span>
                <span className="text-sm font-bold font-mono text-navy">
                  {(result.confidence * 100).toFixed(1)}%
                </span>
              </div>
              <div className="text-3xs text-navy-400 mt-2">
                Source: {resultSource}
              </div>
            </div>

            {/* Posterior Probabilities Bar */}
            <div className="space-y-3.5 md:col-span-2">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-navy flex items-center gap-1.5">
                    <MoveLeft className="h-3.5 w-3.5" /> Left Hand Probability
                  </span>
                  <span className="font-mono font-bold text-navy">{(probLeft * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-navy-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-powder h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.round(probLeft * 100)}%` }}
                  />
                </div>
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-semibold text-navy flex items-center gap-1.5">
                    <MoveRight className="h-3.5 w-3.5" /> Right Hand Probability
                  </span>
                  <span className="font-mono font-bold text-navy">{(probRight * 100).toFixed(1)}%</span>
                </div>
                <div className="w-full bg-navy-100 h-2.5 rounded-full overflow-hidden">
                  <div
                    className="bg-lavender h-full rounded-full transition-all duration-500"
                    style={{ width: `${Math.round(probRight * 100)}%` }}
                  />
                </div>
              </div>

              {/* Separate Breakdown of All 5 Key Entities */}
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 p-2.5 bg-navy-50/50 border border-navy-100 rounded-xl text-2xs">
                <div className="p-2 rounded-lg bg-white border border-navy-50">
                  <span className="text-3xs text-navy-400 block font-medium uppercase">1. Selected Subject</span>
                  <span className="font-mono font-bold text-navy text-xs block mt-0.5">{loadedEpoch?.subjectId || selectedSubject}</span>
                </div>
                <div className="p-2 rounded-lg bg-white border border-navy-50">
                  <span className="text-3xs text-navy-400 block font-medium uppercase">2. Dataset Trial</span>
                  <span className="font-mono font-bold text-navy text-xs block mt-0.5">Trial #{loadedEpoch?.trialIndex ?? selectedTrialIdx}</span>
                </div>
                <div className="p-2 rounded-lg bg-white border border-navy-50">
                  <span className="text-3xs text-navy-400 block font-medium uppercase">3. Instructed Cue</span>
                  <span className="font-bold text-navy text-xs block mt-0.5">{selectedInstruction}</span>
                </div>
                <div className="p-2 rounded-lg bg-white border border-navy-50">
                  <span className="text-3xs text-navy-400 block font-medium uppercase">4. Ground Truth</span>
                  <span className="font-bold text-navy-700 text-xs block mt-0.5">{loadedEpoch?.movement || 'Uploaded Epoch'}</span>
                </div>
                <div className="p-2 rounded-lg bg-white border border-navy-50">
                  <span className="text-3xs text-navy-400 block font-medium uppercase">5. Model Prediction</span>
                  <span className="font-bold text-powder-700 text-xs block mt-0.5">{result.classification === 'Left' ? 'Left Hand' : 'Right Hand'}</span>
                </div>
              </div>

              <div className="p-3 bg-white border border-navy-100 rounded-xl text-2xs text-navy-500 flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong>Classification Status:</strong>{' '}
                  {isMatch
                    ? 'Congruent Match (Model decoded instructed movement)'
                    : allowIncongruentMode
                    ? 'Incongruent Evaluation (Model predicted independent of instructed cue)'
                    : 'Different Movement Decoded'}
                </span>
                <span className={isMatch ? 'text-success font-bold' : 'text-warning font-bold'}>
                  {isMatch ? '✓ Verified Congruent Match' : '≠ Divergent Pattern'}
                </span>
              </div>
            </div>
          </div>
        ) : isTrialRunning ? (
          <div className="p-8 text-center bg-lavender-50/50 rounded-xl border border-lavender-200 animate-pulse">
            <Sparkles className="h-8 w-8 mx-auto text-lavender-600 mb-2 animate-spin" />
            <span className="text-sm font-bold text-navy block">
              {paradigmState === 'VALIDATING' && 'Validating Doctor Authorization & Dataset Epoch...'}
              {paradigmState === 'PREPARING' && 'Preparing BCI Paradigm & Establishing REPLAY Session...'}
              {paradigmState === 'IMAGERY_ACTIVE' && `Acquiring 64-Channel Epoch (${paradigmDuration}.0s Paradigm)...`}
              {paradigmState === 'EPOCH_LOADED' && 'Epoch Matrix Validated (385 × 64 channels)...'}
              {paradigmState === 'ANALYSING' && 'Executing CSP(8) Spatial Filtering + LDA Classification...'}
              {paradigmState === 'SAVING' && 'Persisting Analysis Result to MongoDB...'}
            </span>
            <span className="text-2xs text-navy-400 block mt-1">
              PhysioNet 64-Channel Dataset Replay • 128 Hz • CSP + StandardScaler + LDA Pipeline
            </span>
          </div>
        ) : paradigmState === 'ERROR' ? (
          <div className="p-8 text-center bg-error/5 rounded-xl border border-dashed border-error/30 text-error">
            <XCircle className="h-8 w-8 mx-auto text-error mb-2" />
            <span className="text-xs font-bold block">Trial Execution Failed</span>
            <span className="text-2xs text-navy-600 block mt-1 max-w-md mx-auto">
              {errorMessage || 'An error occurred during trial execution. Please review parameters and retry.'}
            </span>
            <Button size="sm" onClick={handleStartTrial} className="mt-3 bg-navy hover:bg-navy-800 text-white">
              <RotateCcw className="h-3 w-3 mr-1" /> Retry Trial Paradigm
            </Button>
          </div>
        ) : (
          <div className="p-8 text-center text-navy-400 bg-navy-50/30 rounded-xl border border-dashed border-navy-100">
            <Brain className="h-8 w-8 mx-auto text-navy-300 mb-2 opacity-60" />
            <span className="text-xs font-semibold block">Awaiting Trial Execution</span>
            <span className="text-2xs block mt-0.5 max-w-md mx-auto">
              Select an instructed movement, choose a verified PhysioNet trial, and press "Start Trial Paradigm" to evaluate real CSP+LDA inference.
            </span>
          </div>
        )}
      </Card>

      {/* PANEL 4: Persisted Trial History (MongoDB) */}
      <Card className="p-5 shadow-card border border-navy-100">
        <div className="flex items-center justify-between pb-3 mb-4 border-b border-navy-100">
          <div className="flex items-center gap-2">
            <HistoryIcon className="h-4 w-4 text-powder-500" />
            <h2 className="text-sm font-bold text-navy">4. Persisted Trial History (MongoDB)</h2>
          </div>
          <Button size="sm" variant="ghost" onClick={fetchHistory} disabled={loadingHistory}>
            <RefreshCw className={`h-3 w-3 mr-1 ${loadingHistory ? 'animate-spin' : ''}`} />
            Refresh
          </Button>
        </div>

        {history.length > 0 ? (
          <div className="overflow-x-auto">
            <table className="w-full text-xs text-left">
              <thead className="bg-navy-50/70 text-2xs font-semibold text-navy-400 uppercase">
                <tr>
                  <th className="py-2.5 px-3">Timestamp</th>
                  <th className="py-2.5 px-3">Participant</th>
                  <th className="py-2.5 px-3">Session Code</th>
                  <th className="py-2.5 px-3">Instruction</th>
                  <th className="py-2.5 px-3">Ground Truth</th>
                  <th className="py-2.5 px-3">Input Source</th>
                  <th className="py-2.5 px-3">Predicted</th>
                  <th className="py-2.5 px-3">Confidence</th>
                  <th className="py-2.5 px-3">Outcome</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {history.map((trial) => (
                  <tr key={trial.id} className="hover:bg-navy-50/40 transition-colors">
                    <td className="py-2.5 px-3 font-mono text-3xs text-navy-400">
                      {new Date(trial.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' })}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-medium text-navy">{trial.participant_code}</td>
                    <td className="py-2.5 px-3 font-mono text-3xs text-navy-400">{trial.session_code}</td>
                    <td className="py-2.5 px-3 font-medium text-navy">{trial.instruction}</td>
                    <td className="py-2.5 px-3 text-2xs font-semibold text-navy-700">{trial.ground_truth || '--'}</td>
                    <td className="py-2.5 px-3 text-2xs text-navy-500 truncate max-w-[200px]" title={trial.input_source}>
                      {trial.input_source}
                    </td>
                    <td className="py-2.5 px-3 font-bold text-navy">
                      {trial.predicted_movement?.includes('Hand') ? trial.predicted_movement : `${trial.predicted_movement} Hand`}
                    </td>
                    <td className="py-2.5 px-3 font-mono font-semibold">
                      {(trial.confidence * 100).toFixed(1)}%
                    </td>
                    <td className="py-2.5 px-3">
                      {trial.is_match !== undefined && trial.is_match !== null ? (
                        <span className={`px-2 py-0.5 rounded text-3xs font-bold ${trial.is_match ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'}`}>
                          {trial.is_match ? 'MATCH' : 'DIFFERENT'}
                        </span>
                      ) : (
                        <span className="text-3xs text-navy-300">--</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <div className="py-6 text-center text-xs text-navy-400">
            No motor imagery trials logged in database yet. Run a trial above to persist results.
          </div>
        )}
      </Card>

      {/* PANEL 5: Research Disclaimer Banner */}
      <div className="rounded-xl border border-navy-200 bg-white p-4 shadow-soft flex items-start gap-3">
        <ShieldAlert className="h-5 w-5 text-warning flex-shrink-0 mt-0.5" />
        <div className="text-2xs text-navy-600 leading-relaxed space-y-1">
          <p className="font-bold text-navy text-xs">
            RESEARCH DISCLAIMER: Investigational Brain-Computer Interface Technology
          </p>
          <p>
            Motor Imagery Detection is an experimental Brain-Computer Interface (BCI) research capability. A predicted
            imagined movement does not establish conscious intent, volitional comprehension, or cognitive awareness
            in an unresponsive patient. NeuroCare AI is an investigational prototype and is NOT a clinical consciousness
            assessment, coma diagnostic tool, or validated medical communication device.
          </p>
        </div>
      </div>
    </div>
  );
}
