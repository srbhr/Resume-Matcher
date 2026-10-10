'use client';

import React from 'react';
import Link from 'next/link';
import { BackgroundEffect } from '@/components/effects/background-effect';
import { buttonClass } from '@/components/ui/button';
import { useBlockDissolveNavigate } from '@/lib/effects/use-block-dissolve-navigate';
import { useTranslations } from '@/lib/i18n';

export default function Hero() {
  const { t } = useTranslations();
  const dashboardLink = useBlockDissolveNavigate();

  return (
    <section className="relative isolate h-screen w-full bg-canvas p-4 md:p-12 lg:p-24">
      <BackgroundEffect />
      <div className="flex h-full w-full flex-col items-center justify-center border border-ink text-primary bg-canvas shadow-sw-xl">
        <h1 className="hero-enter mb-12 text-center font-mono text-6xl font-bold uppercase leading-none tracking-tighter md:text-8xl lg:text-9xl selection:bg-primary selection:text-white">
          {t('home.brandLine1')}
          <br />
          {t('home.brandLine2')}
        </h1>

        <div className="hero-enter hero-enter-delay-2 flex flex-col gap-4 md:flex-row md:gap-12">
          <a
            href="https://github.com/srbhr/Resume-Matcher"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass({ variant: 'outline', size: 'lg' })}
          >
            GitHub
          </a>
          <a
            href="https://resumematcher.fyi"
            target="_blank"
            rel="noopener noreferrer"
            className={buttonClass({ variant: 'outline', size: 'lg' })}
          >
            {t('home.docs')}
          </a>
          <Link
            href="/dashboard"
            className={buttonClass({ size: 'lg' })}
            onClick={dashboardLink.onClick}
            onMouseEnter={dashboardLink.prepare}
            onFocus={dashboardLink.prepare}
          >
            {t('home.launchApp')}
          </Link>
        </div>
      </div>
    </section>
  );
}
