'use client';

import { useEffect, useRef } from 'react';

/** How often a page in agent mode looks for changes the user's coding agent saved. */
export const AGENT_REFRESH_INTERVAL_MS = 4000;

/**
 * In agent mode the user's coding agent writes resumes from outside the app.
 * While `enabled`, call `refresh` every few seconds when the page is visible,
 * and again as soon as it becomes visible. `refresh` can change on every
 * render; the latest one is called. When it returns a promise, no new refresh
 * starts until that one settles, so a slow server is not flooded with requests
 * that each replace the last.
 */
export function useAgentRefresh(enabled: boolean, refresh: () => unknown) {
  const refreshRef = useRef(refresh);
  useEffect(() => {
    refreshRef.current = refresh;
  });

  useEffect(() => {
    if (!enabled) return;
    let running = false;
    const run = () => {
      if (running || document.hidden) return;
      const result = refreshRef.current();
      if (result instanceof Promise) {
        running = true;
        const done = () => {
          running = false;
        };
        void result.then(done, done);
      }
    };
    const timer = window.setInterval(run, AGENT_REFRESH_INTERVAL_MS);
    document.addEventListener('visibilitychange', run);
    return () => {
      window.clearInterval(timer);
      document.removeEventListener('visibilitychange', run);
    };
  }, [enabled]);
}
