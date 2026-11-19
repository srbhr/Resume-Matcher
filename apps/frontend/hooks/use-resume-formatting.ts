import { useCallback, useEffect, useRef, useState } from 'react';
import { updateResumeTemplateSettings } from '@/lib/api/resume';
import { FORMATTING_SAVE_DEBOUNCE_MS } from '@/lib/builder/save-schedule';
import { DEFAULT_TEMPLATE_SETTINGS, type TemplateSettings } from '@/lib/types/template-settings';

/**
 * One resume's formatting in the builder: the settings shown, and their save.
 * A change is saved after a short pause, at once when the resume changes, the
 * builder closes or the page is hidden (keepalive), and numbered within this
 * session so a late save can't undo a newer one.
 *
 * @param loaded whether the resume (and so its saved formatting) has loaded;
 *   until then a change is ignored, or it would save the defaults over it.
 */
export function useResumeFormatting(resumeId: string | null, loaded: boolean) {
  // The resume's own formatting, applied when it loads. A resume never formatted
  // keeps the defaults.
  const [templateSettings, setTemplateSettings] =
    useState<TemplateSettings>(DEFAULT_TEMPLATE_SETTINGS);
  const [formattingSaveFailed, setFormattingSaveFailed] = useState(false);
  const pendingFormattingRef = useRef<{
    resumeId: string;
    settings: TemplateSettings;
    order: { session: string; revision: number };
  } | null>(null);
  const formattingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // This builder session's id and save counter (see updateResumeTemplateSettings).
  const formattingSessionRef = useRef<string | null>(null);
  const formattingRevisionRef = useRef(0);

  // Sends right away, also while the page unloads (the request is keepalive). Each save
  // carries the next number in this session, so one that arrives late cannot undo a
  // newer choice from this tab.
  const flushFormattingSave = useCallback(() => {
    if (formattingTimerRef.current) clearTimeout(formattingTimerRef.current);
    formattingTimerRef.current = null;
    const pending = pendingFormattingRef.current;
    pendingFormattingRef.current = null;
    if (!pending) return;
    updateResumeTemplateSettings(pending.resumeId, pending.settings, pending.order).then(
      () => setFormattingSaveFailed(false),
      (error) => {
        console.error('Failed to save resume formatting:', error);
        setFormattingSaveFailed(true);
      }
    );
  }, []);

  // Formatting is saved with the resume, so its view page and PDF match the builder.
  const handleSettingsChange = useCallback(
    (newSettings: TemplateSettings) => {
      // Until the resume (and its saved formatting) has loaded, a change would save
      // the defaults over it.
      if (!loaded) return;
      setTemplateSettings(newSettings);
      if (!resumeId) return;
      formattingSessionRef.current ??= `${Date.now().toString(36)}-${Math.random()
        .toString(36)
        .slice(2, 10)}`;
      pendingFormattingRef.current = {
        resumeId,
        settings: newSettings,
        order: {
          session: formattingSessionRef.current,
          revision: ++formattingRevisionRef.current,
        },
      };
      if (formattingTimerRef.current) clearTimeout(formattingTimerRef.current);
      formattingTimerRef.current = setTimeout(flushFormattingSave, FORMATTING_SAVE_DEBOUNCE_MS);
    },
    [resumeId, loaded, flushFormattingSave]
  );

  // Save pending formatting before switching resumes, leaving the builder, or a
  // refresh or tab close (which skip React cleanup).
  useEffect(() => () => flushFormattingSave(), [resumeId, flushFormattingSave]);
  useEffect(() => {
    const onPageHide = () => flushFormattingSave();
    window.addEventListener('pagehide', onPageHide);
    return () => window.removeEventListener('pagehide', onPageHide);
  }, [flushFormattingSave]);

  /** Show the formatting a resume was saved with (defaults when it has none). */
  const applySavedSettings = useCallback((settings: TemplateSettings | null | undefined) => {
    setTemplateSettings(settings ?? DEFAULT_TEMPLATE_SETTINGS);
    setFormattingSaveFailed(false);
  }, []);

  return { templateSettings, formattingSaveFailed, handleSettingsChange, applySavedSettings };
}
