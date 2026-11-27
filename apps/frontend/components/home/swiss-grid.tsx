'use client';

import React, { useEffect, useState } from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { GearSix, ListNumbers, MagnifyingGlass, SquaresFour } from '@phosphor-icons/react';
import { openCommandPalette } from '@/components/common/command-palette-launcher';
import { CommunityLinks } from '@/components/common/community-links';
import { buttonClass } from '@/components/ui/button';
import { PageFrame } from '@/components/ui/page-frame';
import { PageHeader } from '@/components/ui/page-header';
import { APP_VERSION } from '@/lib/config/version';
import { useTranslations } from '@/lib/i18n';

export const SwissGrid = ({
  banner,
  children,
}: {
  /** Page-level alerts, shown inside the frame above the tiles. */
  banner?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const { t } = useTranslations();
  // Ctrl K until mounted, so server and client render the same; then the Mac key.
  const [modKey, setModKey] = useState('Ctrl');
  useEffect(() => {
    if (/Mac|iPhone|iPad/.test(navigator.platform)) setModKey('⌘');
  }, []);

  return (
    <PageFrame height="screen">
      <PageHeader className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <PageHeader.Title>{t('nav.dashboard')}</PageHeader.Title>
        {/* One field-like search, then quiet links: one bordered element, not five. */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={openCommandPalette}
            aria-keyshortcuts="Meta+K Control+K"
            className="flex h-10 w-full items-center gap-2 border border-ink bg-white px-3 text-left text-sm text-steel hover:border-primary focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary sm:w-64"
          >
            <MagnifyingGlass aria-hidden="true" className="size-4 shrink-0 text-ink" />
            <span className="min-w-0 flex-1 truncate">{t('commandPalette.search')}…</span>
            <kbd aria-hidden="true" className="border border-ink px-1 font-mono text-xs text-ink">
              {modKey} K
            </kbd>
          </button>
          <Link href="/queue" className={buttonClass({ variant: 'ghost' })}>
            <ListNumbers aria-hidden="true" />
            {t('nav.queue')}
          </Link>
          <Link href="/tracker" className={buttonClass({ variant: 'ghost' })}>
            <SquaresFour aria-hidden="true" />
            {t('nav.applicationTracker')}
          </Link>
          <Link
            href="/settings"
            aria-label={t('nav.settings')}
            title={t('nav.settings')}
            className={buttonClass({ variant: 'ghost', size: 'icon', className: 'h-10 w-10' })}
          >
            <GearSix aria-hidden="true" />
          </Link>
        </div>
      </PageHeader>

      {/* Content Grid - Scrollable area with NO padding.
          @container makes the card grid respond to the container's actual
          width, not the viewport. The Swiss frame is max-w-86rem so on
          ultra-wide screens the cards no longer over-stretch. */}
      <div className="@container flex-1 overflow-y-auto overflow-x-hidden relative z-10">
        <h2 className="sr-only">{t('dashboard.modulesHeading')}</h2>
        {banner && <div className="space-y-4 p-6">{banner}</div>}
        <div className="p-[1.5px]">
          <div className="grid grid-cols-1 @2xl:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5 bg-ink gap-[1px] border-b border-ink">
            {children}
          </div>
        </div>
      </div>

      {/* Community strip - a slim last row, kept above hovered cards */}
      <div className="px-4 py-2 bg-canvas border-t border-ink shrink-0 relative z-30 flex flex-wrap items-center justify-between gap-2">
        <CommunityLinks variant="strip" />
        <div className="flex items-center gap-2 font-mono text-xs text-primary">
          <Image src="/logo.svg" alt="" width={16} height={16} className="w-4 h-4" />
          <span className="uppercase font-bold">Resume Matcher</span>
          <span className="text-steel">v{APP_VERSION}</span>
        </div>
      </div>
    </PageFrame>
  );
};
