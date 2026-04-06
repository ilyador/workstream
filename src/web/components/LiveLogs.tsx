import { useState, useEffect, useRef, useCallback } from 'react';
import { subscribeToJob } from '../lib/api';
import type { ConnectionState } from '../lib/api';
import s from './LiveLogs.module.css';

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

/** Shows live SSE log lines for a running job */
export function LiveLogs({ jobId, footer }: { jobId: string; footer?: React.ReactNode }) {
  const [lines, setLines] = useState<{ text: string; type: 'log' | 'phase' | 'status' }[]>([]);
  const [connState, setConnState] = useState<ConnectionState>('connecting');
  const [connVisible, setConnVisible] = useState(true);
  const [hasConnected, setHasConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const hideTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const addLine = useCallback((text: string, type: 'log' | 'phase' | 'status' = 'log') => {
    setLines(prev => [...prev.slice(-200), { text, type }]);
  }, []);

  useEffect(() => {
    queueMicrotask(() => {
      setLines([]);
      setConnState('connecting');
      setConnVisible(true);
      setHasConnected(false);
    });

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
        if (state === 'open') setHasConnected(true);
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
    ? (hasConnected ? 'Reconnecting...' : 'Connecting...')
    : connState === 'open' ? 'Connected'
    : 'Connection lost';

  // Show status when connecting/reconnecting/error; hide "Connected" after delay
  const showConn = connState !== 'open' || connVisible;

  return (
    <>
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
      <div className={s.logFooter}>
        <div className={`${s.connBar} ${s[`conn${connState.charAt(0).toUpperCase()}${connState.slice(1)}`]} ${!showConn ? s.connHidden : ''}`}>
          <span className={s.connDot} />
          {connLabel}
        </div>
        {footer}
      </div>
    </>
  );
}
