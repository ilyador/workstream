/**
 * Saves app state on visibilitychange=hidden, restores on page load.
 * Handles iOS Safari tab kills by persisting route, scroll, and UI state
 * to sessionStorage so reloads feel seamless.
 */
const STATE_KEY = 'workstream-session-state';
const MAX_AGE_MS = 30 * 60 * 1000;

interface SessionState {
  route: string;
  boardScrollLeft: number;
  timestamp: number;
}

function getBoardEl(): HTMLElement | null {
  return document.querySelector('[data-board]');
}

export function initSessionRestore() {
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') {
      const board = getBoardEl();
      const state: SessionState = {
        route: window.location.pathname + window.location.search,
        boardScrollLeft: board?.scrollLeft ?? 0,
        timestamp: Date.now(),
      };
      try {
        sessionStorage.setItem(STATE_KEY, JSON.stringify(state));
      } catch {
        // Ignore storage write failures.
      }
    }
  });

  const saved = sessionStorage.getItem(STATE_KEY);
  if (saved) {
    try {
      const state: SessionState = JSON.parse(saved);
      const age = Date.now() - state.timestamp;
      if (age < MAX_AGE_MS && state.route !== window.location.pathname) {
        window.history.replaceState(null, '', state.route);
      }
      if (age < MAX_AGE_MS && state.boardScrollLeft > 0) {
        let restored = false;
        const restore = () => {
          if (restored) return;
          const board = getBoardEl();
          if (board) {
            board.scrollLeft = state.boardScrollLeft;
            restored = true;
          }
        };
        // rAF for fast path; setTimeout fallback if board mounts late
        requestAnimationFrame(() => requestAnimationFrame(restore));
        setTimeout(restore, 300);
      }
    } catch {
      // Ignore malformed saved state.
    }
    sessionStorage.removeItem(STATE_KEY);
  }

  // Request persistent storage on iOS 17+
  if (navigator.storage?.persist) {
    navigator.storage.persist().catch(() => {
      // Ignore unsupported or denied persistence requests.
    });
  }
}
