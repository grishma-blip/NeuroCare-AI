import { useState, useEffect } from 'react';
import { CheckCircle2, Circle, Clock, Info, Sliders, Play, RotateCcw } from 'lucide-react';
import { Card, Badge, DisclaimerBar, SectionHeader, Button } from '@/components/ui';
import { api } from '@/lib/api';
import { taskEventColors } from '@/lib/format';
import type { TaskEvent, RecordingSession } from '@/types';

function formatTimelineTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export default function TaskTimelinePage() {
  const [sessions, setSessions] = useState<RecordingSession[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState('EEG-2024-0312');
  const [sessionData, setSessionData] = useState<RecordingSession | null>(null);
  const [events, setEvents] = useState<TaskEvent[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<TaskEvent | null>(null);
  const [hoveredEvent, setHoveredEvent] = useState<string | null>(null);

  useEffect(() => {
    async function loadSessions() {
      try {
        const list = await api.getSessions();
        setSessions(list);
      } catch (e) {
        console.error(e);
      }
    }
    loadSessions();
  }, []);

  useEffect(() => {
    async function loadSessionEvents() {
      try {
        const sess = await api.getSession(selectedSessionId);
        setSessionData(sess);
        if (sess.events && sess.events.length > 0) {
          setEvents(sess.events);
          setSelectedEvent(sess.events[0]);
        }
      } catch {
        // Fallback default protocol events
        const fallbackEvents: TaskEvent[] = [
          { id: 'ev_1', label: 'Setup & Signal Check', startTime: 0, duration: 30, type: 'setup', description: 'Electrode impedance verification' },
          { id: 'ev_2', label: 'Baseline Rest (Eyes Open/Closed)', startTime: 30, duration: 60, type: 'baseline', description: 'Resting state EEG acquisition' },
          { id: 'ev_3', label: 'Instruction Presentation', startTime: 90, duration: 15, type: 'instruction', description: 'Task cue delivery' },
          { id: 'ev_4', label: 'Mental Imagery Task — Trial 1', startTime: 105, duration: 60, type: 'task', description: 'Kinesthetic tennis imagery block' },
          { id: 'ev_5', label: 'Rest & Recovery', startTime: 165, duration: 45, type: 'rest', description: 'Resting interval to return to baseline' },
          { id: 'ev_6', label: 'Mental Imagery Task — Trial 2', startTime: 210, duration: 60, type: 'task', description: 'Repeat trial to evaluate consistency' },
          { id: 'ev_7', label: 'Session Completion', startTime: 270, duration: 30, type: 'completion', description: 'Session termination and data verification' },
        ];
        setEvents(fallbackEvents);
        setSelectedEvent(fallbackEvents[0]);
      }
    }
    loadSessionEvents();
  }, [selectedSessionId]);

  const totalDuration = events.reduce((sum, e) => sum + e.duration, 0) || 300;

  return (
    <div className="space-y-6 max-w-[1400px] mx-auto animate-fade-in">

      {/* Session info bar */}
      <Card className="p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex flex-wrap items-center gap-4">
          <div>
            <span className="text-2xs text-navy-300 uppercase tracking-wider block">Session</span>
            <select
              value={selectedSessionId}
              onChange={(e) => setSelectedSessionId(e.target.value)}
              className="text-xs font-mono font-semibold text-navy bg-navy-50/50 border border-navy-100 rounded px-2 py-1 focus:outline-none"
            >
              {sessions.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.id} ({s.participantCode})
                </option>
              ))}
              {sessions.length === 0 && <option value="EEG-2024-0312">EEG-2024-0312</option>}
            </select>
          </div>

          <div className="h-8 w-px bg-navy-100 hidden sm:block" />

          <div>
            <span className="text-2xs text-navy-300 uppercase tracking-wider block">Participant</span>
            <p className="text-xs font-bold text-navy">{sessionData?.participantCode || 'P-014'}</p>
          </div>

          <div className="h-8 w-px bg-navy-100 hidden sm:block" />

          <div>
            <span className="text-2xs text-navy-300 uppercase tracking-wider block">Task Protocol</span>
            <p className="text-xs font-medium text-navy">{sessionData?.taskType || 'Motor Imagery Paradigm (2 Trials)'}</p>
          </div>

          <div className="h-8 w-px bg-navy-100 hidden sm:block" />

          <div>
            <span className="text-2xs text-navy-300 uppercase tracking-wider block">Total Protocol Duration</span>
            <p className="text-xs font-mono font-medium text-navy tabular-nums">{formatTimelineTime(totalDuration)}</p>
          </div>
        </div>

        <Badge className="bg-lavender-100 text-navy-600 font-mono text-[10px]">
          Synchronized to EEG Timestamps
        </Badge>
      </Card>

      {/* Horizontal timeline bar */}
      <Card className="p-6">
        <SectionHeader
          title="Task Event Timeline"
          subtitle="Timestamp-aligned experimental protocol blocks synchronised with the recorded EEG time-series"
        />

        {/* Timeline bar */}
        <div className="relative mt-6 mb-4">
          {/* Time axis marks */}
          <div className="flex justify-between text-2xs font-mono text-navy-300 mb-2 px-1">
            {Array.from({ length: 7 }, (_, i) => (
              <span key={i}>{formatTimelineTime(Math.round((totalDuration / 6) * i))}</span>
            ))}
          </div>

          {/* Continuous blocks bar */}
          <div className="h-10 w-full rounded-xl overflow-hidden flex border border-navy-100 p-0.5 bg-navy-50/50 shadow-inner">
            {events.map((ev) => {
              const widthPct = (ev.duration / (totalDuration || 1)) * 100;
              const isSelected = selectedEvent?.id === ev.id;
              const isHovered = hoveredEvent === ev.id;
              const colorInfo = taskEventColors[ev.type] || taskEventColors.task;

              return (
                <div
                  key={ev.id}
                  onClick={() => setSelectedEvent(ev)}
                  onMouseEnter={() => setHoveredEvent(ev.id)}
                  onMouseLeave={() => setHoveredEvent(null)}
                  style={{ width: `${widthPct}%` }}
                  title={`${ev.label} (${ev.duration}s)`}
                  className={`h-full cursor-pointer transition-all relative flex items-center justify-center text-[11px] font-medium truncate px-1 rounded-lg ${
                    colorInfo.bg
                  } ${colorInfo.text} ${
                    isSelected ? 'ring-2 ring-navy z-10 font-bold shadow-soft' : ''
                  } ${isHovered ? 'brightness-95' : ''}`}
                >
                  <span className="truncate">{ev.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      </Card>

      {/* Selected Event Details & Epoch Inspection */}
      {selectedEvent && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <Card className="p-5 md:col-span-2">
            <div className="flex items-start justify-between border-b border-navy-100 pb-3 mb-4">
              <div>
                <span className="text-2xs text-navy-300 uppercase tracking-wider font-semibold">Active Epoch Block</span>
                <h3 className="text-base font-semibold text-navy mt-0.5">{selectedEvent.label}</h3>
              </div>
              <Badge className={taskEventColors[selectedEvent.type]?.bg + ' ' + taskEventColors[selectedEvent.type]?.text}>
                {selectedEvent.type.toUpperCase()}
              </Badge>
            </div>

            <div className="grid grid-cols-3 gap-3 mb-4 text-xs">
              <div className="p-3 rounded-xl bg-navy-50/50">
                <span className="text-2xs text-navy-300 block">Start Timestamp</span>
                <span className="font-mono font-semibold text-navy">
                  +{formatTimelineTime(selectedEvent.startTime)} ({selectedEvent.startTime}s)
                </span>
              </div>
              <div className="p-3 rounded-xl bg-navy-50/50">
                <span className="text-2xs text-navy-300 block">End Timestamp</span>
                <span className="font-mono font-semibold text-navy">
                  +{formatTimelineTime(selectedEvent.startTime + selectedEvent.duration)}
                </span>
              </div>
              <div className="p-3 rounded-xl bg-navy-50/50">
                <span className="text-2xs text-navy-300 block">Epoch Duration</span>
                <span className="font-mono font-semibold text-navy">{selectedEvent.duration} seconds</span>
              </div>
            </div>

            <p className="text-xs text-navy-400 leading-relaxed bg-lavender-50/40 p-3 rounded-lg border border-navy-100/60">
              {selectedEvent.description || 'Standard protocol event block.'}
            </p>
          </Card>

          {/* Protocol Structure Legend */}
          <Card className="p-5">
            <h4 className="text-xs font-semibold text-navy mb-3">Paradigm Category Legend</h4>
            <div className="space-y-2 text-xs">
              {Object.entries(taskEventColors).map(([cat, col]) => (
                <div key={cat} className="flex items-center justify-between p-2 rounded-lg bg-navy-50/30">
                  <span className="text-navy-400 capitalize">{cat}</span>
                  <span className={`px-2 py-0.5 rounded text-[10px] font-semibold ${col.bg} ${col.text}`}>
                    {cat}
                  </span>
                </div>
              ))}
            </div>
          </Card>
        </div>
      )}
    </div>
  );
}
