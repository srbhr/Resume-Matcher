'use client';

import { SwissGrid } from '@/components/home/swiss-grid';
import { ResumeUploadDialog } from '@/components/dashboard/resume-upload-dialog';
import { KanbanBoard } from '@/components/dashboard/kanban-board';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n';

// Optimized Imports for Performance (No Barrel Imports)
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Settings from 'lucide-react/dist/esm/icons/settings';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import Pencil from 'lucide-react/dist/esm/icons/pencil';
import Check from 'lucide-react/dist/esm/icons/check';
import X from 'lucide-react/dist/esm/icons/x';

import {
  fetchResume,
  fetchResumeList,
  deleteResume,
  retryProcessing,
  fetchJobDescription,
  type ResumeListItem,
  updateResumeMeta,
  fetchKanbanConfig,
  updateKanbanConfig,
  bulkUpdateKanbanPositions,
  type KanbanColumn,
} from '@/lib/api/resume';
import { useStatusCache } from '@/lib/context/status-cache';
import { Input } from '@/components/ui/input';

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'loading';

export default function DashboardPage() {
  const { t, locale } = useTranslations();
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [masterResumeSummary, setMasterResumeSummary] = useState<ResumeListItem | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('loading');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tailoredResumes, setTailoredResumes] = useState<ResumeListItem[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [renamingResumeId, setRenamingResumeId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');
  const [renameSavingId, setRenameSavingId] = useState<string | null>(null);
  const [renamingTitleResumeId, setRenamingTitleResumeId] = useState<string | null>(null);
  const [renameTitleValue, setRenameTitleValue] = useState('');
  const [renameTitleSavingId, setRenameTitleSavingId] = useState<string | null>(null);
  const [dashboardView, setDashboardView] = useState<'grid' | 'kanban'>('grid');
  const [kanbanColumns, setKanbanColumns] = useState<KanbanColumn[]>([]);
  const [kanbanLoading, setKanbanLoading] = useState(false);
  const [kanbanDialogOpen, setKanbanDialogOpen] = useState(false);
  const [kanbanDraft, setKanbanDraft] = useState<KanbanColumn[]>([]);
  const [tagFilter, setTagFilter] = useState<string[]>([]);
  const [tagFilterSelection, setTagFilterSelection] = useState('');
  const router = useRouter();

  // Status cache for optimistic counter updates and LLM status check
  const {
    status: systemStatus,
    isLoading: statusLoading,
    incrementResumes,
    decrementResumes,
    setHasMasterResume,
  } = useStatusCache();

  // Request id guard for concurrent loadTailoredResumes invocations
  const loadRequestIdRef = useRef(0);
  // Lightweight in-memory cache for job snippets to avoid N+1 refetches
  const jobSnippetCacheRef = useRef<Record<string, string>>({});

  // Check if LLM is configured (API key is set)
  const isLlmConfigured = !statusLoading && systemStatus?.llm_configured;

  const isTailorEnabled =
    Boolean(masterResumeId) && processingStatus === 'ready' && isLlmConfigured;

  const formatDate = (value: string) => {
    if (!value) return t('common.unknown');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t('common.unknown');

    const dateLocale =
      locale === 'es' ? 'es-ES' : locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';

    return date.toLocaleDateString(dateLocale, {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  };

  const checkResumeStatus = useCallback(async (resumeId: string) => {
    try {
      setProcessingStatus('loading');
      const data = await fetchResume(resumeId);
      const status = data.raw_resume?.processing_status || 'pending';
      setProcessingStatus(status as ProcessingStatus);
    } catch (err: unknown) {
      console.error('Failed to check resume status:', err);
      // If resume not found (404), clear the stale localStorage
      if (err instanceof Error && err.message.includes('404')) {
        localStorage.removeItem('master_resume_id');
        setMasterResumeId(null);
        return;
      }
      setProcessingStatus('failed');
    }
  }, []);

  useEffect(() => {
    const storedId = localStorage.getItem('master_resume_id');
    if (storedId) {
      setMasterResumeId(storedId);
      checkResumeStatus(storedId);
    }
  }, [checkResumeStatus]);

  const loadTailoredResumes = useCallback(async () => {
    try {
      const data = await fetchResumeList(true);
      const masterFromList = data.find((r) => r.is_master);
      setMasterResumeSummary(masterFromList ?? null);
      const storedId = localStorage.getItem('master_resume_id');
      const resolvedMasterId = masterFromList?.resume_id || storedId;

      if (resolvedMasterId) {
        localStorage.setItem('master_resume_id', resolvedMasterId);
        setMasterResumeId(resolvedMasterId);
        checkResumeStatus(resolvedMasterId);
      } else {
        localStorage.removeItem('master_resume_id');
        setMasterResumeId(null);
      }

      const filtered = data.filter((r) => r.resume_id !== resolvedMasterId);
      setTailoredResumes(filtered);

      // Only fetch job descriptions for resumes that are actually tailored
      // (identified by having a non-null parent_id). This avoids N+1 calls
      // for untailored resumes.
      const tailoredWithParent = filtered.filter((r) => r.parent_id);

      // Guard against concurrent invocations overwriting each other
      const requestId = ++loadRequestIdRef.current;

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
            jobSnippetCacheRef.current[r.resume_id] = snippet;
            jobSnippets[r.resume_id] = snippet;
          } catch {
            // ignore missing job descriptions and cache empty result
            jobSnippetCacheRef.current[r.resume_id] = '';
            jobSnippets[r.resume_id] = '';
          }
        })
      );

      // Only apply results if this invocation is the latest (prevents stale overwrite)
      if (requestId === loadRequestIdRef.current) {
        setTailoredResumes((prev) =>
          prev.map((r) => ({ ...r, jobSnippet: jobSnippets[r.resume_id] || '' }))
        );
      }
    } catch (err) {
      console.error('Failed to load tailored resumes:', err);
    }
  }, [checkResumeStatus]);

  useEffect(() => {
    loadTailoredResumes();
  }, [loadTailoredResumes]);

  const loadKanbanConfig = useCallback(async () => {
    setKanbanLoading(true);
    try {
      const config = await fetchKanbanConfig();
      setKanbanColumns(config.columns);
    } catch (err) {
      console.error('Failed to load kanban config:', err);
    } finally {
      setKanbanLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKanbanConfig();
  }, [loadKanbanConfig]);

  // Refresh list when window gains focus (e.g., returning from viewer after delete)
  useEffect(() => {
    const handleFocus = () => {
      loadTailoredResumes();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadTailoredResumes, checkResumeStatus]);

  const handleUploadComplete = (resumeId: string) => {
    localStorage.setItem('master_resume_id', resumeId);
    setMasterResumeId(resumeId);
    // Check status after upload completes
    checkResumeStatus(resumeId);
    // Update cached counters
    incrementResumes();
    setHasMasterResume(true);
  };

  const startRename = (resume: ResumeListItem) => {
    setRenamingResumeId(resume.resume_id);
    setRenameValue(resume.filename || '');
  };

  const cancelRename = () => {
    setRenamingResumeId(null);
    setRenameValue('');
  };

  const startRenameTitle = (resume: ResumeListItem) => {
    setRenamingTitleResumeId(resume.resume_id);
    setRenameTitleValue(resume.title || resume.jobSnippet || resume.filename || '');
  };

  const cancelRenameTitle = () => {
    setRenamingTitleResumeId(null);
    setRenameTitleValue('');
  };

  const openKanbanEditor = () => {
    setKanbanDraft(kanbanColumns.map((col) => ({ ...col })));
    setKanbanDialogOpen(true);
  };

  const slugifyColumnId = (value: string) => {
    return value
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/(^-|-$)+/g, '');
  };

  const addKanbanColumn = () => {
    const newColumn: KanbanColumn = {
      id: `temp-${Date.now()}`,
      label: t('dashboard.kanban.newColumn'),
      order: kanbanDraft.length + 1,
    };
    setKanbanDraft((prev) => [...prev, newColumn]);
  };

  const removeKanbanColumn = (id: string) => {
    setKanbanDraft((prev) => prev.filter((col) => col.id !== id));
  };

  const updateKanbanColumnLabel = (id: string, label: string) => {
    setKanbanDraft((prev) =>
      prev.map((col) => (col.id === id ? { ...col, label } : col))
    );
  };

  const moveKanbanColumn = (fromIndex: number, toIndex: number) => {
    if (toIndex < 0 || toIndex >= kanbanDraft.length) return;
    setKanbanDraft((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  };

  const saveKanbanColumns = async () => {
    const normalized = kanbanDraft.map((col, idx) => {
      const label = col.label.trim();
      const id = col.id.startsWith('temp-') ? slugifyColumnId(label) : col.id;
      return { id: id || `col-${idx + 1}`, label: label || t('dashboard.kanban.untitled'), order: idx + 1 };
    });
    try {
      const updated = await updateKanbanConfig(normalized);
      setKanbanColumns(updated.columns);
      setKanbanDialogOpen(false);
    } catch (err) {
      console.error('Failed to update kanban columns:', err);
    }
  };

  const handleKanbanMove = async (
    moves: Array<{ resume_id: string; kanban_column_id: string; kanban_order: number }>
  ) => {
    try {
      await bulkUpdateKanbanPositions(moves);
      setTailoredResumes((prev) =>
        prev.map((resume) => {
          const update = moves.find((move) => move.resume_id === resume.resume_id);
          if (!update) return resume;
          return { ...resume, kanban_column_id: update.kanban_column_id, kanban_order: update.kanban_order };
        })
      );
      await loadTailoredResumes();
    } catch (err) {
      console.error('Failed to update kanban positions:', err);
      const results = await Promise.allSettled(
        moves.map((move) =>
          updateResumeMeta(move.resume_id, {
            kanban_column_id: move.kanban_column_id,
            kanban_order: move.kanban_order,
          })
        )
      );
      const hadFailures = results.some((result) => result.status === 'rejected');
      if (hadFailures) {
        console.error('Failed to apply kanban fallback updates:', results);
      }
      setTailoredResumes((prev) =>
        prev.map((resume) => {
          const update = moves.find((move) => move.resume_id === resume.resume_id);
          if (!update) return resume;
          return { ...resume, kanban_column_id: update.kanban_column_id, kanban_order: update.kanban_order };
        })
      );
      await loadTailoredResumes();
    }
  };

  const handleUpdateTags = async (resumeId: string, tags: string[]) => {
    try {
      const updated = await updateResumeMeta(resumeId, { tags });
      setTailoredResumes((prev) =>
        prev.map((r) => (r.resume_id === resumeId ? { ...r, tags: updated.tags || tags } : r))
      );
      return updated.tags || tags;
    } catch (err) {
      console.error('Failed to update tags:', err);
      return tags;
    }
  };

  const applyTagFilter = () => {
    const tag = tagFilterSelection.trim().toLowerCase();
    if (tag && !tagFilter.includes(tag)) {
      setTagFilter((prev) => [...prev, tag]);
    }
    setTagFilterSelection('');
  };

  const availableTags = useMemo(() => {
    const tags = new Set<string>();
    tailoredResumes.forEach((resume) => resume.tags?.forEach((tag) => tags.add(tag)));
    return Array.from(tags.values()).sort();
  }, [tailoredResumes]);

  const filteredResumes = useMemo(() => {
    if (!tagFilter.length) return tailoredResumes;
    return tailoredResumes.filter((resume) =>
      tagFilter.every((tag) => resume.tags?.includes(tag))
    );
  }, [tailoredResumes, tagFilter]);

  const saveRename = async (resumeId: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed) return;
    setRenameSavingId(resumeId);
    try {
      const updated = await updateResumeMeta(resumeId, { filename: trimmed });
      if (updated.is_master) {
        setMasterResumeSummary((prev) => (prev ? { ...prev, filename: updated.filename } : updated));
      }
      setTailoredResumes((prev) =>
        prev.map((r) =>
          r.resume_id === resumeId ? { ...r, filename: updated.filename } : r
        )
      );
    } catch (err) {
      console.error('Failed to rename resume:', err);
    } finally {
      setRenameSavingId(null);
      setRenamingResumeId(null);
    }
  };

  const saveRenameTitle = async (resumeId: string) => {
    const trimmed = renameTitleValue.trim();
    if (!trimmed) return;
    setRenameTitleSavingId(resumeId);
    try {
      const updated = await updateResumeMeta(resumeId, { title: trimmed });
      if (updated.is_master) {
        setMasterResumeSummary((prev) => (prev ? { ...prev, title: updated.title } : updated));
      }
      setTailoredResumes((prev) =>
        prev.map((r) => (r.resume_id === resumeId ? { ...r, title: updated.title } : r))
      );
    } catch (err) {
      console.error('Failed to rename resume title:', err);
    } finally {
      setRenameTitleSavingId(null);
      setRenamingTitleResumeId(null);
    }
  };

  const handleRetryProcessing = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!masterResumeId) return;
    setIsRetrying(true);
    try {
      const result = await retryProcessing(masterResumeId);
      if (result.processing_status === 'ready') {
        setProcessingStatus('ready');
      } else if (
        result.processing_status === 'processing' ||
        result.processing_status === 'pending'
      ) {
        setProcessingStatus(result.processing_status);
      } else {
        setProcessingStatus('failed');
      }
    } catch (err) {
      console.error('Retry processing failed:', err);
      setProcessingStatus('failed');
    } finally {
      setIsRetrying(false);
    }
  };

  const handleDeleteAndReupload = (e: React.MouseEvent) => {
    e.stopPropagation();
    setShowDeleteDialog(true);
  };

  const confirmDeleteAndReupload = async () => {
    if (!masterResumeId) return;
    try {
      await deleteResume(masterResumeId);
      decrementResumes();
      setHasMasterResume(false);
      localStorage.removeItem('master_resume_id');
      setMasterResumeId(null);
      setProcessingStatus('loading');
      setIsUploadDialogOpen(true);
      await loadTailoredResumes();
    } catch (err) {
      console.error('Failed to delete resume:', err);
    }
  };

  const getStatusDisplay = () => {
    switch (processingStatus) {
      case 'loading':
        return {
          text: t('dashboard.status.checking'),
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          color: 'text-gray-500',
        };
      case 'processing':
        return {
          text: t('dashboard.status.processing'),
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          color: 'text-blue-700',
        };
      case 'ready':
        return { text: t('dashboard.status.ready'), icon: null, color: 'text-green-700' };
      case 'failed':
        return {
          text: t('dashboard.status.failed'),
          icon: <AlertCircle className="w-3 h-3" />,
          color: 'text-red-600',
        };
      default:
        return { text: t('dashboard.status.pending'), icon: null, color: 'text-gray-500' };
    }
  };

  const totalCards = 1 + tailoredResumes.length + 1;
  const fillerCount = Math.max(0, (5 - (totalCards % 5)) % 5);
  const extraFillerCount = 5;
  // Use Tailwind classes for fillers now that we have them in config or use specific hex if needed
  // Using the hex values from before to maintain exact look, or we could map them to variants
  const fillerPalette = ['bg-[#E5E5E0]', 'bg-[#D8D8D2]', 'bg-[#CFCFC7]', 'bg-[#E0E0D8]'];

  return (
    <div className="space-y-6">
      {/* Configuration Warning Banner */}
      {masterResumeId && !isLlmConfigured && !statusLoading && (
        <div className="border-2 border-warning bg-amber-50 p-4 shadow-sw-default mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-warning" />
            <div>
              <p className="font-mono text-sm font-bold uppercase tracking-wider text-amber-800">
                {t('dashboard.llmNotConfiguredTitle')}
              </p>
              <p className="font-mono text-xs text-amber-700 mt-0.5">
                {t('dashboard.llmNotConfiguredMessage')}
              </p>
            </div>
          </div>
          <Link href="/settings">
            <Button variant="outline" size="sm" className="border-warning text-amber-700">
              <Settings className="w-4 h-4 mr-2" />
              {t('nav.settings')}
            </Button>
          </Link>
        </div>
      )}

      <div className="flex flex-wrap items-center justify-between gap-3 border-2 border-black bg-[#F0F0E8] p-3">
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs uppercase text-gray-600">
            {t('dashboard.viewLabel')}
          </span>
          <Button
            variant={dashboardView === 'grid' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDashboardView('grid')}
          >
            {t('dashboard.viewGrid')}
          </Button>
          <Button
            variant={dashboardView === 'kanban' ? 'default' : 'outline'}
            size="sm"
            onClick={() => setDashboardView('kanban')}
          >
            {t('dashboard.viewKanban')}
          </Button>
        </div>
        {dashboardView === 'kanban' && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex flex-wrap items-center gap-1">
              {tagFilter.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  className="border border-black px-2 py-0.5 text-[10px] uppercase font-mono bg-[#E5E5E0]"
                  onClick={() => setTagFilter((prev) => prev.filter((t) => t !== tag))}
                >
                  {tag} ×
                </button>
              ))}
            </div>
            <div className="flex items-center gap-2 border-2 border-black px-2 py-1 bg-white shadow-[2px_2px_0px_0px_#000000]">
              <span className="font-mono text-[10px] uppercase text-gray-600">
                {t('dashboard.kanban.filterLabel')}
              </span>
              <select
                value={tagFilterSelection}
                onChange={(e) => setTagFilterSelection(e.target.value)}
                className="h-7 text-xs font-mono w-40 rounded-none border-2 border-black bg-white"
              >
                <option value="">{t('dashboard.kanban.tagFilterPlaceholder')}</option>
                {availableTags.map((tag) => (
                  <option key={tag} value={tag}>
                    {tag}
                  </option>
                ))}
              </select>
              <Button variant="outline" size="sm" className="h-7 px-2" onClick={applyTagFilter}>
                {t('dashboard.kanban.applyFilter')}
              </Button>
              {tagFilter.length > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-7 px-2"
                  onClick={() => setTagFilter([])}
                >
                  {t('dashboard.kanban.clearFilters')}
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={openKanbanEditor}
              disabled={kanbanLoading}
            >
              {t('dashboard.kanban.editColumns')}
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={() => router.push('/tailor')}
              disabled={!isTailorEnabled}
            >
              <Plus className="w-4 h-4 mr-2" />
              {t('dashboard.createResume')}
            </Button>
          </div>
        )}
      </div>

      {dashboardView === 'grid' ? (
        <SwissGrid>
          {/* 1. Master Resume Logic */}
          {!masterResumeId ? (
            // LLM Not Configured or Upload State
            !isLlmConfigured && !statusLoading ? (
              <Link href="/settings" className="block h-full">
                <Card
                  variant="interactive"
                  className="aspect-square h-full border-dashed border-warning bg-amber-50"
                >
                  <div className="flex-1 flex flex-col justify-between">
                    <div className="w-14 h-14 border-2 border-warning bg-white flex items-center justify-center mb-4">
                      <AlertTriangle className="w-7 h-7 text-warning" />
                    </div>
                    <div>
                      <CardTitle className="text-lg uppercase text-amber-800 mb-2">
                        {t('dashboard.setupRequiredTitle')}
                      </CardTitle>
                      <CardDescription className="text-amber-700 text-xs">
                        {t('dashboard.setupRequiredMessage')}
                      </CardDescription>
                      <div className="flex items-center gap-2 mt-4 text-amber-700 group-hover:text-amber-900">
                        <Settings className="w-4 h-4" />
                        <span className="font-mono text-xs font-bold uppercase">
                          {t('nav.goToSettings')}
                        </span>
                      </div>
                    </div>
                  </div>
                </Card>
              </Link>
            ) : (
              <ResumeUploadDialog
                open={isUploadDialogOpen}
                onOpenChange={setIsUploadDialogOpen}
                onUploadComplete={handleUploadComplete}
                trigger={
                  <Card
                    variant="interactive"
                    className="aspect-square h-full hover:bg-primary hover:text-canvas"
                  >
                    <div className="flex-1 flex flex-col justify-between pointer-events-none">
                      <div className="w-14 h-14 border-2 border-current flex items-center justify-center mb-4">
                        <span className="text-2xl leading-none relative top-[-2px]">+</span>
                      </div>
                      <div>
                        <CardTitle className="text-xl uppercase">
                          {t('dashboard.initializeMasterResume')}
                        </CardTitle>
                        <CardDescription className="mt-2 opacity-60 group-hover:opacity-100 text-current">
                          {'// '}
                          {t('dashboard.initializeSequence')}
                        </CardDescription>
                      </div>
                    </div>
                  </Card>
                }
              />
            )
          ) : (
            // Master Resume Exists
            <Card
              variant="interactive"
              className="aspect-square h-full"
              onClick={() => router.push(`/resumes/${masterResumeId}`)}
            >
              <div className="flex-1 flex flex-col h-full">
                <div className="flex justify-between items-start mb-6">
                  <div className="w-16 h-16 border-2 border-black bg-blue-700 text-white flex items-center justify-center">
                    <span className="font-mono font-bold text-lg">M</span>
                  </div>
                  <div className="flex gap-1">
                    {processingStatus === 'failed' && (
                      <>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 hover:bg-blue-100 hover:text-blue-700 z-10 rounded-none relative"
                          onClick={handleRetryProcessing}
                          disabled={isRetrying}
                          title={t('dashboard.retryProcessing')}
                        >
                          {isRetrying ? (
                            <Loader2 className="w-4 h-4 animate-spin" />
                          ) : (
                            <RefreshCw className="w-4 h-4" />
                          )}
                        </Button>
                      </>
                    )}
                  </div>
                </div>

              <CardTitle className="text-lg group-hover:text-primary">
                <span className="inline-flex items-center border border-black px-2 py-0.5 text-[10px] font-mono uppercase bg-[#E5E5E0] mb-2">
                  {t('dashboard.masterBadge')}
                </span>
                {renamingTitleResumeId === masterResumeId ? (
                  <div
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      value={renameTitleValue}
                      onChange={(e) => setRenameTitleValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRenameTitle(masterResumeId!);
                        if (e.key === 'Escape') cancelRenameTitle();
                      }}
                      className="h-7 text-xs font-mono"
                      placeholder={t('dashboard.masterResume')}
                      autoFocus
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => saveRenameTitle(masterResumeId!)}
                      disabled={renameTitleSavingId === masterResumeId}
                      title={t('common.save')}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={cancelRenameTitle}
                      title={t('common.cancel')}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex items-start gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                  <button
                    type="button"
                    className="block text-left text-base font-bold leading-tight break-words line-clamp-2 hover:underline"
                    onClick={() =>
                      masterResumeSummary ? startRenameTitle(masterResumeSummary) : null
                    }
                  >
                    {masterResumeSummary?.title || t('dashboard.masterResume')}
                  </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 shrink-0"
                      onClick={() =>
                        masterResumeSummary ? startRenameTitle(masterResumeSummary) : null
                      }
                      title={t('common.rename')}
                      disabled={!masterResumeSummary}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardTitle>
              <div
                className="mt-2 flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                {renamingResumeId === masterResumeId ? (
                  <>
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(masterResumeId!);
                        if (e.key === 'Escape') cancelRename();
                      }}
                      className="h-7 text-xs font-mono"
                      placeholder={t('dashboard.masterResume')}
                      autoFocus
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => saveRename(masterResumeId!)}
                      disabled={renameSavingId === masterResumeId}
                      title={t('common.save')}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={cancelRename}
                      title={t('common.cancel')}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="block font-sans text-sm font-normal text-gray-700 truncate w-full whitespace-nowrap">
                      {masterResumeSummary?.filename || t('dashboard.masterResume')}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() =>
                        masterResumeSummary ? startRename(masterResumeSummary) : null
                      }
                      title={t('common.rename')}
                      disabled={!masterResumeSummary}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>

              <div
                className={`text-xs font-mono mt-auto pt-4 flex flex-col gap-2 uppercase ${getStatusDisplay().color}`}
              >
                <div className="flex items-center gap-1">
                  {getStatusDisplay().icon}
                  {t('dashboard.statusLine', { status: getStatusDisplay().text })}
                </div>
                {processingStatus === 'failed' && (
                  <div className="flex gap-2" onClick={(e) => e.stopPropagation()}>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 rounded-none border-black"
                      onClick={handleRetryProcessing}
                      disabled={isRetrying}
                    >
                      {isRetrying
                        ? t('dashboard.retryingProcessing')
                        : t('dashboard.retryProcessing')}
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      className="text-xs h-7 rounded-none border-red-600 text-red-600 hover:bg-red-50"
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

        {/* 2. Tailored Resumes */}
        {tailoredResumes.map((resume) => (
          <Card
            key={resume.resume_id}
            variant="interactive"
            className="aspect-square h-full bg-canvas"
            onClick={() => router.push(`/resumes/${resume.resume_id}`)}
          >
            <div className="flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 border-2 border-black bg-white text-black flex items-center justify-center">
                  <span className="font-mono font-bold">T</span>
                </div>
                <span className="font-mono text-xs text-gray-500 uppercase">
                  {resume.processing_status}
                </span>
              </div>
              <CardTitle className="text-lg">
                {/* Job description snippet (if available) */}
                {renamingTitleResumeId === resume.resume_id ? (
                  <div
                    className="flex items-center gap-2"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <Input
                      value={renameTitleValue}
                      onChange={(e) => setRenameTitleValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRenameTitle(resume.resume_id);
                        if (e.key === 'Escape') cancelRenameTitle();
                      }}
                      className="h-7 text-xs font-mono"
                      placeholder={t('dashboard.tailoredResume')}
                      autoFocus
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => saveRenameTitle(resume.resume_id)}
                      disabled={renameTitleSavingId === resume.resume_id}
                      title={t('common.save')}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={cancelRenameTitle}
                      title={t('common.cancel')}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </div>
                ) : (
                  <div
                    className="flex items-start gap-2 mb-1"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <button
                      type="button"
                      className="block text-left font-serif text-base font-bold leading-tight break-words line-clamp-2 hover:underline"
                      onClick={() => startRenameTitle(resume)}
                    >
                      {resume.title ||
                        resume.jobSnippet ||
                        resume.filename ||
                        t('dashboard.tailoredResume')}
                    </button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2 shrink-0"
                      onClick={() => startRenameTitle(resume)}
                      title={t('common.rename')}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </CardTitle>
              {/* Resume filename snippet / rename */}
              <div
                className="mt-1 flex items-center gap-2"
                onClick={(e) => e.stopPropagation()}
              >
                {renamingResumeId === resume.resume_id ? (
                  <>
                    <Input
                      value={renameValue}
                      onChange={(e) => setRenameValue(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') saveRename(resume.resume_id);
                        if (e.key === 'Escape') cancelRename();
                      }}
                      className="h-7 text-xs font-mono"
                      placeholder={t('dashboard.tailoredResume')}
                      autoFocus
                    />
                    <Button
                      variant="outline"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => saveRename(resume.resume_id)}
                      disabled={renameSavingId === resume.resume_id}
                      title={t('common.save')}
                    >
                      <Check className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={cancelRename}
                      title={t('common.cancel')}
                    >
                      <X className="w-4 h-4" />
                    </Button>
                  </>
                ) : (
                  <>
                    <p className="block font-sans text-sm font-normal text-gray-700 truncate w-full whitespace-nowrap">
                      {(resume.filename || t('dashboard.tailoredResume')).slice(0, 40)}
                    </p>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-7 px-2"
                      onClick={() => startRename(resume)}
                      title={t('common.rename')}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                  </>
                )}
              </div>
              <CardDescription className="mt-auto pt-4 uppercase">
                {t('dashboard.edited', {
                  date: formatDate(resume.updated_at || resume.created_at),
                })}{' '}
              </CardDescription>
            </div>
          </Card>
        ))}

        {/* 3. Create Tailored Resume */}
        <Card className="aspect-square h-full" variant="default">
          <div className="flex-1 flex flex-col items-center justify-center text-center h-full">
            <Button
              onClick={() => router.push('/tailor')}
              disabled={!isTailorEnabled}
              className="w-20 h-20 bg-blue-700 text-white border-2 border-black shadow-sw-default hover:bg-blue-800 hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all rounded-none"
            >
              <Plus className="w-8 h-8" />
            </Button>
            <p className="text-xs font-mono mt-4 uppercase text-green-700">
              {t('dashboard.createResume')}
            </p>
          </div>
        </Card>

        {/* 4. Fillers */}
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
            className={`hidden md:block ${fillerPalette[index % fillerPalette.length]} aspect-square h-full opacity-70 pointer-events-none`}
          />
        ))}

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
        </SwissGrid>
      ) : (
        <div className="space-y-4">
          {kanbanLoading ? (
            <div className="border-2 border-black bg-[#F0F0E8] p-6 font-mono text-sm">
              {t('common.loading')}
            </div>
          ) : kanbanColumns.length ? (
            <KanbanBoard
              columns={kanbanColumns}
              resumes={filteredResumes}
              onMove={handleKanbanMove}
              onUpdateTags={handleUpdateTags}
            />
          ) : (
            <div className="border-2 border-black bg-[#F0F0E8] p-6 font-mono text-sm">
              {t('dashboard.kanban.noColumns')}
            </div>
          )}
        </div>
      )}

      <Dialog open={kanbanDialogOpen} onOpenChange={setKanbanDialogOpen}>
        <DialogContent className="max-w-2xl p-0 gap-0 rounded-none bg-[#F0F0E8] border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.2)]">
          <div className="p-6 space-y-4">
            <DialogHeader>
              <DialogTitle>{t('dashboard.kanban.editColumnsTitle')}</DialogTitle>
            </DialogHeader>
            <div className="space-y-3">
              {kanbanDraft.map((col, index) => (
                <div key={col.id} className="flex items-center gap-2">
                  <Input
                    value={col.label}
                    onChange={(e) => updateKanbanColumnLabel(col.id, e.target.value)}
                    className="h-9 text-sm font-mono"
                  />
                  <div className="flex items-center gap-1">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 px-2"
                      onClick={() => moveKanbanColumn(index, index - 1)}
                    >
                      {t('dashboard.kanban.moveUp')}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="h-9 px-2"
                      onClick={() => moveKanbanColumn(index, index + 1)}
                    >
                      {t('dashboard.kanban.moveDown')}
                    </Button>
                  </div>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-9 px-2"
                    onClick={() => removeKanbanColumn(col.id)}
                  >
                    {t('common.remove')}
                  </Button>
                </div>
              ))}
              <Button variant="outline" size="sm" onClick={addKanbanColumn}>
                {t('dashboard.kanban.addColumn')}
              </Button>
            </div>
            <DialogFooter>
              <Button variant="outline" size="sm" onClick={() => setKanbanDialogOpen(false)}>
                {t('common.cancel')}
              </Button>
              <Button variant="default" size="sm" onClick={saveKanbanColumns}>
                {t('common.save')}
              </Button>
            </DialogFooter>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
