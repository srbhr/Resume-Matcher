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
  banner,
  children,
}: {
  /** Page-level alerts, shown inside the frame above the tiles. */
  banner?: React.ReactNode;
  children: React.ReactNode;
}) => {
  const { t } = useTranslations();

  return (
    <PageFrame height="screen">
      <PageHeader className="flex flex-col gap-8 lg:flex-row lg:items-center lg:justify-between">
        <PageHeader.Title>{t('nav.dashboard')}</PageHeader.Title>
        {/* One row: the brand line, then the buttons, as the old bottom bar had them. */}
        <div className="flex flex-wrap items-center gap-4">
          <div className="flex items-center gap-2 font-mono text-xs text-primary">
            <Image src="/logo.svg" alt="" width={20} height={20} className="w-5 h-5" />
            <span className="uppercase font-bold">Resume Matcher</span>
            <span className="text-steel">v{APP_VERSION}</span>
          </div>
          <Link
            href="/queue"
            className={buttonClass({ variant: 'outline', className: 'min-w-36' })}
          >
            <ListNumbers aria-hidden="true" />
            {t('nav.queue')}
          </Link>
          <Link
            href="/tracker"
            className={buttonClass({ variant: 'outline', className: 'min-w-36' })}
          >
            <SquaresFour aria-hidden="true" />
            {t('nav.applicationTracker')}
          </Link>
          <Link
            href="/settings"
            aria-label={t('nav.settings')}
            title={t('nav.settings')}
            // Icon size, at the height of the text buttons beside it.
            className={buttonClass({ variant: 'warning', size: 'icon', className: 'h-10 w-10' })}
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
      <div className="px-4 py-2 bg-canvas border-t border-ink shrink-0 relative z-30">
        <CommunityLinks variant="strip" />
      </div>
    </PageFrame>
  );
};
