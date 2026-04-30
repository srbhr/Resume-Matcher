'use client';

import React from 'react';
import type { KeywordRow } from '@/lib/api/ats';

interface ATSKeywordTableProps {
  rows: KeywordRow[];
}

const SECTION_LABELS: Record<string, string> = {
  summary: 'Summary',
  workExperience: 'Experience',
  education: 'Education',
  additional: 'Skills',
};

export function ATSKeywordTable({ rows }: ATSKeywordTableProps) {
  if (rows.length === 0) return null;

  return (
    <div className="border border-black">
      <div className="bg-black text-white font-mono text-xs uppercase tracking-widest px-4 py-2">
        Keyword Match Table
      </div>
      <div className="overflow-x-auto">
        <table className="w-full font-mono text-sm">
          <thead>
            <tr className="border-b border-black bg-secondary">
              <th className="text-left px-4 py-2 uppercase text-xs">JD Keyword</th>
              <th className="text-left px-4 py-2 uppercase text-xs">Found</th>
              <th className="text-left px-4 py-2 uppercase text-xs">Section</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row, i) => (
              <tr
                key={i}
                className={`border-b border-black last:border-0 ${row.found_in_resume ? '' : 'bg-red-50'}`}
              >
                <td className="px-4 py-2">{row.keyword}</td>
                <td className="px-4 py-2">
                  {row.found_in_resume ? (
                    <span className="text-green-700 font-bold">YES</span>
                  ) : (
                    <span className="text-red-600 font-bold">NO</span>
                  )}
                </td>
                <td className="px-4 py-2 text-muted-foreground">
                  {row.section ? SECTION_LABELS[row.section] ?? row.section : '—'}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
