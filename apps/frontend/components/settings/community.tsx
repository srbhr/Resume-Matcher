'use client';

import Image from 'next/image';
import { Info } from '@phosphor-icons/react';
import { CommunityLinks } from '@/components/common/community-links';
import type { DatabaseStats } from '@/lib/api/config';
import { APP_VERSION } from '@/lib/config/version';
import { useTranslations } from '@/lib/i18n';

/** A short ask, then Sponsor and Discord: one quiet line in the Settings footer. */
export function SettingsSupportStrip() {
  const { t } = useTranslations();

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
      <p className="font-mono text-xs uppercase tracking-wide text-ink-soft">
        {t('community.settingsPrompt')}
      </p>
      <CommunityLinks variant="settings" />
    </div>
  );
}

/**
 * The bottom of Settings: the app version, shown as on the dashboard, the counts of
 * what the app holds, and all five links.
 */
export function SettingsAbout({ stats }: { stats: DatabaseStats | null }) {
  const { t } = useTranslations();
  const unavailable = stats?.available === false;
  const counts =
    stats && !unavailable
      ? [
          [t('settings.statusCards.resumes'), stats.total_resumes],
          [t('settings.statusCards.jobs'), stats.total_jobs],
          [t('settings.statusCards.improvements'), stats.total_improvements],
        ]
      : [];

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

      {(counts.length > 0 || unavailable) && (
        <div className="space-y-2">
          <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-ink-soft">
            {t('settings.yourData')}
          </h3>
          {/* Zeros would say the app is empty; the database just didn't answer. */}
          {unavailable && (
            <p className="text-sm text-ink-soft">{t('settings.yourDataUnavailable')}</p>
          )}
          {counts.length > 0 && (
            <dl className="grid max-w-xl grid-cols-1 gap-px border border-ink bg-ink sm:grid-cols-3">
              {counts.map(([label, count]) => (
                <div key={label} className="bg-canvas px-4 py-3">
                  <dt className="font-mono text-xs uppercase text-steel">{label}</dt>
                  <dd className="font-mono text-2xl font-bold tabular-nums text-ink">{count}</dd>
                </div>
              ))}
            </dl>
          )}
        </div>
      )}

      <CommunityLinks variant="about" />
    </section>
  );
}
