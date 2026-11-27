'use client';

import { useState, useEffect, Suspense, useCallback, useMemo, useRef } from 'react';
import { useSearchParams, useRouter } from 'next/navigation';
import dynamic from 'next/dynamic';
import { type ResumeData } from '@/components/dashboard/resume-component';
import { ResumePhotoField } from './forms/resume-photo-field';
import { FormattingControls } from './formatting-controls';
import { GeneratePrompt } from './generate-prompt';
import { CommunityLinks } from '@/components/common/community-links';
import { Button } from '@/components/ui/button';
import { RetroTabs } from '@/components/ui/retro-tabs';
import { PageHeader } from '@/components/ui/page-header';
import { PanelHeader } from '@/components/ui/panel-header';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { EmptyState } from '@/components/ui/empty-state';
import { Alert } from '@/components/ui/alert';
import { ConfirmDialog, type ConfirmDialogProps } from '@/components/ui/confirm-dialog';
import { toast } from '@/components/ui/toast';
import {
  DownloadSimple,
  FloppyDisk,
  ArrowLeft,
  ArrowCounterClockwise,
  SpinnerGap,
} from '@phosphor-icons/react';
import {
  useResumePreview,
  type InterviewPrepData,
} from '@/components/common/resume_previewer_context';
import { PaginatedPreview } from '@/components/preview';
import { SplitPanes } from './split-panes';
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
} from '@/lib/api/resume';
import { useRegenerateWizard } from '@/hooks/use-regenerate-wizard';
import { useResumeFormatting } from '@/hooks/use-resume-formatting';
import { useJobContext } from '@/hooks/use-job-context';
import { useResumePhoto } from '@/hooks/use-resume-photo';
import { useTranslations } from '@/lib/i18n';
import { withLocalizedDefaultSections } from '@/lib/utils/section-helpers';
import { useLanguage } from '@/lib/context/language-context';
import { buildResumeFilename, downloadBlobAsFile, openUrlInNewTab } from '@/lib/utils/download';
import { normalizeResumeForRender, normalizeResumeForSave } from '@/lib/utils/resume-normalization';
import {
  clearResumeDraftStorageKey,
  clearStoredResumeDraft,
  getResumeDraftStorageKey,
  isResumeDataShape,
  isSameResumeData,
  readStoredResumeDraft,
  shouldPromptForDraftRestore,
  writeStoredResumeDraft,
  type StoredResumeDraft,
} from '@/lib/utils/resume-draft-storage';
import { nextSaveDelay } from '@/lib/builder/save-schedule';
import {
  initialResumeSync,
  resumeSync,
  type ResumeSyncEvent,
  type ResumeSyncState,
} from '@/lib/builder/resume-sync';
import {
  attachmentSync,
  initialAttachment,
  type AttachmentEvent,
  type AttachmentPart,
  type AttachmentState,
} from '@/lib/builder/attachment-sync';
import {
  experienceRegenerateItems,
  projectRegenerateItems,
  skillsRegenerateItem,
} from '@/lib/builder/regenerate-items';
import {
  agentVersionOf,
  trackOwnWrite,
  type AgentPart,
  type OwnWrites,
  type ServerResume,
} from '@/lib/builder/agent-sync';
import { AgentPromptDialog, type AgentTask } from '@/components/agent/agent-prompt-dialog';
import { useAgentRefresh } from '@/hooks/use-agent-refresh';
import { clearResumeWizardCompletion } from '@/lib/utils/resume-wizard-storage';
import {
  clearAttachmentDraft,
  readAttachmentDraft,
  writeAttachmentDraft,
  type AttachmentDraftEnvelope,
} from '@/lib/utils/attachment-draft-storage';

// The panels of the tabs other than Resume, and the regenerate wizard, load as
// their own chunks: they sat in /builder's first-load JS though the page opens
// on the Resume tab.
// The resume form brings dnd-kit; it loads while the resume is fetched.
const ResumeForm = dynamic(() => import('./resume-form').then((m) => m.ResumeForm));
const CoverLetterEditor = dynamic(() =>
  import('./cover-letter-editor').then((m) => m.CoverLetterEditor)
);
const OutreachEditor = dynamic(() => import('./outreach-editor').then((m) => m.OutreachEditor));
const CoverLetterPreview = dynamic(() =>
  import('./cover-letter-preview').then((m) => m.CoverLetterPreview)
);
const OutreachPreview = dynamic(() => import('./outreach-preview').then((m) => m.OutreachPreview));
const InterviewPrepView = dynamic(() =>
  import('./interview-prep-view').then((m) => m.InterviewPrepView)
);
const JDComparisonView = dynamic(() =>
  import('./jd-comparison-view').then((m) => m.JDComparisonView)
);
const AtsCheckView = dynamic(() => import('./ats-check-view').then((m) => m.AtsCheckView));
const WritingPanel = dynamic(() => import('./writing-panel').then((m) => m.WritingPanel));
const AtsScorePanel = dynamic(() => import('./ats-score-panel').then((m) => m.AtsScorePanel));
const RegenerateWizard = dynamic(() =>
  import('./regenerate-wizard').then((m) => m.RegenerateWizard)
);

type TabId =
  | 'resume'
  | 'cover-letter'
  | 'outreach'
  | 'interview-prep'
  | 'jd-match'
  | 'ats-check'
  | 'writing';

const TAB_IDS: TabId[] = [
  'resume',
  'cover-letter',
  'outreach',
  'interview-prep',
  'jd-match',
  'ats-check',
  'writing',
];

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

type Attachments = Record<AttachmentPart, AttachmentState>;
const INITIAL_ATTACHMENTS: Attachments = {
  coverLetter: initialAttachment,
  outreach: initialAttachment,
};

/** What differs between the two attachments: their endpoints, names and messages. */
const ATTACHMENT_PARTS = {
  coverLetter: {
    save: updateCoverLetter,
    generate: generateCoverLetter,
    logName: 'cover letter',
    regenerateDialog: 'cover-letter',
    saveSuccess: 'builder.alerts.coverLetterSaveSuccess',
    saveFailed: 'builder.alerts.coverLetterSaveFailed',
    generateFailed: 'builder.alerts.coverLetterGenerateFailed',
  },
  outreach: {
    save: updateOutreachMessage,
    generate: generateOutreachMessage,
    logName: 'outreach message',
    regenerateDialog: 'outreach',
    saveSuccess: 'builder.alerts.outreachSaveSuccess',
    saveFailed: 'builder.alerts.outreachSaveFailed',
    generateFailed: 'builder.alerts.outreachGenerateFailed',
  },
} as const;

interface ResumeBuilderProps {
  /** The user's coding agent does the AI work: AI actions show a prompt for it. */
  agentMode?: boolean;
}

const ResumeBuilderContent = ({ agentMode = false }: ResumeBuilderProps) => {
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
  // The resume's save state (lib/builder/resume-sync.ts). The ref holds the
  // latest state for callbacks that read it after an await; dispatchSync
  // returns it so side effects can follow the transition.
  const syncRef = useRef(initialResumeSync);
  const [sync, setSync] = useState(initialResumeSync);
  const dispatchSync = useCallback((event: ResumeSyncEvent): ResumeSyncState => {
    syncRef.current = resumeSync(syncRef.current, event);
    setSync(syncRef.current);
    return syncRef.current;
  }, []);
  const hasUnsavedChanges = sync.dirty;
  const isSaving = sync.manualSaving;
  const isAutoSaving = sync.autoSaving;
  const loadingState = sync.load;
  const autoSaveError = sync.saveFailed ? t('builder.alerts.autoSaveFailed') : null;
  const [lastSavedData, setLastSavedData] = useState<ResumeData>(() => initialData);
  const [lastAutoSavedAt, setLastAutoSavedAt] = useState<number | null>(null);
  const [pendingDraftRestore, setPendingDraftRestore] = useState<StoredResumeDraft | null>(null);
  const [pendingAttachmentDraftRestore, setPendingAttachmentDraftRestore] =
    useState<AttachmentDraftEnvelope | null>(null);
  const [showLeaveWithLocalDraftDialog, setShowLeaveWithLocalDraftDialog] = useState(false);
  const [hasCurrentLocalDraft, setHasCurrentLocalDraft] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const { improvedData } = useResumePreview();
  const improvedPreview = improvedData?.data?.resume_preview;
  const improvedCoverLetter = improvedData?.data?.cover_letter;
  const improvedOutreach = improvedData?.data?.outreach_message;
  const improvedInterviewPrep = improvedData?.data?.interview_prep ?? null;
  const searchParams = useSearchParams();
  const router = useRouter();
  const resumeId = searchParams.get('id');
  const { templateSettings, formattingSaveFailed, handleSettingsChange, applySavedSettings } =
    useResumeFormatting(resumeId, loadingState === 'loaded');
  const resumeSaveQueueRef = useRef<Promise<void>>(Promise.resolve());
  const documentIsActiveRef = useRef(true);

  useEffect(() => {
    documentIsActiveRef.current = true;
    return () => {
      documentIsActiveRef.current = false;
    };
  }, []);

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

  // Cover letter & outreach state (lib/builder/attachment-sync.ts), one store
  // keyed by part; the ref serves reads after an await, as for the resume.
  const attachmentsRef = useRef<Attachments>(INITIAL_ATTACHMENTS);
  const [attachments, setAttachments] = useState<Attachments>(INITIAL_ATTACHMENTS);
  const dispatchAttachment = useCallback(
    (part: AttachmentPart, event: AttachmentEvent): Attachments => {
      attachmentsRef.current = {
        ...attachmentsRef.current,
        [part]: attachmentSync(attachmentsRef.current[part], event),
      };
      setAttachments(attachmentsRef.current);
      return attachmentsRef.current;
    },
    []
  );
  const coverLetter = attachments.coverLetter.value;
  const outreachMessage = attachments.outreach.value;
  const isCoverLetterSaving = attachments.coverLetter.savesInFlight > 0;
  const isOutreachSaving = attachments.outreach.savesInFlight > 0;
  const hasUnsavedCoverLetter = attachments.coverLetter.unsaved;
  const hasUnsavedOutreach = attachments.outreach.unsaved;
  const [interviewPrep, setInterviewPrep] = useState<InterviewPrepData | null>(null);
  const [hasCurrentAttachmentDraft, setHasCurrentAttachmentDraft] = useState(false);
  const hasCurrentRecoveryDraft =
    (!hasUnsavedChanges || hasCurrentLocalDraft) &&
    (!(hasUnsavedCoverLetter || hasUnsavedOutreach) || hasCurrentAttachmentDraft);
  // Each part's saves and generations run one at a time, in order.
  const attachmentQueuesRef = useRef<Record<AttachmentPart, Promise<void>>>({
    coverLetter: Promise.resolve(),
    outreach: Promise.resolve(),
  });
  const [resumeTitle, setResumeTitle] = useState<string | null>(null);

  // On-demand generation state
  const [isTailoredResume, setIsTailoredResume] = useState(false);
  const [generating, setGenerating] = useState<Record<AttachmentPart, boolean>>({
    coverLetter: false,
    outreach: false,
  });
  const [isGeneratingInterviewPrep, setIsGeneratingInterviewPrep] = useState(false);
  const [interviewPrepError, setInterviewPrepError] = useState<string | null>(null);
  const [showRegenerateDialog, setShowRegenerateDialog] = useState<
    'cover-letter' | 'outreach' | 'interview-prep' | null
  >(null);
  const [agentTask, setAgentTask] = useState<AgentTask | null>(null);
  // Agent mode: the agent's saved version, waiting while the user has unsaved
  // edits to the same part, and when one was last applied here.
  const [agentUpdate, setAgentUpdate] = useState<ServerResume | null>(null);
  const [agentAppliedAt, setAgentAppliedAt] = useState<number | null>(null);
  // Remounts the resume form only when the agent replaced the resume itself, so
  // in-progress form state survives agent updates to other parts.
  const [resumeFormKey, setResumeFormKey] = useState(0);
  const ownWritesRef = useRef<OwnWrites>({ pending: 0, epoch: 0 });
  const lastSavedDataRef = useRef<ResumeData>(initialData);
  const agentCheckRunningRef = useRef(false);
  const dismissedAgentVersionRef = useRef<string | null>(null);

  // The photo of a photo CV: its own resource, saved by the field, not by autosave.
  const { photo, setPhoto } = useResumePhoto(resumeId);

  // The job this resume was tailored to, for JD Match and the ATS check.
  const { jobDescription, jobKeywords, jobCompany, jobForcedKeywords, jobContextStatus } =
    useJobContext(resumeId, isTailoredResume, agentMode);

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
          dispatchSync({ type: 'regenerated' });
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
  const experienceItemsForRegenerate = useMemo(
    () => experienceRegenerateItems(canonicalResumeDataForPreview.workExperience),
    [canonicalResumeDataForPreview.workExperience]
  );
  const projectItemsForRegenerate = useMemo(
    () => projectRegenerateItems(canonicalResumeDataForPreview.personalProjects),
    [canonicalResumeDataForPreview.personalProjects]
  );
  const skillsItemForRegenerate = useMemo(
    () =>
      skillsRegenerateItem(
        canonicalResumeDataForPreview.additional?.technicalSkills,
        t('builder.regenerate.selectDialog.skills')
      ),
    [canonicalResumeDataForPreview.additional?.technicalSkills, t]
  );
  const localizedResumeDataForPreview = useMemo(
    () => withLocalizedDefaultSections(canonicalResumeDataForPreview, t),
    [canonicalResumeDataForPreview, t]
  );

  // Warn user before leaving with unsaved changes
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsavedChanges || hasUnsavedCoverLetter || hasUnsavedOutreach) {
        e.preventDefault();
        e.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasUnsavedChanges, hasUnsavedCoverLetter, hasUnsavedOutreach]);

  useEffect(() => {
    // P0: without this, navigating from resume A to resume B before A's GET
    // resolves lets A's response land under B's id — and because the response
    // also flips loadingState to 'loaded', autosave then writes A's content
    // into B. Every state write below is gated on the effect still being
    // current. (The JD effect below already did this; this one did not.)
    let cancelled = false;

    const loadResumeData = async () => {
      if (cancelled) return;
      dispatchSync({ type: 'loadStarted' });
      setPendingDraftRestore(null);
      setPendingAttachmentDraftRestore(null);

      // Priority 1: Fetch from API if ID is in URL (most reliable)
      if (resumeId) {
        try {
          const data = await fetchResume(resumeId);
          if (cancelled) return;
          // Prefer processed_resume if available
          const status = data.raw_resume?.processing_status;
          if (
            status === 'processing' ||
            status === 'failed' ||
            (status === 'pending' && !isResumeDataShape(data.processed_resume))
          ) {
            dispatchSync({ type: 'loadFailed' });
            return;
          }
          let serverData: ResumeData | null = null;
          if (isResumeDataShape(data.processed_resume)) {
            serverData = data.processed_resume;
          } else if (data.raw_resume?.content) {
            try {
              const parsed: unknown = JSON.parse(data.raw_resume.content);
              if (isResumeDataShape(parsed)) serverData = parsed;
            } catch {
              // Raw content may still be markdown instead of structured JSON.
            }
          }
          if (!serverData) {
            // Preserve drafts until a usable server baseline has been read.
            dispatchSync({ type: 'loadFailed' });
            return;
          }
          // Track if this is a tailored resume (has parent_id)
          setIsTailoredResume(Boolean(data.parent_id));
          // Store resume title for downloads
          setResumeTitle(data.title ?? null);
          applySavedSettings(data.template_settings);
          // These values belong to this resume. Explicitly applying empty values
          // prevents the preceding document's attachment from surviving a switch.
          const serverCoverLetter = data.cover_letter ?? '';
          const serverOutreachMessage = data.outreach_message ?? '';
          dispatchAttachment('coverLetter', { type: 'loaded', content: serverCoverLetter });
          dispatchAttachment('outreach', { type: 'loaded', content: serverOutreachMessage });
          const attachmentDraft = readAttachmentDraft(resumeId);
          if (
            attachmentDraft &&
            (attachmentDraft.coverLetter !== serverCoverLetter ||
              attachmentDraft.outreachMessage !== serverOutreachMessage)
          ) {
            setPendingAttachmentDraftRestore(attachmentDraft);
          } else {
            clearAttachmentDraft(resumeId);
          }
          setInterviewPrep(data.interview_prep ?? null);
          setInterviewPrepError(null);
          const localDraft = readStoredResumeDraft(resumeId);
          setResumeData(serverData);
          setLastSavedData(serverData);
          setHasCurrentLocalDraft(false);
          if (shouldPromptForDraftRestore(localDraft, serverData)) {
            setPendingDraftRestore(localDraft);
          } else {
            clearStoredResumeDraft(resumeId);
          }
          dispatchSync({ type: 'loadedFromServer' });
          return;
        } catch (err) {
          if (cancelled) return;
          // Do NOT fall through to the localStorage draft restore below. That
          // path sets hasUnsavedChanges=true, which arms autosave and would
          // PATCH a stale draft over a server copy we failed to read and
          // therefore know nothing about. Surface the failure instead.
          console.error('Failed to load resume from API:', err);
          dispatchSync({ type: 'loadFailed' });
          return;
        }
      }

      // Priority 2: Improved Data from Context (Tailor Flow)
      if (improvedPreview) {
        setIsTailoredResume(Boolean(improvedData?.data?.resume_id && improvedData.data.job_id));
        setResumeData(improvedPreview);
        setLastSavedData(improvedPreview);
        const contextCoverLetter = improvedCoverLetter ?? '';
        const contextOutreach = improvedOutreach ?? '';
        dispatchAttachment('coverLetter', { type: 'loaded', content: contextCoverLetter });
        dispatchAttachment('outreach', { type: 'loaded', content: contextOutreach });
        setInterviewPrep(improvedInterviewPrep);
        setInterviewPrepError(null);
        // Persist to localStorage as backup
        setHasCurrentLocalDraft(writeStoredResumeDraft(resumeId, improvedPreview));
        dispatchSync({ type: 'loadedLocally' });
        return;
      }

      // Priority 3: Restore from localStorage (browser refresh recovery)
      const savedDraft = readStoredResumeDraft(resumeId);
      if (savedDraft) {
        setPendingDraftRestore(savedDraft);
        dispatchSync({ type: 'loadedLocally' });
        return;
      }

      // Fallback: Use initial data
      dispatchSync({ type: 'loadedLocally' });
    };

    void loadResumeData();

    return () => {
      cancelled = true;
    };
  }, [
    applySavedSettings,
    dispatchAttachment,
    dispatchSync,
    improvedData?.data?.job_id,
    improvedData?.data?.resume_id,
    improvedPreview,
    improvedCoverLetter,
    improvedOutreach,
    improvedInterviewPrep,
    resumeId,
  ]);

  useEffect(() => {
    // Scheduling navigation cannot acknowledge that the created resume opened.
    // This identity-keyed builder retires recovery only after its validated
    // server baseline is available; failed or abandoned loads retain it.
    if (resumeId && loadingState === 'loaded') clearResumeWizardCompletion(resumeId);
  }, [resumeId, loadingState]);

  const handleUpdate = useCallback(
    (newData: ResumeData) => {
      dispatchSync({ type: 'edited', now: Date.now() });
      setResumeData(newData);
      // Auto-save draft to localStorage
      setHasCurrentLocalDraft(writeStoredResumeDraft(resumeId, newData));
    },
    [dispatchSync, resumeId]
  );

  useEffect(() => {
    lastSavedDataRef.current = lastSavedData;
  }, [lastSavedData]);

  /**
   * Agent mode, before a resume save: the agent's version if it saved the resume
   * since this editor last loaded or saved it. The periodic check can miss that
   * window (autosave runs sooner), and saving then would silently replace the
   * agent's work. Returns null when the server copy is the editor's own, when a
   * save of ours is in flight (the difference is then most likely ours), or when
   * the server cannot be read (saving proceeds as before).
   */
  const findAgentConflict = useCallback(
    async (part: AgentPart): Promise<ServerResume | null> => {
      if (!agentMode || !resumeId || ownWritesRef.current.pending > 0) return null;
      try {
        const data = await fetchResume(resumeId);
        const { coverLetter, outreach } = attachmentsRef.current;
        const changed =
          part === 'resume'
            ? isResumeDataShape(data.processed_resume) &&
              !isSameResumeData(data.processed_resume, lastSavedDataRef.current)
            : part === 'coverLetter'
              ? (data.cover_letter ?? '') !== coverLetter.baseline
              : (data.outreach_message ?? '') !== outreach.baseline;
        if (!changed || agentVersionOf(data) === dismissedAgentVersionRef.current) return null;
        return data;
      } catch (error) {
        console.warn('Could not check for agent changes before saving:', error);
        return null;
      }
    },
    [agentMode, resumeId]
  );

  /**
   * Whether saving `part` now is safe. While the user has not chosen between
   * their edits and the agent's version, or when the agent has just saved this
   * part, it shows the banner (and, with `notify`, says why) and returns false.
   */
  const agentAllowsSave = useCallback(
    async (part: AgentPart, notify: boolean): Promise<boolean> => {
      const agentVersion = agentUpdate ?? (await findAgentConflict(part));
      if (!agentVersion) return true;
      setAgentUpdate(agentVersion);
      if (notify) showNotification(t('builder.agentUpdate.chooseFirst'), 'warning');
      return false;
    },
    [agentUpdate, findAgentConflict, showNotification, t]
  );

  const queueResumeSave = useCallback(
    (editorData: ResumeData) => {
      if (!resumeId) {
        return Promise.reject(new Error('Resume ID is required to save.'));
      }

      const canonicalPayload = normalizeResumeForSave(editorData);
      const runSave = trackOwnWrite(
        ownWritesRef,
        resumeSaveQueueRef.current
          .catch(() => {
            // Keep the queue alive after a failed save so the next edit can still persist.
          })
          .then(() => {
            if (!documentIsActiveRef.current) {
              throw new DOMException('Editor closed', 'AbortError');
            }
            return updateResume(resumeId, canonicalPayload);
          })
      );

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
      regenerateWizard.step !== 'idle' ||
      // The user has not chosen between their edits and the agent's version.
      agentUpdate
    ) {
      return;
    }

    const versionAtSchedule = syncRef.current.editVersion;
    const editorSnapshot = resumeData;
    const { unsyncedSince } = syncRef.current;
    const saveDelay = nextSaveDelay(unsyncedSince ? Date.now() - unsyncedSince : 0);
    const timerId = window.setTimeout(async () => {
      dispatchSync({ type: 'autoSaveStarted', now: Date.now() });
      try {
        const agentVersion = await findAgentConflict('resume');
        if (agentVersion) {
          // Ask the user instead; autosave stays paused until they choose.
          setAgentUpdate(agentVersion);
          return;
        }
        const { response, canonicalPayload } = await queueResumeSave(editorSnapshot);
        if (!documentIsActiveRef.current) return;
        const next = dispatchSync({ type: 'autoSaveSucceeded', version: versionAtSchedule });
        // Prefer the server's copy: it may rewrite the payload (e.g. aligning
        // descriptionStyles), and comparing a stale client payload against the
        // server state would surface a spurious draft-recovery prompt on reload.
        setLastSavedData((response?.processed_resume as ResumeData) ?? canonicalPayload);
        setLastAutoSavedAt(Date.now());

        if (next.editVersion === versionAtSchedule) {
          clearStoredResumeDraft(resumeId);
          setHasCurrentLocalDraft(false);
        }
      } catch (error) {
        if (!documentIsActiveRef.current) return;
        console.error('Failed to auto-save resume:', error);
        dispatchSync({ type: 'saveFailed' });
      } finally {
        if (documentIsActiveRef.current) dispatchSync({ type: 'saveSettled', kind: 'auto' });
      }
    }, saveDelay);

    return () => window.clearTimeout(timerId);
  }, [
    agentUpdate,
    autoSaveError,
    dispatchSync,
    findAgentConflict,
    hasUnsavedChanges,
    isAutoSaving,
    isSaving,
    loadingState,
    queueResumeSave,
    regenerateWizard.step,
    resumeData,
    resumeId,
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
        dispatchSync({ type: 'manualSaveStarted' });
        // Capture the text and its edit number before any wait, so edits typed
        // meanwhile stay unsaved (and autosave picks them up) instead of being
        // marked saved.
        const versionAtFlush = syncRef.current.editVersion;
        const editorSnapshot = resumeData;
        // Agent mode: never save over the agent's version before the user has
        // chosen between it and their edits (Download, Back and Save all land here).
        if (!(await agentAllowsSave('resume', showErrorDialog))) return false;
        const { response, canonicalPayload } = await queueResumeSave(editorSnapshot);
        if (!documentIsActiveRef.current) return false;
        const next = dispatchSync({ type: 'manualSaveSucceeded', version: versionAtFlush });
        setLastSavedData((response?.processed_resume as ResumeData) ?? canonicalPayload);

        if (next.editVersion === next.syncedVersion) {
          setLastAutoSavedAt(Date.now());
          clearStoredResumeDraft(resumeId);
          setHasCurrentLocalDraft(false);
          return true;
        }

        return false;
      } catch (error) {
        if (!documentIsActiveRef.current) return false;
        console.error('Failed to save resume:', error);
        dispatchSync({ type: 'saveFailed' });
        if (showErrorDialog) {
          showNotification(t('builder.alerts.saveFailed'), 'danger');
        }
        return false;
      } finally {
        if (documentIsActiveRef.current) dispatchSync({ type: 'saveSettled', kind: 'manual' });
      }
    },
    [
      agentAllowsSave,
      autoSaveError,
      dispatchSync,
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
    const saveInFlight = syncRef.current.autoSaving || syncRef.current.manualSaving;
    dispatchSync({ type: 'reset', now: Date.now() });
    setResumeData(lastSavedData);

    if (saveInFlight) {
      // That save carries the discarded edits, so the resume stays unsaved
      // (resumeSync) and the draft keeps the reset copy until autosave sends it.
      setHasCurrentLocalDraft(writeStoredResumeDraft(resumeId, lastSavedData));
    } else {
      clearStoredResumeDraft(resumeId);
      setHasCurrentLocalDraft(false);
    }
  };

  const handleRestoreLocalDraft = () => {
    if (!pendingDraftRestore) return;
    dispatchSync({ type: 'draftRestored', now: Date.now() });
    setResumeData(pendingDraftRestore.data);
    const didWriteScopedDraft = writeStoredResumeDraft(resumeId, pendingDraftRestore.data);
    setHasCurrentLocalDraft(
      didWriteScopedDraft ||
        JSON.stringify(readStoredResumeDraft(resumeId)?.data) ===
          JSON.stringify(pendingDraftRestore.data)
    );
    if (
      didWriteScopedDraft &&
      pendingDraftRestore.storageKey !== getResumeDraftStorageKey(resumeId)
    ) {
      clearResumeDraftStorageKey(pendingDraftRestore.storageKey);
    }
    setPendingDraftRestore(null);
  };

  const handleRestorePendingDrafts = () => {
    handleRestoreLocalDraft();
    handleRestoreAttachmentDraft();
  };

  const handleKeepServerDraft = () => {
    if (pendingDraftRestore) {
      clearResumeDraftStorageKey(pendingDraftRestore.storageKey);
    } else {
      clearStoredResumeDraft(resumeId);
    }
    setPendingDraftRestore(null);
    setHasCurrentLocalDraft(false);
    if (resumeId && pendingAttachmentDraftRestore) {
      clearAttachmentDraft(resumeId);
    }
    setPendingAttachmentDraftRestore(null);
    setHasCurrentAttachmentDraft(false);
  };

  /** Keep the browser draft of both attachments in step with the store. */
  const persistAttachmentDraft = () => {
    if (!resumeId) return;
    const { coverLetter, outreach } = attachmentsRef.current;
    if (coverLetter.value === coverLetter.baseline && outreach.value === outreach.baseline) {
      clearAttachmentDraft(resumeId);
      setHasCurrentAttachmentDraft(false);
      return;
    }
    const didWrite = writeAttachmentDraft(resumeId, coverLetter.value, outreach.value);
    const existing = didWrite ? null : readAttachmentDraft(resumeId);
    setHasCurrentAttachmentDraft(
      didWrite ||
        Boolean(
          existing &&
          existing.coverLetter === coverLetter.value &&
          existing.outreachMessage === outreach.value
        )
    );
  };

  const handleAttachmentChange = (part: AttachmentPart, value: string) => {
    dispatchAttachment(part, { type: 'changed', value });
    persistAttachmentDraft();
  };

  const handleRestoreAttachmentDraft = () => {
    if (!pendingAttachmentDraftRestore) return;
    dispatchAttachment('coverLetter', {
      type: 'draftRestored',
      value: pendingAttachmentDraftRestore.coverLetter,
    });
    dispatchAttachment('outreach', {
      type: 'draftRestored',
      value: pendingAttachmentDraftRestore.outreachMessage,
    });
    persistAttachmentDraft();
    setPendingAttachmentDraftRestore(null);
  };

  // Agent mode: the parts of the server copy that differ from what this editor
  // last loaded or saved, i.e. what the user's coding agent changed.
  const agentChanges = (data: ServerResume) => {
    const serverResume = isResumeDataShape(data.processed_resume) ? data.processed_resume : null;
    const coverLetter = data.cover_letter ?? '';
    const outreachMessage = data.outreach_message ?? '';
    const baselines = attachmentsRef.current;
    return {
      serverResume,
      coverLetter,
      outreachMessage,
      resume: Boolean(serverResume && !isSameResumeData(serverResume, lastSavedData)),
      coverLetterChanged: coverLetter !== baselines.coverLetter.baseline,
      outreachChanged: outreachMessage !== baselines.outreach.baseline,
      title: (data.title ?? null) !== resumeTitle,
    };
  };

  /**
   * Show the agent's version of each part it changed, replacing any unsaved
   * edits to that part. Parts the agent did not change keep the user's edits.
   */
  const applyAgentVersion = (data: ServerResume) => {
    const changes = agentChanges(data);
    dispatchSync({ type: 'agentApplied', resume: Boolean(changes.serverResume && changes.resume) });
    if (changes.serverResume && changes.resume) {
      setResumeFormKey((key) => key + 1);
      setResumeData(changes.serverResume);
      setLastSavedData(changes.serverResume);
      clearStoredResumeDraft(resumeId);
      setHasCurrentLocalDraft(false);
    }
    if (changes.coverLetterChanged) {
      dispatchAttachment('coverLetter', { type: 'agentApplied', content: changes.coverLetter });
    }
    if (changes.outreachChanged) {
      dispatchAttachment('outreach', { type: 'agentApplied', content: changes.outreachMessage });
    }
    persistAttachmentDraft();
    if (changes.title) setResumeTitle(data.title ?? null);
    setAgentUpdate(null);
    setAgentAppliedAt(Date.now());
  };

  const checkForAgentChanges = async () => {
    if (
      !resumeId ||
      loadingState !== 'loaded' ||
      agentCheckRunningRef.current ||
      ownWritesRef.current.pending > 0 ||
      isSaving ||
      isAutoSaving ||
      regenerateWizard.step !== 'idle' ||
      pendingDraftRestore ||
      pendingAttachmentDraftRestore
    ) {
      return;
    }
    const before = [
      ownWritesRef.current.epoch,
      syncRef.current.editVersion,
      attachmentsRef.current.coverLetter.editVersion,
      attachmentsRef.current.outreach.editVersion,
    ].join();
    agentCheckRunningRef.current = true;
    try {
      const data = await fetchResume(resumeId);
      const after = [
        ownWritesRef.current.epoch,
        syncRef.current.editVersion,
        attachmentsRef.current.coverLetter.editVersion,
        attachmentsRef.current.outreach.editVersion,
      ].join();
      // An edit or save happened meanwhile: this state no longer matches the server read.
      if (!documentIsActiveRef.current || ownWritesRef.current.pending > 0 || after !== before) {
        return;
      }
      const changes = agentChanges(data);
      if (
        !changes.resume &&
        !changes.coverLetterChanged &&
        !changes.outreachChanged &&
        !changes.title
      ) {
        if (agentUpdate) setAgentUpdate(null);
        return;
      }
      if (agentVersionOf(data) === dismissedAgentVersionRef.current) return;
      const conflict =
        (changes.resume && hasUnsavedChanges) ||
        (changes.coverLetterChanged && hasUnsavedCoverLetter) ||
        (changes.outreachChanged && hasUnsavedOutreach);
      if (conflict) setAgentUpdate(data);
      else applyAgentVersion(data);
    } catch (error) {
      console.warn('Could not check for agent changes:', error);
    } finally {
      agentCheckRunningRef.current = false;
    }
  };

  useAgentRefresh(agentMode && loadingState === 'loaded', () => checkForAgentChanges());

  const handleKeepMyEdits = () => {
    if (!agentUpdate) return;
    // Autosave resumes and replaces the agent's version with these edits.
    dismissedAgentVersionRef.current = agentVersionOf(agentUpdate);
    setAgentUpdate(null);
  };

  const getCompanyFromTitle = (title: string | null | undefined): string | null => {
    if (!title) return null;
    const atIdx = title.lastIndexOf(' @ ');
    return atIdx !== -1 ? title.substring(atIdx + 3).trim() : null;
  };

  const handleBackToDashboard = async () => {
    const resumeDidSave = await flushResumeChanges(true);
    const attachmentsDidSave = await flushAttachmentChanges();
    if (resumeDidSave && attachmentsDidSave) {
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
      if (agentMode) setAgentTask('regenerate');
      else regenerateWizard.startRegenerate();
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
      toast.success(t('builder.alerts.downloadSuccess'));
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

  // Attachment handlers (cover letter and outreach message)
  const queueAttachmentWrite = <T,>(part: AttachmentPart, action: () => Promise<T>): Promise<T> => {
    const queues = attachmentQueuesRef.current;
    const operation = trackOwnWrite(
      ownWritesRef,
      queues[part].then(() => {
        if (!documentIsActiveRef.current) throw new DOMException('Editor closed', 'AbortError');
        return action();
      })
    );
    queues[part] = operation.then(
      () => undefined,
      () => undefined
    );
    return operation;
  };

  const saveAttachment = async (
    part: AttachmentPart,
    showSuccess = true,
    showFailure = true
  ): Promise<boolean> => {
    if (!resumeId || loadingState !== 'loaded') return false;
    const activeResumeId = resumeId;
    const { save, logName, saveSuccess, saveFailed } = ATTACHMENT_PARTS[part];
    try {
      dispatchAttachment(part, { type: 'saveStarted' });
      if (!(await agentAllowsSave(part, showFailure))) return false;
      // A prior generation or newer edit can replace the value while this save waits.
      const savedContent = await queueAttachmentWrite(part, async () => {
        const { value } = attachmentsRef.current[part];
        await save(activeResumeId, value);
        return value;
      });
      if (!documentIsActiveRef.current) return false;
      dispatchAttachment(part, { type: 'saveSucceeded', content: savedContent });
      persistAttachmentDraft();
      if (showSuccess) {
        showNotification(t(saveSuccess), 'success');
      }
      return true;
    } catch (error) {
      if (!documentIsActiveRef.current) return false;
      console.error(`Failed to save ${logName}:`, error);
      persistAttachmentDraft();
      if (showFailure) {
        showNotification(t(saveFailed), 'danger');
      }
      return false;
    } finally {
      if (documentIsActiveRef.current) dispatchAttachment(part, { type: 'saveSettled' });
    }
  };

  const flushCoverLetterForExport = async (showFailure = true): Promise<boolean> => {
    while (documentIsActiveRef.current) {
      await attachmentQueuesRef.current.coverLetter;
      if (!documentIsActiveRef.current) return false;
      const { value, baseline } = attachmentsRef.current.coverLetter;
      if (value === baseline) {
        return true;
      }
      if (!(await saveAttachment('coverLetter', false, showFailure))) {
        return false;
      }
    }
    return false;
  };

  const flushAttachmentChanges = async (): Promise<boolean> => {
    while (documentIsActiveRef.current) {
      if (!(await flushCoverLetterForExport(false))) return false;
      await attachmentQueuesRef.current.outreach;
      if (!documentIsActiveRef.current) return false;
      const { coverLetter, outreach } = attachmentsRef.current;
      if (outreach.value !== outreach.baseline) {
        if (!(await saveAttachment('outreach', false, false))) return false;
        continue;
      }
      if (coverLetter.value === coverLetter.baseline) return true;
    }
    return false;
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
      if (!(await flushCoverLetterForExport())) {
        return;
      }
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

  // On-demand generation handlers
  const doGenerateAttachment = async (part: AttachmentPart) => {
    if (!resumeId || loadingState !== 'loaded') return;
    const activeResumeId = resumeId;
    const { generate, logName, generateFailed } = ATTACHMENT_PARTS[part];
    const startingEditVersion = attachmentsRef.current[part].editVersion;
    setGenerating((current) => ({ ...current, [part]: true }));
    setShowRegenerateDialog(null);
    try {
      const content = await queueAttachmentWrite(part, () => generate(activeResumeId));
      if (!documentIsActiveRef.current) return;
      dispatchAttachment(part, {
        type: 'generated',
        content,
        startVersion: startingEditVersion,
      });
      persistAttachmentDraft();
    } catch (error) {
      if (!documentIsActiveRef.current) return;
      console.error(`Failed to generate ${logName}:`, error);
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      showNotification(t(generateFailed, { error: errorMessage }), 'danger');
    } finally {
      if (documentIsActiveRef.current) setGenerating((current) => ({ ...current, [part]: false }));
    }
  };

  const handleGenerateAttachment = (part: AttachmentPart) => {
    if (!resumeId || loadingState !== 'loaded') return;
    if (agentMode) {
      setAgentTask(part);
      return;
    }
    // If content exists, show confirmation dialog
    if (attachments[part].value) {
      setShowRegenerateDialog(ATTACHMENT_PARTS[part].regenerateDialog);
      return;
    }
    void doGenerateAttachment(part);
  };

  const canGenerateInterviewPrep =
    Boolean(resumeId) &&
    loadingState === 'loaded' &&
    isTailoredResume &&
    jobContextStatus === 'available';

  const interviewPrepUnavailableMessage = !resumeId
    ? t('interviewPrep.saveRequiredDescription')
    : jobContextStatus === 'loading'
      ? t('interviewPrep.loadingContextDescription')
      : jobContextStatus === 'missing'
        ? t('interviewPrep.missingContextDescription')
        : null;

  const doGenerateInterviewPrep = async () => {
    if (!canGenerateInterviewPrep || !resumeId) return;
    const activeResumeId = resumeId;
    setIsGeneratingInterviewPrep(true);
    setInterviewPrepError(null);
    setShowRegenerateDialog(null);
    try {
      const content = await generateInterviewPrep(activeResumeId);
      if (!documentIsActiveRef.current) return;
      setInterviewPrep(content);
    } catch (error) {
      if (!documentIsActiveRef.current) return;
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
      if (documentIsActiveRef.current) setIsGeneratingInterviewPrep(false);
    }
  };

  const handleGenerateInterviewPrep = () => {
    if (!canGenerateInterviewPrep) return;
    if (agentMode) {
      setAgentTask('interviewPrep');
      return;
    }
    if (interviewPrep) {
      setShowRegenerateDialog('interview-prep');
      return;
    }
    void doGenerateInterviewPrep();
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
      void doGenerateAttachment('coverLetter');
    } else if (showRegenerateDialog === 'outreach') {
      void doGenerateAttachment('outreach');
    } else if (showRegenerateDialog === 'interview-prep') {
      void doGenerateInterviewPrep();
    }
  };

  const resumeSaveStatus = (() => {
    if (isSaving || isAutoSaving) {
      return { label: t('builder.autoSave.saving'), tone: 'active' as const };
    }
    if (autoSaveError) {
      return { label: autoSaveError, tone: 'error' as const };
    }
    if (formattingSaveFailed) {
      return { label: t('builder.alerts.formattingSaveFailed'), tone: 'error' as const };
    }
    if (hasUnsavedChanges) {
      return hasCurrentLocalDraft
        ? { label: t('builder.autoSave.localDraft'), tone: 'warning' as const }
        : { label: t('builder.autoSave.localDraftUnavailable'), tone: 'error' as const };
    }
    if (agentAppliedAt && agentAppliedAt > (lastAutoSavedAt ?? 0)) {
      return { label: t('builder.agentUpdate.applied'), tone: 'ready' as const };
    }
    if (resumeId && lastAutoSavedAt) {
      return { label: t('builder.autoSave.saved'), tone: 'ready' as const };
    }
    return null;
  })();

  const nothingYet = <EmptyState className="px-6" title={t('builder.panels.nothingYet')} />;

  return (
    <div className="h-screen w-full bg-canvas flex justify-center items-center p-2 md:p-4">
      {/* Main Container */}
      <div className="w-full h-full border border-ink bg-canvas shadow-sw-lg flex flex-col">
        {/* Header: one compact toolbar row (owner F2, builder only) */}
        <PageHeader className="flex flex-wrap items-center justify-between gap-x-6 gap-y-3 px-6 py-3 md:px-6 md:py-3 no-print">
          <div className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
            <Button variant="outline" size="sm" onClick={handleBackToDashboard}>
              <ArrowLeft aria-hidden="true" />
              {t('nav.backToDashboard')}
            </Button>
            <PageHeader.Title className="text-2xl leading-tight md:text-3xl">
              {t('nav.builder')}
            </PageHeader.Title>
            <p className="font-mono text-xs font-bold uppercase tracking-wide text-steel">
              {'// '}
              {resumeId ? t('builder.editMode') : t('builder.createAndPreview')}
            </p>
            <span role="status">
              {resumeSaveStatus && (
                <StatusIndicator tone={resumeSaveStatus.tone} live={false}>
                  {resumeSaveStatus.label}
                </StatusIndicator>
              )}
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Community links: quiet ghost actions, left of the tab's own actions */}
            <CommunityLinks variant="builder" />

            {/* Resume tab actions */}
            {activeTab === 'resume' && (
              <>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleStartRegenerate}
                  disabled={!resumeId || isSaving}
                >
                  {t('builder.regenerate.buttonLabel')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleReset}
                  disabled={!hasUnsavedChanges}
                >
                  <ArrowCounterClockwise aria-hidden="true" />
                  {t('common.reset')}
                </Button>
                <Button
                  size="sm"
                  onClick={handleSave}
                  disabled={!resumeId || isSaving || loadingState !== 'loaded'}
                >
                  <FloppyDisk aria-hidden="true" />
                  {isSaving
                    ? t('common.saving')
                    : autoSaveError
                      ? t('builder.autoSave.retrySave')
                      : hasUnsavedChanges
                        ? t('builder.autoSave.saveNow')
                        : t('builder.autoSave.savedButton')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownload}
                  disabled={!resumeId || isDownloading}
                >
                  <DownloadSimple aria-hidden="true" />
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
                  onClick={() => handleGenerateAttachment('coverLetter')}
                  disabled={generating.coverLetter}
                >
                  {generating.coverLetter && (
                    <SpinnerGap aria-hidden="true" className="animate-spin" />
                  )}
                  {t('coverLetter.regenerate')}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadCoverLetter}
                  disabled={!resumeId || isDownloading}
                >
                  <DownloadSimple aria-hidden="true" />
                  {isDownloading ? t('common.generating') : t('common.download')}
                </Button>
              </>
            )}

            {/* Outreach tab actions (Copy lives in the editor) */}
            {activeTab === 'outreach' && outreachMessage && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => handleGenerateAttachment('outreach')}
                disabled={generating.outreach}
              >
                {generating.outreach && <SpinnerGap aria-hidden="true" className="animate-spin" />}
                {t('outreach.regenerate')}
              </Button>
            )}

            {/* Interview prep tab actions */}
            {activeTab === 'interview-prep' && interviewPrep && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleGenerateInterviewPrep}
                disabled={!canGenerateInterviewPrep || isGeneratingInterviewPrep}
              >
                {isGeneratingInterviewPrep && (
                  <SpinnerGap aria-hidden="true" className="animate-spin" />
                )}
                {t('interviewPrep.regenerate')}
              </Button>
            )}
          </div>
        </PageHeader>

        {/* Agent mode: the agent saved a part the user is also editing. */}
        {agentUpdate && (
          <div className="border-b border-ink px-6 py-3 no-print">
            <Alert tone="warning" title={t('builder.agentUpdate.conflictTitle')}>
              <p>{t('builder.agentUpdate.conflictBody')}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                <Button size="sm" onClick={() => applyAgentVersion(agentUpdate)}>
                  {t('builder.agentUpdate.useAgent')}
                </Button>
                <Button size="sm" variant="outline" onClick={handleKeepMyEdits}>
                  {t('builder.agentUpdate.keepMine')}
                </Button>
              </div>
            </Alert>
          </div>
        )}

        {/* Content Grid */}
        <SplitPanes
          handleLabel={t('builder.resizePanels')}
          left={
            /* Left panel: editor and generate controls */
            <div className="bg-canvas p-3 md:p-4 overflow-y-auto no-print">
              <div className="max-w-3xl space-y-6">
                <PanelHeader
                  tone="input"
                  title={
                    activeTab === 'resume'
                      ? t('builder.leftPanel.editorPanel')
                      : activeTab === 'cover-letter'
                        ? t('builder.leftPanel.coverLetterEditor')
                        : activeTab === 'outreach'
                          ? t('builder.leftPanel.outreachEditor')
                          : activeTab === 'interview-prep'
                            ? t('builder.leftPanel.interviewPrep')
                            : activeTab === 'jd-match'
                              ? t('builder.leftPanel.jdMatchAnalysis')
                              : activeTab === 'writing'
                                ? t('builder.leftPanel.writing')
                                : t('builder.leftPanel.atsCheck')
                  }
                />

                {/* Resume Editor */}
                {activeTab === 'resume' &&
                  (loadingState === 'failed' ? (
                    <Alert tone="error">{t('builder.alerts.loadFailed')}</Alert>
                  ) : (
                    <>
                      <FormattingControls
                        settings={templateSettings}
                        onChange={handleSettingsChange}
                      />
                      <ResumeForm
                        key={resumeFormKey}
                        resumeData={resumeData}
                        onUpdate={handleUpdate}
                        photoField={
                          resumeId && (
                            <ResumePhotoField
                              resumeId={resumeId}
                              photo={photo}
                              onChange={setPhoto}
                            />
                          )
                        }
                      />
                    </>
                  ))}

                {/* Cover Letter Editor */}
                {activeTab === 'cover-letter' &&
                  (coverLetter ? (
                    <CoverLetterEditor
                      content={coverLetter}
                      onChange={(value) => handleAttachmentChange('coverLetter', value)}
                      onSave={() => void saveAttachment('coverLetter')}
                      isSaving={isCoverLetterSaving}
                    />
                  ) : (
                    <GeneratePrompt
                      type="cover-letter"
                      isGenerating={generating.coverLetter}
                      onGenerate={() => handleGenerateAttachment('coverLetter')}
                      isTailoredResume={isTailoredResume}
                    />
                  ))}

                {/* Outreach Editor */}
                {activeTab === 'outreach' &&
                  (outreachMessage ? (
                    <OutreachEditor
                      content={outreachMessage}
                      onChange={(value) => handleAttachmentChange('outreach', value)}
                      onSave={() => void saveAttachment('outreach')}
                      isSaving={isOutreachSaving}
                    />
                  ) : (
                    <GeneratePrompt
                      type="outreach"
                      isGenerating={generating.outreach}
                      onGenerate={() => handleGenerateAttachment('outreach')}
                      isTailoredResume={isTailoredResume}
                    />
                  ))}

                {/* Interview Prep: generate controls here, the output renders on the right */}
                {activeTab === 'interview-prep' &&
                  (interviewPrep ? (
                    <p className="max-w-[60ch] text-sm text-ink-soft text-pretty">
                      {t('builder.generatePrompt.interviewPrepFooter')}
                    </p>
                  ) : (
                    <InterviewPrepView
                      interviewPrep={null}
                      isGenerating={isGeneratingInterviewPrep}
                      error={interviewPrepError}
                      onGenerate={handleGenerateInterviewPrep}
                      isTailoredResume={isTailoredResume}
                      canGenerate={canGenerateInterviewPrep}
                      unavailableMessage={interviewPrepUnavailableMessage}
                    />
                  ))}

                {/* JD Match Info Panel */}
                {activeTab === 'jd-match' && (
                  <div className="space-y-4">
                    {resumeId && jobContextStatus === 'available' && (
                      <AtsScorePanel
                        key={resumeId}
                        resumeId={resumeId}
                        hasUnsavedChanges={hasUnsavedChanges}
                        hasJobKeywords={jobKeywords !== null}
                        template={templateSettings.template}
                      />
                    )}

                    <div className="border-2 border-ink bg-white p-4">
                      <h3 className="font-mono text-sm font-bold uppercase mb-2">
                        {t('builder.jdMatch.aboutTitle')}
                      </h3>
                      <p className="text-sm text-ink-soft leading-relaxed">
                        {t('builder.jdMatch.aboutDescription')}
                      </p>
                    </div>

                    <div className="border-2 border-ink bg-canvas p-4">
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
                              <mark className="bg-highlight px-1">
                                {t('builder.jdMatch.highlightColor')}
                              </mark>
                              {parts.slice(1).join('__COLOR__')}
                            </>
                          );
                        })()}
                      </p>
                      {jobForcedKeywords.length > 0 && (
                        <p className="mt-2 text-sm text-ink-soft leading-relaxed">
                          <mark className="bg-primary px-1 text-white">
                            {t('builder.jdMatch.forcedColor')}
                          </mark>{' '}
                          {t('builder.jdMatch.forcedLegend')}
                        </p>
                      )}
                    </div>

                    <div className="border-2 border-ink bg-white p-4">
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

                {/* Writing: score, Improve writing and its review */}
                {activeTab === 'writing' && (
                  <WritingPanel
                    resumeData={resumeData}
                    onApply={(data) => {
                      handleUpdate(data);
                      setResumeFormKey((key) => key + 1);
                    }}
                    agentMode={agentMode}
                    onAgentPrompt={() => setAgentTask('improveWriting')}
                  />
                )}

                {/* ATS Check Info Panel */}
                {activeTab === 'ats-check' && (
                  <div className="space-y-4">
                    <div className="border-2 border-ink bg-white p-4">
                      <h3 className="font-mono text-sm font-bold uppercase mb-2">
                        {t('builder.atsCheck.aboutTitle')}
                      </h3>
                      <p className="text-sm text-ink-soft leading-relaxed">
                        {t('builder.atsCheck.aboutDescription')}
                      </p>
                    </div>
                    <div className="border-2 border-ink bg-canvas p-4">
                      <h3 className="font-mono text-sm font-bold uppercase mb-2">
                        {t('builder.atsCheck.roundTripTitle')}
                      </h3>
                      <p className="text-sm text-ink-soft leading-relaxed">
                        {t('builder.atsCheck.roundTripDescription')}
                      </p>
                    </div>
                    <div className="border-2 border-ink bg-white p-4">
                      <h3 className="font-mono text-sm font-bold uppercase mb-2">
                        {t('builder.atsCheck.tipsTitle')}
                      </h3>
                      <ul className="text-sm text-ink-soft space-y-1 list-disc list-inside">
                        <li>{t('builder.atsCheck.tips.items.singleColumn')}</li>
                        <li>{t('builder.atsCheck.tips.items.standardHeadings')}</li>
                        <li>{t('builder.atsCheck.tips.items.contactInBody')}</li>
                      </ul>
                    </div>
                  </div>
                )}
              </div>
            </div>
          }
          right={
            /* Right panel: output only */
            <div className="bg-panel overflow-hidden flex flex-col no-print">
              {/* Panel caption and tabs */}
              <div className="px-3 pt-3 md:px-4 shrink-0 bg-panel">
                <PanelHeader
                  tone="output"
                  title={t('builder.panels.preview')}
                  titleId="builder-preview-heading"
                />
                <RetroTabs
                  idPrefix="builder"
                  aria-labelledby="builder-preview-heading"
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
                    {
                      id: 'ats-check',
                      label: t('builder.previewTabs.atsCheck'),
                      disabled: !resumeId,
                    },
                    { id: 'writing', label: t('builder.previewTabs.writing') },
                  ]}
                  activeTab={activeTab}
                  onTabChange={(id) => setActiveTab(id as TabId)}
                />
              </div>

              {/* Preview Content: the active tab's panel */}
              <div
                id={`builder-panel-${activeTab}`}
                role="tabpanel"
                aria-labelledby={`builder-tab-${activeTab}`}
                className="flex-1 overflow-y-auto"
              >
                {/* Resume Preview (the Writing tab shows the resume it edits) */}
                {(activeTab === 'resume' || activeTab === 'writing') && (
                  <PaginatedPreview
                    resumeData={localizedResumeDataForPreview}
                    settings={templateSettings}
                    photo={photo}
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
                    nothingYet
                  ))}

                {/* Outreach Preview */}
                {activeTab === 'outreach' &&
                  (outreachMessage ? (
                    <div className="p-6">
                      <OutreachPreview content={outreachMessage} />
                    </div>
                  ) : (
                    nothingYet
                  ))}

                {/* Interview Prep Output */}
                {activeTab === 'interview-prep' &&
                  (interviewPrep ? (
                    <InterviewPrepView
                      interviewPrep={interviewPrep}
                      isGenerating={isGeneratingInterviewPrep}
                      error={interviewPrepError}
                      onGenerate={handleGenerateInterviewPrep}
                      isTailoredResume={isTailoredResume}
                      canGenerate={canGenerateInterviewPrep}
                      unavailableMessage={interviewPrepUnavailableMessage}
                    />
                  ) : (
                    nothingYet
                  ))}

                {/* JD Match Comparison */}
                {activeTab === 'jd-match' && jobDescription && (
                  <JDComparisonView
                    jobDescription={jobDescription}
                    resumeData={resumeData}
                    jobKeywords={jobKeywords}
                    company={jobCompany}
                    forcedKeywords={jobForcedKeywords}
                  />
                )}

                {/* ATS Parse Check */}
                {activeTab === 'ats-check' && (
                  <AtsCheckView
                    resumeId={resumeId}
                    settings={templateSettings}
                    locale={uiLanguage}
                    hasUnsavedChanges={hasUnsavedChanges}
                  />
                )}
              </div>
            </div>
          }
        />
      </div>

      {agentMode && (
        <AgentPromptDialog
          task={agentTask}
          resumeId={resumeId ?? ''}
          onClose={() => setAgentTask(null)}
        />
      )}

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
        open={pendingDraftRestore !== null || pendingAttachmentDraftRestore !== null}
        onOpenChange={() => undefined}
        dismissible={false}
        title={t('builder.draftRecovery.title')}
        description={t(
          resumeId ? 'builder.draftRecovery.description' : 'builder.draftRecovery.newDescription'
        )}
        confirmLabel={t('builder.draftRecovery.restoreDraft')}
        cancelLabel={t(resumeId ? 'builder.draftRecovery.useServer' : 'builder.discardChanges')}
        variant="warning"
        closeOnConfirm={false}
        onConfirm={handleRestorePendingDrafts}
        onCancel={handleKeepServerDraft}
      />

      {/* Leave With Local Draft Dialog */}
      <ConfirmDialog
        open={showLeaveWithLocalDraftDialog}
        onOpenChange={setShowLeaveWithLocalDraftDialog}
        title={t(
          hasCurrentRecoveryDraft
            ? 'builder.leaveWithLocalDraft.title'
            : 'builder.leaveWithoutDraft.title'
        )}
        description={t(
          hasCurrentRecoveryDraft
            ? 'builder.leaveWithLocalDraft.description'
            : 'builder.leaveWithoutDraft.description'
        )}
        confirmLabel={t(
          hasCurrentRecoveryDraft
            ? 'builder.leaveWithLocalDraft.leave'
            : 'builder.leaveWithoutDraft.leave'
        )}
        cancelLabel={t(
          hasCurrentRecoveryDraft
            ? 'builder.leaveWithLocalDraft.stay'
            : 'builder.leaveWithoutDraft.stay'
        )}
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
        needsRefresh={regenerateWizard.needsRefresh}
        error={regenerateWizard.error}
        onGenerate={regenerateWizard.generate}
        onAccept={regenerateWizard.acceptChanges}
        onReject={regenerateWizard.rejectAndRegenerate}
        onClose={regenerateWizard.reset}
      />
    </div>
  );
};

const ResumeBuilderDocument = ({ agentMode }: ResumeBuilderProps) => {
  const searchParams = useSearchParams();
  // Query-only navigation can retain this page. Remount the editor at the
  // document boundary so every baseline, queue and draft belongs to one ID.
  return <ResumeBuilderContent key={searchParams.get('id') ?? 'new'} agentMode={agentMode} />;
};

export const ResumeBuilder = ({ agentMode }: ResumeBuilderProps) => {
  const { t } = useTranslations();
  return (
    <Suspense fallback={<div>{t('common.loading')}</div>}>
      <ResumeBuilderDocument agentMode={agentMode} />
    </Suspense>
  );
};
