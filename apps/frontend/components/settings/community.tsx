'use client';

import Image from 'next/image';
import { Info } from '@phosphor-icons/react';
import { CommunityLinks } from '@/components/common/community-links';
import { APP_VERSION } from '@/lib/config/version';
import { useTranslations } from '@/lib/i18n';

/** A compact line at the top of Settings: a short ask, then Sponsor and Discord. */
export function SettingsSupportStrip() {
  const { t } = useTranslations();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1 border border-ink bg-paper px-4 py-2 shadow-sw-nested">
      <p className="font-mono text-xs uppercase tracking-wide text-ink-soft">
        {t('community.settingsPrompt')}
      </p>
      <CommunityLinks variant="settings" />
    </div>
  );
}

/** The bottom of Settings: the app version, shown as on the dashboard, and all five links. */
export function SettingsAbout() {
  const { t } = useTranslations();

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2 border-b border-panel-hover pb-2">
        <Info aria-hidden="true" className="w-4 h-4" />
        <h2 className="font-serif text-xl font-bold text-ink text-balance">
          {t('community.aboutTitle')}
        </h2>
      </div>

      <div className="flex items-center gap-2 font-mono text-xs text-primary">
        <Image src="/logo.svg" alt="" width={20} height={20} className="w-5 h-5" />
        <span className="uppercase font-bold">Resume Matcher</span>
        <span className="text-steel">v{APP_VERSION}</span>
      </div>

      <CommunityLinks variant="about" />
    </section>
  );
}
