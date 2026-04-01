import { useState, useEffect, useRef } from 'react';
import { timeAgo } from '../lib/time';
import s from './Header.module.css';

interface Project {
  id: string;
  name: string;
}

interface Notification {
  id: string;
  type: string;
  task_id: string | null;
  message: string;
  read: boolean;
  created_at: string;
}

interface Props {
  projectName: string;
  milestone: { name: string; tasksDone: number; tasksTotal: number };
  notifications: number;
  notificationList?: Notification[];
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  userInitials: string;
  projects: Project[];
  currentProjectId: string | null;
  onSwitchProject: (id: string) => void;
  onNewProject: () => void;
  onSignOut?: () => void;
  onManageMembers?: () => void;
}

export function Header({
  projectName,
  milestone,
  notifications,
  notificationList = [],
  onMarkRead,
  onMarkAllRead,
  userInitials,
  projects,
  currentProjectId,
  onSwitchProject,
  onNewProject,
  onSignOut,
  onManageMembers,
}: Props) {
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !notifOpen && !avatarOpen) return;
    function handleClickOutside(e: MouseEvent) {
      if (open && dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
      if (notifOpen && notifRef.current && !notifRef.current.contains(e.target as Node)) {
        setNotifOpen(false);
      }
      if (avatarOpen && avatarRef.current && !avatarRef.current.contains(e.target as Node)) {
        setAvatarOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, notifOpen, avatarOpen]);

  return (
    <header className={s.bar}>
      <div className={s.left}>
        <span className={s.logo}>CodeSync</span>
        <span className={s.sep}>/</span>
        <div className={s.switcher} ref={dropdownRef}>
          <button className={s.project} onClick={() => setOpen(prev => !prev)}>
            {projectName} <span className={`${s.caret} ${open ? s.caretOpen : ''}`}>&#9662;</span>
          </button>
          {open && (
            <div className={s.dropdown}>
              <div className={s.dropdownList}>
                {projects.map(p => (
                  <button
                    key={p.id}
                    className={`${s.dropdownItem} ${p.id === currentProjectId ? s.dropdownItemActive : ''}`}
                    onClick={() => {
                      onSwitchProject(p.id);
                      setOpen(false);
                    }}
                  >
                    <span className={s.dropdownCheck}>
                      {p.id === currentProjectId ? '\u2713' : ''}
                    </span>
                    <span className={s.dropdownName}>{p.name}</span>
                  </button>
                ))}
              </div>
              <div className={s.dropdownDivider} />
              <button
                className={s.dropdownNew}
                onClick={() => {
                  setOpen(false);
                  onNewProject();
                }}
              >
                + New Project
              </button>
              {onManageMembers && (
                <>
                  <div className={s.dropdownDivider} />
                  <button
                    className={s.dropdownNew}
                    onClick={() => {
                      setOpen(false);
                      onManageMembers();
                    }}
                  >
                    Manage Members
                  </button>
                </>
              )}
            </div>
          )}
        </div>
      </div>
      <div className={s.right}>
        <span className={s.milestone}>
          {milestone.tasksTotal === 0 && milestone.name === 'All'
            ? 'No milestone'
            : <>{milestone.name} &middot; {milestone.tasksDone}/{milestone.tasksTotal}</>
          }
        </span>
        <div className={s.notifWrap} ref={notifRef}>
          <button className={s.icon} onClick={() => setNotifOpen(prev => !prev)}>
            {notifications > 0 && <span className={s.dot} />}
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.73 21a2 2 0 0 1-3.46 0"/></svg>
          </button>
          {notifOpen && (
            <div className={s.notifDropdown}>
              <div className={s.notifHeader}>
                <span className={s.notifTitle}>Notifications</span>
                {notifications > 0 && (
                  <button className={s.notifMarkAll} onClick={() => onMarkAllRead?.()}>Mark all read</button>
                )}
              </div>
              {notificationList.length === 0 ? (
                <div className={s.notifEmpty}>No notifications</div>
              ) : (
                <div className={s.notifList}>
                  {notificationList.slice(0, 20).map(n => (
                    <button
                      key={n.id}
                      className={`${s.notifItem} ${!n.read ? s.notifUnread : ''}`}
                      onClick={() => {
                        if (!n.read) onMarkRead?.(n.id);
                      }}
                    >
                      <span className={s.notifMsg}>{n.message}</span>
                      <span className={s.notifTime}>{timeAgo(n.created_at)}</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
        <div className={s.avatarWrap} ref={avatarRef}>
          <button className={s.avatar} onClick={() => setAvatarOpen(prev => !prev)}>{userInitials}</button>
          {avatarOpen && (
            <div className={s.avatarDropdown}>
              <button
                className={s.avatarOption}
                onClick={() => {
                  setAvatarOpen(false);
                  onSignOut?.();
                }}
              >
                Sign Out
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
