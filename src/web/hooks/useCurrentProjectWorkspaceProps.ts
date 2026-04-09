import { useCallback } from 'react';
import { toTaskView } from '../lib/task-view';
import type { CurrentProjectWorkspaceProps, ProjectWorkspaceProps } from '../components/project-workspace-types';
import { useProjectWorkspaceHeaderProps } from './useProjectWorkspaceHeaderProps';
import { useProjectWorkspaceModalProps } from './useProjectWorkspaceModalProps';
import { useProjectWorkspaceRoutesProps } from './useProjectWorkspaceRoutesProps';

export function useCurrentProjectWorkspaceProps(props: CurrentProjectWorkspaceProps): ProjectWorkspaceProps {
  const {
    tasks,
    flowMap,
    memberMap,
    onStartEditingTask,
  } = props;

  const handleEditTask = useCallback((taskId: string) => {
    const rawTask = tasks.find(task => task.id === taskId);
    if (!rawTask) return;

    const flowName = rawTask.flow_id ? flowMap[rawTask.flow_id] : null;

    onStartEditingTask(toTaskView(rawTask, memberMap, flowName), rawTask);
  }, [flowMap, memberMap, onStartEditingTask, tasks]);

  const headerProps = useProjectWorkspaceHeaderProps(props);
  const routesProps = useProjectWorkspaceRoutesProps({ ...props, handleEditTask });
  const modalProps = useProjectWorkspaceModalProps(props);

  return {
    headerProps,
    routesProps,
    modalProps,
  };
}
