'use client';

import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';

const STORAGE_KEY = 'resume_matcher_effects';

interface EffectsContextValue {
  enabled: boolean;
  setEnabled: (enabled: boolean) => void;
}

// Without a provider (print routes, isolated tests) effects stay off: they only ever appear
// where the app has opted in and the user can turn them off.
const EffectsContext = createContext<EffectsContextValue>({
  enabled: false,
  setEnabled: () => {},
});

/**
 * Whether background effects are on. Client-only, like the UI language: the choice lives in
 * localStorage (default on), every access is guarded because storage can be blocked or full.
 */
export function EffectsProvider({ children }: { children: React.ReactNode }) {
  // On for the first render so server and client markup agree; the stored choice lands after mount.
  const [enabled, setEnabledState] = useState(true);

  useEffect(() => {
    try {
      if (localStorage.getItem(STORAGE_KEY) === 'false') setEnabledState(false);
    } catch {
      // Storage unavailable: keep the default.
    }
  }, []);

  const setEnabled = useCallback((next: boolean) => {
    setEnabledState(next);
    try {
      localStorage.setItem(STORAGE_KEY, String(next));
    } catch {
      // The choice still holds for this session.
    }
  }, []);

  const value = useMemo(() => ({ enabled, setEnabled }), [enabled, setEnabled]);

  return <EffectsContext.Provider value={value}>{children}</EffectsContext.Provider>;
}

export function useEffectsEnabled(): boolean {
  return useContext(EffectsContext).enabled;
}

export function useSetEffectsEnabled(): (enabled: boolean) => void {
  return useContext(EffectsContext).setEnabled;
}
