'use client';

import { SwissGrid } from '@/components/home/swiss-grid';
import { ResumeUploadDialog } from '@/components/dashboard/resume-upload-dialog';
import { AgentPromptDialog, type AgentTask } from '@/components/agent/agent-prompt-dialog';
import { useAgentRefresh } from '@/hooks/use-agent-refresh';
import { MasterResumeChoiceDialog } from '@/components/dashboard/master-resume-choice-dialog';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Alert } from '@/components/ui/alert';
import { Button, buttonClass } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import { Hatch } from '@/components/ui/hatch';
import { Dropdown } from '@/components/ui/dropdown';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { StatusIndicator, type StatusTone } from '@/components/ui/status-indicator';
import { toast } from '@/components/ui/toast';
import { DefaultBadge } from '@/components/common/default-badge';
import { LlmSetupAlert } from '@/components/common/llm-setup-alert';
import Link from 'next/link';
import dynamic from 'next/dynamic';
import { useTranslations } from '@/lib/i18n';
import { formatDate, formatTimeAgo } from '@/lib/format-date';
import { downloadBlobAsFile, sanitizeFilename } from '@/lib/utils/download';
import { DEFAULT_TEMPLATE_SETTINGS, PAGE_SIZE_INFO } from '@/lib/types/template-settings';
import { cn } from '@/lib/utils';

// Optimized Imports for Performance (No Barrel Imports)
import {
  SpinnerGap,
  ArrowsClockwise,
  ArrowRight,
  DotsThree,
  DownloadSimple,
  PencilSimple,
  Plus,
  Gear,
  Warning,
} from '@phosphor-icons/react';

import {
  fetchResume,
  fetchResumeList,
  deleteResume,
  retryProcessing,
  fetchJobDescription,
  downloadResumePdf,
  setDefaultMasterResume,
  duplicateResume,
  MAX_MASTER_RESUMES,
  type ResumeListItem,
} from '@/lib/api/resume';
import { ApiError } from '@/lib/api/client';
import { useStatusCache } from '@/lib/context/status-cache';
import { hasMeaningfulResumeContent } from '@/lib/utils/resume-content';

// The tile menu (ui-sdk's Menu) loads after the page: nobody opens it before first paint,
// and it would otherwise add its whole popup layer to the dashboard's first-load JS.
const ActionMenu = dynamic(() => import('@/components/ui/action-menu').then((m) => m.ActionMenu));

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'loading';

// Stretched link: its ::after covers the whole tile, so the tile navigates by mouse and
// keyboard. Tile action buttons sit above it (z-10) and stay outside the link.
const TILE_LINK =
  'after:absolute after:inset-0 focus-visible:outline-none focus-visible:after:ring-2 focus-visible:after:ring-inset focus-visible:after:ring-white';
// Action tiles (initialize, add track) are one native button filling the Card.
const TILE_BUTTON =
  'flex flex-1 flex-col justify-between p-4 text-left focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-white';
// Tile highlight (owner ruling, round 2): hover, or keyboard focus anywhere inside a tile, fills
// the tile Hyper Blue with white text. There is no ink outline: Card interactive's
// `hover:border-ink` is overridden here so the 2px border stays transparent, and its 1px press-in
// is cancelled. Focus adds a 2px inset white ring on the link or button (a primary ring would
// vanish on the fill). Inherited text turns white with the tile; anything that sets its own
// colour (steel captions, the spinner, status squares, monogram frames) opts in below so it
// stays AA on blue (white on primary is 6.7:1).
// Every dashboard tile: 5:4, a fifth shorter than the square it was. Padded 16px (Card's
// default is 24 to 32px), so the square, a three-line title and two meta lines fit the
// shape at the narrowest tile any column count gives (about 255px wide, 204px tall).
const TILE_SHAPE = 'aspect-5/4 h-full';
const TILE_PAD = 'p-4 md:p-4';
const TILE_FILL =
  'hover:border-transparent hover:translate-x-0 hover:translate-y-0 hover:bg-primary hover:text-white has-[:focus-visible]:z-20 has-[:focus-visible]:bg-primary has-[:focus-visible]:text-white';
const TILE_WHITE = 'group-hover:text-white group-has-[:focus-visible]:text-white';
const TILE_WHITE_BORDER = 'group-hover:border-white group-has-[:focus-visible]:border-white';
// StatusIndicator (components/ui) colours its square and label itself, so the tile reaches in.
const TILE_STATUS =
  'group-hover:[&>span:first-child]:bg-white group-hover:[&>span:last-child]:text-white group-has-[:focus-visible]:[&>span:first-child]:bg-white group-has-[:focus-visible]:[&>span:last-child]:text-white';
// The ghost retry icon is ink: white on blue, and a darker blue (not panel) under the pointer.
const TILE_GHOST_ICON = `${TILE_WHITE} group-hover:hover:bg-primary-hover group-hover:active:bg-primary-hover focus-visible:ring-white`;
// Tile action buttons (Set as default, Duplicate, Retry, Delete) float above the stretched link.
// Focusing one fills its tile blue, where the Button primitive's primary ring would vanish.
const TILE_ACTION = 'z-10 focus-visible:ring-white';
const STATUS_TONE: Record<ResumeListItem['processing_status'], StatusTone> = {
  ready: 'ready',
  processing: 'active',
  pending: 'neutral',
  failed: 'error',
};
// Quick actions on a tailored tile show on hover and keyboard focus (opacity, so Tab still
// reaches them). While hidden they take no pointer events, so a tap on a touch screen, which
// has no hover, opens the tile instead of an action nobody can see. The menu button also
// shows on touch screens, and stays while its menu is open.
const TILE_REVEAL =
  'pointer-events-none opacity-0 group-hover:pointer-events-auto group-hover:opacity-100 group-has-[:focus-visible]:pointer-events-auto group-has-[:focus-visible]:opacity-100 focus-visible:opacity-100';
const TILE_MENU_REVEAL = `${TILE_REVEAL} pointer-coarse:pointer-events-auto pointer-coarse:opacity-100 aria-expanded:pointer-events-auto aria-expanded:opacity-100`;
const TILE_ICON_ACTION = cn(buttonClass({ variant: 'ghost', size: 'icon-sm' }), TILE_GHOST_ICON);
// A group's label row spans the grid, on the canvas between the ink rules.
const GROUP_ROW =
  'col-span-full flex flex-wrap items-center justify-between gap-x-6 gap-y-2 bg-canvas px-6 py-3';
const GROUP_LABEL = 'font-mono text-xs font-bold uppercase tracking-wider text-ink';

/**
 * Hatched cells that finish a group's last row (plus, with `spareRow`, one whole row more)
 * at each column count the grid takes (SwissGrid): 2, 3, 4 and 5. One column needs none. Returns each
 * cell's visibility classes, so a short row never leaves the ink gap colour showing.
 */
const GRID_COLUMNS = [
  [2, '@2xl:block', '@2xl:hidden'],
  [3, '@3xl:block', '@3xl:hidden'],
  [4, '@5xl:block', '@5xl:hidden'],
  [5, '@7xl:block', '@7xl:hidden'],
] as const;
function rowFillers(cells: number, spareRow = false): string[] {
  const need = (cols: number) => ((cols - (cells % cols)) % cols) + (spareRow ? cols : 0);
  const count = Math.max(...GRID_COLUMNS.map(([cols]) => need(cols)));
  return Array.from({ length: count }, (_, index) =>
    cn('hidden', ...GRID_COLUMNS.map(([cols, show, hide]) => (index < need(cols) ? show : hide)))
  );
}

/** The template's translation key: `swiss-single` is `swissSingle`. */
const templateKey = (template: string) =>
  template.replace(/-(\w)/g, (_, letter: string) => letter.toUpperCase());

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
  const [agentTask, setAgentTask] = useState<AgentTask | null>(null);
  // Tailored group: order, the master it was tailored from (when there are several),
  // the tile being deleted and the tile downloading.
  const [tailoredSort, setTailoredSort] = useState<'recent' | 'name'>('recent');
  const [masterFilter, setMasterFilter] = useState('all');
  const [deleteTarget, setDeleteTarget] = useState<ResumeListItem | null>(null);
  const [downloadingId, setDownloadingId] = useState<string | null>(null);
  // When the list last loaded: "Edited 2 days ago" counts from here, not from each render.
  const [listLoadedAt, setListLoadedAt] = useState(0);
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
  // Agent mode: the user's coding agent creates and tailors resumes, so the
  // create tiles show a prompt for it instead of calling the app's AI.
  const agentMode = !statusLoading && Boolean(systemStatus?.agent_mode);

  // Any ready master can be tailored (the tailor page picks the default, else the
  // stored id, else the first ready one), so a failed default must not block the rest.
  const hasReadyMaster =
    processingStatus === 'ready' || otherMasters.some((r) => r.processing_status === 'ready');
  const isTailorEnabled = Boolean(masterResumeId) && hasReadyMaster && isLlmConfigured;

  const formatEditedDate = (value: string) =>
    formatDate(value, locale, { month: 'short', day: '2-digit', year: 'numeric' }) ||
    t('common.unknown');
  const formatEditedAgo = (value: string) =>
    formatTimeAgo(value, locale, listLoadedAt) || t('common.unknown');

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
        if (err instanceof ApiError && err.status === 404) {
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
      void checkResumeStatus(storedId);
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
        setListLoadedAt(Date.now());
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
          void checkResumeStatus(resolvedMasterId, background && sameMaster);
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
    void loadTailoredResumes();
  }, [loadTailoredResumes]);

  // Agent mode: resumes the agent saves appear without a reload.
  useAgentRefresh(agentMode, () => loadTailoredResumes(true));

  // Refresh list when window gains focus (e.g., returning from viewer after delete)
  useEffect(() => {
    const handleFocus = () => {
      otherMastersPollAttemptsRef.current = 0;
      void loadTailoredResumes();
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
      void checkResumeStatus(resumeId);
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

  const handleDuplicate = async (resumeId: string, e?: React.MouseEvent) => {
    e?.stopPropagation();
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

  const confirmDeleteTailored = async () => {
    if (!deleteTarget) return;
    const resumeId = deleteTarget.resume_id;
    setDeleteTarget(null);
    try {
      await deleteResume(resumeId);
      decrementResumes();
    } catch (err) {
      console.error('Failed to delete resume:', err);
      setActionError(t('dashboard.errors.deleteFailed'));
    }
    await loadTailoredResumes();
  };

  // Downloads with the tile's own saved template settings, as the viewer does.
  const handleDownload = async (resume: ResumeListItem, title: string) => {
    setDownloadingId(resume.resume_id);
    try {
      const blob = await downloadResumePdf(
        resume.resume_id,
        resume.template_settings ?? DEFAULT_TEMPLATE_SETTINGS,
        locale
      );
      downloadBlobAsFile(blob, sanitizeFilename(title, resume.resume_id, 'resume'));
      toast.success(t('builder.alerts.downloadSuccess'));
    } catch (err) {
      console.error('Failed to download resume:', err);
      setActionError(t('builder.alerts.downloadFailed'));
    } finally {
      setDownloadingId(null);
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
      if (err instanceof ApiError && err.status === 404) {
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

  // Persistent state is a StatusIndicator square; SpinnerGap marks in-flight work only.
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

  const atMasterLimit = 1 + otherMasters.length >= MAX_MASTER_RESUMES;
  const showAddTrackTile =
    Boolean(masterResumeId) && !atMasterLimit && (isLlmConfigured || agentMode);
  const openMasterChoice = () =>
    agentMode ? setAgentTask('createMaster') : setIsMasterChoiceDialogOpen(true);
  const masterCount = (masterResumeId ? 1 : 0) + otherMasters.length;
  const masterOptions = [
    ...(masterResumeId
      ? [{ id: masterResumeId, label: defaultMasterTitle || t('dashboard.masterResume') }]
      : []),
    ...otherMasters.map((r) => ({
      id: r.resume_id,
      label: r.title || r.filename || t('dashboard.masterTrack'),
    })),
  ];
  // A filter on a master that has gone (deleted elsewhere) shows everything again.
  const activeMasterFilter = masterOptions.some((o) => o.id === masterFilter)
    ? masterFilter
    : 'all';
  const tailoredTitle = (resume: ResumeListItem) =>
    resume.title || resume.jobSnippet || resume.filename || t('dashboard.tailoredResume');
  const shownTailored = tailoredResumes
    .filter((r) => activeMasterFilter === 'all' || r.parent_id === activeMasterFilter)
    .sort((a, b) =>
      tailoredSort === 'name'
        ? tailoredTitle(a).localeCompare(tailoredTitle(b), locale)
        : Date.parse(b.updated_at || b.created_at) - Date.parse(a.updated_at || a.created_at)
    );
  const statusDisplay = getStatusDisplay();
  // The default master's line shows only what needs attention; "Ready" and the brief
  // "Checking" stay for screen readers.
  const statusVisible = processingStatus !== 'ready' && processingStatus !== 'loading';
  const openTailor = () => (agentMode ? setAgentTask('tailor') : router.push('/tailor'));
  const tailorDisabled = agentMode ? !masterResumeId || !hasReadyMaster : !isTailorEnabled;
  // A failed load with nothing to show: the alert alone, no tiles (an empty account looks different).
  const emptyWithError =
    listError && !masterResumeId && otherMasters.length === 0 && tailoredResumes.length === 0;
  const showLlmAlert = Boolean(masterResumeId) && !isLlmConfigured && !agentMode && !statusLoading;

  return (
    <SwissGrid
      action={
        <Button type="button" size="sm" onClick={openTailor} disabled={tailorDisabled}>
          <Plus aria-hidden="true" />
          {t('dashboard.tailorResume')}
        </Button>
      }
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
                  <ArrowsClockwise aria-hidden="true" />
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
          {/* Masters: the label row, then the default, the other tracks and Add track. */}
          <div className={GROUP_ROW}>
            <h2 className={GROUP_LABEL}>
              {t('dashboard.groups.masters', { count: masterCount, max: MAX_MASTER_RESUMES })}
            </h2>
          </div>

          {/* 1. Master Resume Logic */}
          {!masterResumeId ? (
            // LLM Not Configured or Upload State
            !isLlmConfigured && !agentMode && !statusLoading ? (
              <Link
                href="/settings"
                className="group/setup block h-full focus-visible:outline-none"
              >
                <Card
                  variant="interactive"
                  className={cn(
                    TILE_SHAPE,
                    'border-dashed border-warning bg-warning-tint hover:border-transparent hover:translate-x-0 hover:translate-y-0 hover:bg-primary hover:text-white group-focus-visible/setup:z-20 group-focus-visible/setup:border-transparent group-focus-visible/setup:translate-x-0 group-focus-visible/setup:translate-y-0 group-focus-visible/setup:bg-primary group-focus-visible/setup:text-white group-focus-visible/setup:ring-2 group-focus-visible/setup:ring-inset group-focus-visible/setup:ring-white'
                  )}
                >
                  <div className="flex-1 flex flex-col justify-between">
                    <Warning
                      aria-hidden="true"
                      className="size-6 text-warning-text group-hover:text-white group-focus-visible/setup:text-white"
                    />
                    <div>
                      <CardTitle className="text-lg uppercase text-warning-text mb-2 group-hover:text-white group-focus-visible/setup:text-white">
                        {t('dashboard.setupRequiredTitle')}
                      </CardTitle>
                      <CardDescription className="text-warning-text text-xs group-hover:text-white group-focus-visible/setup:text-white">
                        {t('dashboard.setupRequiredMessage')}
                      </CardDescription>
                      <div className="flex items-center gap-2 mt-4 text-warning-text group-hover:text-white group-focus-visible/setup:text-white">
                        <Gear aria-hidden="true" className="size-4" />
                        <span className="font-mono text-xs font-bold uppercase">
                          {t('nav.goToSettings')}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ) : (
              <Card variant="interactive" noPadding className={cn(TILE_SHAPE, TILE_FILL)}>
                <button
                  type="button"
                  className={TILE_BUTTON}
                  aria-label={t('dashboard.initializeMasterResume')}
                  onClick={openMasterChoice}
                >
                  <span
                    className={cn(
                      'size-12 border-2 border-ink flex items-center justify-center mb-4',
                      TILE_WHITE_BORDER
                    )}
                  >
                    <Plus aria-hidden="true" className="size-6" />
                  </span>
                  <span className="block">
                    <span className="block font-serif text-xl font-bold uppercase leading-none tracking-tight">
                      {t('dashboard.initializeMasterResume')}
                    </span>
                    <span className={cn('mt-2 block font-mono text-sm text-steel', TILE_WHITE)}>
                      {'// '}
                      {t('dashboard.initializeSequence')}
                    </span>
                  </span>
                </button>
              </Card>
            )
          ) : (
            // Master Resume Exists
            <Card variant="interactive" className={cn(TILE_SHAPE, TILE_PAD, TILE_FILL)}>
              <div className="flex-1 flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                  <div
                    className={cn(
                      'size-12 border-2 border-ink bg-primary text-white flex items-center justify-center',
                      TILE_WHITE_BORDER
                    )}
                  >
                    <span className="font-mono font-bold text-lg">M</span>
                  </div>
                  {(processingStatus === 'failed' || processingStatus === 'processing') && (
                    <span className="relative z-10 inline-flex">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-sm"
                        className={cn('z-10', TILE_GHOST_ICON)}
                        onClick={handleRetryProcessing}
                        disabled={isRetrying}
                        aria-label={t('dashboard.retryProcessing')}
                        title={t('dashboard.retryProcessing')}
                      >
                        {isRetrying ? (
                          <SpinnerGap aria-hidden="true" className="animate-spin" />
                        ) : (
                          <ArrowsClockwise aria-hidden="true" />
                        )}
                      </Button>
                    </span>
                  )}
                </div>

                <div className="flex items-start gap-2">
                  <CardTitle className="min-w-0 text-lg line-clamp-3">
                    <Link
                      href={`/resumes/${masterResumeId}`}
                      title={defaultMasterTitle || undefined}
                      className={TILE_LINK}
                    >
                      {defaultMasterTitle || t('dashboard.masterResume')}
                    </Link>
                  </CardTitle>
                  <DefaultBadge className={TILE_WHITE_BORDER}>
                    {t('dashboard.defaultBadge')}
                  </DefaultBadge>
                </div>

                <div className="mt-auto pt-4 flex flex-col gap-2">
                  <div className={cn('flex items-center gap-2', !statusVisible && 'sr-only')}>
                    {statusDisplay.busy && (
                      <SpinnerGap
                        aria-hidden="true"
                        className={cn(
                          'size-4 animate-spin',
                          statusDisplay.tone === 'active' ? 'text-primary' : 'text-steel',
                          TILE_WHITE
                        )}
                      />
                    )}
                    <StatusIndicator tone={statusDisplay.tone} className={TILE_STATUS}>
                      {t('dashboard.statusLine', { status: statusDisplay.text })}
                    </StatusIndicator>
                  </div>
                  {(processingStatus === 'failed' || processingStatus === 'processing') && (
                    <div className="relative z-10 flex w-fit max-w-full flex-wrap gap-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        className={TILE_ACTION}
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
                        className={TILE_ACTION}
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
                className={cn(TILE_SHAPE, TILE_PAD, TILE_FILL)}
              >
                <div className="flex-1 flex flex-col">
                  <div className="flex justify-between items-start mb-6">
                    <div
                      className={cn(
                        'size-12 border-2 border-ink bg-primary text-white flex items-center justify-center',
                        TILE_WHITE_BORDER
                      )}
                    >
                      <span className="font-mono font-bold">M</span>
                    </div>
                    {resume.processing_status !== 'ready' && (
                      <StatusIndicator
                        tone={STATUS_TONE[resume.processing_status]}
                        className={TILE_STATUS}
                      >
                        {t(`dashboard.status.${resume.processing_status}`)}
                      </StatusIndicator>
                    )}
                  </div>
                  <CardTitle className="text-lg">
                    <Link
                      href={`/resumes/${resume.resume_id}`}
                      title={title}
                      className={cn(
                        'block font-serif text-base font-bold leading-tight mb-1 w-full line-clamp-3',
                        TILE_LINK
                      )}
                    >
                      {title}
                    </Link>
                  </CardTitle>
                  <div className="relative z-10 mt-auto flex w-fit max-w-full flex-wrap gap-2 pt-4">
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      className={TILE_ACTION}
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
                        className={TILE_ACTION}
                        aria-label={t('dashboard.duplicate')}
                        disabled={isDuplicating || resume.processing_status !== 'ready'}
                        onClick={(e) => handleDuplicate(resume.resume_id, e)}
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
            <Card variant="interactive" noPadding className={cn(TILE_SHAPE, TILE_FILL)}>
              <button
                type="button"
                className={TILE_BUTTON}
                aria-label={t('dashboard.addMasterTrack')}
                onClick={openMasterChoice}
              >
                <span className="flex items-center gap-2 font-serif text-lg font-bold uppercase leading-none tracking-tight">
                  <Plus aria-hidden="true" className="size-4 shrink-0" />
                  {t('dashboard.addMasterTrack')}
                </span>
                <span className={cn('block font-mono text-sm uppercase text-steel', TILE_WHITE)}>
                  {t('dashboard.masterLimitReached', { max: MAX_MASTER_RESUMES })}
                </span>
              </button>
            </Card>
          )}

          {rowFillers(1 + otherMasters.length + (showAddTrackTile ? 1 : 0)).map(
            (visibility, index) => (
              <Card
                key={`masters-filler-${index}`}
                variant="ghost"
                noPadding
                className={cn(
                  TILE_SHAPE,
                  'pointer-events-none relative bg-canvas text-steel',
                  visibility
                )}
              >
                <Hatch />
              </Card>
            )
          )}

          {/* Tailored: the label row with its order and master filter, then the tiles. */}
          {(masterResumeId || tailoredResumes.length > 0) && (
            <>
              <div className={GROUP_ROW}>
                <h2 className={GROUP_LABEL}>
                  {t('dashboard.groups.tailored', { count: shownTailored.length })}
                </h2>
                {tailoredResumes.length === 0 ? (
                  <p className="text-sm text-ink-soft">{t('dashboard.noTailored')}</p>
                ) : (
                  <div className="flex flex-wrap items-center gap-4">
                    {masterOptions.length > 1 && (
                      <Dropdown
                        className="w-56"
                        options={[
                          { id: 'all', label: t('dashboard.filter.all') },
                          ...masterOptions,
                        ]}
                        value={activeMasterFilter}
                        onChange={setMasterFilter}
                      />
                    )}
                    {shownTailored.length > 1 && (
                      <SegmentedControl
                        size="sm"
                        aria-label={t('dashboard.sort.label')}
                        items={[
                          { value: 'recent', label: t('dashboard.sort.recent') },
                          { value: 'name', label: t('dashboard.sort.name') },
                        ]}
                        value={tailoredSort}
                        onChange={setTailoredSort}
                      />
                    )}
                  </div>
                )}
              </div>

              {shownTailored.map((resume) => {
                const title = tailoredTitle(resume);
                const edited = resume.updated_at || resume.created_at;
                const settings = resume.template_settings ?? DEFAULT_TEMPLATE_SETTINGS;
                const downloading = downloadingId === resume.resume_id;
                return (
                  <Card
                    key={resume.resume_id}
                    variant="interactive"
                    className={cn(TILE_SHAPE, TILE_PAD, TILE_FILL)}
                  >
                    <div className="flex-1 flex flex-col">
                      <div className="flex justify-between items-start gap-2 mb-3">
                        <div
                          className={cn(
                            'size-12 shrink-0 border-2 border-ink bg-ink text-white flex items-center justify-center',
                            TILE_WHITE_BORDER
                          )}
                        >
                          <span className="font-mono font-bold">{getMonogram(title)}</span>
                        </div>
                        {resume.processing_status === 'ready' ? (
                          // The row itself takes no taps until revealed, so on a touch screen
                          // the tile opens wherever the hidden actions sit.
                          <div className="pointer-events-none relative z-10 flex w-fit items-center gap-1 group-hover:pointer-events-auto group-has-[:focus-visible]:pointer-events-auto">
                            <Link
                              href={`/resumes/${resume.resume_id}`}
                              aria-label={t('dashboard.tileActions.open', { title })}
                              title={t('dashboard.tileActions.open', { title })}
                              className={cn(TILE_ICON_ACTION, TILE_REVEAL)}
                            >
                              <ArrowRight aria-hidden="true" />
                            </Link>
                            <Link
                              href={`/builder?id=${resume.resume_id}`}
                              aria-label={t('dashboard.tileActions.edit', { title })}
                              title={t('dashboard.tileActions.edit', { title })}
                              className={cn(TILE_ICON_ACTION, TILE_REVEAL)}
                            >
                              <PencilSimple aria-hidden="true" />
                            </Link>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon-sm"
                              className={cn(TILE_GHOST_ICON, TILE_REVEAL)}
                              aria-label={t('dashboard.tileActions.download', { title })}
                              title={t('dashboard.tileActions.download', { title })}
                              disabled={downloading}
                              onClick={() => void handleDownload(resume, title)}
                            >
                              {downloading ? (
                                <SpinnerGap aria-hidden="true" className="animate-spin" />
                              ) : (
                                <DownloadSimple aria-hidden="true" />
                              )}
                            </Button>
                            <ActionMenu
                              label={t('dashboard.tileActions.more', { title })}
                              items={[
                                {
                                  value: 'duplicate',
                                  label: t('dashboard.duplicate'),
                                  disabled: isDuplicating,
                                },
                                { value: 'delete', label: t('common.delete'), destructive: true },
                              ]}
                              onAction={(action) =>
                                action === 'duplicate'
                                  ? void handleDuplicate(resume.resume_id)
                                  : setDeleteTarget(resume)
                              }
                              triggerClassName={cn(TILE_GHOST_ICON, TILE_MENU_REVEAL)}
                            >
                              <DotsThree aria-hidden="true" />
                            </ActionMenu>
                          </div>
                        ) : (
                          <StatusIndicator
                            tone={STATUS_TONE[resume.processing_status]}
                            className={TILE_STATUS}
                          >
                            {t(`dashboard.status.${resume.processing_status}`)}
                          </StatusIndicator>
                        )}
                      </div>
                      <CardTitle className="text-lg">
                        <Link
                          href={`/resumes/${resume.resume_id}`}
                          title={title}
                          className={cn(
                            'block font-serif text-base font-bold leading-tight w-full line-clamp-3',
                            TILE_LINK
                          )}
                        >
                          {title}
                        </Link>
                      </CardTitle>
                      <div className="mt-auto space-y-1 pt-3">
                        <CardDescription
                          className={cn('text-xs uppercase tabular-nums', TILE_WHITE)}
                          title={formatEditedDate(edited)}
                        >
                          {t('dashboard.edited', { date: formatEditedAgo(edited) })}
                        </CardDescription>
                        <CardDescription className={cn('text-xs uppercase', TILE_WHITE)}>
                          {t(`builder.formatting.templates.${templateKey(settings.template)}.name`)}
                          {' · '}
                          {settings.pageSize === 'A4'
                            ? PAGE_SIZE_INFO.A4.name
                            : t('builder.pageSize.usLetter')}
                        </CardDescription>
                      </div>
                    </div>
                  </Card>
                );
              })}

              {/* Unused cells, hatched: the drafting mark for "not in use". */}
              {rowFillers(shownTailored.length, true).map((visibility, index) => (
                <Card
                  key={`tailored-filler-${index}`}
                  variant="ghost"
                  noPadding
                  className={cn(
                    TILE_SHAPE,
                    'pointer-events-none relative bg-canvas text-steel',
                    visibility
                  )}
                >
                  <Hatch />
                </Card>
              ))}
            </>
          )}
        </>
      )}

      <AgentPromptDialog task={agentTask} onClose={() => setAgentTask(null)} />
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
        open={deleteTarget !== null}
        onOpenChange={(open) => !open && setDeleteTarget(null)}
        title={t('confirmations.deleteResume')}
        description={t('confirmations.deleteResumeDescription')}
        confirmLabel={t('confirmations.deleteResumeConfirmLabel')}
        cancelLabel={t('common.cancel')}
        onConfirm={() => void confirmDeleteTailored()}
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
