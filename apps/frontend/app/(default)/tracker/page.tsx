'use client';

import React from 'react';
import Link from 'next/link';
import ArrowLeft from 'lucide-react/dist/esm/icons/arrow-left';
import { KanbanBoard } from '@/components/tracker/kanban-board';
import { useTranslations } from '@/lib/i18n';

export default function TrackerPage() {
  const { t } = useTranslations();
  return (
    <main className="mx-auto max-w-7xl px-4 py-8">
      <Link
        href="/dashboard"
        className="mb-4 inline-flex items-center gap-1 font-mono text-xs uppercase text-ink-soft hover:text-primary"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t('nav.backToDashboard')}
      </Link>
      <KanbanBoard />
    </main>
  );
}
