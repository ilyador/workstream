import { BoardWorkstreamColumn } from './BoardWorkstreamColumn';
import type { BoardColumnDataProps, BoardColumnDragProps, BoardProps, BoardTaskActionProps } from './board-types';
import type { TaskView, WorkstreamView } from '../lib/task-view';

interface BoardWorkstreamColumnsProps extends BoardColumnDataProps, BoardColumnDragProps, BoardTaskActionProps {
  workstreams: WorkstreamView[];
  tasksByWorkstream: Record<string, TaskView[]>;
  focusWsId?: string | null;
  draggedWsId?: string | null;
  onColumnDragStart: (workstreamId: string) => void;
  onColumnDrop: (targetWorkstreamId: string) => void;
  onUpdateWorkstream: BoardProps['onUpdateWorkstream'];
  onDeleteWorkstream: BoardProps['onDeleteWorkstream'];
  onAddTask: BoardProps['onAddTask'];
  onRunWorkstream: BoardProps['onRunWorkstream'];
  onCreatePr: BoardProps['onCreatePr'];
}

export function BoardWorkstreamColumns({
  workstreams,
  tasksByWorkstream,
  ...columnProps
}: BoardWorkstreamColumnsProps) {
  return (
    <>
      {workstreams.map(workstream => (
        <BoardWorkstreamColumn
          key={workstream.id}
          workstream={workstream}
          tasks={tasksByWorkstream[workstream.id] || []}
          {...columnProps}
        />
      ))}
    </>
  );
}
