'use client';

import { ResumeUploadDialog } from '@/components/dashboard/resume-upload-dialog';
import { useState, useEffect, useCallback, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from '@/lib/i18n';

import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Settings from 'lucide-react/dist/esm/icons/settings';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import ArrowRight from 'lucide-react/dist/esm/icons/arrow-right';
import FileText from 'lucide-react/dist/esm/icons/file-text';
import Zap from 'lucide-react/dist/esm/icons/zap';
import Trash2 from 'lucide-react/dist/esm/icons/trash-2';

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

const GRID_BG = {
  backgroundImage:
    'linear-gradient(rgba(29, 78, 216, 0.07) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.07) 1px, transparent 1px)',
  backgroundSize: '40px 40px',
};

export default function DashboardPage() {
  const { t, locale } = useTranslations();
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('loading');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tailoredResumes, setTailoredResumes] = useState<ResumeListItem[]>([]);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const router = useRouter();

  const {
    status: systemStatus,
    isLoading: statusLoading,
    incrementResumes,
    decrementResumes,
    setHasMasterResume,
  } = useStatusCache();

  const loadRequestIdRef = useRef(0);
  const jobSnippetCacheRef = useRef<Record<string, string>>({});

  const isLlmConfigured = !statusLoading && systemStatus?.llm_configured;
  const isTailorEnabled =
    Boolean(masterResumeId) && processingStatus === 'ready' && isLlmConfigured;

  const formatDate = (value: string) => {
    if (!value) return t('common.unknown');
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return t('common.unknown');
    const dateLocale =
      locale === 'es' ? 'es-ES' : locale === 'zh' ? 'zh-CN' : locale === 'ja' ? 'ja-JP' : 'en-US';
    return date.toLocaleDateString(dateLocale, { month: 'short', day: '2-digit', year: 'numeric' });
  };

  const checkResumeStatus = useCallback(async (resumeId: string) => {
    try {
      setProcessingStatus('loading');
      const data = await fetchResume(resumeId);
      const status = data.raw_resume?.processing_status || 'pending';
      setProcessingStatus(status as ProcessingStatus);
    } catch (err: unknown) {
      console.error('Failed to check resume status:', err);
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

      const tailoredWithParent = filtered.filter((r) => r.parent_id);
      const requestId = ++loadRequestIdRef.current;
      const jobSnippets: Record<string, string> = {};

      await Promise.all(
        tailoredWithParent.map(async (r) => {
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
            jobSnippetCacheRef.current[r.resume_id] = '';
            jobSnippets[r.resume_id] = '';
          }
        })
      );

      if (requestId === loadRequestIdRef.current) {
        setTailoredResumes((prev) =>
          prev.map((r) => ({ ...r, jobSnippet: jobSnippets[r.resume_id] || '' }))
        );
      }
    } catch (err) {
      console.error('Failed to load tailored resumes:', err);
    }
  }, [checkResumeStatus]);

  useEffect(() => { loadTailoredResumes(); }, [loadTailoredResumes]);

  useEffect(() => {
    const handleFocus = () => { loadTailoredResumes(); };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadTailoredResumes]);

  const handleUploadComplete = (resumeId: string) => {
    localStorage.setItem('master_resume_id', resumeId);
    setMasterResumeId(resumeId);
    checkResumeStatus(resumeId);
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
      } else if (result.processing_status === 'processing' || result.processing_status === 'pending') {
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

  const handleDeleteTailored = async (resumeId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteResume(resumeId);
      decrementResumes();
      setTailoredResumes((prev) => prev.filter((r) => r.resume_id !== resumeId));
    } catch (err) {
      console.error('Failed to delete resume:', err);
    }
  };

  const getStatusDisplay = () => {
    switch (processingStatus) {
      case 'loading':
        return { text: t('dashboard.status.checking'), icon: <Loader2 className="w-3 h-3 animate-spin" />, color: 'text-steel-grey', dot: 'bg-steel-grey' };
      case 'processing':
        return { text: t('dashboard.status.processing'), icon: <Loader2 className="w-3 h-3 animate-spin" />, color: 'text-blue-600', dot: 'bg-blue-600' };
      case 'ready':
        return { text: t('dashboard.status.ready'), icon: null, color: 'text-green-700', dot: 'bg-green-500' };
      case 'failed':
        return { text: t('dashboard.status.failed'), icon: <AlertCircle className="w-3 h-3" />, color: 'text-red-600', dot: 'bg-red-500' };
      default:
        return { text: t('dashboard.status.pending'), icon: null, color: 'text-steel-grey', dot: 'bg-steel-grey' };
    }
  };

  const getMonogram = (title: string): string => {
    const words = title.split(/\s+/).filter((w) => /^[a-zA-Z]/.test(w));
    return words.slice(0, 3).map((w) => w.charAt(0).toUpperCase()).join('');
  };

  const cardPalette = [
    { bg: '#1D4ED8', fg: '#FFFFFF' },
    { bg: '#15803D', fg: '#FFFFFF' },
    { bg: '#000000', fg: '#FFFFFF' },
    { bg: '#92400E', fg: '#FFFFFF' },
    { bg: '#7C3AED', fg: '#FFFFFF' },
    { bg: '#0E7490', fg: '#FFFFFF' },
    { bg: '#B91C1C', fg: '#FFFFFF' },
    { bg: '#4338CA', fg: '#FFFFFF' },
  ];

  const hashTitle = (title: string): number => {
    let hash = 0;
    for (let i = 0; i < title.length; i++) {
      hash = (hash << 5) - hash + title.charCodeAt(i);
      hash |= 0;
    }
    return Math.abs(hash);
  };

  const status = getStatusDisplay();

  return (
    <div className="min-h-screen w-full bg-[#F0F0E8]" style={GRID_BG}>
      <div className="max-w-5xl mx-auto px-6 py-10 space-y-8">

        {/* ── Header ── */}
        <div className="flex items-end justify-between">
          <div>
            <div className="flex items-center gap-2 mb-3">
              <Image src="/logo.svg" alt="Resume Matcher" width={18} height={18} />
              <span className="font-mono text-xs uppercase tracking-widest text-steel-grey">
                Resume Matcher
              </span>
            </div>
            <h1 className="font-serif text-5xl md:text-6xl text-ink tracking-tight uppercase leading-none">
              {t('nav.dashboard')}
            </h1>
          </div>
          <Link
            href="/settings"
            className="flex items-center gap-2 font-mono text-xs uppercase tracking-widest text-steel-grey hover:text-ink transition-colors border border-transparent hover:border-ink px-3 py-2"
          >
            <Settings className="w-3.5 h-3.5" />
            {t('nav.settings')}
          </Link>
        </div>

        {/* ── LLM warning ── */}
        {masterResumeId && !isLlmConfigured && !statusLoading && (
          <div className="border-2 border-warning bg-amber-50 px-5 py-3 flex items-center justify-between shadow-sw-sm">
            <div className="flex items-center gap-3">
              <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
              <p className="font-mono text-xs font-bold uppercase tracking-wider text-amber-800">
                {t('dashboard.llmNotConfiguredTitle')} — {t('dashboard.llmNotConfiguredMessage')}
              </p>
            </div>
            <Link href="/settings">
              <Button variant="outline" size="sm" className="border-warning text-amber-700 rounded-none font-mono text-xs">
                Configure
              </Button>
            </Link>
          </div>
        )}

        {/* ══════════════════════════════════════════════
            PRIMARY ACTIONS  (hero CTAs — most used)
        ══════════════════════════════════════════════ */}
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-steel-grey mb-3">
            // Quick actions
          </p>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">

            {/* ATS SCREEN */}
            <Link href="/ats" className="block" style={{ minHeight: '220px' }}>
              <div
                className="group relative overflow-hidden border-2 border-ink bg-ink text-white p-8 shadow-sw-default hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-sw-lg transition-all duration-200 cursor-pointer h-full"
              >
                {/* Dark gradient wash */}
                <div className="absolute inset-0 bg-gradient-to-br from-[#1a1a2e] via-[#16213e] to-[#0f3460]" />
                {/* Grid texture */}
                <div className="absolute inset-0 opacity-10" style={{
                  backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
                  backgroundSize: '20px 20px',
                }} />

                <div className="relative z-10 flex flex-col h-full">
                  <div className="flex items-start justify-between mb-6">
                    <div className="w-12 h-12 border-2 border-white/30 bg-white/10 flex items-center justify-center">
                      <Zap className="w-6 h-6 text-white" />
                    </div>
                    <ArrowRight className="w-5 h-5 text-white/40 group-hover:text-white/90 group-hover:translate-x-1 transition-all duration-200" />
                  </div>
                  <div className="mt-auto">
                    <p className="font-mono text-xs uppercase tracking-widest text-blue-300 mb-2">Most used</p>
                    <h2 className="font-serif text-3xl font-bold text-white uppercase leading-tight mb-2">
                      ATS Screen
                    </h2>
                    <p className="font-mono text-xs text-slate-300 leading-relaxed">
                      Score your resume against any job description before applying
                    </p>
                  </div>
                </div>
              </div>
            </Link>

            {/* CREATE TAILORED RESUME */}
            <button
              onClick={() => isTailorEnabled && router.push('/tailor')}
              disabled={!isTailorEnabled}
              className="group relative overflow-hidden text-left border-2 border-ink bg-ink text-white p-8 shadow-sw-default hover:-translate-x-[3px] hover:-translate-y-[3px] hover:shadow-sw-lg transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:translate-x-0 disabled:hover:translate-y-0 disabled:hover:shadow-sw-default"
              style={{ minHeight: '220px' }}
            >
              {/* Blue gradient wash */}
              <div className="absolute inset-0 bg-gradient-to-br from-blue-700 via-blue-800 to-[#0a1628] opacity-100" />
              {/* Grid texture overlay */}
              <div className="absolute inset-0 opacity-10" style={{
                backgroundImage: 'linear-gradient(rgba(255,255,255,0.4) 1px, transparent 1px), linear-gradient(90deg, rgba(255,255,255,0.4) 1px, transparent 1px)',
                backgroundSize: '20px 20px',
              }} />

              <div className="relative z-10 flex flex-col h-full">
                <div className="flex items-start justify-between mb-6">
                  <div className="w-12 h-12 border-2 border-white/30 bg-white/10 flex items-center justify-center">
                    <Plus className="w-6 h-6 text-white" />
                  </div>
                  <ArrowRight className="w-5 h-5 text-white/40 group-hover:text-white/90 group-hover:translate-x-1 transition-all duration-200" />
                </div>
                <div className="mt-auto">
                  <p className="font-mono text-xs uppercase tracking-widest text-blue-200 mb-2">Most used</p>
                  <h2 className="font-serif text-3xl font-bold text-white uppercase leading-tight mb-2">
                    Create Tailored Resume
                  </h2>
                  <p className="font-mono text-xs text-blue-200 leading-relaxed">
                    Customize your master resume for a specific job description
                  </p>
                  {!isTailorEnabled && masterResumeId && (
                    <p className="font-mono text-xs text-amber-300 mt-2">
                      ⚠ Configure LLM in Settings first
                    </p>
                  )}
                  {!masterResumeId && (
                    <p className="font-mono text-xs text-amber-300 mt-2">
                      ⚠ Upload a master resume first
                    </p>
                  )}
                </div>
              </div>
            </button>
          </div>
        </div>

        {/* ══════════════════════════════════════════════
            MASTER RESUME
        ══════════════════════════════════════════════ */}
        <div>
          <p className="font-mono text-xs uppercase tracking-widest text-steel-grey mb-3">
            // Master resume
          </p>
          <div className="border-2 border-ink bg-[#F0F0E8] shadow-sw-sm">
            {!masterResumeId ? (
              !isLlmConfigured && !statusLoading ? (
                <Link href="/settings">
                  <div className="flex items-center gap-6 p-6 hover:bg-amber-50 transition-colors cursor-pointer group">
                    <div className="w-14 h-14 border-2 border-warning bg-white flex items-center justify-center shrink-0">
                      <AlertTriangle className="w-6 h-6 text-warning" />
                    </div>
                    <div className="flex-1">
                      <p className="font-serif text-lg font-bold text-amber-800 uppercase">
                        {t('dashboard.setupRequiredTitle')}
                      </p>
                      <p className="font-mono text-xs text-amber-700 mt-1">
                        {t('dashboard.setupRequiredMessage')}
                      </p>
                    </div>
                    <ArrowRight className="w-5 h-5 text-amber-400 group-hover:translate-x-1 transition-transform shrink-0" />
                  </div>
                </Link>
              ) : (
                <ResumeUploadDialog
                  open={isUploadDialogOpen}
                  onOpenChange={setIsUploadDialogOpen}
                  onUploadComplete={handleUploadComplete}
                  trigger={
                    <div className="flex items-center gap-6 p-6 hover:bg-black hover:text-white transition-colors cursor-pointer group">
                      <div className="w-14 h-14 border-2 border-current flex items-center justify-center shrink-0">
                        <Plus className="w-6 h-6" />
                      </div>
                      <div className="flex-1">
                        <p className="font-serif text-lg font-bold uppercase">
                          {t('dashboard.initializeMasterResume')}
                        </p>
                        <p className="font-mono text-xs text-steel-grey group-hover:text-white/60 mt-1 transition-colors">
                          {'// '}{t('dashboard.initializeSequence')}
                        </p>
                      </div>
                      <ArrowRight className="w-5 h-5 text-steel-grey group-hover:text-white group-hover:translate-x-1 transition-all shrink-0" />
                    </div>
                  }
                />
              )
            ) : (
              <div
                className="flex items-center gap-6 p-6 hover:bg-black hover:text-white transition-colors cursor-pointer group"
                onClick={() => router.push(`/resumes/${masterResumeId}`)}
              >
                <div className="w-14 h-14 border-2 border-ink group-hover:border-white bg-blue-700 text-white flex items-center justify-center shrink-0 transition-colors">
                  <span className="font-mono font-bold text-lg">M</span>
                </div>
                <div className="flex-1">
                  <p className="font-serif text-lg font-bold uppercase">{t('dashboard.masterResume')}</p>
                  <div className={`flex items-center gap-2 font-mono text-xs mt-1 uppercase ${status.color} group-hover:text-white/70 transition-colors`}>
                    <span className={`w-1.5 h-1.5 rounded-full ${status.dot} shrink-0`} />
                    {status.icon}
                    {status.text}
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0" onClick={(e) => e.stopPropagation()}>
                  {(processingStatus === 'failed' || processingStatus === 'processing') && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        className="font-mono text-xs rounded-none border-ink group-hover:border-white group-hover:bg-transparent group-hover:text-white"
                        onClick={handleRetryProcessing}
                        disabled={isRetrying}
                      >
                        {isRetrying ? <Loader2 className="w-3 h-3 animate-spin" /> : <RefreshCw className="w-3 h-3 mr-1" />}
                        {isRetrying ? t('dashboard.retryingProcessing') : t('dashboard.retryProcessing')}
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        className="font-mono text-xs rounded-none border-red-600 text-red-600 hover:bg-red-50"
                        onClick={handleDeleteAndReupload}
                      >
                        {t('dashboard.deleteAndReupload')}
                      </Button>
                    </>
                  )}
                </div>
                <ArrowRight className="w-5 h-5 text-steel-grey group-hover:text-white group-hover:translate-x-1 transition-all shrink-0" />
              </div>
            )}
          </div>
        </div>

        {/* ══════════════════════════════════════════════
            RESUME LIBRARY
        ══════════════════════════════════════════════ */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <p className="font-mono text-xs uppercase tracking-widest text-steel-grey">
              // Resume library
              {tailoredResumes.length > 0 && (
                <span className="ml-2 text-ink font-bold">({tailoredResumes.length})</span>
              )}
            </p>
          </div>

          {tailoredResumes.length === 0 ? (
            <div className="border-2 border-dashed border-ink/20 p-8 text-center">
              <FileText className="w-8 h-8 text-steel-grey mx-auto mb-3" />
              <p className="font-mono text-xs text-steel-grey uppercase tracking-widest">
                No tailored resumes yet — create one above
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {tailoredResumes.map((resume) => {
                const title =
                  resume.title || resume.jobSnippet || resume.filename || t('dashboard.tailoredResume');
                const color = cardPalette[hashTitle(title) % cardPalette.length];
                return (
                  <div
                    key={resume.resume_id}
                    className="border-2 border-ink bg-[#F0F0E8] p-5 cursor-pointer hover:-translate-x-[2px] hover:-translate-y-[2px] hover:shadow-sw-default transition-all duration-200 group"
                    onClick={() => router.push(`/resumes/${resume.resume_id}`)}
                  >
                    <div className="flex items-start justify-between mb-4">
                      <div
                        className="w-10 h-10 border-2 border-ink flex items-center justify-center shrink-0"
                        style={{ backgroundColor: color.bg, color: color.fg }}
                      >
                        <span className="font-mono font-bold text-xs">{getMonogram(title)}</span>
                      </div>
                      <button
                        onClick={(e) => handleDeleteTailored(resume.resume_id, e)}
                        className="p-1.5 text-steel-grey hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                        title="Delete resume"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                    <p className="font-serif text-base font-bold leading-tight line-clamp-2 mb-3 group-hover:text-blue-700 transition-colors">
                      {title}
                    </p>
                    <p className="font-mono text-xs text-steel-grey uppercase">
                      {t('dashboard.edited', { date: formatDate(resume.updated_at || resume.created_at) })}
                    </p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Bottom spacer */}
        <div className="h-4" />
      </div>

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
    </div>
  );
}
