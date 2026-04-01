import { useState, useEffect, useRef } from 'react';
import { subscribeToJob } from '../lib/api';
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

export function JobsPanel({ jobs, onReply, onApprove, onReject }: {
  jobs: JobView[];
  onReply?: (jobId: string, answer: string) => void;
  onApprove?: (jobId: string) => void;
  onReject?: (jobId: string) => void;
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
            </div>

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
                      <button className={s.approve} onClick={() => onApprove?.(job.id)}>Approve &#9662;</button>
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
  const [lines, setLines] = useState<string[]>([]);
  const [currentPhase, setCurrentPhase] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    setLines([]);
    setCurrentPhase(null);
    const unsub = subscribeToJob(jobId, {
      onLog: (text) => setLines(prev => [...prev.slice(-200), text]),
      onPhaseStart: (phase) => {
        setCurrentPhase(phase);
        setLines(prev => [...prev, `--- ${phase} ---`]);
      },
      onPhaseComplete: (phase) => {
        setLines(prev => [...prev, `--- ${phase} complete ---`]);
      },
    });
    return unsub;
  }, [jobId]);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [lines]);

  return (
    <div
      ref={scrollRef}
      style={{
        maxHeight: 200,
        overflow: 'auto',
        background: 'var(--bg-active)',
        borderRadius: 8,
        padding: '10px 14px',
        marginBottom: 12,
        fontFamily: "ui-monospace, 'SF Mono', 'Cascadia Mono', monospace",
        fontSize: 12,
        lineHeight: 1.7,
        color: 'var(--text-2)',
      }}
    >
      {lines.length === 0 && (
        <span style={{ color: 'var(--text-4)' }}>Connecting to log stream...</span>
      )}
      {lines.map((line, i) => (
        <div key={i}>{line}</div>
      ))}
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
