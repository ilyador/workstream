import { useTheme } from '../hooks/useTheme';
import { HeaderProjectSwitcher } from './HeaderProjectSwitcher';
import { HeaderActionCenter } from './HeaderActionCenter';
import { HeaderNotifications } from './HeaderNotifications';
import { HeaderAccountControls } from './HeaderAccountControls';
import { HeaderUserMenu } from './HeaderUserMenu';
import type { ActionItem, HeaderProjectSummary } from './header-types';
import type { NotificationRecord } from '../lib/api';
import s from './Header.module.css';

interface Props {
  projectName: string;
  localPath?: string;
  notifications: number;
  notificationList?: NotificationRecord[];
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  todoItems?: ActionItem[];
  reviewItems?: ActionItem[];
  userInitials: string;
  projects: HeaderProjectSummary[];
  currentProjectId: string | null;
  onSwitchProject: (id: string) => void;
  onNewProject: () => void;
  onSignOut?: () => void;
  onManageMembers?: () => void;
  onUpdateLocalPath?: (path: string) => void;
}

export function Header({
  projectName,
  localPath,
  notifications,
  notificationList = [],
  onMarkRead,
  onMarkAllRead,
  todoItems = [],
  reviewItems = [],
  userInitials,
  projects,
  currentProjectId,
  onSwitchProject,
  onNewProject,
  onSignOut,
  onManageMembers,
  onUpdateLocalPath,
}: Props) {
  useTheme();

  return (
    <header className={s.bar}>
      <div className={s.left}>
        <HeaderProjectSwitcher
          projectName={projectName}
          projects={projects}
          currentProjectId={currentProjectId}
          onSwitchProject={onSwitchProject}
          onNewProject={onNewProject}
          onManageMembers={onManageMembers}
        />
      </div>

      <HeaderActionCenter todoItems={todoItems} reviewItems={reviewItems} />

      <div className={s.right}>
        <HeaderAccountControls
          localPath={localPath}
          onUpdateLocalPath={onUpdateLocalPath}
        />
        <HeaderNotifications
          notifications={notifications}
          notificationList={notificationList}
          onMarkRead={onMarkRead}
          onMarkAllRead={onMarkAllRead}
        />
        <HeaderUserMenu userInitials={userInitials} onSignOut={onSignOut} />
      </div>
    </header>
  );
}
