import { useState, useEffect, useRef } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { timeAgo } from '../lib/time';
import { useTheme } from '../hooks/useTheme';
import s from './Header.module.css';
import taskStyles from './TaskCard.module.css';
import formStyles from './TaskForm.module.css';

interface Project {
  id: string;
  name: string;
}

interface Notification {
  id: string;
  type: string;
  task_id: string | null;
  workstream_id?: string | null;
  message: string;
  read: boolean;
  created_at: string;
}

export interface ActionItem {
  id: string;
  label: string;
  sublabel?: string;
  tag?: string;
  taskId?: string;
  workstreamId?: string;
}

interface Props {
  projectName: string;
  localPath?: string;
  milestone: { name: string; tasksDone: number; tasksTotal: number };
  notifications: number;
  notificationList?: Notification[];
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
  todoItems?: ActionItem[];
  reviewItems?: ActionItem[];
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
  localPath,
  milestone,
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
}: Props) {
  const navigate = useNavigate();
  useTheme();
  const [open, setOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [avatarOpen, setAvatarOpen] = useState(false);
  const [todoOpen, setTodoOpen] = useState(false);
  const [reviewOpen, setReviewOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const notifRef = useRef<HTMLDivElement>(null);
  const avatarRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open && !notifOpen && !avatarOpen) return;
    function handleClickOutside(e: MouseEvent) {
      const t = e.target as Node;
      if (open && dropdownRef.current && !dropdownRef.current.contains(t)) setOpen(false);
      if (notifOpen && notifRef.current && !notifRef.current.contains(t)) setNotifOpen(false);
      if (avatarOpen && avatarRef.current && !avatarRef.current.contains(t)) setAvatarOpen(false);
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open, notifOpen, avatarOpen]);

  return (
    <header className={s.bar}>
      <div className={s.left}>
        <span className={s.logo}>WorkStream</span>
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
              {/* Mobile: nav links */}
              <div className={s.mobileNav}>
                <div className={s.dropdownDivider} />
                {[
                  { to: '/', label: 'Streams', exact: true },
                  { to: '/flows', label: 'AI Flows' },
                  { to: '/archive', label: 'Archive' },
                ].map(link => {
                  const path = window.location.pathname;
                  const active = link.exact ? path === link.to : path.startsWith(link.to);
                  return (
                    <button key={link.to}
                      className={`${s.dropdownNew} ${active ? s.dropdownNavActive : ''}`}
                      onClick={() => { setOpen(false); navigate(link.to); }}
                    >{link.label}</button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
        <nav className={s.headerNav}>
          <NavLink to="/" end className={({isActive}) => isActive ? s.navLinkActive : s.navLink}>Streams</NavLink>
          <NavLink to="/flows" className={({isActive}) => isActive ? s.navLinkActive : s.navLink}>AI Flows</NavLink>
          <NavLink to="/archive" className={({isActive}) => isActive ? s.navLinkActive : s.navLink}>Archive</NavLink>
        </nav>
      </div>

      {/* Action center */}
      <div className={s.center}>
        <button
          className={`${s.actionBtn} ${todoItems.length > 0 ? s.actionBtnActive : ''}`}
          onClick={() => { setTodoOpen(true); setReviewOpen(false); }}
        >
          <span className={s.actionLabel}>To Do</span>
          {todoItems.length > 0 && <span className={`${s.actionCount} ${s.actionCountTodo}`}>{todoItems.length}</span>}
        </button>

        <button
          className={`${s.actionBtn} ${reviewItems.length > 0 ? s.actionBtnActive : ''}`}
          onClick={() => { setReviewOpen(true); setTodoOpen(false); }}
        >
          <span className={s.actionLabel}>To Review</span>
          {reviewItems.length > 0 && <span className={`${s.actionCount} ${s.actionCountReview}`}>{reviewItems.length}</span>}
        </button>
      </div>

      {/* To Do modal */}
      {todoOpen && (
        <div className={formStyles.overlay} onClick={() => setTodoOpen(false)}>
          <div className={`${formStyles.modal} ${s.actionModal}`} onClick={e => e.stopPropagation()}>
            <div className={s.actionModalHeader}>
              <span className={s.actionModalTitle}>To Do</span>
              {todoItems.length > 0 && <span className={`${s.actionCount} ${s.actionCountTodo}`}>{todoItems.length}</span>}
            </div>
            {todoItems.length === 0 ? (
              <div className={s.actionEmpty}>Nothing to do</div>
            ) : (
              <div className={s.actionList}>
                {todoItems.map(item => (
                  <button key={item.id} className={s.actionItem} onClick={() => {
                    if (item.taskId) navigate(`/?task=${item.taskId}`);
                    setTodoOpen(false);
                  }}>
                    <span className={s.actionItemLabel}>{item.label}</span>
                    <span className={s.actionItemTags}>
                      {item.tag && <span className={`${taskStyles.tag} ${taskStyles.tagType}`}>{item.tag}</span>}
                      {item.sublabel && <span className={s.actionItemPill}>{item.sublabel}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* To Review modal */}
      {reviewOpen && (
        <div className={formStyles.overlay} onClick={() => setReviewOpen(false)}>
          <div className={`${formStyles.modal} ${s.actionModal}`} onClick={e => e.stopPropagation()}>
            <div className={s.actionModalHeader}>
              <span className={s.actionModalTitle}>To Review</span>
              {reviewItems.length > 0 && <span className={`${s.actionCount} ${s.actionCountReview}`}>{reviewItems.length}</span>}
            </div>
            {reviewItems.length === 0 ? (
              <div className={s.actionEmpty}>Nothing to review</div>
            ) : (
              <div className={s.actionList}>
                {reviewItems.map(item => (
                  <button key={item.id} className={s.actionItem} onClick={() => {
                    if (item.taskId) navigate(`/?task=${item.taskId}`);
                    else if (item.workstreamId) navigate(`/?ws=${item.workstreamId}`);
                    setReviewOpen(false);
                  }}>
                    <span className={s.actionItemLabel}>{item.label}</span>
                    <span className={s.actionItemTags}>
                      {item.tag && <span className={`${taskStyles.tag} ${taskStyles.tagType}`}>{item.tag}</span>}
                      {item.sublabel && <span className={s.actionItemPill}>{item.sublabel}</span>}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      <div className={s.right}>
        {localPath && <span className={s.localPath} title={localPath}>{localPath}</span>}
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
                        if (n.task_id) navigate(`/?task=${n.task_id}`);
                        else if (n.workstream_id) navigate(`/?ws=${n.workstream_id}`);
                        setNotifOpen(false);
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
