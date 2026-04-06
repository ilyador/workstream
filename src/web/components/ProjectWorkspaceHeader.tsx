import { Header } from './Header';
import appStyles from '../App.module.css';
import type { NotificationRecord } from '../lib/api';

interface ProjectWorkspaceHeaderProps {
  project: {
    id: string;
    name: string;
    local_path: string | null;
  };
  projects: Array<{ id: string; name: string }>;
  user: {
    initials: string;
  };
  webNotifications: {
    showPrompt: boolean;
    requestPermission: () => void | Promise<void>;
    dismiss: () => void;
  };
  notifications: {
    unreadCount: number;
    notifications: NotificationRecord[];
    markRead: (id: string) => void | Promise<void>;
    markAllRead: () => void | Promise<void>;
  };
  milestone: {
    name: string;
    tasksDone: number;
    tasksTotal: number;
  };
  todoItems: Array<{ id: string; label: string; sublabel?: string; tag?: string; taskId?: string }>;
  reviewItems: Array<{ id: string; label: string; sublabel?: string; tag?: string; taskId?: string; workstreamId?: string }>;
  onSwitchProject: (projectId: string) => void | Promise<void>;
  onNewProject: () => void;
  onSignOut: () => Promise<void>;
  onManageMembers: () => void;
  onUpdateLocalPath?: (path: string) => void | Promise<void>;
}

export function ProjectWorkspaceHeader({
  project,
  projects,
  user,
  webNotifications,
  notifications,
  milestone,
  todoItems,
  reviewItems,
  onSwitchProject,
  onNewProject,
  onSignOut,
  onManageMembers,
  onUpdateLocalPath,
}: ProjectWorkspaceHeaderProps) {
  return (
    <>
      {webNotifications.showPrompt && (
        <div className={appStyles.notificationPrompt}>
          <svg width="16" height="16" viewBox="0 0 16 16" fill="none" className={appStyles.notificationIcon}>
            <path d="M8 1.5C5.5 1.5 4 3.5 4 5.5V8L2.5 10.5V11.5H13.5V10.5L12 8V5.5C12 3.5 10.5 1.5 8 1.5Z" stroke="currentColor" strokeWidth="1.3" strokeLinejoin="round"/>
            <path d="M6.5 12.5C6.5 13.3 7.2 14 8 14C8.8 14 9.5 13.3 9.5 12.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round"/>
          </svg>
          <span>Enable notifications to stay updated on task progress</span>
          <button
            className={`btn btnPrimary btnSm ${appStyles.notificationAction}`}
            onClick={webNotifications.requestPermission}
          >
            Enable
          </button>
          <button
            className={`btn btnGhost btnSm ${appStyles.notificationDismiss}`}
            onClick={webNotifications.dismiss}
          >
            Dismiss
          </button>
        </div>
      )}

      <Header
        projectName={project.name}
        localPath={project.local_path ?? undefined}
        milestone={milestone}
        notifications={notifications.unreadCount}
        notificationList={notifications.notifications}
        onMarkRead={notifications.markRead}
        onMarkAllRead={notifications.markAllRead}
        todoItems={todoItems}
        reviewItems={reviewItems}
        userInitials={user.initials}
        projects={projects}
        currentProjectId={project.id}
        onSwitchProject={onSwitchProject}
        onNewProject={onNewProject}
        onSignOut={onSignOut}
        onManageMembers={onManageMembers}
        onUpdateLocalPath={onUpdateLocalPath}
      />
    </>
  );
}
