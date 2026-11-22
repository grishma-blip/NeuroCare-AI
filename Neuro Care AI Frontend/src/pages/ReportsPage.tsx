import { useState, useMemo, useEffect } from 'react';
import {
  Download,
  FileText,
  Search,
  Database,
  HardDrive,
  Filter as FilterIcon,
  CheckCircle2,
  Loader2,
  XCircle,
  FileCode,
  FileSpreadsheet,
  ShieldCheck,
  Brain,
  Share2,
  Layers,
  Sparkles,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  DisclaimerBar,
  EmptyState,
  SectionHeader,
  StatCard,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui';
import { api } from '@/lib/api';
import { formatDateTime, formatSize, formatNumber } from '@/lib/format';
import type { ExportRecord, RecordingSession } from '@/types';

export default function ReportsPage() {
  const [reports, setReports] = useState<ExportRecord[]>([]);
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [downloading, setDownloading] = useState<string | null>(null);

  // ML Dataset Partition Modal state
  const [showMlModal, setShowMlModal] = useState(false);
  const [trainSplit, setTrainSplit] = useState(0.8);
  const [partitionResult, setPartitionResult] = useState<any | null>(null);
  const [partitioning, setPartitioning] = useState(false);

  const loadData = async () => {
    setLoading(true);
    try {
      const sess = await api.getSessions();
      setSessions(sess);
      const reps: ExportRecord[] = sess.map((s) => ({
        id: s.id,
        sessionId: s.id,
        participantCode: s.participantCode,
        date: s.date,
        format: 'JSON',
        sizeKB: s.duration ? Math.round(s.duration * 0.5) : 12,
        status: s.status === 'completed' ? 'ready' : 'processing',
        taskType: s.taskType,
      }));
      setReports(reps);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleDownloadPdf = async (sessionId: string, sessionCode?: string) => {
    setDownloading(`pdf_${sessionId}`);
    try {
      await api.downloadSessionPdf(sessionId, sessionCode);
    } catch (err: any) {
      alert(err.message || 'Error generating PDF report');
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadCsv = async (sessionId: string, sessionCode?: string) => {
    setDownloading(`csv_${sessionId}`);
    try {
      await api.downloadSessionCsv(sessionId, sessionCode);
    } catch (err: any) {
      alert(err.message || 'Error exporting CSV records');
    } finally {
      setDownloading(null);
    }
  };

  const handleDownloadJsonReport = async (sessionId: string, sessionCode?: string) => {
    setDownloading(`json_${sessionId}`);
    try {
      await api.downloadSessionJson(sessionId, sessionCode);
    } catch (err: any) {
      alert(err.message || 'Error exporting JSON report from backend');
    } finally {
      setDownloading(null);
    }
  };

  const handleGenerateMlDataset = async () => {
    setPartitioning(true);
    try {
      const res = await api.exportMlDataset(trainSplit);
      setPartitionResult(res);
    } catch (err: any) {
      alert(err.message || 'Failed to partition ML dataset');
    } finally {
      setPartitioning(false);
    }
  };

  const handleDownloadManifestJson = () => {
    if (!partitionResult) return;
    const blob = new Blob([JSON.stringify(partitionResult, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${partitionResult.dataset_name || 'NeuroCare_Dataset_Split'}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = useMemo(() => {
    return reports.filter((e) => {
      return (
        e.sessionId.toLowerCase().includes(search.toLowerCase()) ||
        e.participantCode.toLowerCase().includes(search.toLowerCase())
      );
    });
  }, [reports, search]);

  const totalSize = reports.reduce((sum, e) => sum + (e.sizeKB || 100), 0);

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-fade-in">

      {/* Header and Quick Stats */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-base font-semibold text-navy">Research Data Exports &amp; Clinical PDF Reports</h2>
          <p className="text-xs text-navy-400 mt-0.5">
            Download vector multi-page clinical reports, timestamped microvolt CSV arrays, and partitioned ML datasets.
          </p>
        </div>

        <Button onClick={() => setShowMlModal(true)}>
          <Brain className="h-3.5 w-3.5 mr-1 text-powder" />
          Prepare ML Dataset Partition
        </Button>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <StatCard
          label="Available Session Exports"
          value={reports.length}
          sub="Verified completed recording files"
          icon={<Download className="h-5 w-5" />}
        />
        <StatCard
          label="Ready for Export"
          value={reports.length}
          sub="Calibrated CSV &amp; JSON packages"
          icon={<CheckCircle2 className="h-5 w-5" />}
          accent
        />
        <StatCard
          label="Estimated Data Volume"
          value={formatSize(totalSize)}
          sub="Time-series voltage arrays"
          icon={<HardDrive className="h-5 w-5" />}
        />
      </div>

      {/* Privacy Notice */}
      <Card className="p-4 flex items-start gap-2.5 border-l-4 border-l-powder">
        <ShieldCheck className="h-4 w-4 text-powder-600 flex-shrink-0 mt-0.5" />
        <p className="text-xs text-navy-400 leading-relaxed">
          <strong>IRB / Ethics Compliance:</strong> All data exports strip personal names and adhere to anonymous subject codes (P-xxx).
          Data export is blocked automatically if participant consent status has been withdrawn.
        </p>
      </Card>

      {/* Filter and Search */}
      <Card className="p-4">
        <div className="relative max-w-md">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-navy-300" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search report by session ID or participant code..."
            className="w-full rounded-lg border border-navy-100 bg-white pl-10 pr-3 py-2 text-xs text-navy placeholder:text-navy-200 focus:outline-none focus:ring-2 focus:ring-powder/30 focus:border-powder transition-all"
          />
        </div>
      </Card>

      {/* Reports Table */}
      <Card className="overflow-hidden">
        {filtered.length === 0 ? (
          <EmptyState
            icon={<FileSpreadsheet className="h-6 w-6" />}
            title="No reports match your search"
            message="Completed recording sessions will appear here automatically for research data download."
          />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-navy-100 bg-lavender-50/50 text-left text-navy-400">
                  <th className="py-3 px-4 font-semibold">Session Code</th>
                  <th className="py-3 px-4 font-semibold">Participant</th>
                  <th className="py-3 px-4 font-semibold">Protocol</th>
                  <th className="py-3 px-4 font-semibold">Date &amp; Time</th>
                  <th className="py-3 px-4 font-semibold">Format</th>
                  <th className="py-3 px-4 font-semibold text-right">Download Reports &amp; Data</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-navy-50">
                {filtered.map((r) => {
                  const matchingSession = sessions.find((s) => s.id === r.sessionId);
                  const sessionCode = matchingSession?.session_code || r.sessionId;
                  return (
                    <tr key={r.sessionId} className="hover:bg-lavender-50/40 transition-colors">
                      <td className="py-3 px-4 font-mono font-medium text-navy">{sessionCode}</td>
                      <td className="py-3 px-4 font-semibold text-navy">{r.participantCode}</td>
                      <td className="py-3 px-4 text-navy-400">{r.taskType || 'Single Channel BioAmp'}</td>
                      <td className="py-3 px-4 text-navy-400">{formatDateTime(r.date)}</td>
                      <td className="py-3 px-4">
                        <Badge className="bg-lavender-100 text-navy-600 font-mono text-[10px]">
                          PDF · CSV · JSON
                        </Badge>
                      </td>
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          {/* 1-Click PDF Report Button */}
                          <Button
                            size="sm"
                            variant="secondary"
                            className="bg-error/5 hover:bg-error/10 text-error border-error/20"
                            onClick={() => handleDownloadPdf(r.sessionId, sessionCode)}
                            disabled={downloading === `pdf_${r.sessionId}`}
                          >
                            <FileText className="h-3 w-3 mr-1" />
                            PDF Report
                          </Button>

                          {/* 1-Click Raw CSV Button */}
                          <Button
                            size="sm"
                            variant="secondary"
                            className="bg-success/5 hover:bg-success/10 text-success border-success/20"
                            onClick={() => handleDownloadCsv(r.sessionId, sessionCode)}
                            disabled={downloading === `csv_${r.sessionId}`}
                          >
                            <FileSpreadsheet className="h-3 w-3 mr-1" />
                            Raw CSV
                          </Button>

                          {/* 1-Click Metadata JSON Button */}
                          <Button
                            size="sm"
                            variant="secondary"
                            onClick={() => handleDownloadJsonReport(r.sessionId, sessionCode)}
                            disabled={downloading === `json_${r.sessionId}`}
                          >
                            <FileCode className="h-3 w-3 mr-1" />
                            JSON
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {/* Prepare ML Dataset Partition Dialog */}
      <Dialog open={showMlModal} onOpenChange={setShowMlModal}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <div className="flex items-center gap-2">
              <Brain className="h-5 w-5 text-powder-600" />
              <DialogTitle>Prepare ML Train / Test Dataset</DialogTitle>
            </div>
            <DialogDescription>
              Partition completed recording sessions into reproducible cohorts. Sessions are grouped strictly by participant to guarantee zero cross-subject data leakage.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="font-semibold text-navy">Train Cohort Ratio: {Math.round(trainSplit * 100)}%</label>
                <span className="text-navy-400 font-mono">Test Cohort: {Math.round((1 - trainSplit) * 100)}%</span>
              </div>
              <input
                type="range"
                min="0.5"
                max="0.9"
                step="0.05"
                value={trainSplit}
                onChange={(e) => setTrainSplit(parseFloat(e.target.value))}
                className="w-full accent-navy cursor-pointer"
              />
              <div className="flex justify-between text-2xs text-navy-300 mt-1">
                <span>50% Train / 50% Test</span>
                <span>80% Train / 20% Test (Recommended)</span>
                <span>90% Train / 10% Test</span>
              </div>
            </div>

            <Button
              className="w-full justify-center"
              onClick={handleGenerateMlDataset}
              disabled={partitioning}
            >
              {partitioning ? 'Partitioning Sessions...' : 'Generate Participant-Level Split'}
            </Button>

            {partitionResult && (
              <div className="p-3 rounded-xl bg-navy-50/50 border border-navy-100 space-y-3 animate-fade-in">
                <div className="flex items-center justify-between border-b border-navy-100 pb-2">
                  <span className="font-bold text-navy flex items-center gap-1.5">
                    <CheckCircle2 className="h-4 w-4 text-success" /> Partition Manifest Ready
                  </span>
                  <Badge className="bg-success/10 text-success text-2xs font-semibold">
                    Zero Leakage Guaranteed
                  </Badge>
                </div>

                <div className="grid grid-cols-2 gap-2 text-2xs">
                  <div className="p-2 rounded bg-white border border-navy-100">
                    <span className="text-navy-400 block">Train Cohort</span>
                    <span className="font-bold text-navy text-xs block mt-0.5">
                      {partitionResult.summary?.train_participants_count} subjects
                    </span>
                    <span className="text-navy-400">{partitionResult.summary?.train_sessions_count} sessions</span>
                  </div>

                  <div className="p-2 rounded bg-white border border-navy-100">
                    <span className="text-navy-400 block">Test / Validation Cohort</span>
                    <span className="font-bold text-navy text-xs block mt-0.5">
                      {partitionResult.summary?.test_participants_count} subjects
                    </span>
                    <span className="text-navy-400">{partitionResult.summary?.test_sessions_count} sessions</span>
                  </div>
                </div>

                <Button
                  size="sm"
                  variant="secondary"
                  className="w-full justify-center"
                  onClick={handleDownloadManifestJson}
                >
                  <Download className="h-3.5 w-3.5 mr-1 text-powder-700" />
                  Download Dataset Split Manifest (.json)
                </Button>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button variant="secondary" onClick={() => setShowMlModal(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
