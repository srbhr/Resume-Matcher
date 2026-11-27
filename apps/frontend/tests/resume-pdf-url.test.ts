import { describe, expect, it } from 'vitest';
import { getResumePdfUrl, toPageFitSettings } from '@/lib/api/resume';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

/** The download URL and page fitting send one set of print settings, built once. */
describe('getResumePdfUrl', () => {
  const query = (url: string) => Object.fromEntries(new URL(url, 'http://x').searchParams);

  it('sends every print setting page fitting sends, as text', () => {
    const settings = {
      ...DEFAULT_TEMPLATE_SETTINGS,
      template: 'modern' as const,
      compactMode: true,
      margins: { top: 12, bottom: 14, left: 16, right: 18 },
      linkStyle: 'text' as const,
      listStyle: { ...DEFAULT_TEMPLATE_SETTINGS.listStyle, awards: 'comma' as const },
    };
    const sent = query(getResumePdfUrl('r1', settings, 'fr'));
    const expected = Object.fromEntries(
      Object.entries(toPageFitSettings(settings, 'fr')).map(([name, value]) => [
        name,
        String(value),
      ])
    );
    expect(sent).toEqual(expected);
    expect(sent).toMatchObject({
      template: 'modern',
      compactMode: 'true',
      marginRight: '18',
      linkStyle: 'text',
      listAwards: 'comma',
      lang: 'fr',
    });
  });

  it('asks for the default template and page size without settings', () => {
    expect(query(getResumePdfUrl('r1'))).toEqual({ template: 'swiss-single', pageSize: 'A4' });
    expect(query(getResumePdfUrl('r1', undefined, 'es'))).toEqual({
      template: 'swiss-single',
      pageSize: 'A4',
      lang: 'es',
    });
  });
});
