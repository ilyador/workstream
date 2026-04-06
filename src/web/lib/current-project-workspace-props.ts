import type { ProjectWorkspaceHeaderProps } from '../components/ProjectWorkspaceHeader';
import type { ProjectWorkspaceModalsProps } from '../components/ProjectWorkspaceModals';
import type { ProjectWorkspaceRoutesProps } from '../components/ProjectWorkspaceRoutes';

export function buildProjectWorkspaceHeaderProps({
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
}: {
  project: ProjectWorkspaceHeaderProps['project'];
  projects: ProjectWorkspaceHeaderProps['projects'];
  profile: { id: string; initials: string };
  webNotifications: ProjectWorkspaceHeaderProps['webNotifications'];
  notifications: ProjectWorkspaceHeaderProps['notifications'];
  milestone: ProjectWorkspaceHeaderProps['milestone'];
  todoItems: ProjectWorkspaceHeaderProps['todoItems'];
  reviewItems: ProjectWorkspaceHeaderProps['reviewItems'];
  onSwitchProject: ProjectWorkspaceHeaderProps['onSwitchProject'];
  onOpenAddProject: ProjectWorkspaceHeaderProps['onNewProject'];
  onSignOut: ProjectWorkspaceHeaderProps['onSignOut'];
  onOpenMembersModal: ProjectWorkspaceHeaderProps['onManageMembers'];
  onUpdateLocalPath: ProjectWorkspaceHeaderProps['onUpdateLocalPath'];
}): ProjectWorkspaceHeaderProps {
  return {
    project,
    projects,
    user: { id: profile.id, initials: profile.initials },
    webNotifications,
    notifications,
    milestone,
    todoItems,
    reviewItems,
    onSwitchProject,
    onNewProject: onOpenAddProject,
    onSignOut,
    onManageMembers: onOpenMembersModal,
    onUpdateLocalPath,
  };
}

export function buildProjectWorkspaceRoutesProps(
  props: ProjectWorkspaceRoutesProps,
): ProjectWorkspaceRoutesProps {
  return props;
}

export function buildProjectWorkspaceModalProps(
  props: ProjectWorkspaceModalsProps,
): ProjectWorkspaceModalsProps {
  return props;
}
