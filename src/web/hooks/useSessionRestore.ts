/**
 * Saves app state (route + scroll) on visibilitychange=hidden.
 * Restores on page load if the session is recent (< 30 min).
 * This makes iOS Safari tab kills invisible to the user.
 */
const STATE_KEY = 'workstream-session-state';
const MAX_AGE_MS = 30 * 60 * 1000; // 30 minutes

interface SessionState {
  route: string;
  scrollY: number;
  timestamp: number;
}

export function initSessionRestore() {
  // Save state when page goes hidden (last chance before iOS kills it)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const state: SessionState = {
        route: window.location.pathname + window.location.search,
        scrollY: window.scrollY,
        timestamp: Date.now(),
      };
      try { sessionStorage.setItem(STATE_KEY, JSON.stringify(state)); } catch {}
    }
  });

  // Restore on load if session is fresh
  const saved = sessionStorage.getItem(STATE_KEY);
  if (saved) {
    try {
      const state: SessionState = JSON.parse(saved);
      const age = Date.now() - state.timestamp;
      if (age < MAX_AGE_MS && state.route !== window.location.pathname) {
        // Replace current URL with saved route (no navigation, just URL)
        window.history.replaceState(null, '', state.route);
      }
      if (age < MAX_AGE_MS && state.scrollY > 0) {
        // Restore scroll after React renders
        requestAnimationFrame(() => {
          requestAnimationFrame(() => window.scrollTo(0, state.scrollY));
        });
      }
    } catch {}
    sessionStorage.removeItem(STATE_KEY);
  }
}
