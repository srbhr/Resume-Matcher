import * as React from 'react';

/**
 * The "DEFAULT" marker for the default master resume (dashboard + viewer).
 * Reproduces the badge as it rendered on the dashboard tile (`border-black` → `border-ink`).
 */
export function DefaultBadge({ children }: { children: React.ReactNode }) {
  return (
    <span className="shrink-0 rounded-none border border-ink px-1 font-mono text-xs uppercase">
      {children}
    </span>
  );
}
