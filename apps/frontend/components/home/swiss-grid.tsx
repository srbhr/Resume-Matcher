'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import LayoutGrid from 'lucide-react/dist/esm/icons/layout-grid';
import { buttonClass } from '@/components/ui/button';
import { PageFrame } from '@/components/ui/page-frame';
import { PageHeader } from '@/components/ui/page-header';
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
      <PageHeader>
        <PageHeader.Title>{t('nav.dashboard')}</PageHeader.Title>
        <PageHeader.Subtitle>{t('dashboard.selectModule')}</PageHeader.Subtitle>
      </PageHeader>

      {/* Content Grid - Scrollable area with NO padding.
          @container makes the card grid respond to the container's actual
          width, not the viewport. The Swiss frame is max-w-86rem so on
          ultra-wide screens the cards no longer over-stretch. */}
      <div className="@container flex-1 overflow-y-auto overflow-x-hidden relative z-10">
        {banner && <div className="space-y-4 p-6">{banner}</div>}
        <div className="p-[1.5px]">
          <div className="grid grid-cols-1 @2xl:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5 bg-black gap-[1px] border-b border-black">
            {children}
          </div>
        </div>
      </div>

      {/* Footer - stays above hovered cards */}
      <div className="p-4 bg-canvas flex justify-between items-center font-mono text-xs text-primary border-t border-black shrink-0 relative z-30">
        <div className="flex items-center gap-2">
          <Image src="/logo.svg" alt="Resume Matcher" width={20} height={20} className="w-5 h-5" />
          <span className="uppercase font-bold">Resume Matcher</span>
        </div>
        <div className="flex items-center gap-4">
          <Link
            href="/tracker"
            className={buttonClass({ variant: 'outline', className: 'min-w-36' })}
          >
            <LayoutGrid aria-hidden="true" />
            {t('nav.applicationTracker')}
          </Link>
          <Link
            href="/settings"
            className={buttonClass({ variant: 'warning', className: 'min-w-36' })}
          >
            {t('nav.settings')}
          </Link>
        </div>
      </div>
    </PageFrame>
  );
};
