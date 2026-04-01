import s from './FocusView.module.css';

interface Props {
  task: { id: string; title: string; type: string; mode: string; effort: string; blocksCount: number };
  reason: string;
  next: string;
  then: string;
  onRun?: (taskId: string) => void;
  onSkip?: (taskId: string) => void;
}

export function FocusView({ task, reason, next, then, onRun, onSkip }: Props) {
  return (
    <section className={s.section}>
      <p className={s.overline}>Now</p>
      <h1 className={s.title}>{task.title}</h1>
      <p className={s.reason}>{reason}</p>

      <div className={s.actions}>
        {task.mode === 'ai' ? (
          <button className="btn btnPrimary" onClick={() => onRun?.(task.id)}>Run</button>
        ) : (
          <button className="btn btnPrimary" onClick={() => onRun?.(task.id)}>Start</button>
        )}
        <button className="btn btnSecondary" onClick={() => onSkip?.(task.id)}>Skip</button>
        <span className={s.meta}>
          {task.type} &middot; {task.effort} &middot; {task.mode}
        </span>
      </div>

      {(next || then) && (
        <div className={s.upcoming}>
          <span className={s.upLabel}>up next</span>
          {next && <span className={s.upItem}>{next}</span>}
          {then && <span className={s.upItem}>{then}</span>}
        </div>
      )}
    </section>
  );
}
