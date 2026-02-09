'use client';

import { SwissGrid } from '@/components/home/swiss-grid';
import { ResumeUploadDialog } from '@/components/dashboard/resume-upload-dialog';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import { useTranslations } from '@/lib/i18n';

// Optimized Imports for Performance (No Barrel Imports)
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
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
  type ResumeListItem,
} from '@/lib/api/resume';
import { useStatusCache } from '@/lib/context/status-cache';

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'loading';

export default function DashboardPage() {
  const { t, locale } = useTranslations();
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('loading');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tailoredResumes, setTailoredResumes] = useState<ResumeListItem[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
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
                {t('dashboard.masterResume')}
              </CardTitle>

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
                <span className="block font-serif text-base font-bold leading-tight mb-1 w-full line-clamp-2">
                  {resume.title ||
                    resume.jobSnippet ||
                    resume.filename ||
                    t('dashboard.tailoredResume')}
                </span>
              </CardTitle>
              {/* Resume filename snippet */}
              <p className="mt-1 block font-sans text-sm font-normal text-gray-700 truncate w-full whitespace-nowrap">
                {(resume.filename || t('dashboard.tailoredResume')).slice(0, 40)}
              </p>
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
    </div>
  );
}
