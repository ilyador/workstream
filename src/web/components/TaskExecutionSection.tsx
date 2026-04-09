import s from './TaskForm.module.css';

interface TaskExecutionSectionProps {
  assignee: string;
  multiagent: string;
  autoContinue: boolean;
  allowProjectData: boolean;
  chaining: string;
  projectDataEnabled: boolean;
  setMultiagent: (value: string) => void;
  setAutoContinue: (value: boolean) => void;
  setAllowProjectData: (value: boolean) => void;
  setChaining: (value: string) => void;
}

export function TaskExecutionSection({
  assignee,
  multiagent,
  autoContinue,
  allowProjectData,
  chaining,
  projectDataEnabled,
  setMultiagent,
  setAutoContinue,
  setAllowProjectData,
  setChaining,
}: TaskExecutionSectionProps) {
  return (
    <>
      <div className={s.checkboxes}>
        {!assignee && (
          <label className={s.checkboxRow}>
            <input
              type="checkbox"
              checked={multiagent === 'yes'}
              onChange={event => setMultiagent(event.target.checked ? 'yes' : 'auto')}
            />
            <span>Use subagents</span>
          </label>
        )}
        {!assignee && (
          <label className={s.checkboxRow}>
            <input
              type="checkbox"
              checked={autoContinue}
              onChange={event => setAutoContinue(event.target.checked)}
            />
            <span>Continue automatically</span>
          </label>
        )}
        {!assignee && (
          <label className={s.checkboxRow}>
            <input
              type="checkbox"
              checked={allowProjectData}
              disabled={!projectDataEnabled}
              onChange={event => setAllowProjectData(event.target.checked)}
            />
            <span>Allow Project Data</span>
          </label>
        )}
        {!assignee && !projectDataEnabled && (
          <div className={s.hint}>Set up Project Data in project settings before enabling it on tasks.</div>
        )}
      </div>

      <div className={s.field}>
        <label className={s.label}>File chaining</label>
        <select className={s.select} value={chaining} onChange={event => setChaining(event.target.value)}>
          <option value="none">None</option>
          <option value="accept">Accept files from previous task</option>
          <option value="produce">Produce files for next task</option>
          <option value="both">Accept and produce files</option>
        </select>
      </div>
    </>
  );
}
