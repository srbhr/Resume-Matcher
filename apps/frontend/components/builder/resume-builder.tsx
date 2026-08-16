'use client';

import React, { useState, useEffect, Suspense, useCallback, useMemo, useRef } from 'react';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { type ResumeData } from '@/components/dashboard/resume-component';
import { ResumeForm } from './resume-form';
import { FormattingControls } from './formatting-controls';
import { CoverLetterEditor } from './cover-letter-editor';
import { OutreachEditor } from './outreach-editor';
import { CoverLetterPreview } from './cover-letter-preview';
import { OutreachPreview } from './outreach-preview';
import { GeneratePrompt } from './generate-prompt';
import { InterviewPrepView } from './interview-prep-view';
import { Button } from '@/components/ui/button';
import { RetroTabs } from '@/components/ui/retro-tabs';
import { ConfirmDialog, type ConfirmDialogProps } from '@/components/ui/confirm-dialog';
import {
  Download,
  Save,
  AlertTriangle,
  ArrowLeft,
  RotateCcw,
  Copy,
  Check,
  Sparkles,
  Loader2,
} from 'lucide-react';
import {
  useResumePreview,
  type InterviewPrepData,
} from '@/components/common/resume_previewer_context';
import { PaginatedPreview } from '@/components/preview';
import {
  downloadResumePdf,
  downloadCoverLetterPdf,
  getResumePdfUrl,
  getCoverLetterPdfUrl,
  fetchResume,
  updateResume,
  updateCoverLetter,
  updateOutreachMessage,
  generateCoverLetter,
  generateOutreachMessage,
  generateInterviewPrep,
  fetchJobDescription,
} from '@/lib/api/resume';
import { JDComparisonView } from './jd-comparison-view';
import { RegenerateWizard } from './regenerate-wizard';
import { useRegenerateWizard } from '@/hooks/use-regenerate-wizard';
import { useTranslations } from '@/lib/i18n';
import { type TemplateSettings, DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';
import { withLocalizedDefaultSections } from '@/lib/utils/section-helpers';
import { useLanguage } from '@/lib/context/language-context';
import { buildResumeFilename, downloadBlobAsFile, openUrlInNewTab } from '@/lib/utils/download';
import { normalizeResumeForRender, normalizeResumeForSave } from '@/lib/utils/resume-normalization';
import {
  buildResumeDraft,
  getResumeDraftStorageKey,
  LEGACY_RESUME_DRAFT_STORAGE_KEY,
  parseResumeDraft,
  safeStorage,
  shouldPromptForDraftRestore,
  type ResumeDraftEnvelope,
} from '@/lib/utils/resume-draft-storage';
import type { RegenerateItemInput } from '@/lib/api/enrichment';

type TabId = 'resume' | 'cover-letter' | 'outreach' | 'interview-prep' | 'jd-match';
type JobContextStatus = 'idle' | 'loading' | 'available' | 'missing';

const SETTINGS_STORAGE_KEY = 'resume_builder_settings';
const TAB_IDS: TabId[] = ['resume', 'cover-letter', 'outreach', 'interview-prep', 'jd-match'];
const RESUME_AUTOSAVE_DEBOUNCE_MS = 2500;
const RESUME_AUTOSAVE_MAX_WAIT_MS = 12000;
// Floor for the computed delay. Without it, once an unsynced streak exceeds the
// max wait the delay pins to 0 and every keystroke schedules an immediate
// full-document PATCH.
// This floor deliberately wins over the remaining max-wait budget, so a save
// can land up to MIN_DELAY after MAX_WAIT elapses. MAX_WAIT is a target for
// how long edits may stay unsynced, not a hard deadline — dropping the floor
// to honour it exactly is what produced one PATCH per keystroke.
const RESUME_AUTOSAVE_MIN_DELAY_MS = 500;

type Translate = (key: string, params?: Record<string, string | number>) => string;

const getTabFromSearchParams = (searchParams: Pick<URLSearchParams, 'get'>): TabId => {
  const tab = searchParams.get('tab');
  return TAB_IDS.includes(tab as TabId) ? (tab as TabId) : 'resume';
};

const buildInitialData = (t: Translate): ResumeData => ({
  personalInfo: {
    name: t('builder.personalInfoForm.placeholders.name'),
    title: t('builder.personalInfoForm.placeholders.title'),
    email: t('builder.personalInfoForm.placeholders.email'),
    phone: t('builder.personalInfoForm.placeholders.phone'),
    location: t('builder.personalInfoForm.placeholders.location'),
    website: t('builder.personalInfoForm.placeholders.website'),
    linkedin: t('builder.personalInfoForm.placeholders.linkedin'),
    github: t('builder.personalInfoForm.placeholders.github'),
  },
  summary: t('builder.placeholders.summary'),
  workExperience: [],
  education: [],
  personalProjects: [],
  additional: {
    technicalSkills: [],
    languages: [],
    certificationsTraining: [],
    awards: [],
  },
});

type StoredResumeDraft = ResumeDraftEnvelope & { storageKey: string };

const withStorageKey = (
  draft: ResumeDraftEnvelope | null,
  storageKey: string
): StoredResumeDraft | null => {
  return draft ? { ...draft, storageKey } : null;
};

const readStoredResumeDraft = (resumeId: string | null): StoredResumeDraft | null => {
  const scopedKey = getResumeDraftStorageKey(resumeId);
  const scopedDraft = withStorageKey(
    parseResumeDraft(safeStorage.get(scopedKey), resumeId),
    scopedKey
  );
  if (scopedDraft) {
    return scopedDraft;
  }

  const legacyDraft = withStorageKey(
    parseResumeDraft(safeStorage.get(LEGACY_RESUME_DRAFT_STORAGE_KEY), resumeId, Date.now(), {
      allowLegacyPlainData: !resumeId,
    }),
    LEGACY_RESUME_DRAFT_STORAGE_KEY
  );

  return legacyDraft;
};

const writeStoredResumeDraft = (resumeId: string | null, data: ResumeData): void => {
  safeStorage.set(
    getResumeDraftStorageKey(resumeId),
    JSON.stringify(buildResumeDraft(resumeId, data))
  );
};

const clearStoredResumeDraft = (resumeId: string | null): void => {
  // Only clear this resume's own scoped key. Removing the legacy key here too
  // would destroy a pre-upgrade draft for a *different* (new, unsaved) resume,
  // which the read path deliberately only surfaces when there is no resumeId.
  safeStorage.remove(getResumeDraftStorageKey(resumeId));
};

const clearResumeDraftStorageKey = (storageKey: string): void => {
  safeStorage.remove(storageKey);
};

const ResumeBuilderContent = () => {
  const { t } = useTranslations();
  const { uiLanguage, contentLanguage } = useLanguage();
  const [notificationDialog, setNotificationDialog] = useState<{
    title: string;
    description: string;
    variant: NonNullable<ConfirmDialogProps['variant']>;
  } | null>(null);

  const showNotification = useCallback(
    (
      description: string,
      variant: NonNullable<ConfirmDialogProps['variant']> = 'default',
      title?: string
    ) => {
      const fallbackTitle = variant === 'success' ? t('common.success') : t('common.error');
      setNotificationDialog({
        title: title ?? fallbackTitle,
        description,
        variant,
      });
    },
    [t]
  );

  const initialData = useMemo(() => buildInitialData(t), [t]);
  const [resumeData, setResumeData] = useState<ResumeData>(() => initialData);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastSavedData, setLastSavedData] = useState<ResumeData>(() => initialData);
  const [isSaving, setIsSaving] = useState(false);
  const [isAutoSaving, setIsAutoSaving] = useState(false);
  const [autoSaveError, setAutoSaveError] = useState<string | null>(null);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<number | null>(null);
  const [pendingDraftRestore, setPendingDraftRestore] = useState<StoredResumeDraft | null>(null);
  const [showLeaveWithLocalDraftDialog, setShowLeaveWithLocalDraftDialog] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [loadingState, setLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [templateSettings, setTemplateSettings] = useState<TemplateSettings>(() => {
    if (typeof window === 'undefined') return DEFAULT_TEMPLATE_SETTINGS;
    try {
      const saved = safeStorage.get(SETTINGS_STORAGE_KEY);
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
  });
  const { improvedData } = useResumePreview();
  const improvedPreview = improvedData?.data?.resume_preview;
  const improvedCoverLetter = improvedData?.data?.cover_letter;
  const improvedOutreach = improvedData?.data?.outreach_message;
  const improvedInterviewPrep = improvedData?.data?.interview_prep ?? null;
  const searchParams = useSearchParams();
  const router = useRouter();
  const resumeId = searchParams.get('id');
  // Monotonic edit counter. It is deliberately never reset: two savers can be
  // in flight (a queued manual flush behind an autosave), and resetting it to 0
  // on whichever finishes first invalidated the other's captured baseline, so a
  // save that actually succeeded reported failure. "Everything is synced" is
  // now `editVersionRef === syncedVersionRef`, which no other saver can forge.
  const editVersionRef = useRef(0);
  const syncedVersionRef = useRef(0);
  const resumeSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const unsyncedSinceRef = useRef<number | null>(null);

  useEffect(() => {
    if (resumeId || hasUnsavedChanges || improvedPreview) {
      return;
    }
    const savedDraft = readStoredResumeDraft(null);
    if (savedDraft) {
      return;
    }
    setResumeData(initialData);
    setLastSavedData(initialData);
  }, [initialData, resumeId, hasUnsavedChanges, improvedPreview]);

  // Tab state
  const [activeTab, setActiveTab] = useState<TabId>(() => getTabFromSearchParams(searchParams));

  useEffect(() => {
    setActiveTab(getTabFromSearchParams(searchParams));
  }, [searchParams]);

  // Cover letter & outreach state
  const [coverLetter, setCoverLetter] = useState('');
  const [outreachMessage, setOutreachMessage] = useState('');
  const [interviewPrep, setInterviewPrep] = useState<InterviewPrepData | null>(null);
  const [isCoverLetterSaving, setIsCoverLetterSaving] = useState(false);
  const [isOutreachSaving, setIsOutreachSaving] = useState(false);
  const [isCopied, setIsCopied] = useState(false);
  const [resumeTitle, setResumeTitle] = useState<string | null>(null);

  // On-demand generation state
  const [isTailoredResume, setIsTailoredResume] = useState(false);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [isGeneratingOutreach, setIsGeneratingOutreach] = useState(false);
  const [isGeneratingInterviewPrep, setIsGeneratingInterviewPrep] = useState(false);
  const [interviewPrepError, setInterviewPrepError] = useState<string | null>(null);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState<
    'cover-letter' | 'outreach' | 'interview-prep' | null
  >(null);

  // JD comparison state
  const [jobDescription, setJobDescription] = useState<string | null>(null);
  const [jobContextStatus, setJobContextStatus] = useState<JobContextStatus>('idle');

  // AI Regenerate wizard
  const regenerateWizard = useRegenerateWizard({
    resumeId: resumeId || '',
    outputLanguage: contentLanguage,
    onSuccess: async () => {
      // Reload resume data after applying changes
      if (!resumeId) {
        return;
      }

      try {
        const data = await fetchResume(resumeId);
        // Update resume title for downloads
        setResumeTitle(data.title ?? null);
        if (data.processed_resume) {
          setResumeData(data.processed_resume as ResumeData);
          setLastSavedData(data.processed_resume as ResumeData);
          setHasUnsavedChanges(false);
          syncedVersionRef.current = editVersionRef.current;
          unsyncedSinceRef.current = null;
        }
      } catch (error) {
        console.error('Failed to reload resume after applying regenerated changes:', error);
        showNotification(t('builder.alerts.reloadFailed'), 'danger');
        throw error;
      }
    },
    onError: (errorMessage) => {
      if (/network|fetch/i.test(errorMessage) || errorMessage.includes('Failed to fetch')) {
        console.warn('Network error during regeneration or apply:', errorMessage);
        showNotification(t('builder.regenerate.errors.networkError'), 'danger');
        return;
      }

      if (/resume content changed|uniquely matched|please regenerate/i.test(errorMessage)) {
        console.warn('Regenerated changes were based on a stale resume snapshot:', errorMessage);
        showNotification(t('builder.regenerate.errors.resumeChanged'), 'danger');
        return;
      }

      if (/generate/i.test(errorMessage)) {
        console.warn('Generation failed:', errorMessage);
        showNotification(t('builder.regenerate.errors.generationFailed'), 'danger');
        return;
      }

      console.error('Error during regeneration or applying regenerated changes:', errorMessage);
      showNotification(t('builder.regenerate.errors.applyFailed'), 'danger');
    },
  });

  const canonicalResumeDataForPreview = useMemo(
    () => normalizeResumeForRender(resumeData),
    [resumeData]
  );

  // Build regenerate items from canonical resume data so apply checks match the saved snapshot.
  const experienceItemsForRegenerate: RegenerateItemInput[] = useMemo(() => {
    return (canonicalResumeDataForPreview.workExperience || []).map((exp, idx) => ({
      item_id: `exp_${idx}`,
      item_type: 'experience' as const,
      title: exp.title ?? '',
      subtitle: exp.company || undefined,
      current_content: Array.isArray(exp.description) ? exp.description : [],
    }));
  }, [canonicalResumeDataForPreview.workExperience]);

  const projectItemsForRegenerate: RegenerateItemInput[] = useMemo(() => {
    return (canonicalResumeDataForPreview.personalProjects || []).map((proj, idx) => ({
      item_id: `proj_${idx}`,
      item_type: 'project' as const,
      title: proj.name ?? '',
      subtitle: proj.role || undefined,
      current_content: Array.isArray(proj.description) ? proj.description : [],
    }));
  }, [canonicalResumeDataForPreview.personalProjects]);

  const skillsItemForRegenerate: RegenerateItemInput | null = useMemo(() => {
    const skills = canonicalResumeDataForPreview.additional?.technicalSkills;
    if (skills && skills.length > 0) {
      return {
        item_id: 'skills',
        item_type: 'skills' as const,
        title: t('builder.regenerate.selectDialog.skills'),
        current_content: skills,
      };
    }
    return null;
  }, [canonicalResumeDataForPreview.additional?.technicalSkills, t]);
  const localizedResumeDataForPreview = useMemo(
    () => withLocalizedDefaultSections(canonicalResumeDataForPreview, t),
    [canonicalResumeDataForPreview, t]
  );

  // Save template settings to localStorage when they change
  useEffect(() => {
    safeStorage.set(SETTINGS_STORAGE_KEY, JSON.stringify(templateSettings));
  }, [templateSettings]);

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges]);

  useEffect(() => {
    // P0: without this, navigating from resume A to resume B before A's GET
    // resolves lets A's response land under B's id — and because the response
    // also flips loadingState to 'loaded', autosave then writes A's content
    // into B. Every state write below is gated on the effect still being
    // current. (The JD effect below already did this; this one did not.)
    let cancelled = false;

    const loadResumeData = async () => {
      if (cancelled) return;
      setLoadingState('loading');
      setPendingDraftRestore(null);

      // Priority 1: Fetch from API if ID is in URL (most reliable)
      if (resumeId) {
        try {
          const data = await fetchResume(resumeId);
          if (cancelled) return;
          // Track if this is a tailored resume (has parent_id)
          setIsTailoredResume(Boolean(data.parent_id));
          // Store resume title for downloads
          setResumeTitle(data.title ?? null);
          // Load cover letter and outreach message if available
          if (data.cover_letter) {
            setCoverLetter(data.cover_letter);
          }
          if (data.outreach_message) {
            setOutreachMessage(data.outreach_message);
          }
          setInterviewPrep(data.interview_prep ?? null);
          setInterviewPrepError(null);
          // Prefer processed_resume if available
          if (data.processed_resume) {
            const serverData = data.processed_resume as ResumeData;
            const localDraft = readStoredResumeDraft(resumeId);
            setResumeData(serverData);
            setLastSavedData(serverData);
            setHasUnsavedChanges(false);
            syncedVersionRef.current = editVersionRef.current;
            unsyncedSinceRef.current = null;
            setAutoSaveError(null);
            if (shouldPromptForDraftRestore(localDraft, serverData)) {
              setPendingDraftRestore(localDraft);
            } else {
              clearStoredResumeDraft(resumeId);
            }
            setLoadingState('loaded');
            return;
          }
          // Fallback to parsing raw content
          if (data.raw_resume?.content) {
            try {
              const parsed = JSON.parse(data.raw_resume.content);
              const serverData = parsed as ResumeData;
              const localDraft = readStoredResumeDraft(resumeId);
              setResumeData(serverData);
              setLastSavedData(serverData);
              setHasUnsavedChanges(false);
              syncedVersionRef.current = editVersionRef.current;
              unsyncedSinceRef.current = null;
              setAutoSaveError(null);
              if (shouldPromptForDraftRestore(localDraft, serverData)) {
                setPendingDraftRestore(localDraft);
              } else {
                clearStoredResumeDraft(resumeId);
              }
              setLoadingState('loaded');
              return;
            } catch {
              // Raw content is markdown, not JSON
            }
          }
        } catch (err) {
          if (cancelled) return;
          // Do NOT fall through to the localStorage draft restore below. That
          // path sets hasUnsavedChanges=true, which arms autosave and would
          // PATCH a stale draft over a server copy we failed to read and
          // therefore know nothing about. Surface the failure instead.
          console.error('Failed to load resume from API:', err);
          setLoadingState('error');
          return;
        }
      }

      // Priority 2: Improved Data from Context (Tailor Flow)
      if (improvedPreview) {
        setIsTailoredResume(Boolean(improvedData?.data?.resume_id && improvedData.data.job_id));
        setResumeData(improvedPreview);
        setLastSavedData(improvedPreview);
        // Also load cover letter and outreach if present
        if (improvedCoverLetter) {
          setCoverLetter(improvedCoverLetter);
        }
        if (improvedOutreach) {
          setOutreachMessage(improvedOutreach);
        }
        setInterviewPrep(improvedInterviewPrep);
        setInterviewPrepError(null);
        // Persist to localStorage as backup
        writeStoredResumeDraft(resumeId, improvedPreview);
        setLoadingState('loaded');
        return;
      }

      // Priority 3: Restore from localStorage (browser refresh recovery)
      const savedDraft = readStoredResumeDraft(resumeId);
      if (savedDraft) {
        setResumeData(savedDraft.data);
        setLastSavedData(savedDraft.data);
        setHasUnsavedChanges(true); // Mark as unsaved since it's a draft
        editVersionRef.current += 1;
        unsyncedSinceRef.current = Date.now();
        setLoadingState('loaded');
        return;
      }

      // Fallback: Use initial data
      setLoadingState('loaded');
    };

    loadResumeData();

    return () => {
      cancelled = true;
    };
  }, [
    improvedData?.data?.job_id,
    improvedData?.data?.resume_id,
    improvedPreview,
    improvedCoverLetter,
    improvedOutreach,
    improvedInterviewPrep,
    resumeId,
  ]);

  // Fetch job description when we have a tailored resume
  useEffect(() => {
    let cancelled = false;

    const loadJobDescription = async () => {
      if (isTailoredResume && resumeId) {
        setJobDescription(null);
        setJobContextStatus('loading');
        try {
          const data = await fetchJobDescription(resumeId);
          if (!cancelled) {
            setJobDescription(data.content);
            setJobContextStatus('available');
          }
        } catch (err) {
          // JD might not be available for older resumes
          if (!cancelled) {
            console.warn('Could not fetch job description:', err);
            setJobDescription(null);
            setJobContextStatus('missing');
          }
        }
      } else {
        // Clear job description when switching to non-tailored resume
        setJobDescription(null);
        setJobContextStatus('idle');
      }
    };

    loadJobDescription();
    return () => {
      cancelled = true;
    };
  }, [isTailoredResume, resumeId]);

  const handleUpdate = useCallback(
    (newData: ResumeData) => {
      editVersionRef.current += 1;
      unsyncedSinceRef.current ??= Date.now();
      setResumeData(newData);
      setHasUnsavedChanges(true);
      setAutoSaveError(null);
      // Auto-save draft to localStorage
      writeStoredResumeDraft(resumeId, newData);
    },
    [resumeId]
  );

  const handleSettingsChange = useCallback((newSettings: TemplateSettings) => {
    setTemplateSettings(newSettings);
  }, []);

  const queueResumeSave = useCallback(
    (editorData: ResumeData) => {
      if (!resumeId) {
        return Promise.reject(new Error('Resume ID is required to save.'));
      }

      const canonicalPayload = normalizeResumeForSave(editorData);
      const runSave = resumeSaveQueueRef.current
        .catch(() => {
          // Keep the queue alive after a failed save so the next edit can still persist.
        })
        .then(() => updateResume(resumeId, canonicalPayload));

      resumeSaveQueueRef.current = runSave.then(
        () => undefined,
        () => undefined
      );

      return runSave.then((response) => ({ response, canonicalPayload }));
    },
    [resumeId]
  );

  useEffect(() => {
    if (
      !resumeId ||
      // Never PATCH before the server copy has been read. Until then resumeData
      // still holds i18n placeholders, and a full-document replace would
      // overwrite the real resume with them.
      loadingState !== 'loaded' ||
      !hasUnsavedChanges ||
      isSaving ||
      isAutoSaving ||
      autoSaveError ||
      regenerateWizard.step !== 'idle'
    ) {
      return;
    }

    const versionAtSchedule = editVersionRef.current;
    const editorSnapshot = resumeData;
    const elapsedSinceStreakStart = unsyncedSinceRef.current
      ? Date.now() - unsyncedSinceRef.current
      : 0;
    const saveDelay = Math.max(
      RESUME_AUTOSAVE_MIN_DELAY_MS,
      Math.min(RESUME_AUTOSAVE_DEBOUNCE_MS, RESUME_AUTOSAVE_MAX_WAIT_MS - elapsedSinceStreakStart)
    );
    const timerId = window.setTimeout(async () => {
      setIsAutoSaving(true);
      // Restart the max-wait window on EVERY attempt, not only on attempts
      // whose version check happens to match. Otherwise a single edit landing
      // mid-flight leaves this marker set forever, the computed delay pins to
      // its floor, and every subsequent keystroke schedules another PATCH.
      unsyncedSinceRef.current = Date.now();
      try {
        const { response, canonicalPayload } = await queueResumeSave(editorSnapshot);
        // Prefer the server's copy: it may rewrite the payload (e.g. aligning
        // descriptionStyles), and comparing a stale client payload against the
        // server state would surface a spurious draft-recovery prompt on reload.
        setLastSavedData((response?.processed_resume as ResumeData) ?? canonicalPayload);
        setLastAutoSavedAt(Date.now());
        setAutoSaveError(null);

        if (editVersionRef.current === versionAtSchedule) {
          setHasUnsavedChanges(false);
          syncedVersionRef.current = versionAtSchedule;
          unsyncedSinceRef.current = null;
          clearStoredResumeDraft(resumeId);
        }
      } catch (error) {
        console.error('Failed to auto-save resume:', error);
        setAutoSaveError(t('builder.alerts.autoSaveFailed'));
      } finally {
        setIsAutoSaving(false);
      }
    }, saveDelay);

    return () => window.clearTimeout(timerId);
  }, [
    autoSaveError,
    hasUnsavedChanges,
    isAutoSaving,
    isSaving,
    loadingState,
    queueResumeSave,
    regenerateWizard.step,
    resumeData,
    resumeId,
    t,
  ]);

  const flushResumeChanges = useCallback(
    async (showErrorDialog = true): Promise<boolean> => {
      if (!resumeId || (!hasUnsavedChanges && !autoSaveError)) {
        return true;
      }

      // Same guard as the autosave effect. Gating only autosave left the
      // manual Save button able to issue the identical destructive
      // full-document PATCH while the initial fetch was still in flight,
      // replacing a real resume with i18n placeholders.
      if (loadingState !== 'loaded') {
        return false;
      }

      try {
        setIsSaving(true);
        const versionAtFlush = editVersionRef.current;
        const editorSnapshot = resumeData;
        const { response, canonicalPayload } = await queueResumeSave(editorSnapshot);
        setLastSavedData((response?.processed_resume as ResumeData) ?? canonicalPayload);
        setAutoSaveError(null);

        // Compare against syncedVersionRef, not a zeroed counter: an autosave
        // completing ahead of this queued save used to reset the baseline and
        // make a successful PATCH look like a failure to the caller.
        syncedVersionRef.current = Math.max(syncedVersionRef.current, versionAtFlush);
        if (editVersionRef.current === syncedVersionRef.current) {
          setHasUnsavedChanges(false);
          unsyncedSinceRef.current = null;
          setLastAutoSavedAt(Date.now());
          clearStoredResumeDraft(resumeId);
          return true;
        }

        return false;
      } catch (error) {
        console.error('Failed to save resume:', error);
        setAutoSaveError(t('builder.alerts.autoSaveFailed'));
        if (showErrorDialog) {
          showNotification(t('builder.alerts.saveFailed'), 'danger');
        }
        return false;
      } finally {
        setIsSaving(false);
      }
    },
    [
      autoSaveError,
      hasUnsavedChanges,
      loadingState,
      queueResumeSave,
      resumeData,
      resumeId,
      showNotification,
      t,
    ]
  );

  const handleSave = async () => {
    if (!resumeId) {
      showNotification(t('builder.alerts.saveNotAvailable'), 'warning');
      return;
    }
    await flushResumeChanges(true);
  };

  const handleReset = () => {
    const saveInFlight = isSaving || isAutoSaving;
    setResumeData(lastSavedData);

    // Bump the version so any save already in flight cannot claim the reset
    // state as synced when it lands — its captured baseline is now stale.
    editVersionRef.current += 1;

    if (saveInFlight) {
      // That in-flight PATCH is carrying the edits we just discarded, so the
      // server is about to hold content the editor no longer shows. Stay dirty
      // and let autosave push the reset state, converging the two. Marking this
      // clean is what left the discarded text on the server silently.
      setHasUnsavedChanges(true);
      unsyncedSinceRef.current = Date.now();
      writeStoredResumeDraft(resumeId, lastSavedData);
    } else {
      setHasUnsavedChanges(false);
      syncedVersionRef.current = editVersionRef.current;
      unsyncedSinceRef.current = null;
      clearStoredResumeDraft(resumeId);
    }

    setAutoSaveError(null);
  };

  const handleRestoreLocalDraft = () => {
    if (!pendingDraftRestore) return;
    editVersionRef.current += 1;
    unsyncedSinceRef.current = Date.now();
    setResumeData(pendingDraftRestore.data);
    setHasUnsavedChanges(true);
    setAutoSaveError(null);
    writeStoredResumeDraft(resumeId, pendingDraftRestore.data);
    if (pendingDraftRestore.storageKey !== getResumeDraftStorageKey(resumeId)) {
      clearResumeDraftStorageKey(pendingDraftRestore.storageKey);
    }
    setPendingDraftRestore(null);
  };

  const handleKeepServerDraft = () => {
    if (pendingDraftRestore) {
      clearResumeDraftStorageKey(pendingDraftRestore.storageKey);
    } else {
      clearStoredResumeDraft(resumeId);
    }
    setPendingDraftRestore(null);
  };

  const getCompanyFromTitle = (title: string | null | undefined): string | null => {
    if (!title) return null;
    const atIdx = title.lastIndexOf(' @ ');
    return atIdx !== -1 ? title.substring(atIdx + 3).trim() : null;
  };

  const handleBackToDashboard = async () => {
    const didSave = await flushResumeChanges(true);
    if (didSave) {
      router.push('/dashboard');
    } else {
      setShowLeaveWithLocalDraftDialog(true);
    }
  };

  const handleLeaveWithLocalDraft = () => {
    setShowLeaveWithLocalDraftDialog(false);
    router.push('/dashboard');
  };

  const handleStartRegenerate = async () => {
    const didSave = await flushResumeChanges(true);
    if (didSave) {
      regenerateWizard.startRegenerate();
    }
  };

  const handleDownload = async () => {
    if (!resumeId) {
      showNotification(t('builder.alerts.downloadNotAvailable'), 'warning');
      return;
    }
    const didSave = await flushResumeChanges(true);
    if (!didSave) {
      return;
    }
    try {
      setIsDownloading(true);
      const blob = await downloadResumePdf(resumeId, templateSettings, uiLanguage);
      const company = getCompanyFromTitle(resumeTitle);
      const userName = resumeData.personalInfo?.name?.trim() || null;
      const filename = buildResumeFilename(userName, company, resumeId, 'resume');
      downloadBlobAsFile(blob, filename);
      showNotification(t('builder.alerts.downloadSuccess'), 'success');
    } catch (error) {
      console.error('Failed to download resume:', error);
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        const fallbackUrl = getResumePdfUrl(resumeId, templateSettings, uiLanguage);
        const didOpen = openUrlInNewTab(fallbackUrl);
        if (!didOpen) {
          showNotification(t('common.popupBlocked', { url: fallbackUrl }), 'warning');
        }
        return;
      }
      let errorMessage = t('builder.alerts.downloadFailed');
      if (error instanceof Error && error.message) {
        errorMessage = `${t('builder.alerts.downloadFailed')}: ${error.message}`;
      }
      showNotification(errorMessage, 'danger');
    } finally {
      setIsDownloading(false);
    }
  };

  // Cover letter handlers
  const handleSaveCoverLetter = async () => {
    if (!resumeId) return;
    try {
      setIsCoverLetterSaving(true);
      await updateCoverLetter(resumeId, coverLetter);
      showNotification(t('builder.alerts.coverLetterSaveSuccess'), 'success');
    } catch (error) {
      console.error('Failed to save cover letter:', error);
      showNotification(t('builder.alerts.coverLetterSaveFailed'), 'danger');
    } finally {
      setIsCoverLetterSaving(false);
    }
  };

  const handleDownloadCoverLetter = async () => {
    if (!resumeId) {
      showNotification(t('builder.alerts.coverLetterDownloadRequiresResume'), 'warning');
      return;
    }
    if (!coverLetter) {
      showNotification(t('builder.alerts.coverLetterMissing'), 'warning');
      return;
    }
    try {
      setIsDownloading(true);
      const blob = await downloadCoverLetterPdf(resumeId, templateSettings.pageSize, uiLanguage);
      const company = getCompanyFromTitle(resumeTitle);
      const userName = resumeData.personalInfo?.name?.trim() || null;
      const filename = buildResumeFilename(userName, company, resumeId, 'cover-letter');
      downloadBlobAsFile(blob, filename);
    } catch (error) {
      console.error('Failed to download cover letter:', error);
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        const fallbackUrl = getCoverLetterPdfUrl(resumeId, templateSettings.pageSize, uiLanguage);
        const didOpen = openUrlInNewTab(fallbackUrl);
        if (!didOpen) {
          showNotification(t('common.popupBlocked', { url: fallbackUrl }), 'warning');
        }
        return;
      }
      const errorMessage = error instanceof Error ? error.message : t('common.unknown');
      showNotification(
        t('builder.alerts.coverLetterDownloadFailed', { error: errorMessage }),
        'danger'
      );
    } finally {
      setIsDownloading(false);
    }
  };

  // Outreach handlers
  const handleSaveOutreach = async () => {
    if (!resumeId) return;
    try {
      setIsOutreachSaving(true);
      await updateOutreachMessage(resumeId, outreachMessage);
      showNotification(t('builder.alerts.outreachSaveSuccess'), 'success');
    } catch (error) {
      console.error('Failed to save outreach message:', error);
      showNotification(t('builder.alerts.outreachSaveFailed'), 'danger');
    } finally {
      setIsOutreachSaving(false);
    }
  };

  const handleCopyOutreach = async () => {
    try {
      await navigator.clipboard.writeText(outreachMessage);
      setIsCopied(true);
      setTimeout(() => setIsCopied(false), 2000);
    } catch (error) {
      console.error('Failed to copy:', error);
    }
  };

  // On-demand generation handlers
  const doGenerateCoverLetter = async () => {
    if (!resumeId) return;
    setIsGeneratingCoverLetter(true);
    setShowRegenerateDialog(null);
    try {
      const content = await generateCoverLetter(resumeId);
      setCoverLetter(content);
    } catch (error) {
      console.error('Failed to generate cover letter:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showNotification(
        t('builder.alerts.coverLetterGenerateFailed', { error: errorMessage }),
        'danger'
      );
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

  const handleGenerateCoverLetter = () => {
    if (!resumeId) return;
    // If content exists, show confirmation dialog
    if (coverLetter) {
      setShowRegenerateDialog('cover-letter');
      return;
    }
    doGenerateCoverLetter();
  };

  const doGenerateOutreach = async () => {
    if (!resumeId) return;
    setIsGeneratingOutreach(true);
    setShowRegenerateDialog(null);
    try {
      const content = await generateOutreachMessage(resumeId);
      setOutreachMessage(content);
    } catch (error) {
      console.error('Failed to generate outreach message:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showNotification(
        t('builder.alerts.outreachGenerateFailed', { error: errorMessage }),
        'danger'
      );
    } finally {
      setIsGeneratingOutreach(false);
    }
  };

  const handleGenerateOutreach = () => {
    if (!resumeId) return;
    // If content exists, show confirmation dialog
    if (outreachMessage) {
      setShowRegenerateDialog('outreach');
      return;
    }
    doGenerateOutreach();
  };

  const canGenerateInterviewPrep =
    Boolean(resumeId) && isTailoredResume && jobContextStatus === 'available';

  const interviewPrepUnavailableMessage = !resumeId
    ? t('interviewPrep.saveRequiredDescription')
    : jobContextStatus === 'loading'
      ? t('interviewPrep.loadingContextDescription')
      : jobContextStatus === 'missing'
        ? t('interviewPrep.missingContextDescription')
        : null;

  const doGenerateInterviewPrep = async () => {
    if (!canGenerateInterviewPrep || !resumeId) return;
    setIsGeneratingInterviewPrep(true);
    setInterviewPrepError(null);
    setShowRegenerateDialog(null);
    try {
      const content = await generateInterviewPrep(resumeId);
      setInterviewPrep(content);
    } catch (error) {
      console.error('Failed to generate interview preparation:', error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      setInterviewPrepError(
        t('builder.alerts.interviewPrepGenerateFailed', { error: errorMessage })
      );
      showNotification(
        t('builder.alerts.interviewPrepGenerateFailed', { error: errorMessage }),
        'danger'
      );
    } finally {
      setIsGeneratingInterviewPrep(false);
    }
  };

  const handleGenerateInterviewPrep = () => {
    if (!canGenerateInterviewPrep) return;
    if (interviewPrep) {
      setShowRegenerateDialog('interview-prep');
      return;
    }
    doGenerateInterviewPrep();
  };

  const regenerateDialogContentTitle =
    showRegenerateDialog === 'cover-letter'
      ? t('coverLetter.title')
      : showRegenerateDialog === 'outreach'
        ? t('outreach.title')
        : t('interviewPrep.title');

  const regenerateDialogConfirmLabel =
    showRegenerateDialog === 'cover-letter'
      ? t('coverLetter.regenerate')
      : showRegenerateDialog === 'outreach'
        ? t('outreach.regenerate')
        : t('interviewPrep.regenerate');

  const handleConfirmRegenerate = () => {
    if (showRegenerateDialog === 'cover-letter') {
      doGenerateCoverLetter();
    } else if (showRegenerateDialog === 'outreach') {
      doGenerateOutreach();
    } else if (showRegenerateDialog === 'interview-prep') {
      doGenerateInterviewPrep();
    }
  };

  const resumeSaveStatus = (() => {
    if (isSaving || isAutoSaving) {
      return { label: t('builder.autoSave.saving'), tone: 'blue' as const };
    }
    if (autoSaveError) {
      return { label: autoSaveError, tone: 'red' as const };
    }
    if (hasUnsavedChanges) {
      return { label: t('builder.autoSave.localDraft'), tone: 'amber' as const };
    }
    if (resumeId && lastAutoSavedAt) {
      return { label: t('builder.autoSave.saved'), tone: 'green' as const };
    }
    return null;
  })();

  // Swiss tokens rather than raw Tailwind palette classes, matching the tone
  // set used by StatCard in diff-preview-modal.tsx (L-09).
  const resumeSaveStatusStyles = {
    amber: 'border-warning bg-[#FFF7ED] text-warning',
    blue: 'border-primary bg-[#EFF6FF] text-primary',
    green: 'border-success bg-[#F0FDF4] text-success',
    red: 'border-destructive bg-[#FEF2F2] text-destructive',
  };
  const ResumeSaveStatusIcon = resumeSaveStatus?.tone === 'green' ? Check : AlertTriangle;

  return (
    <div className="h-screen w-full bg-background flex justify-center items-center p-4 md:p-8">
      {/* Main Container */}
      <div className="w-full h-full max-w-[90%] md:max-w-[95%] xl:max-w-[1800px] border border-black bg-background shadow-sw-lg flex flex-col">
        {/* Header Section */}
        <div className="border-b border-black p-6 md:p-8 bg-background no-print">
          {/* Top Row: Back button and Actions */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <Button variant="link" onClick={handleBackToDashboard} className="mb-2 -ml-1">
                <ArrowLeft className="w-4 h-4" />
                {t('nav.backToDashboard')}
              </Button>
              <h1 className="font-serif text-3xl md:text-5xl text-black tracking-tight leading-[0.95] uppercase">
                {t('nav.builder')}
              </h1>
              <div className="mt-3 flex items-center gap-3">
                <p className="text-sm font-mono text-blue-700 uppercase tracking-wide font-bold">
                  {'// '}
                  {resumeId ? t('builder.editMode') : t('builder.createAndPreview')}
                </p>
                {resumeSaveStatus && (
                  <span
                    className={`flex items-center gap-1 text-xs font-mono px-2 py-1 border ${resumeSaveStatusStyles[resumeSaveStatus.tone]}`}
                  >
                    <ResumeSaveStatusIcon className="w-3 h-3" />
                    {resumeSaveStatus.label}
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-4 md:mt-0">
              {/* Resume tab actions */}
              {activeTab === 'resume' && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleStartRegenerate}
                    disabled={!resumeId || isSaving}
                  >
                    <Sparkles className="w-4 h-4" />
                    {t('builder.regenerate.buttonLabel')}
                  </Button>
                  <Button
                    variant="warning"
                    size="sm"
                    onClick={handleReset}
                    disabled={!hasUnsavedChanges}
                  >
                    <RotateCcw className="w-4 h-4" />
                    {t('common.reset')}
                  </Button>
                  <Button
                    size="sm"
                    onClick={handleSave}
                    disabled={!resumeId || isSaving || loadingState !== 'loaded'}
                  >
                    <Save className="w-4 h-4" />
                    {isSaving
                      ? t('common.saving')
                      : autoSaveError
                        ? t('builder.autoSave.retrySave')
                        : hasUnsavedChanges
                          ? t('builder.autoSave.saveNow')
                          : t('builder.autoSave.savedButton')}
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={handleDownload}
                    disabled={!resumeId || isDownloading}
                  >
                    <Download className="w-4 h-4" />
                    {isDownloading ? t('common.generating') : t('common.download')}
                  </Button>
                </>
              )}

              {/* Cover letter tab actions */}
              {activeTab === 'cover-letter' && coverLetter && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateCoverLetter}
                    disabled={isGeneratingCoverLetter}
                  >
                    {isGeneratingCoverLetter ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {t('coverLetter.regenerate')}
                  </Button>
                  <Button
                    variant="success"
                    size="sm"
                    onClick={handleDownloadCoverLetter}
                    disabled={!resumeId || isDownloading}
                  >
                    <Download className="w-4 h-4" />
                    {isDownloading ? t('common.generating') : t('common.download')}
                  </Button>
                </>
              )}

              {/* Outreach tab actions */}
              {activeTab === 'outreach' && outreachMessage && (
                <>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={handleGenerateOutreach}
                    disabled={isGeneratingOutreach}
                  >
                    {isGeneratingOutreach ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Sparkles className="w-4 h-4" />
                    )}
                    {t('outreach.regenerate')}
                  </Button>
                  <Button variant="success" size="sm" onClick={handleCopyOutreach}>
                    {isCopied ? (
                      <>
                        <Check className="w-4 h-4" />
                        {t('outreach.copied')}
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        {t('outreach.copyToClipboard')}
                      </>
                    )}
                  </Button>
                </>
              )}

              {/* Interview prep tab actions */}
              {activeTab === 'interview-prep' && interviewPrep && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleGenerateInterviewPrep}
                  disabled={!canGenerateInterviewPrep || isGeneratingInterviewPrep}
                >
                  {isGeneratingInterviewPrep ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Sparkles className="w-4 h-4" />
                  )}
                  {t('interviewPrep.regenerate')}
                </Button>
              )}
            </div>
          </div>
        </div>

        {/* Content Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 bg-black gap-[1px] flex-1 min-h-0">
          {/* Left Panel: Editor */}
          <div className="bg-background p-6 md:p-8 overflow-y-auto no-print">
            <div className="max-w-3xl mx-auto space-y-6">
              <div className="flex items-center gap-2 border-b-2 border-black pb-2">
                <div className="w-3 h-3 bg-blue-700"></div>
                <h2 className="font-mono text-lg font-bold uppercase tracking-wider">
                  {activeTab === 'resume' && t('builder.leftPanel.editorPanel')}
                  {activeTab === 'cover-letter' && t('builder.leftPanel.coverLetterEditor')}
                  {activeTab === 'outreach' && t('builder.leftPanel.outreachEditor')}
                  {activeTab === 'interview-prep' && t('builder.leftPanel.interviewPrep')}
                  {activeTab === 'jd-match' && t('builder.leftPanel.jdMatchAnalysis')}
                </h2>
              </div>

              {/* Resume Editor */}
              {activeTab === 'resume' &&
                (loadingState === 'error' ? (
                  <div
                    role="alert"
                    className="border border-destructive bg-[#FEF2F2] p-4 font-mono text-xs text-destructive"
                  >
                    {t('builder.alerts.loadFailed')}
                  </div>
                ) : (
                  <>
                    <FormattingControls
                      settings={templateSettings}
                      onChange={handleSettingsChange}
                    />
                    <ResumeForm resumeData={resumeData} onUpdate={handleUpdate} />
                  </>
                ))}

              {/* Cover Letter Editor */}
              {activeTab === 'cover-letter' &&
                (coverLetter ? (
                  <CoverLetterEditor
                    content={coverLetter}
                    onChange={setCoverLetter}
                    onSave={handleSaveCoverLetter}
                    isSaving={isCoverLetterSaving}
                  />
                ) : (
                  <GeneratePrompt
                    type="cover-letter"
                    isGenerating={isGeneratingCoverLetter}
                    onGenerate={handleGenerateCoverLetter}
                    isTailoredResume={isTailoredResume}
                  />
                ))}

              {/* Outreach Editor */}
              {activeTab === 'outreach' &&
                (outreachMessage ? (
                  <OutreachEditor
                    content={outreachMessage}
                    onChange={setOutreachMessage}
                    onSave={handleSaveOutreach}
                    isSaving={isOutreachSaving}
                  />
                ) : (
                  <GeneratePrompt
                    type="outreach"
                    isGenerating={isGeneratingOutreach}
                    onGenerate={handleGenerateOutreach}
                    isTailoredResume={isTailoredResume}
                  />
                ))}

              {/* Interview Prep Read-Only View */}
              {activeTab === 'interview-prep' && (
                <InterviewPrepView
                  interviewPrep={interviewPrep}
                  isGenerating={isGeneratingInterviewPrep}
                  error={interviewPrepError}
                  onGenerate={handleGenerateInterviewPrep}
                  isTailoredResume={isTailoredResume}
                  canGenerate={canGenerateInterviewPrep}
                  unavailableMessage={interviewPrepUnavailableMessage}
                  className="p-0"
                />
              )}

              {/* JD Match Info Panel */}
              {activeTab === 'jd-match' && (
                <div className="space-y-4">
                  <div className="border-2 border-black bg-white p-4">
                    <h3 className="font-mono text-sm font-bold uppercase mb-2">
                      {t('builder.jdMatch.aboutTitle')}
                    </h3>
                    <p className="text-sm text-ink-soft leading-relaxed">
                      {t('builder.jdMatch.aboutDescription')}
                    </p>
                  </div>

                  <div className="border-2 border-black bg-background p-4">
                    <h3 className="font-mono text-sm font-bold uppercase mb-2">
                      {t('builder.jdMatch.highlightedKeywordsTitle')}
                    </h3>
                    <p className="text-sm text-ink-soft leading-relaxed">
                      {(() => {
                        const template = t(
                          'builder.jdMatch.highlightedKeywordsDescriptionTemplate'
                        );
                        const parts = template.split('__COLOR__');
                        if (parts.length < 2) return template;
                        return (
                          <>
                            {parts[0]}
                            <mark className="bg-yellow-200 px-1">
                              {t('builder.jdMatch.highlightColor')}
                            </mark>
                            {parts.slice(1).join('__COLOR__')}
                          </>
                        );
                      })()}
                    </p>
                  </div>

                  <div className="border-2 border-black bg-white p-4">
                    <h3 className="font-mono text-sm font-bold uppercase mb-2">
                      {t('builder.jdMatch.tipsTitle')}
                    </h3>
                    <ul className="text-sm text-ink-soft space-y-1 list-disc list-inside">
                      <li>{t('builder.jdMatch.tips.items.addMissingKeywords')}</li>
                      <li>{t('builder.jdMatch.tips.items.focusTechnicalSkills')}</li>
                      <li>{t('builder.jdMatch.tips.items.matchActionVerbs')}</li>
                    </ul>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Right Panel: Preview with Tabs */}
          <div className="bg-secondary overflow-hidden flex flex-col no-print">
            {/* Tabs Header */}
            <div className="px-6 pt-3 shrink-0 bg-secondary">
              <RetroTabs
                tabs={[
                  { id: 'resume', label: t('builder.previewTabs.resume') },
                  {
                    id: 'cover-letter',
                    label: t('builder.previewTabs.coverLetter'),
                    disabled: !coverLetter,
                  },
                  {
                    id: 'outreach',
                    label: t('builder.previewTabs.outreach'),
                    disabled: !outreachMessage,
                  },
                  {
                    id: 'interview-prep',
                    label: t('builder.previewTabs.interviewPrep'),
                    disabled: !isTailoredResume,
                  },
                  {
                    id: 'jd-match',
                    label: t('builder.previewTabs.jdMatch'),
                    disabled: !jobDescription,
                  },
                ]}
                activeTab={activeTab}
                onTabChange={(id) => setActiveTab(id as TabId)}
              />
            </div>

            {/* Preview Content */}
            <div className="flex-1 overflow-y-auto">
              {/* Resume Preview */}
              {activeTab === 'resume' && (
                <PaginatedPreview
                  resumeData={localizedResumeDataForPreview}
                  settings={templateSettings}
                />
              )}

              {/* Cover Letter Preview */}
              {activeTab === 'cover-letter' &&
                (coverLetter && resumeData.personalInfo ? (
                  <div className="p-6">
                    <CoverLetterPreview
                      content={coverLetter}
                      personalInfo={resumeData.personalInfo}
                      pageSize={templateSettings.pageSize}
                    />
                  </div>
                ) : (
                  <GeneratePrompt
                    type="cover-letter"
                    isGenerating={isGeneratingCoverLetter}
                    onGenerate={handleGenerateCoverLetter}
                    isTailoredResume={isTailoredResume}
                  />
                ))}

              {/* Outreach Preview */}
              {activeTab === 'outreach' &&
                (outreachMessage ? (
                  <div className="p-6">
                    <OutreachPreview content={outreachMessage} />
                  </div>
                ) : (
                  <GeneratePrompt
                    type="outreach"
                    isGenerating={isGeneratingOutreach}
                    onGenerate={handleGenerateOutreach}
                    isTailoredResume={isTailoredResume}
                  />
                ))}

              {/* Interview Prep Preview */}
              {activeTab === 'interview-prep' && (
                <InterviewPrepView
                  interviewPrep={interviewPrep}
                  isGenerating={isGeneratingInterviewPrep}
                  error={interviewPrepError}
                  onGenerate={handleGenerateInterviewPrep}
                  isTailoredResume={isTailoredResume}
                  canGenerate={canGenerateInterviewPrep}
                  unavailableMessage={interviewPrepUnavailableMessage}
                />
              )}

              {/* JD Match Comparison */}
              {activeTab === 'jd-match' && jobDescription && (
                <JDComparisonView jobDescription={jobDescription} resumeData={resumeData} />
              )}
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 bg-background flex justify-between items-center font-mono text-xs text-blue-700 border-t border-black no-print">
          <span className="uppercase font-bold flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Resume Matcher"
              width={20}
              height={20}
              className="w-5 h-5"
            />
            {t('builder.footer.moduleLabel')}
          </span>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 bg-green-700"></div>
              <span className="uppercase">
                {templateSettings.template === 'swiss-single' ||
                templateSettings.template === 'modern' ||
                templateSettings.template === 'latex' ||
                templateSettings.template === 'clean'
                  ? t('builder.footer.singleColumn')
                  : t('builder.footer.twoColumn')}
              </span>
            </div>
            <span className="text-steel-grey">|</span>
            <span className="uppercase">
              {templateSettings.pageSize === 'A4' ? 'A4' : t('builder.pageSize.usLetter')}
            </span>
          </div>
        </div>
      </div>

      {/* Regenerate Confirmation Dialog */}
      <ConfirmDialog
        open={showRegenerateDialog !== null}
        onOpenChange={(open) => !open && setShowRegenerateDialog(null)}
        title={t('builder.regenerateDialog.title', {
          title: regenerateDialogContentTitle,
        })}
        description={t('builder.regenerateDialog.description', {
          title: regenerateDialogContentTitle,
        })}
        confirmLabel={regenerateDialogConfirmLabel}
        cancelLabel={t('common.cancel')}
        variant="warning"
        onConfirm={handleConfirmRegenerate}
      />

      {/* Local Draft Recovery Dialog */}
      <ConfirmDialog
        open={pendingDraftRestore !== null}
        onOpenChange={() => undefined}
        title={t('builder.draftRecovery.title')}
        description={t('builder.draftRecovery.description')}
        confirmLabel={t('builder.draftRecovery.restoreDraft')}
        cancelLabel={t('builder.draftRecovery.useServer')}
        variant="warning"
        closeOnConfirm={false}
        onConfirm={handleRestoreLocalDraft}
        onCancel={handleKeepServerDraft}
      />

      {/* Leave With Local Draft Dialog */}
      <ConfirmDialog
        open={showLeaveWithLocalDraftDialog}
        onOpenChange={setShowLeaveWithLocalDraftDialog}
        title={t('builder.leaveWithLocalDraft.title')}
        description={t('builder.leaveWithLocalDraft.description')}
        confirmLabel={t('builder.leaveWithLocalDraft.leave')}
        cancelLabel={t('builder.leaveWithLocalDraft.stay')}
        variant="warning"
        onConfirm={handleLeaveWithLocalDraft}
      />

      {/* Notification Dialog (replaces native alert()) */}
      <ConfirmDialog
        open={notificationDialog !== null}
        onOpenChange={(open) => !open && setNotificationDialog(null)}
        title={notificationDialog?.title ?? ''}
        description={notificationDialog?.description ?? ''}
        confirmLabel={t('common.ok')}
        showCancelButton={false}
        variant={notificationDialog?.variant ?? 'default'}
        onConfirm={() => setNotificationDialog(null)}
      />

      {/* AI Regenerate Wizard */}
      <RegenerateWizard
        step={regenerateWizard.step}
        onStepChange={regenerateWizard.setStep}
        experienceItems={experienceItemsForRegenerate}
        projectItems={projectItemsForRegenerate}
        skillsItem={skillsItemForRegenerate}
        selectedItems={regenerateWizard.selectedItems}
        onSelectionChange={regenerateWizard.setSelectedItems}
        instruction={regenerateWizard.instruction}
        onInstructionChange={regenerateWizard.setInstruction}
        regeneratedItems={regenerateWizard.regeneratedItems}
        regenerateErrors={regenerateWizard.regenerateErrors}
        isGenerating={regenerateWizard.isGenerating}
        isApplying={regenerateWizard.isApplying}
        error={regenerateWizard.error}
        onGenerate={regenerateWizard.generate}
        onAccept={regenerateWizard.acceptChanges}
        onReject={regenerateWizard.rejectAndRegenerate}
        onClose={regenerateWizard.reset}
      />
    </div>
  );
};

export const ResumeBuilder = () => {
  const { t } = useTranslations();
  return (
    <Suspense fallback={<div>{t('common.loading')}</div>}>
      <ResumeBuilderContent />
    </Suspense>
  );
};
