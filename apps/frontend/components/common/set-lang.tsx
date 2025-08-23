"use client";
import { useEffect } from 'react';
import { usePathname } from 'next/navigation';

/**
 * Sets document.documentElement.lang on the client based on first path segment (locale).
 * This avoids needing to duplicate <html> per locale and keeps SSR default as 'en'.
 */
export default function SetLang() {
  const pathname = usePathname();
  useEffect(() => {
    if (!pathname) return;
    const parts = pathname.split('/').filter(Boolean);
    const maybeLocale = parts[0];
    if (maybeLocale && /^[a-zA-Z-]{2,5}$/.test(maybeLocale)) {
      document.documentElement.lang = maybeLocale;
    }
  }, [pathname]);
  return null;
}
