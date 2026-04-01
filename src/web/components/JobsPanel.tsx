import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeToJob } from '../lib/api';
import type { ConnectionState } from '../lib/api';
import s from './JobsPanel.module.css';

export type JobView = {
  id: string;
  taskId: string;
  title: string;
  type: string;
  description?: string;
  status: 'running' | 'paused' | 'review' | 'done' | 'failed';
  phases?: { name: string; status: string }[];
  currentPhase?: string;
  attempt?: number;
  maxAttempts?: number;
  elapsed?: string;
  question?: string;
  review?: {
    filesChanged: number;
    testsPassed: boolean;
    linesAdded: number;
    linesRemoved: number;
    summary: string;
    changedFiles?: string[];
  };
  completedAgo?: string;
};

const labels: Record<string, string> = {
  running: 'Running',
  paused: 'Waiting',
  review: 'Review',
  done: 'Done',
  failed: 'Failed',
};

export type GitAction = 'commit' | 'commit_push' | 'branch_pr';

/** Human-readable descriptions for phase names */
const PHASE_DESCRIPTIONS: Record<string, string> = {
  plan: 'Planning implementation approach...',
  analyze: 'Analyzing the codebase...',
  implement: 'Implementing changes...',
  fix: 'Fixing the issue...',
  verify: 'Running tests to verify...',
  review: 'Reviewing code quality...',
  refactor: 'Refactoring code...',
  'write-tests': 'Writing tests...',
};

export function JobsPanel({ jobs, onReply, onApprove, onReject, onTerminate }: {
  jobs: JobView[];
  onReply?: (jobId: string, answer: string) => void;
  onApprove?: (jobId: string, action?: GitAction) => void;
  onReject?: (jobId: string) => void;
  onTerminate?: (jobId: string) => void;
}) {
  const [expanded, setExpanded] = useState<string | null>(jobs.find(j => j.status !== 'done')?.id || null);

  // Auto-expand the first non-done job when jobs change
  useEffect(() => {
    if (expanded && jobs.some(j => j.id === expanded)) return;
    const first = jobs.find(j => j.status !== 'done' && j.status !== 'failed');
    if (first) setExpanded(first.id);
  }, [jobs, expanded]);

  if (jobs.length === 0) {
    return (
      <section>
        <div className={s.header}>
          <span className={s.label}>Activity</span>
        </div>
        <p style={{ fontSize: 14, color: 'var(--text-4)', marginTop: 24 }}>
          No activity yet. Run a task to see it here.
        </p>
      </section>
    );
  }

  return (
    <section>
      <div className={s.header}>
        <span className={s.label}>Activity</span>
      </div>
      {jobs.map((job) => {
        const isOpen = expanded === job.id;
        const isDone = job.status === 'done';
        const isFailed = job.status === 'failed';
        return (
          <div
            key={job.id}
            className={`${s.item} ${isDone || isFailed ? s.done : ''} ${isOpen ? s.open : ''}`}
            onClick={() => setExpanded(isOpen ? null : job.id)}
          >
            <div className={s.row}>
              <span className={`${s.dot} ${s[`d_${job.status}`]}`} />
              <div className={s.rowText}>
                <span className={s.title}>{job.title}</span>
                <span className={s.sub}>
                  {job.status === 'running' && (
                    <>{job.currentPhase || 'Starting'} &middot; attempt {job.attempt || 1}/{job.maxAttempts || 3} &middot; <strong>{job.elapsed || '...'}</strong></>
                  )}
                  {job.status === 'paused' && <span className={s.amber}>Needs your input</span>}
                  {job.status === 'review' && job.review && <>{job.review.filesChanged} files changed &middot; +{job.review.linesAdded} -{job.review.linesRemoved}</>}
                  {job.status === 'review' && !job.review && <span>Ready for review</span>}
                  {job.status === 'done' && <>{job.completedAgo || 'Completed'}</>}
                  {job.status === 'failed' && <span style={{ color: 'var(--red)' }}>Failed</span>}
                </span>
              </div>
              <span className={`${s.badge} ${s[`b_${job.status}`]}`}>{labels[job.status] || job.status}</span>
              {job.status === 'running' && onTerminate && (
                <button
                  className={s.terminate}
                  onClick={(e) => { e.stopPropagation(); onTerminate(job.id); }}
                >
                  Terminate
                </button>
              )}
            </div>

            {isOpen && isFailed && (
              <div className={s.detail} onClick={e => e.stopPropagation()}>
                {job.question && <div className={s.question}>{job.question}</div>}
                <button
                  className={s.reject}
                  onClick={() => onReject?.(job.id)}
                  style={{ marginTop: 8 }}
                >
                  Return task to backlog
                </button>
              </div>
            )}

            {isOpen && !isDone && !isFailed && (
              <div className={s.detail} onClick={e => e.stopPropagation()}>
                {job.description && <p className={s.desc}>{job.description}</p>}

                {job.phases && job.phases.length > 0 && (
                  <div className={s.phases}>
                    {job.phases.map((p, i) => (
                      <span key={p.name} className={s.phaseWrap}>
                        {i > 0 && <span className={s.arrow}>&rarr;</span>}
                        <span className={`${s.phase} ${s[`ph_${p.status}`]}`}>{p.name}</span>
                      </span>
                    ))}
                  </div>
                )}

                {job.status === 'running' && <LiveLogs jobId={job.id} />}

                {job.status === 'paused' && job.question && (
                  <>
                    <div className={s.question}>{job.question}</div>
                    <ReplyInput onReply={(answer) => onReply?.(job.id, answer)} />
                  </>
                )}

                {job.status === 'review' && job.review && (
                  <>
                    {job.review.changedFiles && (
                      <div className={s.files}>
                        <span className={s.filesLabel}>Changed files</span>
                        {job.review.changedFiles.map(f => <code key={f} className={s.file}>{f}</code>)}
                      </div>
                    )}
                    <div className={s.checks}>
                      <span className={s.checkOk}>&#10003; Tests pass</span>
                      <span className={s.checkOk}>&#10003; Architecture rules pass</span>
                    </div>
                    <div className={s.reviewActions}>
                      <ApproveDropdown onSelect={(action) => onApprove?.(job.id, action)} />
                      <button className={s.reject} onClick={() => onReject?.(job.id)}>Reject &rarr; Backlog</button>
                    </div>
                  </>
                )}
              </div>
            )}
          </div>
        );
      })}
    </section>
  );
}

/** Shows live SSE log lines for a running job */
function LiveLogs({ jobId }: { jobId: string }) {
  const [lines, setLines] = useState<{ text: string; type: 'log' | 'phase' | 'status' }[]>([]);
  const [connState, setConnState] = useState<ConnectionState>('connecting');
  const [connVisible, setConnVisible] = useState(true);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hasConnectedRef = useRef(false);

  const addLine = useCallback((text: string, type: 'log' | 'phase' | 'status' = 'log') => {
    setLines(prev => [...prev.slice(-200), { text, type }]);
  }, []);

  useEffect(() => {
    setLines([]);
    setConnState('connecting');
    setConnVisible(true);
    hasConnectedRef.current = false;

    const unsub = subscribeToJob(jobId, {
      onLog: (text) => addLine(text, 'log'),
      onPhaseStart: (phase, attempt) => {
        const label = attempt > 1 ? `Phase: ${phase} (attempt ${attempt})` : `Phase: ${phase}`;
        addLine(label, 'phase');
        const desc = PHASE_DESCRIPTIONS[phase];
        if (desc) addLine(desc, 'phase');
      },
      onPhaseComplete: (phase) => {
        addLine(`Phase: ${phase} complete`, 'phase');
      },
      onPause: (question) => {
        addLine(`Paused: ${question}`, 'status');
      },
      onReview: () => {
        addLine('Ready for review', 'status');
      },
      onDone: () => {
        addLine('Done', 'status');
      },
      onFail: (error) => {
        addLine(`Failed: ${error}`, 'status');
      },
      onConnectionChange: (state) => {
        setConnState(state);
        setConnVisible(true);
        if (state === 'open') hasConnectedRef.current = true;
        // Hide "Connected" indicator after 2 seconds
        if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
        if (state === 'open') {
          hideTimerRef.current = setTimeout(() => setConnVisible(false), 2000);
        }
      },
    });

    return () => {
      unsub();
      if (hideTimerRef.current) clearTimeout(hideTimerRef.current);
    };
  }, [jobId, addLine]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  const connLabel = connState === 'connecting'
    ? (hasConnectedRef.current ? 'Reconnecting...' : 'Connecting...')
    : connState === 'open' ? 'Connected'
    : 'Connection lost';

  // Show status when connecting/reconnecting/error; hide "Connected" after delay
  const showConn = connState !== 'open' || connVisible;

  return (
    <>
      <div className={`${s.connBar} ${s[`conn${connState.charAt(0).toUpperCase()}${connState.slice(1)}`]} ${!showConn ? s.connHidden : ''}`}>
        <span className={s.connDot} />
        {connLabel}
      </div>
      <div ref={scrollRef} className={s.logBox}>
        {lines.length === 0 && connState === 'connecting' && (
          <span style={{ color: 'var(--text-4)' }}>Waiting for output...</span>
        )}
        {lines.length === 0 && connState === 'open' && (
          <span className={s.noOutput}>Claude is working... output will appear when the phase completes.</span>
        )}
        {lines.map((line, i) => (
          <div key={i} className={line.type === 'phase' ? s.logPhase : s.logLine}>
            {line.text}
          </div>
        ))}
      </div>
    </>
  );
}

function ApproveDropdown({ onSelect }: { onSelect: (action: GitAction) => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const options: { label: string; action: GitAction }[] = [
    { label: 'Commit', action: 'commit' },
    { label: 'Commit + Push', action: 'commit_push' },
    { label: 'New Branch + PR', action: 'branch_pr' },
  ];

  return (
    <div ref={ref} className={s.approveWrap}>
      <button className={s.approve} onClick={() => setOpen(prev => !prev)}>
        Approve &#9662;
      </button>
      {open && (
        <div className={s.approveMenu}>
          {options.map(o => (
            <button
              key={o.action}
              className={s.approveOption}
              onClick={() => { setOpen(false); onSelect(o.action); }}
            >{o.label}</button>
          ))}
        </div>
      )}
    </div>
  );
}

function ReplyInput({ onReply }: { onReply: (answer: string) => void }) {
  const [val, setVal] = useState('');
  const [sending, setSending] = useState(false);

  const handleReply = () => {
    if (!val.trim() || sending) return;
    setSending(true);
    onReply(val.trim());
    setVal('');
    setSending(false);
  };

  return (
    <div className={s.replyRow}>
      <input
        className={s.input}
        value={val}
        onChange={e => setVal(e.target.value)}
        onKeyDown={e => { if (e.key === 'Enter') handleReply(); }}
        placeholder="Your answer..."
        disabled={sending}
      />
      <button className={s.send} onClick={handleReply} disabled={sending}>
        {sending ? 'Sending...' : 'Reply'}
      </button>
    </div>
  );
}
