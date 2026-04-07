import { useCallback, type ReactNode } from 'react';
import { TaskCard, type TaskCardProps } from '../components/TaskCard';
import type { WorkstreamView } from '../lib/task-view';

interface UseWorkstreamColumnActionsArgs {
  workstream: WorkstreamView | null;
  onDeleteWorkstream?: (id: string) => void;
  confirm: (title: string, body: string, options?: { label?: string; danger?: boolean }) => Promise<boolean>;
  setEditName: (name: string) => void;
  setEditing: (editing: boolean) => void;
  renderTaskCard?: (props: TaskCardProps) => ReactNode;
}

export function useWorkstreamColumnActions({
  workstream,
  onDeleteWorkstream,
  confirm,
  setEditName,
  setEditing,
  renderTaskCard,
}: UseWorkstreamColumnActionsArgs) {
  const handleStartEdit = useCallback(() => {
    if (!workstream) return;
    setEditName(workstream.name);
    setEditing(true);
  }, [setEditName, setEditing, workstream]);

  const handleRequestDelete = useCallback(async () => {
    if (!workstream || !onDeleteWorkstream) return;
    const confirmed = await confirm(
      'Delete workstream',
      `Delete workstream "${workstream.name}"? Tasks will move to backlog.`,
      { label: 'Delete', danger: true },
    );
    if (confirmed) {
      onDeleteWorkstream(workstream.id);
    }
  }, [confirm, onDeleteWorkstream, workstream]);

  const renderCard = useCallback((cardProps: TaskCardProps) => {
    if (renderTaskCard) return renderTaskCard(cardProps);
    return <TaskCard {...cardProps} />;
  }, [renderTaskCard]);

  return {
    handleStartEdit,
    handleRequestDelete,
    renderCard,
  };
}
