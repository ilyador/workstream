import { useState, useEffect, useCallback } from 'react';
import { getNotifications, markNotificationRead, markAllNotificationsRead } from '../lib/api';

interface Notification {
  id: string;
  type: string;
  task_id: string | null;
  message: string;
  read: boolean;
  created_at: string;
}

export function useNotifications(userId: string | undefined) {
  const [notifications, setNotifications] = useState<Notification[]>([]);

  const load = useCallback(async () => {
    if (!userId) return;
    try {
      const data = await getNotifications();
      setNotifications(data);
    } catch { /* ignore */ }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    queueMicrotask(() => {
      void load();
    });
    const interval = setInterval(load, 10000);
    return () => clearInterval(interval);
  }, [userId, load]);

  const unreadCount = notifications.filter(n => !n.read).length;

  async function markRead(id: string) {
    await markNotificationRead(id);
    setNotifications(prev => prev.map(n => n.id === id ? { ...n, read: true } : n));
  }

  async function markAllRead() {
    await markAllNotificationsRead();
    setNotifications(prev => prev.map(n => ({ ...n, read: true })));
  }

  return { notifications, unreadCount, markRead, markAllRead };
}
