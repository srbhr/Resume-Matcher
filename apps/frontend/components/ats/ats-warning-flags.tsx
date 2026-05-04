'use client';

import React from 'react';

interface ATSWarningFlagsProps {
  flags: string[];
}

export function ATSWarningFlags({ flags }: ATSWarningFlagsProps) {
  if (flags.length === 0) return null;

  return (
    <div className="border border-black">
      <div className="bg-red-600 text-white font-mono text-xs uppercase tracking-widest px-4 py-2">
        Warning Flags ({flags.length})
      </div>
      <ol className="divide-y divide-black">
        {flags.map((flag, i) => (
          <li key={flag} className="flex gap-3 px-4 py-3 font-mono text-sm">
            <span className="text-red-600 font-bold shrink-0">{i + 1}.</span>
            <span>{flag}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}
