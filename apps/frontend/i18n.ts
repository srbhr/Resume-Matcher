import {getRequestConfig} from 'next-intl/server';

export const locales = ['en','de'] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = 'en';

export default getRequestConfig(async (ctx?: { locale?: string }) => {
	// Prefer requestLocale() if available (next-intl >= 3.22), else fall back to deprecated ctx.locale
	let locale: string | undefined;
	try {
		const mod: any = await import('next-intl/server'); // eslint-disable-line @typescript-eslint/no-explicit-any
		if (typeof mod.requestLocale === 'function') {
			locale = await mod.requestLocale();
		}
	} catch {
		// ignore – use ctx.locale fallback
	}
	const candidate = locale ?? ctx?.locale;
	const resolvedLocale: Locale = locales.includes(candidate as Locale) ? (candidate as Locale) : defaultLocale;
	return {
		locale: resolvedLocale,
		messages: (await import(`./messages/${resolvedLocale}.json`)).default
	};
});
