'use client';

import { SwissGrid } from '@/components/home/swiss-grid';
import { ResumeUploadDialog } from '@/components/dashboard/resume-upload-dialog';
import { MasterResumeChoiceDialog } from '@/components/dashboard/master-resume-choice-dialog';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { StatusIndicator, type StatusTone } from '@/components/ui/status-indicator';
import { DefaultBadge } from '@/components/common/default-badge';
import { LlmSetupAlert } from '@/components/common/llm-setup-alert';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n';
import { formatDate } from '@/lib/format-date';
import { cn } from '@/lib/utils';

// Optimized Imports for Performance (No Barrel Imports)
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Settings from 'lucide-react/dist/esm/icons/settings';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';

import {
  fetchResume,
  fetchResumeList,
  deleteResume,
  retryProcessing,
  fetchJobDescription,
  setDefaultMasterResume,
  duplicateResume,
  MAX_MASTER_RESUMES,
  type ResumeListItem,
} from '@/lib/api/resume';
import { useStatusCache } from '@/lib/context/status-cache';
import { hasMeaningfulResumeContent } from '@/lib/utils/resume-content';

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'loading';

// Stretched link: its ::after covers the whole tile, so the tile navigates by mouse and
// keyboard. Tile action buttons sit above it (z-10) and stay outside the link.
const TILE_LINK =
  'after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-primary';
// Action tiles (initialize, add track) are one native button filling the Card.
const TILE_BUTTON =
  'flex flex-1 flex-col justify-between p-6 text-left md:p-8 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary';
// Tile highlight (owner ruling): hover or keyboard focus inside a tile lifts it to white with
// Card's 2px ink frame and 1px press-in. Only the title and the + mark turn primary
// (TILE_ACCENT); everything else keeps its colour. Never a full blue fill.
const TILE_LIFT =
  'hover:bg-white has-[:focus-visible]:z-20 has-[:focus-visible]:border-ink has-[:focus-visible]:bg-white has-[:focus-visible]:translate-x-px has-[:focus-visible]:translate-y-px';
const TILE_ACCENT = 'group-hover:text-primary group-has-[:focus-visible]:text-primary';
// Monogram fills: brand tokens only, each AA with white text (lowest: steel, 5.19:1).
const MONOGRAM_FILLS = ['bg-primary', 'bg-ink', 'bg-success', 'bg-steel', 'bg-destructive'];
const FILLER_FILLS = ['bg-panel', 'bg-panel-hover', 'bg-panel-hover', 'bg-panel'];

export default function DashboardPage() {
  const { t, locale } = useTranslations();
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('loading');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [listError, setListError] = useState(false);
  const [deleteError, setDeleteError] = useState(false);
  // One dialog for failed tile actions (set default, duplicate, re-upload default).
  const [actionError, setActionError] = useState<string | null>(null);
  const [tailoredResumes, setTailoredResumes] = useState<ResumeListItem[]>([]);
  const [otherMasters, setOtherMasters] = useState<ResumeListItem[]>([]);
  const [defaultMasterTitle, setDefaultMasterTitle] = useState<string | null>(null);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDuplicating, setIsDuplicating] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isMasterChoiceDialogOpen, setIsMasterChoiceDialogOpen] = useState(false);
  // Set by "Delete and re-upload": the next completed upload replaces the deleted default.
  const [reuploadReplacesDefault, setReuploadReplacesDefault] = useState(false);
  const router = useRouter();

  // Status cache for optimistic counter updates and LLM status check
  const {
    status: systemStatus,
    isLoading: statusLoading,
    incrementResumes,
    decrementResumes,
    setHasMasterResume,
  } = useStatusCache();
  // Read through a ref so the list reconcile keeps a stable identity (it drives the load effects).
  const setHasMasterResumeRef = useRef(setHasMasterResume);
  useEffect(() => {
    setHasMasterResumeRef.current = setHasMasterResume;
  }, [setHasMasterResume]);

  // Request id guard for concurrent loadTailoredResumes invocations
  const loadRequestIdRef = useRef(0);
  const statusRequestIdRef = useRef(0);
  const retryMasterRef = useRef<string | null>(null);
  const pollAttemptsRef = useRef(0);
  const otherMastersPollAttemptsRef = useRef(0);
  const [statusRevision, setStatusRevision] = useState(0);
  // Bumped when the latest list load ends without new data, so the extra-master poll it
  // superseded is rescheduled (a successful load re-arms it through `otherMasters`).
  const [listRevision, setListRevision] = useState(0);
  const activeMasterIdRef = useRef<string | null>(null);
  const mountedRef = useRef(true);
  // Lightweight in-memory cache for job snippets to avoid N+1 refetches
  const jobSnippetCacheRef = useRef<Record<string, string>>({});

  // Check if LLM is configured (API key is set)
  const isLlmConfigured = !statusLoading && systemStatus?.llm_configured;

  // Any ready master can be tailored (the tailor page picks the default, else the
  // stored id, else the first ready one), so a failed default must not block the rest.
  const hasReadyMaster =
    processingStatus === 'ready' || otherMasters.some((r) => r.processing_status === 'ready');
  const isTailorEnabled = Boolean(masterResumeId) && hasReadyMaster && isLlmConfigured;

  const formatEditedDate = (value: string) =>
    formatDate(value, locale, { month: 'short', day: '2-digit', year: 'numeric' }) ||
    t('common.unknown');

  const adoptMasterResume = useCallback((resumeId: string | null) => {
    if (activeMasterIdRef.current !== resumeId) {
      statusRequestIdRef.current += 1;
      retryMasterRef.current = null;
      pollAttemptsRef.current = 0;
      setIsRetrying(false);
    }
    activeMasterIdRef.current = resumeId;
    setMasterResumeId(resumeId);
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
      loadRequestIdRef.current += 1;
      statusRequestIdRef.current += 1;
    };
  }, []);

  const checkResumeStatus = useCallback(
    async (resumeId: string, background = false) => {
      if (
        !mountedRef.current ||
        activeMasterIdRef.current !== resumeId ||
        retryMasterRef.current === resumeId
      )
        return;
      if (!background) pollAttemptsRef.current = 0;
      const requestId = ++statusRequestIdRef.current;
      const isCurrent = () =>
        mountedRef.current &&
        requestId === statusRequestIdRef.current &&
        activeMasterIdRef.current === resumeId;
      try {
        if (!background) setProcessingStatus('loading');
        const data = await fetchResume(resumeId);
        if (!isCurrent()) return;
        const savedStatus = data.raw_resume?.processing_status || 'pending';
        // Older backend versions accepted `{}` as a valid ResumeData object.
        // Surface that legacy state as failed so users can retry it safely.
        const status =
          savedStatus === 'ready' && !hasMeaningfulResumeContent(data.processed_resume)
            ? 'failed'
            : savedStatus;
        setProcessingStatus(status as ProcessingStatus);
      } catch (err: unknown) {
        if (!isCurrent()) return;
        console.error('Failed to check resume status:', err);
        // If resume not found (404), clear the stale localStorage
        if (err instanceof Error && err.message.includes('404')) {
          localStorage.removeItem('master_resume_id');
          adoptMasterResume(null);
          return;
        }
        setProcessingStatus('failed');
      } finally {
        if (isCurrent()) setStatusRevision((version) => version + 1);
      }
    },
    [adoptMasterResume]
  );

  useEffect(() => {
    const storedId = localStorage.getItem('master_resume_id');
    if (storedId) {
      adoptMasterResume(storedId);
      checkResumeStatus(storedId);
    }
  }, [adoptMasterResume, checkResumeStatus]);

  // A bounded backoff preserves the processing label and never overlaps requests.
  // Focus or an explicit refresh starts a fresh observation window.
  useEffect(() => {
    if (
      !masterResumeId ||
      isRetrying ||
      !['pending', 'processing'].includes(processingStatus) ||
      pollAttemptsRef.current >= 12
    )
      return;
    const requestId = statusRequestIdRef.current;
    const delay = Math.min(30_000, 3_000 * 2 ** pollAttemptsRef.current);
    const timer = window.setTimeout(() => {
      if (requestId !== statusRequestIdRef.current || document.hidden) return;
      pollAttemptsRef.current += 1;
      void checkResumeStatus(masterResumeId, true);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [masterResumeId, processingStatus, isRetrying, statusRevision, checkResumeStatus]);

  // `background` marks a poll-driven refresh: it must not reset the default master's
  // observation window or flash its status back to "checking".
  const loadTailoredResumes = useCallback(
    async (background = false) => {
      const requestId = ++loadRequestIdRef.current;
      const isCurrent = () => mountedRef.current && requestId === loadRequestIdRef.current;
      try {
        setListError(false);
        const data = await fetchResumeList(true);
        if (!isCurrent()) return;
        const masters = data.filter((r) => r.is_master);
        // Server truth for the shared flag Settings reads; other pages can leave it stale.
        setHasMasterResumeRef.current(masters.length > 0);
        const masterFromList = masters.find((r) => r.is_default_master) ?? masters[0];
        const storedId = localStorage.getItem('master_resume_id');
        const resolvedMasterId = masterFromList?.resume_id || storedId;

        if (resolvedMasterId) {
          const sameMaster = activeMasterIdRef.current === resolvedMasterId;
          localStorage.setItem('master_resume_id', resolvedMasterId);
          adoptMasterResume(resolvedMasterId);
          checkResumeStatus(resolvedMasterId, background && sameMaster);
        } else {
          localStorage.removeItem('master_resume_id');
          adoptMasterResume(null);
        }

        setOtherMasters(masters.filter((r) => r.resume_id !== resolvedMasterId));
        setDefaultMasterTitle(masterFromList?.title ?? null);
        const filtered = data.filter((r) => !r.is_master && r.resume_id !== resolvedMasterId);
        setTailoredResumes(filtered);

        // Only fetch job descriptions for resumes that are actually tailored
        // (identified by having a non-null parent_id). This avoids N+1 calls
        // for untailored resumes.
        const tailoredWithParent = filtered.filter((r) => r.parent_id);

        // Fetch job description snippets for tailored resumes in parallel and attach to state
        // Use a small in-memory cache to avoid re-fetching the same snippet repeatedly.
        const jobSnippets: Record<string, string> = {};
        await Promise.all(
          tailoredWithParent.map(async (r) => {
            // Use cached snippet when available
            if (jobSnippetCacheRef.current[r.resume_id]) {
              jobSnippets[r.resume_id] = jobSnippetCacheRef.current[r.resume_id];
              return;
            }
            try {
              const jd = await fetchJobDescription(r.resume_id);
              const snippet = (jd?.content || '').slice(0, 80);
              if (isCurrent()) jobSnippetCacheRef.current[r.resume_id] = snippet;
              jobSnippets[r.resume_id] = snippet;
            } catch {
              // ignore missing job descriptions and cache empty result
              if (isCurrent()) jobSnippetCacheRef.current[r.resume_id] = '';
              jobSnippets[r.resume_id] = '';
            }
          })
        );

        // Only apply results if this invocation is the latest (prevents stale overwrite)
        if (isCurrent()) {
          setTailoredResumes((prev) =>
            prev.map((r) => ({ ...r, jobSnippet: jobSnippets[r.resume_id] || '' }))
          );
        }
      } catch (err) {
        if (!isCurrent()) return;
        console.error('Failed to load tailored resumes:', err);
        setListError(true);
        setListRevision((version) => version + 1);
      }
    },
    [adoptMasterResume, checkResumeStatus]
  );

  // Extra masters parse in the background; refresh the list with the same bounded
  // backoff as the default master until none is pending or processing.
  useEffect(() => {
    const isParsing = otherMasters.some((r) =>
      ['pending', 'processing'].includes(r.processing_status)
    );
    if (!isParsing) {
      otherMastersPollAttemptsRef.current = 0;
      return;
    }
    if (otherMastersPollAttemptsRef.current >= 12) return;
    // A reload started after scheduling (focus, upload, an action) supersedes this
    // poll; the list it loads, or `listRevision` when it fails, re-runs this effect.
    const requestId = loadRequestIdRef.current;
    const delay = Math.min(30_000, 3_000 * 2 ** otherMastersPollAttemptsRef.current);
    const timer = window.setTimeout(() => {
      if (requestId !== loadRequestIdRef.current || document.hidden) return;
      otherMastersPollAttemptsRef.current += 1;
      void loadTailoredResumes(true);
    }, delay);
    return () => window.clearTimeout(timer);
  }, [otherMasters, listRevision, loadTailoredResumes]);

  useEffect(() => {
    loadTailoredResumes();
  }, [loadTailoredResumes]);

  // Refresh list when window gains focus (e.g., returning from viewer after delete)
  useEffect(() => {
    const handleFocus = () => {
      otherMastersPollAttemptsRef.current = 0;
      loadTailoredResumes();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadTailoredResumes, checkResumeStatus]);

  const handleUploadComplete = (resumeId: string) => {
    // Update cached counters
    incrementResumes();
    setHasMasterResume(true);
    if (reuploadReplacesDefault) {
      setReuploadReplacesDefault(false);
      otherMastersPollAttemptsRef.current = 0;
      void makeReuploadDefault(resumeId);
      return;
    }
    // Only the first upload becomes the default; later ones join the other masters
    if (!masterResumeId) {
      localStorage.setItem('master_resume_id', resumeId);
      adoptMasterResume(resumeId);
      // Check status after upload completes
      checkResumeStatus(resumeId);
    }
    otherMastersPollAttemptsRef.current = 0;
    void loadTailoredResumes();
  };

  // Deleting the old default promoted another track on the server, so the
  // re-upload takes the default explicitly. The list reload shows it either way.
  const makeReuploadDefault = async (resumeId: string) => {
    try {
      await setDefaultMasterResume(resumeId);
      localStorage.setItem('master_resume_id', resumeId);
    } catch (err) {
      console.error('Failed to set the re-uploaded resume as default:', err);
      // Close the upload dialog (still showing success until its 1.5 s auto-close) in the
      // same render, so the error never stacks on it or loses the scroll lock when it closes.
      setIsUploadDialogOpen(false);
      setActionError(t('resumeViewer.setDefaultError'));
    }
    await loadTailoredResumes();
  };

  const handleUploadDialogOpenChange = (open: boolean) => {
    setIsUploadDialogOpen(open);
    // A re-upload dialog closed without an upload ends the replacement.
    if (!open) setReuploadReplacesDefault(false);
  };

  const handleSetDefault = async (e: React.MouseEvent, resumeId: string) => {
    e.stopPropagation();
    try {
      await setDefaultMasterResume(resumeId);
      localStorage.setItem('master_resume_id', resumeId);
      await loadTailoredResumes();
    } catch (err) {
      console.error('Failed to set default master resume:', err);
      setActionError(t('resumeViewer.setDefaultError'));
    }
  };

  const handleDuplicate = async (e: React.MouseEvent, resumeId: string) => {
    e.stopPropagation();
    setIsDuplicating(true);
    try {
      await duplicateResume(resumeId);
      incrementResumes();
      await loadTailoredResumes();
    } catch (err) {
      console.error('Failed to duplicate resume:', err);
      // A 409 (master limit, not ready) carries a message written for the user.
      const isConflict = (err as { status?: number } | null)?.status === 409;
      setActionError(
        isConflict && err instanceof Error ? err.message : t('resumeViewer.duplicateError')
      );
    } finally {
      setIsDuplicating(false);
    }
  };

  const handleChooseUpload = () => {
    setIsMasterChoiceDialogOpen(false);
    setIsUploadDialogOpen(true);
  };

  const handleChooseWizard = () => {
    setIsMasterChoiceDialogOpen(false);
    router.push('/resume-wizard');
  };

  const handleRetryProcessing = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!masterResumeId || retryMasterRef.current === masterResumeId) return;
    const resumeId = masterResumeId;
    retryMasterRef.current = resumeId;
    const requestId = ++statusRequestIdRef.current;
    const isCurrent = () =>
      mountedRef.current &&
      requestId === statusRequestIdRef.current &&
      activeMasterIdRef.current === resumeId;
    setIsRetrying(true);
    setProcessingStatus('loading');
    try {
      const result = await retryProcessing(resumeId);
      if (!isCurrent()) return;
      if (result.processing_status === 'ready') {
        setProcessingStatus('ready');
      } else if (
        result.processing_status === 'processing' ||
        result.processing_status === 'pending'
      ) {
        pollAttemptsRef.current = 0;
        setProcessingStatus(result.processing_status);
      } else {
        setProcessingStatus('failed');
      }
    } catch (err) {
      if (!isCurrent()) return;
      console.error('Retry processing failed:', err);
      if (err instanceof Error && err.message.includes('status 404')) {
        localStorage.removeItem('master_resume_id');
        adoptMasterResume(null);
        setHasMasterResume(false);
        return;
      }
      setProcessingStatus('failed');
    } finally {
      if (isCurrent()) {
        retryMasterRef.current = null;
        setIsRetrying(false);
      }
    }
  };

  const handleDeleteAndReupload = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const confirmDeleteAndReupload = async () => {
    if (!masterResumeId) return;
    const resumeId = masterResumeId;
    const invalidationId = ++loadRequestIdRef.current;
    try {
      setDeleteError(false);
      await deleteResume(resumeId);
      if (!mountedRef.current || activeMasterIdRef.current !== resumeId) return;
      decrementResumes();
      // The server promotes a remaining master, so the flag only clears with the last one.
      setHasMasterResume(otherMasters.length > 0);
      localStorage.removeItem('master_resume_id');
      adoptMasterResume(null);
      setProcessingStatus('loading');
      setReuploadReplacesDefault(true);
      setIsUploadDialogOpen(true);
      await loadTailoredResumes();
    } catch (err) {
      if (!mountedRef.current || activeMasterIdRef.current !== resumeId) return;
      console.error('Failed to delete resume:', err);
      setShowDeleteDialog(false);
      setDeleteError(true);
    } finally {
      // No reload followed (the delete failed or the master changed): re-arm the poll.
      if (mountedRef.current && invalidationId === loadRequestIdRef.current) {
        setListRevision((version) => version + 1);
      }
    }
  };

  // Persistent state is a StatusIndicator square; Loader2 marks in-flight work only.
  const getStatusDisplay = (): { text: string; tone: StatusTone; busy: boolean } => {
    switch (processingStatus) {
      case 'loading':
        return { text: t('dashboard.status.checking'), tone: 'neutral', busy: true };
      case 'processing':
        return { text: t('dashboard.status.processing'), tone: 'active', busy: true };
      case 'ready':
        return { text: t('dashboard.status.ready'), tone: 'ready', busy: false };
      case 'failed':
        return { text: t('dashboard.status.failed'), tone: 'error', busy: false };
      default:
        return { text: t('dashboard.status.pending'), tone: 'neutral', busy: false };
    }
  };

  const getMonogram = (title: string): string => {
    const words = title.split(/\s+/).filter((w) => /^[a-zA-Z]/.test(w));
    return words
      .slice(0, 3)
      .map((w) => w.charAt(0).toUpperCase())
      .join('');
  };

  const hashTitle = (title: string): number => {
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = (hash << 5) - hash + title.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  };

  const atMasterLimit = 1 + otherMasters.length >= MAX_MASTER_RESUMES;
  const showAddTrackTile = Boolean(masterResumeId) && !atMasterLimit && isLlmConfigured;
  const totalCards =
    1 + otherMasters.length + tailoredResumes.length + 1 + (showAddTrackTile ? 1 : 0);
  const fillerCount = Math.max(0, (5 - (totalCards % 5)) % 5);
  const extraFillerCount = 5;
  const statusDisplay = getStatusDisplay();
  // A failed load with nothing to show: the alert alone, no tiles (an empty account looks different).
  const emptyWithError =
    listError && !masterResumeId && otherMasters.length === 0 && tailoredResumes.length === 0;
  const showLlmAlert = Boolean(masterResumeId) && !isLlmConfigured && !statusLoading;

  return (
    <SwissGrid
      banner={
        (listError || showLlmAlert) && (
          <>
            {listError && (
              <Alert tone="error" title={t('dashboard.errors.loadFailed')}>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => void loadTailoredResumes()}
                >
                  <RefreshCw aria-hidden="true" />
                  {t('common.retry')}
                </Button>
              </Alert>
            )}
            {showLlmAlert && (
              <LlmSetupAlert
                titleKey="dashboard.llmNotConfiguredTitle"
                messageKey="dashboard.llmNotConfiguredMessage"
                actionKey="nav.settings"
              />
            )}
          </>
        )
      }
    >
      {!emptyWithError && (
        <>
          {/* 1. Master Resume Logic */}
          {!masterResumeId ? (
            // LLM Not Configured or Upload State
            !isLlmConfigured && !statusLoading ? (
              <Link
                href="/settings"
                className="group/setup block h-full focus-visible:outline-none"
              >
                <Card
                  variant="interactive"
                  className="aspect-square h-full border-dashed border-warning bg-warning-tint hover:bg-white group-focus-visible/setup:z-20 group-focus-visible/setup:border-ink group-focus-visible/setup:bg-white group-focus-visible/setup:translate-x-px group-focus-visible/setup:translate-y-px group-focus-visible/setup:ring-2 group-focus-visible/setup:ring-inset group-focus-visible/setup:ring-primary"
                >
                  <div className="flex-1 flex flex-col justify-between">
                    <AlertTriangle aria-hidden="true" className="size-6 text-warning-text" />
                    <div>
                      <CardTitle className="text-lg uppercase text-warning-text mb-2 group-hover:text-primary group-focus-visible/setup:text-primary">
                        {t('dashboard.setupRequiredTitle')}
                      </CardTitle>
                      <CardDescription className="text-warning-text text-xs">
                        {t('dashboard.setupRequiredMessage')}
                      </CardDescription>
                      <div className="flex items-center gap-2 mt-4 text-warning-text">
                        <Settings aria-hidden="true" className="size-4" />
                        <span className="font-mono text-xs font-bold uppercase">
                          {t('nav.goToSettings')}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ) : (
              <Card
                variant="interactive"
                noPadding
                className={cn('aspect-square h-full', TILE_LIFT)}
              >
                <button
                  type="button"
                  className={TILE_BUTTON}
                  aria-label={t('dashboard.initializeMasterResume')}
                  onClick={() => setIsMasterChoiceDialogOpen(true)}
                >
                  <span
                    className={cn(
                      'size-12 border-2 border-ink flex items-center justify-center mb-4 group-hover:border-primary group-has-[:focus-visible]:border-primary',
                      TILE_ACCENT
                    )}
                  >
                    <Plus aria-hidden="true" className="size-6" />
                  </span>
                  <span className="block">
                    <span
                      className={cn(
                        'block font-serif text-xl font-bold uppercase leading-none tracking-tight',
                        TILE_ACCENT
                      )}
                    >
                      {t('dashboard.initializeMasterResume')}
                    </span>
                    <span className="mt-2 block font-mono text-sm text-steel">
                      {'// '}
                      {t('dashboard.initializeSequence')}
                    </span>
                  </span>
                </button>
              </Card>
            )
          ) : (
            // Master Resume Exists
            <Card variant="interactive" className={cn('aspect-square h-full', TILE_LIFT)}>
              <div className="flex-1 flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                  <div className="size-12 border-2 border-ink bg-primary text-white flex items-center justify-center">
                    <span className="font-mono font-bold text-lg">M</span>
                  </div>
                  {(processingStatus === 'failed' || processingStatus === 'processing') && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-sm"
                      className="z-10"
                      onClick={handleRetryProcessing}
                      disabled={isRetrying}
                      aria-label={t('dashboard.retryProcessing')}
                      title={t('dashboard.retryProcessing')}
                    >
                      {isRetrying ? (
                        <Loader2 aria-hidden="true" className="animate-spin" />
                      ) : (
                        <RefreshCw aria-hidden="true" />
                      )}
                    </Button>
                  )}
                </div>

                <div className="flex items-start gap-2">
                  <CardTitle className={cn('min-w-0 text-lg line-clamp-2', TILE_ACCENT)}>
                    <Link href={`/resumes/${masterResumeId}`} className={TILE_LINK}>
                      {defaultMasterTitle || t('dashboard.masterResume')}
                    </Link>
                  </CardTitle>
                  <DefaultBadge>{t('dashboard.defaultBadge')}</DefaultBadge>
                </div>

                <div className="mt-auto pt-4 flex flex-col gap-2">
                  <div className="flex items-center gap-2">
                    {statusDisplay.busy && (
                      <Loader2
                        aria-hidden="true"
                        className={cn(
                          'size-4 animate-spin',
                          statusDisplay.tone === 'active' ? 'text-primary' : 'text-steel'
                        )}
                      />
                    )}
                    <StatusIndicator tone={statusDisplay.tone}>
                      {t('dashboard.statusLine', { status: statusDisplay.text })}
                    </StatusIndicator>
                  </div>
                  {(processingStatus === 'failed' || processingStatus === 'processing') && (
                    <div className="flex flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="z-10"
                        onClick={handleRetryProcessing}
                        disabled={isRetrying}
                      >
                        {isRetrying
                          ? t('dashboard.retryingProcessing')
                          : t('dashboard.retryProcessing')}
                      </Button>
                      <Button
                        type="button"
                        variant="outline-destructive"
                        size="sm"
                        className="z-10"
                        onClick={handleDeleteAndReupload}
                      >
                        {t('dashboard.deleteAndReupload')}
                      </Button>
                    </div>
                  )}
                </div>
              </div>
            </Card>
          )}

          {/* 2. Other Master Resumes */}
          {otherMasters.map((resume) => {
            const title = resume.title || resume.filename || t('dashboard.masterTrack');
            return (
              <Card
                key={resume.resume_id}
                variant="interactive"
                className={cn('aspect-square h-full', TILE_LIFT)}
              >
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div className="size-12 border-2 border-ink bg-primary text-white flex items-center justify-center">
                      <span className="font-mono font-bold">M</span>
                    </div>
                    <span className="font-mono text-xs text-steel uppercase">
                      {resume.processing_status}
                    </span>
                  </div>
                  <CardTitle className={cn('text-lg', TILE_ACCENT)}>
                    <Link
                      href={`/resumes/${resume.resume_id}`}
                      className={cn(
                        'block font-serif text-base font-bold leading-tight mb-1 w-full line-clamp-2',
                        TILE_LINK
                      )}
                    >
                      {title}
                    </Link>
                  </CardTitle>
                  <div className="mt-auto pt-4 flex flex-wrap gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className="z-10"
                      aria-label={t('dashboard.setDefault')}
                      onClick={(e) => handleSetDefault(e, resume.resume_id)}
                    >
                      {t('dashboard.setDefault')}
                    </Button>
                    {!atMasterLimit && (
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className="z-10"
                        aria-label={t('dashboard.duplicate')}
                        disabled={isDuplicating || resume.processing_status !== 'ready'}
                        onClick={(e) => handleDuplicate(e, resume.resume_id)}
                      >
                        {t('dashboard.duplicate')}
                      </Button>
                    )}
                  </div>
                </div>
              </Card>
            );
          })}

          {/* 3. Add Master Track */}
          {showAddTrackTile && (
            <Card variant="interactive" noPadding className={cn('aspect-square h-full', TILE_LIFT)}>
              <button
                type="button"
                className={TILE_BUTTON}
                aria-label={t('dashboard.addMasterTrack')}
                onClick={() => setIsMasterChoiceDialogOpen(true)}
              >
                <span
                  className={cn(
                    'flex items-center gap-2 font-serif text-lg font-bold uppercase leading-none tracking-tight',
                    TILE_ACCENT
                  )}
                >
                  <Plus aria-hidden="true" className="size-4 shrink-0" />
                  {t('dashboard.addMasterTrack')}
                </span>
                <span className="block font-mono text-sm uppercase text-steel">
                  {t('dashboard.masterLimitReached', { max: MAX_MASTER_RESUMES })}
                </span>
              </button>
            </Card>
          )}

          {/* 4. Tailored Resumes */}
          {tailoredResumes.map((resume) => {
            const title =
              resume.title || resume.jobSnippet || resume.filename || t('dashboard.tailoredResume');
            const monogramFill = MONOGRAM_FILLS[hashTitle(title) % MONOGRAM_FILLS.length];
            return (
              <Card
                key={resume.resume_id}
                variant="interactive"
                className={cn('aspect-square h-full', TILE_LIFT)}
              >
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div
                      className={cn(
                        'size-12 border-2 border-ink text-white flex items-center justify-center',
                        monogramFill
                      )}
                    >
                      <span className="font-mono font-bold">{getMonogram(title)}</span>
                    </div>
                    <span className="font-mono text-xs text-steel uppercase">
                      {resume.processing_status}
                    </span>
                  </div>
                  <CardTitle className={cn('text-lg', TILE_ACCENT)}>
                    <Link
                      href={`/resumes/${resume.resume_id}`}
                      className={cn(
                        'block font-serif text-base font-bold leading-tight mb-1 w-full line-clamp-2',
                        TILE_LINK
                      )}
                    >
                      {title}
                    </Link>
                  </CardTitle>
                  <CardDescription className="mt-auto pt-4 uppercase tabular-nums">
                    {t('dashboard.edited', {
                      date: formatEditedDate(resume.updated_at || resume.created_at),
                    })}
                  </CardDescription>
                </div>
              </Card>
            );
          })}

          {/* 5. Create Tailored Resume */}
          <Card className="aspect-square h-full" variant="default">
            <div className="flex-1 flex flex-col items-center justify-center text-center h-full">
              <Button
                type="button"
                className="size-20"
                onClick={() => router.push('/tailor')}
                disabled={!isTailorEnabled}
                aria-label={t('dashboard.createResume')}
                title={t('dashboard.createResume')}
              >
                <Plus aria-hidden="true" className="size-8" />
              </Button>
              <p className="text-xs font-mono mt-4 uppercase text-steel">
                {t('dashboard.createResume')}
              </p>
            </div>
          </Card>

          {/* 6. Fillers */}
          {Array.from({ length: fillerCount }).map((_, index) => (
            <Card
              key={`filler-${index}`}
              variant="ghost"
              noPadding
              className="hidden md:block bg-canvas aspect-square h-full opacity-50 pointer-events-none"
            />
          ))}

          {Array.from({ length: extraFillerCount }).map((_, index) => (
            <Card
              key={`extra-filler-${index}`}
              variant="ghost"
              noPadding
              className={`hidden md:block ${FILLER_FILLS[index % FILLER_FILLS.length]} aspect-square h-full opacity-70 pointer-events-none`}
            />
          ))}
        </>
      )}

      <MasterResumeChoiceDialog
        open={isMasterChoiceDialogOpen}
        onOpenChange={setIsMasterChoiceDialogOpen}
        onChooseUpload={handleChooseUpload}
        onChooseWizard={handleChooseWizard}
      />
      <ResumeUploadDialog
        open={isUploadDialogOpen}
        onOpenChange={handleUploadDialogOpenChange}
        onUploadComplete={handleUploadComplete}
        becomesDefault={reuploadReplacesDefault}
        trigger={<button type="button" className="hidden" tabIndex={-1} aria-hidden="true" />}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={t('confirmations.deleteMasterResumeTitle')}
        description={t('confirmations.deleteMasterResumeDescription')}
        confirmLabel={t('dashboard.deleteAndReupload')}
        cancelLabel={t('confirmations.keepResumeCancelLabel')}
        onConfirm={confirmDeleteAndReupload}
        variant="danger"
      />

      <ConfirmDialog
        open={deleteError}
        onOpenChange={setDeleteError}
        title={t('common.error')}
        description={t('dashboard.errors.deleteFailed')}
        confirmLabel={t('common.retry')}
        cancelLabel={t('common.cancel')}
        onConfirm={confirmDeleteAndReupload}
        onCancel={() => setDeleteError(false)}
        variant="danger"
      />

      <ConfirmDialog
        open={actionError !== null}
        onOpenChange={(open) => !open && setActionError(null)}
        title={t('common.error')}
        description={actionError ?? ''}
        confirmLabel={t('common.ok')}
        onConfirm={() => setActionError(null)}
        variant="danger"
        showCancelButton={false}
      />
    </SwissGrid>
  );
}
