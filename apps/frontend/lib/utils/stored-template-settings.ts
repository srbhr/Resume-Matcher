import { safeStorage } from '@/lib/utils/resume-draft-storage';
import { DEFAULT_TEMPLATE_SETTINGS, type TemplateSettings } from '@/lib/types/template-settings';

export const TEMPLATE_SETTINGS_STORAGE_KEY = 'resume_builder_settings';

/** Builder template settings persisted in localStorage, merged over defaults. */
export function readStoredTemplateSettings(): TemplateSettings {
  if (typeof window === 'undefined') return DEFAULT_TEMPLATE_SETTINGS;
  try {
    const saved = safeStorage.get(TEMPLATE_SETTINGS_STORAGE_KEY);
    if (saved) {
      const parsed = JSON.parse(saved);
      return {
        ...DEFAULT_TEMPLATE_SETTINGS,
        ...parsed,
        margins: { ...DEFAULT_TEMPLATE_SETTINGS.margins, ...parsed.margins },
        spacing: { ...DEFAULT_TEMPLATE_SETTINGS.spacing, ...parsed.spacing },
        fontSize: { ...DEFAULT_TEMPLATE_SETTINGS.fontSize, ...parsed.fontSize },
      };
    }
  } catch {
    // fall through to defaults
  }
  return DEFAULT_TEMPLATE_SETTINGS;
}
