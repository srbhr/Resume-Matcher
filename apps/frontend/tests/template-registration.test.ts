import { describe, expect, it } from 'vitest';
import {
  TEMPLATE_OPTIONS,
  applyTemplatePreset,
  DEFAULT_TEMPLATE_SETTINGS,
  type TemplateType,
  type TemplateSettings,
} from '@/lib/types/template-settings';

describe('template registration', () => {
  it('includes all seven templates with non-empty metadata', () => {
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
      ])
    );
    expect(ids).toHaveLength(7);

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
