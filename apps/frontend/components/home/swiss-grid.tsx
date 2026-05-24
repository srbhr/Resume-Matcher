'use client';

import React from 'react';
import Image from 'next/image';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n';

export const SwissGrid = ({ children }: { children: React.ReactNode }) => {
  const { t } = useTranslations();

  return (
    // 1. Outer Wrapper: Fixed height with grid background
    <div className="h-screen w-full flex justify-center items-start py-12 px-4 md:px-8 overflow-hidden bg-background grid-bg">
      {/* 2. The Main Container: Sharp borders, creating the "Canvas" */}
      <div className="w-full max-w-[86rem] max-h-full border border-border bg-background shadow-sw-lg flex flex-col overflow-hidden">
        {/* Header Section - stays above hovered cards */}
        <div className="border-b border-border p-8 md:p-12 shrink-0 bg-background relative z-30">
          <h1 className="font-serif text-5xl md:text-7xl text-foreground tracking-tight leading-[0.95] uppercase">
            {t('nav.dashboard')}
          </h1>
          <p className="mt-6 text-sm font-mono text-primary uppercase tracking-wide max-w-md font-bold">
            {'// '}
            {t('dashboard.selectModule')}
          </p>
        </div>

        {/* Content Grid - Scrollable area with NO padding.
            @container makes the card grid respond to the container's actual
            width, not the viewport. The Swiss frame is max-w-86rem so on
            ultra-wide screens the cards no longer over-stretch. */}
        <div className="@container flex-1 overflow-y-auto overflow-x-hidden relative z-10">
          <div className="p-[1.5px]">
            <div className="grid grid-cols-1 @2xl:grid-cols-2 @3xl:grid-cols-3 @5xl:grid-cols-5 bg-foreground gap-[1px] border-b border-border">
              {children}
            </div>
          </div>
        </div>

        {/* Footer - stays above hovered cards */}
        <div className="p-4 bg-background flex justify-between items-center font-mono text-xs text-primary border-t border-border shrink-0 relative z-30">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Resume Matcher"
              width={20}
              height={20}
              className="w-5 h-5"
            />
            <span className="uppercase font-bold">Resume Matcher</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/settings"
              className="bg-warning text-on-accent border border-border px-6 py-2 uppercase font-bold tracking-wide shadow-sw-sm hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all min-w-[140px] text-center"
            >
              {t('nav.settings')}
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
};
