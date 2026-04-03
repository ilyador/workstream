import { useState, useEffect, useCallback } from 'react';

const DISMISS_KEY = 'codesync-notif-dismissed';
const DISMISS_DAYS = 7; // Re-show prompt after this many days

function isDismissed(): boolean {
  const val = localStorage.getItem(DISMISS_KEY);
  if (!val) return false;
  const ts = parseInt(val, 10);
  if (isNaN(ts)) return false;
  return Date.now() - ts < DISMISS_DAYS * 24 * 60 * 60 * 1000;
}

export function useWebNotifications() {
  const [permission, setPermission] = useState<NotificationPermission>(
    typeof Notification !== 'undefined' ? Notification.permission : 'denied'
  );
  const [dismissed, setDismissed] = useState(isDismissed);

  useEffect(() => {
    if (typeof Notification !== 'undefined') {
      setPermission(Notification.permission);
    }
  }, []);

  const requestPermission = useCallback(async () => {
    if (typeof Notification === 'undefined') return;
    const result = await Notification.requestPermission();
    setPermission(result);
  }, []);

  const dismiss = useCallback(() => {
    setDismissed(true);
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
  }, []);

  const notify = useCallback((title: string, body: string) => {
    if (typeof Notification === 'undefined') return;
    if (Notification.permission !== 'granted') return;
    try {
      new Notification(title, { body, icon: '/favicon.ico' });
    } catch {
      // Notification constructor can throw in some environments
    }
  }, []);

  // Notification API only available on HTTPS or localhost
  const notificationsAvailable = typeof Notification !== 'undefined';
  const showPrompt = notificationsAvailable && permission === 'default' && !dismissed;

  return { permission, showPrompt, requestPermission, dismiss, notify };
}
