import { redirect } from 'next/navigation';

// Deprecated non-i18n Match page: redirect to default locale variant.
// Mark static: only depends on build-time env value.
export const dynamic = 'force-static';

export default function LegacyMatchRedirect() {
  const defaultLocale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE || 'en';
  redirect(`/${defaultLocale}/match`);
}
