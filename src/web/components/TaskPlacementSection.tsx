import type { WorkstreamOption } from './task-form-shared';
import s from './TaskForm.module.css';

interface TaskPlacementSectionProps {
  workstreams: WorkstreamOption[];
  workstreamId: string;
  priority: string;
  setWorkstreamId: (value: string) => void;
  setPriority: (value: string) => void;
}

export function TaskPlacementSection({
  workstreams,
  workstreamId,
  priority,
  setWorkstreamId,
  setPriority,
}: TaskPlacementSectionProps) {
  return (
    <div className={s.row}>
      {workstreams.length > 0 && (
        <div className={s.field}>
          <label className={s.label}>Workstream</label>
          <select className={s.select} value={workstreamId} onChange={event => setWorkstreamId(event.target.value)}>
            <option value="">Backlog</option>
            {workstreams.map(workstream => (
              <option key={workstream.id} value={workstream.id}>
                {workstream.name}
              </option>
            ))}
          </select>
        </div>
      )}
      {!workstreamId && (
        <div className={s.field}>
          <label className={s.label}>Priority</label>
          <div className={s.segmented}>
            {(['critical', 'upcoming', 'backlog'] as const).map(option => (
              <button
                key={option}
                type="button"
                className={`${s.segmentedBtn} ${priority === option ? s.segmentedActive : ''}`}
                onClick={() => setPriority(option)}
              >
                {option.charAt(0).toUpperCase() + option.slice(1)}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
