'use client';

import { Key, Trash, Warning } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';

/**
 * Settings' Danger zone: clear every saved API key, or reset the database. Each
 * button opens the page's confirm dialog; a failure shows here, where it was pressed.
 */
export function DangerZone({
  error,
  busy,
  onClearApiKeys,
  onResetDatabase,
}: {
  error: string | null;
  busy: boolean;
  onClearApiKeys: () => void;
  onResetDatabase: () => void;
}) {
  const { t } = useTranslations();
  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2 border-b border-destructive pb-2">
        <Warning className="w-4 h-4 text-destructive" />
        <h2 className="font-serif text-xl font-bold text-ink text-balance">
          {t('settings.dangerZone')}
        </h2>
      </div>

      {error && (
        <Alert tone="error" className="break-words">
          {error}
        </Alert>
      )}

      <div className="grid md:grid-cols-2 gap-6">
        {/* Clear API Keys */}
        <div className="border border-destructive bg-destructive-tint p-6 space-y-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-ink text-balance mb-1">
              {t('settings.clearApiKeys')}
            </h3>
            <p className="text-xs text-ink-soft text-pretty">
              {t('settings.clearApiKeysDescription')}
            </p>
          </div>
          <Button
            type="button"
            variant="outline-destructive"
            className="w-full"
            onClick={onClearApiKeys}
            disabled={busy}
          >
            <Key className="w-4 h-4" />
            {t('settings.clearApiKeys')}
          </Button>
        </div>

        {/* Reset Database */}
        <div className="border border-destructive bg-destructive-tint p-6 space-y-4">
          <div>
            <h3 className="font-serif text-lg font-bold text-ink text-balance mb-1">
              {t('settings.resetDatabase')}
            </h3>
            <p className="text-xs text-ink-soft text-pretty">
              {t('settings.resetDatabaseDescription')}
            </p>
          </div>
          <Button
            type="button"
            variant="destructive"
            className="w-full"
            onClick={onResetDatabase}
            disabled={busy}
          >
            <Trash className="w-4 h-4" />
            {t('settings.resetDatabase')}
          </Button>
        </div>
      </div>
    </section>
  );
}
