import { redirect } from 'next/navigation';

// Redirect bare /resume route to the localized default locale variant.
// Mark as static since it doesn't depend on per-request data (env is baked at build time).
export const dynamic = 'force-static';

export default function ResumeUploadRedirect() {
	const defaultLocale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE || 'en';
	redirect(`/${defaultLocale}/resume`);
}

