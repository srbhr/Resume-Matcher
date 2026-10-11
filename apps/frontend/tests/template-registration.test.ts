import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_OPTIONS,
  applyTemplatePreset,
  settingsToCssVars,
  isTwoColumnTemplate,
  DEFAULT_TEMPLATE_SETTINGS,
  type TemplateType,
  type TemplateSettings,
} from '@/lib/types/template-settings';

describe('template registration', () => {
  it('includes all nine templates with non-empty metadata', () => {
    const ids = TEMPLATE_OPTIONS.map((t) => t.id);
    expect(ids).toEqual(
      expect.arrayContaining<TemplateType>([
        'swiss-single',
        'swiss-two-column',
        'modern',
        'modern-two-column',
        'latex',
        'clean',
        'vivid',
        'vivid-single',
        'modern-deedy',
      ])
    );
    expect(ids).toHaveLength(9);

    for (const opt of TEMPLATE_OPTIONS) {
      expect(opt.name.length).toBeGreaterThan(0);
      expect(opt.description.length).toBeGreaterThan(0);
    }
  });

  it('has unique template ids', () => {
    const ids = TEMPLATE_OPTIONS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });
});

describe('applyTemplatePreset', () => {
  it('seeds signature fonts for single-typeface templates', () => {
    const clean = applyTemplatePreset(DEFAULT_TEMPLATE_SETTINGS, 'clean');
    expect(clean.template).toBe('clean');
    expect(clean.fontSize.headerFont).toBe('sans-serif');
    expect(clean.fontSize.bodyFont).toBe('sans-serif');

    const latex = applyTemplatePreset(DEFAULT_TEMPLATE_SETTINGS, 'latex');
    expect(latex.template).toBe('latex');
    expect(latex.fontSize.headerFont).toBe('serif');
    expect(latex.fontSize.bodyFont).toBe('serif');

    const deedy = applyTemplatePreset(DEFAULT_TEMPLATE_SETTINGS, 'modern-deedy');
    expect(deedy.template).toBe('modern-deedy');
    expect(deedy.fontSize.headerFont).toBe('sans-serif');
    expect(deedy.fontSize.bodyFont).toBe('sans-serif');
  });

  it('leaves fonts untouched for templates without a preset', () => {
    const custom: TemplateSettings = {
      ...DEFAULT_TEMPLATE_SETTINGS,
      fontSize: { ...DEFAULT_TEMPLATE_SETTINGS.fontSize, headerFont: 'mono', bodyFont: 'mono' },
    };
    const modern = applyTemplatePreset(custom, 'modern');
    expect(modern.template).toBe('modern');
    expect(modern.fontSize.headerFont).toBe('mono');
    expect(modern.fontSize.bodyFont).toBe('mono');
  });

  it('preserves unrelated settings when applying a preset', () => {
    const custom: TemplateSettings = {
      ...DEFAULT_TEMPLATE_SETTINGS,
      pageSize: 'LETTER',
      compactMode: true,
    };
    const clean = applyTemplatePreset(custom, 'clean');
    expect(clean.pageSize).toBe('LETTER');
    expect(clean.compactMode).toBe(true);
    expect(clean.margins).toEqual(custom.margins);
  });
});

describe('modern-deedy template', () => {
  const settings = (template: TemplateType, font: 'serif' | 'sans-serif' | 'mono') => ({
    ...DEFAULT_TEMPLATE_SETTINGS,
    template,
    fontSize: { ...DEFAULT_TEMPLATE_SETTINGS.fontSize, headerFont: font, bodyFont: font },
  });
  const fonts = (template: TemplateType, font: 'serif' | 'sans-serif' | 'mono') =>
    settingsToCssVars(settings(template, font), 'en') as Record<string, string>;

  it('is a single-column layout', () => {
    expect(isTwoColumnTemplate('modern-deedy')).toBe(false);
  });

  it('resolves its sans-serif choice to self-hosted Lato, ahead of the sans fallbacks', () => {
    const vars = fonts('modern-deedy', 'sans-serif');
    expect(vars['--body-font']).toMatch(/^var\(--font-lato\), ui-sans-serif/);
    expect(vars['--header-font']).toMatch(/^var\(--font-lato\), ui-sans-serif/);
  });

  it('keeps the Serif and Mono choices live and leaves other templates on the system sans', () => {
    expect(fonts('modern-deedy', 'serif')['--body-font']).not.toContain('--font-lato');
    expect(fonts('modern-deedy', 'mono')['--header-font']).not.toContain('--font-lato');
    expect(fonts('clean', 'sans-serif')['--body-font']).not.toContain('--font-lato');
  });
});
