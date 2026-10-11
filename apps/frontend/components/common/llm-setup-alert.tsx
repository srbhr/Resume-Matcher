'use client';

import Link from 'next/link';
import { Alert } from '@/components/ui/alert';
import { buttonClass } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';

/** The one "LLM not configured" banner (dashboard + tailor). */
export function LlmSetupAlert({
  titleKey,
  messageKey,
  actionKey,
}: {
  titleKey: string;
  messageKey: string;
  actionKey: string;
}) {
  const { t } = useTranslations();
  return (
    <Alert tone="warning" title={t(titleKey)}>
      <p>{t(messageKey)}</p>
      <Link
        href="/settings"
        className={buttonClass({ variant: 'outline', size: 'sm', className: 'mt-3' })}
      >
        {t(actionKey)}
      </Link>
    </Alert>
  );
}
