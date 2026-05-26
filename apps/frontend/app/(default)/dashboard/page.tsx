'use client';

import { ResumeUploadDialog } from '@/components/dashboard/resume-upload-dialog';
import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Card, CardTitle, CardDescription } from '@/components/ui/card';
import Link from 'next/link';
import Image from 'next/image';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import AlertCircle from 'lucide-react/dist/esm/icons/alert-circle';
import RefreshCw from 'lucide-react/dist/esm/icons/refresh-cw';
import Plus from 'lucide-react/dist/esm/icons/plus';
import Settings from 'lucide-react/dist/esm/icons/settings';
import AlertTriangle from 'lucide-react/dist/esm/icons/alert-triangle';
import ChevronDown from 'lucide-react/dist/esm/icons/chevron-down';
import Upload from 'lucide-react/dist/esm/icons/upload';
import Edit2 from 'lucide-react/dist/esm/icons/edit-2';

import {
  fetchResumeList,
  deleteResume,
  retryProcessing,
  fetchJobDescription,
  createBlankMasterResume,
  type ResumeListItem,
} from '@/lib/api/resume';
import { useStatusCache } from '@/lib/context/status-cache';

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'loading';

interface MasterGroup {
  master: ResumeListItem;
  tailored: ResumeListItem[];
}

// Muted palette that complements the #F0F0E8 canvas. Indexed by hashed title
// so each master keeps a stable color across reloads.
const CARD_PALETTE: Array<{ bg: string; fg: string }> = [
  { bg: '#1D4ED8', fg: '#FFFFFF' }, // Hyper Blue
  { bg: '#15803D', fg: '#FFFFFF' }, // Signal Green
  { bg: '#000000', fg: '#FFFFFF' }, // Ink
  { bg: '#92400E', fg: '#FFFFFF' }, // Warm Brown
  { bg: '#7C3AED', fg: '#FFFFFF' }, // Violet
  { bg: '#0E7490', fg: '#FFFFFF' }, // Teal
  { bg: '#B91C1C', fg: '#FFFFFF' }, // Deep Red
  { bg: '#4338CA', fg: '#FFFFFF' }, // Indigo
];

function hashTitle(title: string): number {
  let hash = 0;
  for (let i = 0; i < title.length; i++) {
    hash = (hash << 5) - hash + title.charCodeAt(i);
    hash |= 0;
  }
  return Math.abs(hash);
}

function getMonogram(title: string): string {
  const words = title.split(/\s+/).filter((w) => /^[a-zA-Z]/.test(w));
  if (words.length === 0) return 'M';
  return words
    .slice(0, 2)
    .map((w) => w.charAt(0).toUpperCase())
    .join('');
}

function pad2(n: number): string {
  return String(n).padStart(2, '0');
}

function rowFill(n: number, columns: number): number {
  const r = n % columns;
  return r === 0 ? 0 : columns - r;
}

export default function DashboardPage() {
  const { t, locale } = useTranslations();
  const [resumes, setResumes] = useState<ResumeListItem[]>([]);
  const [statuses, setStatuses] = useState<Record<string, ProcessingStatus>>({});
  const [openMap, setOpenMap] = useState<Record<string, boolean>>({});
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [isCreatingBlank, setIsCreatingBlank] = useState(false);
  const [retryingId, setRetryingId] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
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

  const formatDate = useCallback(
    (value: string) => {
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
    },
    [t, locale]
  );

  const loadResumes = useCallback(async () => {
    try {
      const data = await fetchResumeList(true);
      setResumes(data);

      const masters = data.filter((r) => r.is_master);
      setStatuses((prev) => {
        const next = { ...prev };
        for (const m of masters) {
          next[m.resume_id] = m.processing_status as ProcessingStatus;
        }
        return next;
      });
      setOpenMap((prev) => {
        const next = { ...prev };
        // Default to open for any masters we haven't seen yet.
        for (const m of masters) {
          if (next[m.resume_id] === undefined) next[m.resume_id] = true;
        }
        return next;
      });

      // Best-effort: enrich tailored entries with a short job description snippet
      const tailoredWithParent = data.filter((r) => !r.is_master && r.parent_id);
      const requestId = ++loadRequestIdRef.current;
      const jobSnippets: Record<string, string> = {};
      await Promise.all(
        tailoredWithParent.map(async (r) => {
          if (jobSnippetCacheRef.current[r.resume_id] !== undefined) {
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
        setResumes((prev) =>
          prev.map((r) =>
            r.is_master ? r : { ...r, jobSnippet: jobSnippets[r.resume_id] ?? r.jobSnippet }
          )
        );
      }
    } catch (err) {
      console.error('Failed to load resumes:', err);
    }
  }, []);

  useEffect(() => {
    loadResumes();
  }, [loadResumes]);

  useEffect(() => {
    const handleFocus = () => loadResumes();
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadResumes]);

  const groups: MasterGroup[] = useMemo(() => {
    const masters = resumes.filter((r) => r.is_master);
    const tailoredByParent = new Map<string, ResumeListItem[]>();
    for (const r of resumes) {
      if (r.is_master || !r.parent_id) continue;
      const list = tailoredByParent.get(r.parent_id) ?? [];
      list.push(r);
      tailoredByParent.set(r.parent_id, list);
    }
    return masters.map((m) => ({
      master: m,
      tailored: tailoredByParent.get(m.resume_id) ?? [],
    }));
  }, [resumes]);

  const totalTailored = useMemo(() => resumes.filter((r) => !r.is_master).length, [resumes]);

  const toggle = useCallback((id: string) => {
    setOpenMap((prev) => ({ ...prev, [id]: !prev[id] }));
  }, []);

  const handleUploadComplete = useCallback(() => {
    incrementResumes();
    setHasMasterResume(true);
    loadResumes();
  }, [incrementResumes, setHasMasterResume, loadResumes]);

  const handleCreateFromScratch = useCallback(async () => {
    setIsCreatingBlank(true);
    try {
      const result = await createBlankMasterResume();
      incrementResumes();
      setHasMasterResume(true);
      router.push(`/builder?id=${result.resume_id}`);
    } catch (err) {
      console.error('Failed to create blank resume:', err);
    } finally {
      setIsCreatingBlank(false);
    }
  }, [incrementResumes, setHasMasterResume, router]);

  const handleRetry = useCallback(async (resumeId: string) => {
    setRetryingId(resumeId);
    try {
      const result = await retryProcessing(resumeId);
      setStatuses((prev) => ({
        ...prev,
        [resumeId]: result.processing_status as ProcessingStatus,
      }));
    } catch (err) {
      console.error('Retry processing failed:', err);
      setStatuses((prev) => ({ ...prev, [resumeId]: 'failed' }));
    } finally {
      setRetryingId(null);
    }
  }, []);

  const confirmDelete = useCallback(async () => {
    if (!pendingDeleteId) return;
    try {
      await deleteResume(pendingDeleteId);
      decrementResumes();
      setPendingDeleteId(null);
      await loadResumes();
      const remainingMasters = (await fetchResumeList(true)).some((r) => r.is_master);
      setHasMasterResume(remainingMasters);
    } catch (err) {
      console.error('Failed to delete resume:', err);
      setPendingDeleteId(null);
    }
  }, [pendingDeleteId, decrementResumes, setHasMasterResume, loadResumes]);

  const showConfigBanner = groups.length > 0 && !isLlmConfigured && !statusLoading;
  const showEmpty = groups.length === 0;
  const tailorEnabled = Boolean(isLlmConfigured);

  return (
    <div className="h-screen w-full flex justify-center items-start py-3 sm:py-8 md:py-12 px-3 sm:px-4 md:px-8 overflow-hidden bg-background grid-bg">
      <div className="w-full max-w-[86rem] max-h-full border border-border bg-canvas shadow-sw-lg flex flex-col overflow-hidden">
        {/* Header */}
        <div className="border-b border-border p-4 sm:p-6 md:p-8 lg:p-12 shrink-0 bg-canvas relative z-30">
          <h1 className="font-serif text-3xl sm:text-5xl md:text-7xl text-ink tracking-tight leading-[0.95] uppercase">
            {t('nav.dashboard')}
          </h1>
          <p className="mt-6 text-sm font-mono text-primary uppercase tracking-wide max-w-md font-bold">
            {'// '}
            {t('dashboard.selectModule')}
          </p>
        </div>

        {/* Scrollable content */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden bg-canvas relative z-10">
          {showConfigBanner && (
            <div className="border-b-2 border-warning bg-amber-50 p-4 flex items-center justify-between">
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

          {/* Topbar: counts + New Master */}
          <div className="flex flex-wrap items-end justify-between gap-3 md:gap-6 px-4 sm:px-6 md:px-8 lg:px-10 py-3 md:py-6 border-b border-ink">
            <div>
              <div className="flex items-baseline gap-4">
                <span className="font-serif text-3xl sm:text-4xl md:text-5xl lg:text-6xl font-bold leading-none tracking-tight text-ink">
                  {pad2(groups.length)}
                </span>
                <span className="font-mono text-xs font-bold tracking-[0.12em] uppercase text-ink">
                  {t('dashboard.groups.masterCountLabel')}
                </span>
              </div>
              <div className="mt-2 font-mono text-[11px] font-bold tracking-[0.08em] text-primary uppercase">
                {'// '}
                {t('dashboard.groups.totalTailored', { count: pad2(totalTailored) })}
              </div>
            </div>
            <div className="flex items-center gap-3">
              {isLlmConfigured ? (
                <Button size="sm" className="font-mono" onClick={() => setIsUploadDialogOpen(true)}>
                  <Upload className="w-4 h-4 mr-2" />
                  {t('dashboard.groups.newMaster')}
                </Button>
              ) : (
                <Link href="/settings">
                  <Button variant="outline" size="sm" className="border-warning text-amber-700">
                    <Settings className="w-4 h-4 mr-2" />
                    {t('nav.settings')}
                  </Button>
                </Link>
              )}
            </div>
          </div>

          {/* Empty state */}
          {showEmpty && (
            <div className="p-8 md:p-12">
              {!isLlmConfigured && !statusLoading ? (
                <Link href="/settings" className="block">
                  <Card
                    variant="interactive"
                    className="border-dashed border-warning bg-amber-50 max-w-md"
                  >
                    <div className="w-14 h-14 border-2 border-warning bg-card flex items-center justify-center mb-4">
                      <AlertTriangle className="w-7 h-7 text-warning" />
                    </div>
                    <CardTitle className="text-lg uppercase text-amber-800 mb-2">
                      {t('dashboard.setupRequiredTitle')}
                    </CardTitle>
                    <CardDescription className="text-amber-700 text-xs">
                      {t('dashboard.setupRequiredMessage')}
                    </CardDescription>
                  </Card>
                </Link>
              ) : (
                <div className="max-w-md">
                  <Card variant="interactive" onClick={() => setIsUploadDialogOpen(true)}>
                    <div className="w-14 h-14 border-2 border-ink flex items-center justify-center mb-4">
                      <Plus className="w-7 h-7" />
                    </div>
                    <CardTitle className="text-xl uppercase">
                      {t('dashboard.groups.noMasters')}
                    </CardTitle>
                    <CardDescription className="mt-2">
                      {t('dashboard.groups.noMastersDescription')}
                    </CardDescription>
                    <button
                      type="button"
                      className="mt-6 text-left font-mono text-xs uppercase underline opacity-70 hover:opacity-100"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCreateFromScratch();
                      }}
                      disabled={isCreatingBlank}
                    >
                      {isCreatingBlank ? '...' : t('dashboard.createFromScratch')}
                    </button>
                  </Card>
                </div>
              )}
            </div>
          )}

          {/* Bands */}
          {groups.map((group) => (
            <MasterBand
              key={group.master.resume_id}
              group={group}
              open={openMap[group.master.resume_id] ?? true}
              status={
                statuses[group.master.resume_id] ??
                (group.master.processing_status as ProcessingStatus)
              }
              retrying={retryingId === group.master.resume_id}
              tailorEnabled={tailorEnabled}
              onToggle={() => toggle(group.master.resume_id)}
              onEdit={() => router.push(`/resumes/${group.master.resume_id}`)}
              onRetry={() => handleRetry(group.master.resume_id)}
              onRequestDelete={() => setPendingDeleteId(group.master.resume_id)}
              onTailor={() =>
                router.push(`/tailor?master_id=${encodeURIComponent(group.master.resume_id)}`)
              }
              onOpenTailored={(id) => router.push(`/resumes/${id}`)}
              formatDate={formatDate}
              t={t}
            />
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 bg-canvas flex justify-between items-center font-mono text-xs text-primary border-t border-border shrink-0 relative z-30">
          <div className="flex items-center gap-2">
            <Image
              src="/logo.svg"
              alt="Resume Matcher"
              width={20}
              height={20}
              className="w-5 h-5"
            />
            <span className="uppercase font-bold">Resume Matcher</span>
          </div>
          <div className="flex items-center gap-4">
            <Link
              href="/settings"
              className="bg-warning text-on-accent border border-border px-6 py-2 uppercase font-bold tracking-wide shadow-sw-sm hover:translate-y-[1px] hover:translate-x-[1px] hover:shadow-none transition-all min-w-[140px] text-center"
            >
              {t('nav.settings')}
            </Link>
          </div>
        </div>
      </div>

      <ResumeUploadDialog
        trigger={null}
        open={isUploadDialogOpen}
        onOpenChange={setIsUploadDialogOpen}
        onUploadComplete={handleUploadComplete}
      />

      <ConfirmDialog
        open={pendingDeleteId !== null}
        onOpenChange={(open) => !open && setPendingDeleteId(null)}
        title={t('confirmations.deleteMasterResumeTitle')}
        description={t('confirmations.deleteMasterResumeDescription')}
        confirmLabel={t('dashboard.deleteAndReupload')}
        cancelLabel={t('confirmations.keepResumeCancelLabel')}
        onConfirm={confirmDelete}
        variant="danger"
      />
    </div>
  );
}

interface MasterBandProps {
  group: MasterGroup;
  open: boolean;
  status: ProcessingStatus;
  retrying: boolean;
  tailorEnabled: boolean;
  onToggle: () => void;
  onEdit: () => void;
  onRetry: () => void;
  onRequestDelete: () => void;
  onTailor: () => void;
  onOpenTailored: (resumeId: string) => void;
  formatDate: (value: string) => string;
  t: (key: string, params?: Record<string, string | number>) => string;
}

function MasterBand({
  group,
  open,
  status,
  retrying,
  tailorEnabled,
  onToggle,
  onEdit,
  onRetry,
  onRequestDelete,
  onTailor,
  onOpenTailored,
  formatDate,
  t,
}: MasterBandProps) {
  const { master, tailored } = group;
  const title =
    master.title?.trim() || master.filename?.replace(/\.[^.]+$/, '') || t('dashboard.masterResume');
  const color = CARD_PALETTE[hashTitle(title) % CARD_PALETTE.length];
  const monogram = getMonogram(title);
  const editedLabel = formatDate(master.updated_at || master.created_at);
  const showRecoveryActions = status === 'failed' || status === 'processing';
  const totalCells = tailored.length + 1;
  const fillers = rowFill(totalCells, 4);

  return (
    <section className="border-b border-ink">
      {/* Header */}
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="w-full bg-canvas border-b border-ink px-6 py-5 flex items-center gap-4 text-left hover:bg-paper-tint transition-colors"
      >
        <span className="w-6 h-6 flex items-center justify-center text-ink shrink-0">
          <ChevronDown
            className="w-4 h-4 transition-transform duration-150"
            style={{ transform: open ? 'rotate(0deg)' : 'rotate(-90deg)' }}
          />
        </span>
        <span
          aria-hidden="true"
          className="w-11 h-11 border-2 border-ink flex items-center justify-center font-mono font-bold text-sm tracking-[0.04em] shrink-0"
          style={{ background: color.bg, color: color.fg }}
        >
          {monogram}
        </span>
        <span className="flex flex-col gap-0.5 min-w-0">
          <span className="font-serif text-2xl md:text-[26px] font-bold leading-none tracking-tight text-ink uppercase truncate">
            {title}
          </span>
          <span className="font-mono text-[11px] font-bold tracking-[0.08em] text-primary uppercase truncate">
            {'// '}
            {t('dashboard.groups.bandSubtitle', { date: editedLabel.toUpperCase() })}
          </span>
        </span>
        <span className="flex-1" />
        <StatusPill status={status} />
        <CountChip count={tailored.length} t={t} />
        <span
          role="button"
          tabIndex={0}
          onClick={(e) => {
            e.stopPropagation();
            onEdit();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.stopPropagation();
              onEdit();
            }
          }}
          className="font-mono text-[11px] font-bold tracking-[0.08em] uppercase text-ink px-3 py-2 border border-ink bg-canvas shadow-sw-sm inline-flex items-center gap-1.5 cursor-pointer hover:translate-x-[1px] hover:translate-y-[1px] hover:shadow-none transition-all"
        >
          <Edit2 className="w-3.5 h-3.5" />
          {t('dashboard.groups.editMaster')}
        </span>
      </button>

      {/* Recovery row for failed/processing masters */}
      {showRecoveryActions && open && (
        <div
          className="bg-amber-50 border-b border-ink px-6 py-3 flex items-center gap-3 font-mono text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <AlertCircle className="w-4 h-4 text-warning" />
          <span className="font-bold uppercase tracking-wider text-amber-800">
            {status === 'failed' ? t('dashboard.status.failed') : t('dashboard.status.processing')}
          </span>
          <span className="flex-1" />
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 rounded-none border-border"
            onClick={onRetry}
            disabled={retrying}
          >
            {retrying ? (
              <Loader2 className="w-3 h-3 animate-spin mr-2" />
            ) : (
              <RefreshCw className="w-3 h-3 mr-2" />
            )}
            {retrying ? t('dashboard.retryingProcessing') : t('dashboard.retryProcessing')}
          </Button>
          <Button
            variant="outline"
            size="sm"
            className="text-xs h-7 rounded-none border-red-600 text-red-600 hover:bg-red-50"
            onClick={onRequestDelete}
          >
            {t('dashboard.deleteAndReupload')}
          </Button>
        </div>
      )}

      {/* Body */}
      {open && (
        <div className="grid bg-ink gap-px grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4">
          {tailored.map((child) => (
            <TailoredCell
              key={child.resume_id}
              resume={child}
              onOpen={onOpenTailored}
              formatDate={formatDate}
            />
          ))}
          <CreateTailoredCell onClick={onTailor} disabled={!tailorEnabled} t={t} />
          {Array.from({ length: fillers }).map((_, i) => (
            <div
              key={`f-${i}`}
              className="bg-secondary opacity-55 pointer-events-none min-h-[160px]"
            />
          ))}
        </div>
      )}
    </section>
  );
}

function TailoredCell({
  resume,
  onOpen,
  formatDate,
}: {
  resume: ResumeListItem;
  onOpen: (id: string) => void;
  formatDate: (value: string) => string;
}) {
  const title =
    resume.title?.trim() ||
    resume.jobSnippet?.trim() ||
    resume.filename?.replace(/\.[^.]+$/, '') ||
    '';
  const editedLabel = formatDate(resume.updated_at || resume.created_at);
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => onOpen(resume.resume_id)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') onOpen(resume.resume_id);
      }}
      className="bg-canvas p-5 min-h-[160px] flex flex-col relative outline outline-1 outline-transparent -outline-offset-1 cursor-pointer hover:outline-ink hover:shadow-sw-default hover:-translate-x-[2px] hover:-translate-y-[2px] hover:z-10 transition-all"
    >
      <div className="flex items-start justify-between gap-2">
        <span className="font-mono text-[10px] tracking-[0.1em] uppercase text-steel-grey truncate">
          {resume.jobSnippet?.slice(0, 30) || ''}
        </span>
        <StatusPill status={resume.processing_status as ProcessingStatus} compact />
      </div>
      <h4 className="font-serif text-base font-bold leading-tight tracking-tight mt-4 line-clamp-3 text-ink">
        {title}
      </h4>
      <div className="mt-auto pt-3 font-mono text-[10px] font-bold tracking-[0.08em] uppercase text-steel-grey">
        {editedLabel.toUpperCase()}
      </div>
    </div>
  );
}

function CreateTailoredCell({
  onClick,
  disabled,
  t,
}: {
  onClick: () => void;
  disabled: boolean;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={cn(
        'bg-canvas p-5 min-h-[160px] flex flex-col items-center justify-center text-center outline outline-1 outline-transparent -outline-offset-1 transition-all',
        disabled
          ? 'opacity-50 cursor-not-allowed'
          : 'cursor-pointer hover:outline-ink hover:shadow-sw-default hover:-translate-x-[2px] hover:-translate-y-[2px] hover:z-10'
      )}
    >
      <div className="w-14 h-14 border-2 border-ink bg-primary text-primary-foreground flex items-center justify-center shadow-sw-sm">
        <Plus className="w-7 h-7" />
      </div>
      <div className="mt-3.5 font-mono text-[11px] font-bold tracking-[0.1em] uppercase text-ink">
        {'// '}
        {t('dashboard.groups.tailorNew')}
      </div>
    </button>
  );
}

function StatusPill({ status, compact = false }: { status: ProcessingStatus; compact?: boolean }) {
  const config: Record<ProcessingStatus, { label: string; dot: string; text: string }> = {
    ready: { label: 'READY', dot: 'bg-green-700', text: 'text-green-700' },
    processing: { label: 'PROCESSING', dot: 'bg-primary', text: 'text-primary' },
    pending: { label: 'PENDING', dot: 'bg-steel-grey', text: 'text-steel-grey' },
    failed: { label: 'FAILED', dot: 'bg-red-600', text: 'text-red-600' },
    loading: { label: 'CHECKING', dot: 'bg-steel-grey', text: 'text-steel-grey' },
  };
  const c = config[status] ?? config.pending;
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1.5 font-mono font-bold uppercase border border-ink bg-canvas',
        compact
          ? 'text-[10px] tracking-[0.08em] px-1.5 py-0.5'
          : 'text-[10px] tracking-[0.08em] px-2 py-1',
        c.text
      )}
    >
      <span className={cn('rounded-full', c.dot, compact ? 'w-1.5 h-1.5' : 'w-2 h-2')} />
      <span>{c.label}</span>
    </span>
  );
}

function CountChip({
  count,
  t,
}: {
  count: number;
  t: (key: string, params?: Record<string, string | number>) => string;
}) {
  return (
    <span className="font-mono text-[11px] font-bold tracking-[0.08em] uppercase border border-ink px-2 py-1 bg-canvas text-ink whitespace-nowrap">
      {t('dashboard.groups.tailoredCount', { count: pad2(count) })}
    </span>
  );
}
