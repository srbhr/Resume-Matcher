import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  TEMPLATE_SETTINGS_STORAGE_KEY,
  readStoredTemplateSettings,
} from '@/lib/utils/stored-template-settings';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

beforeEach(() => window.localStorage.clear());
afterEach(() => window.localStorage.clear());

describe('readStoredTemplateSettings', () => {
  it('uses the builder storage key', () => {
    expect(TEMPLATE_SETTINGS_STORAGE_KEY).toBe('resume_builder_settings');
  });

  it('returns defaults when nothing is stored', () => {
    expect(readStoredTemplateSettings()).toEqual(DEFAULT_TEMPLATE_SETTINGS);
  });

  it('merges stored partial settings over defaults, including nested groups', () => {
    window.localStorage.setItem(
      TEMPLATE_SETTINGS_STORAGE_KEY,
      JSON.stringify({ template: 'modern', margins: { top: 20 } })
    );
    const settings = readStoredTemplateSettings();
    expect(settings.template).toBe('modern');
    expect(settings.margins).toEqual({ ...DEFAULT_TEMPLATE_SETTINGS.margins, top: 20 });
    expect(settings.spacing).toEqual(DEFAULT_TEMPLATE_SETTINGS.spacing);
  });

  it('falls back to defaults on corrupt JSON', () => {
    window.localStorage.setItem(TEMPLATE_SETTINGS_STORAGE_KEY, '{not json');
    expect(readStoredTemplateSettings()).toEqual(DEFAULT_TEMPLATE_SETTINGS);
  });
});
