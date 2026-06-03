'use client';
import type { ReactNode } from 'react';

export function ChatMessage({ from, children }: { from: 'ai' | 'user'; children: ReactNode }) {
  const isAi = from === 'ai';
  return (
    <div className={`flex ${isAi ? 'justify-start' : 'justify-end'}`}>
      <div
        className={`max-w-[85%] border border-black px-4 py-3 shadow-sw-default ${
          isAi ? 'bg-canvas' : 'bg-blue-700 text-canvas'
        }`}
      >
        <p className="whitespace-pre-wrap text-sm leading-relaxed">{children}</p>
      </div>
    </div>
  );
}
