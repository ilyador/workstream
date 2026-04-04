import { useState, useEffect } from 'react';
import { getMe, getToken, clearSession } from '../lib/api';

interface Profile {
  id: string;
  name: string;
  email: string;
  initials: string;
}

// Cache profile in sessionStorage to avoid splash on iOS Safari tab restore
const PROFILE_CACHE_KEY = 'workstream-profile-cache';
function getCachedProfile(): Profile | null {
  try {
    const cached = sessionStorage.getItem(PROFILE_CACHE_KEY);
    return cached ? JSON.parse(cached) : null;
  } catch { return null; }
}

export function useAuth() {
  const hasToken = !!getToken();
  const cached = hasToken ? getCachedProfile() : null;

  const [profile, setProfile] = useState<Profile | null>(cached);
  const [loading, setLoading] = useState(hasToken && !cached);
  const [loggedIn, setLoggedIn] = useState(hasToken);

  useEffect(() => {
    if (!getToken()) { setLoading(false); return; }

    getMe()
      .then(data => {
        setProfile(data.profile);
        setLoggedIn(true);
        try { sessionStorage.setItem(PROFILE_CACHE_KEY, JSON.stringify(data.profile)); } catch {}
      })
      .catch(() => {
        clearSession();
        sessionStorage.removeItem(PROFILE_CACHE_KEY);
        setLoggedIn(false);
      })
      .finally(() => setLoading(false));
  }, [loggedIn]);

  function onAuthSuccess() {
    setLoggedIn(true);
    setLoading(true);
  }

  function onSignOut() {
    clearSession();
    sessionStorage.removeItem(PROFILE_CACHE_KEY);
    setProfile(null);
    setLoggedIn(false);
  }

  return { profile, loading, loggedIn, onAuthSuccess, onSignOut };
}
