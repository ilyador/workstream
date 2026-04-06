import { useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import type { NotificationRecord } from '../lib/api';
import { timeAgo } from '../lib/time';
import { useDismissOnOutsideClick } from '../hooks/useDismissOnOutsideClick';
import s from './Header.module.css';

interface HeaderNotificationsProps {
  notifications: number;
  notificationList: NotificationRecord[];
  onMarkRead?: (id: string) => void;
  onMarkAllRead?: () => void;
}

export function HeaderNotifications({
  notifications,
  notificationList,
  onMarkRead,
  onMarkAllRead,
}: HeaderNotificationsProps) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const notifRef = useRef<HTMLDivElement>(null);

  useDismissOnOutsideClick(notifRef, open, () => setOpen(false));

  return (
    <div className={s.notifWrap} ref={notifRef}>
      <button className={s.icon} onClick={() => setOpen(current => !current)}>
        {notifications > 0 && <span className={s.dot} />}
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
      </button>
      {open && (
        <div className={s.notifDropdown}>
          <div className={s.notifHeader}>
            <span className={s.notifTitle}>Notifications</span>
            {notifications > 0 && (
              <button className={s.notifMarkAll} onClick={() => onMarkAllRead?.()}>
                Mark all read
              </button>
            )}
          </div>
          {notificationList.length === 0 ? (
            <div className={s.notifEmpty}>No notifications</div>
          ) : (
            <div className={s.notifList}>
              {notificationList.slice(0, 20).map(notification => (
                <button
                  key={notification.id}
                  className={`${s.notifItem} ${!notification.read ? s.notifUnread : ''}`}
                  onClick={() => {
                    if (!notification.read) onMarkRead?.(notification.id);
                    if (notification.task_id) navigate(`/?task=${notification.task_id}`);
                    else if (notification.workstream_id) navigate(`/?ws=${notification.workstream_id}`);
                    setOpen(false);
                  }}
                >
                  <span className={s.notifMsg}>{notification.message}</span>
                  <span className={s.notifTime}>{timeAgo(notification.created_at)}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
