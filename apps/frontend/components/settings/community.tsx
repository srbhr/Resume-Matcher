'use client';

import { CommunityLinks } from '@/components/common/community-links';
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
