'use client';

import React from 'react';

interface ATSMissingKeywordsProps {
  keywords: string[];
}

export function ATSMissingKeywords({ keywords }: ATSMissingKeywordsProps) {
  if (keywords.length === 0) return null;

  return (
    <div className="border border-black">
      <div className="bg-black text-white font-mono text-xs uppercase tracking-widest px-4 py-2">
        Missing Keywords ({keywords.length})
      </div>
      <div className="p-4 flex flex-wrap gap-2">
        {keywords.map((kw, i) => (
          <span
            key={i}
            className="border border-red-600 text-red-700 font-mono text-xs px-2 py-1 bg-red-50"
          >
            {kw}
          </span>
        ))}
      </div>
    </div>
  );
}
