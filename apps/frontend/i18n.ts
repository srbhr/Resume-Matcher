import {getRequestConfig} from 'next-intl/server';

export const locales = ['en','de'] as const;
export type Locale = typeof locales[number];
export const defaultLocale: Locale = 'en';

export default getRequestConfig(async () => {
	// Prefer requestLocale() to avoid deprecated ctx.locale access
	let candidate: string | undefined;
	try {
		const mod: any = await import('next-intl/server');
		if (typeof mod.requestLocale === 'function') {
			candidate = await mod.requestLocale();
		}
	} catch {
		// no-op; will fall back to defaultLocale
	}
	const resolvedLocale: Locale = locales.includes(candidate as Locale) ? (candidate as Locale) : defaultLocale;
	return {
		locale: resolvedLocale,
		messages: (await import(`./messages/${resolvedLocale}.json`)).default
	};
});
