import { useMemo } from 'react';
import { buildProjectWorkspaceHeaderProps } from '../lib/current-project-workspace-props';
import type { CurrentProjectWorkspaceProps } from '../components/project-workspace-types';

export function useProjectWorkspaceHeaderProps({
  project,
  projects,
  profile,
  webNotifications,
  notifications,
  milestone,
  todoItems,
  reviewItems,
  onSwitchProject,
  onOpenAddProject,
  onSignOut,
  onOpenMembersModal,
  onUpdateLocalPath,
}: CurrentProjectWorkspaceProps) {
  return useMemo(() => buildProjectWorkspaceHeaderProps({
    project,
    projects,
    profile,
    webNotifications,
    notifications,
    milestone,
    todoItems,
    reviewItems,
    onSwitchProject,
    onOpenAddProject,
    onSignOut,
    onOpenMembersModal,
    onUpdateLocalPath,
  }), [
    milestone,
    notifications,
    onOpenAddProject,
    onOpenMembersModal,
    onSignOut,
    onSwitchProject,
    onUpdateLocalPath,
    profile,
    project,
    projects,
    reviewItems,
    todoItems,
    webNotifications,
  ]);
}
