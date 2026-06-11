'use client';

import React from 'react';
import Link from 'next/link';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import { KanbanBoard } from '@/components/tracker/kanban-board';
import { useTranslations } from '@/lib/i18n';

export default function TrackerPage() {
  const { t } = useTranslations();
  return (
    // Fill the viewport so the Swiss canvas grows with the window; the board
    // area flexes to the available height and the columns scroll internally.
    <main
      className="flex h-[100dvh] w-full flex-col overflow-hidden bg-background px-4 py-6 md:px-8"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.1) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.1) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="mx-auto flex min-h-0 w-full max-w-[104rem] flex-1 flex-col">
        <Link
          href="/dashboard"
          className="mb-3 inline-flex shrink-0 items-center gap-1 self-start font-mono text-xs uppercase text-ink-soft hover:text-primary"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          {t('nav.backToDashboard')}
        </Link>
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden border border-black bg-background shadow-sw-lg">
          <KanbanBoard />
        </div>
      </div>
    </main>
  );
}
