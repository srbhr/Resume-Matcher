import { readFileSync } from 'node:fs';
import path from 'node:path';
import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { locales, type Locale } from '@/i18n/config';
import { useTranslations } from '@/lib/i18n';
import { MESSAGE_LOADERS } from '@/lib/i18n/client-messages';
import fr from '@/messages/fr.json';
import en from '@/messages/en.json';

/**
 * The browser gets English up front and fetches any other UI language when it's
 * picked. All seven locales in the shared chunk cost about 135 KB gzip on every
 * route (2026-11-27 first-load report).
 */

let uiLanguage: Locale = 'en';
vi.mock('@/lib/context/language-context', () => ({
  useLanguage: () => ({ uiLanguage }),
}));

function Label() {
  const { t } = useTranslations();
  return <span>{t('common.save')}</span>;
}

describe('client UI messages', () => {
  it('has English at once, with no load', () => {
    uiLanguage = 'en';
    render(<Label />);

    expect(screen.getByText(en.common.save)).toBeInTheDocument();
  });

  it('shows English until another language arrives, then switches to it', async () => {
    uiLanguage = 'fr';
    expect(fr.common.save).not.toBe(en.common.save);
    render(<Label />);

    expect(screen.getByText(en.common.save)).toBeInTheDocument();
    expect(await screen.findByText(fr.common.save)).toBeInTheDocument();
  });

  it('can load every UI language but English, which is always there', () => {
    expect(Object.keys(MESSAGE_LOADERS).sort()).toEqual(
      locales.filter((locale) => locale !== 'en').sort()
    );
  });

  it('keeps the other languages out of the client bundle: no static imports', () => {
    const read = (file: string) =>
      readFileSync(path.join(__dirname, '..', 'lib', 'i18n', file), 'utf8');
    for (const file of ['client-messages.ts', 'translations.ts']) {
      const source = read(file);
      expect(source).not.toMatch(/^import .* from '@\/messages\/(?!en\.json)/m);
      // The full table in messages.ts is for the server; the client may only take its type.
      expect(source).not.toMatch(/^import (?!type )[^\n]* from '\.\/messages'/m);
    }
  });
});
