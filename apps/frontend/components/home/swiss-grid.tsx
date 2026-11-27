'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { GearSix, ListNumbers, SquaresFour } from '@phosphor-icons/react';
import { CommunityLinks } from '@/components/common/community-links';
import { buttonClass } from '@/components/ui/button';
import { PageFrame } from '@/components/ui/page-frame';
import { PageHeader } from '@/components/ui/page-header';
import { APP_VERSION } from '@/lib/config/version';
import { useTranslations } from '@/lib/i18n';

export const SwissGrid = ({
  action,
  banner,
  children,
}: {
  /** The page's one primary action, after the three links in the header. */
  action?: React.ReactNode;
  /** Page-level alerts, shown inside the frame above the tiles. */
  banner?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const { t } = useTranslations();
  return (
    <PageFrame height="screen" ground="crosses-wide">
      <PageHeader className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <PageHeader.Title>{t('nav.dashboard')}</PageHeader.Title>
        {/* Where to go next: three labelled buttons, each an icon and a name. */}
        <nav aria-label={t('nav.primary')} className="flex flex-wrap items-center gap-3">
          <Link href="/queue" className={buttonClass({ variant: 'outline', size: 'sm' })}>
            <ListNumbers aria-hidden="true" />
            {t('nav.queue')}
          </Link>
          <Link href="/tracker" className={buttonClass({ variant: 'outline', size: 'sm' })}>
            <SquaresFour aria-hidden="true" />
            {t('nav.applicationTracker')}
          </Link>
          <Link href="/settings" className={buttonClass({ variant: 'outline', size: 'sm' })}>
            <GearSix aria-hidden="true" />
            {t('nav.settings')}
          </Link>
          {action}
        </nav>
      </PageHeader>

      {/* Content Grid - Scrollable area with NO padding.
          @container makes the card grid respond to the container's actual
          width, not the viewport. The Swiss frame is max-w-86rem so on
          ultra-wide screens the cards no longer over-stretch. Five columns
          only from a 1280px container: narrower, a tile's title and meta
          lines no longer fit its 5:4 shape. */}
      <div className="@container flex-1 overflow-y-auto overflow-x-hidden relative z-10">
        <h2 className="sr-only">{t('dashboard.modulesHeading')}</h2>
        {banner && <div className="space-y-4 p-6">{banner}</div>}
        <div className="p-[1.5px]">
          <div className="grid grid-cols-1 @2xl:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-4 @7xl:grid-cols-5 bg-ink gap-[1px] border-b border-ink">
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
