'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { QRCodeSVG } from 'qrcode.react';
import { useRouter, useParams, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { SegmentedTabs, type SegmentedTab } from '@/components/ui/segmented-tabs';
import Resume, { ResumeData } from '@/components/dashboard/resume-component';
import {
  fetchResume,
  downloadResumePdf,
  getResumePdfUrl,
  deleteResume,
  retryProcessing,
  renameResume,
  generateCoverLetter,
  generateCounterpart,
  generateOutreachMessage,
  updateCoverLetter,
  updateOutreachMessage,
  downloadCoverLetterPdf,
  getCoverLetterPdfUrl,
  updateResume,
  saveTemplateSettings,
} from '@/lib/api/resume';
import { useStatusCache } from '@/lib/context/status-cache';
import {
  ChevronLeft,
  Loader2,
  AlertCircle,
  Pencil,
  Wand2,
  Download,
  Copy,
  Check,
  Target,
  BarChart3,
  Save,
  X as XIcon,
} from 'lucide-react';
import { EnrichmentModal } from '@/components/enrichment/enrichment-modal';
import { CoverLetterEditor } from '@/components/builder/cover-letter-editor';
import { OutreachEditor } from '@/components/builder/outreach-editor';
import { ResumeForm } from '@/components/builder/resume-form';
import { FormattingControls } from '@/components/builder/formatting-controls';
import { PaginatedPreview } from '@/components/preview';
import { AnalysisPanel, type AnalysisMode } from '@/components/resumes/analysis-panel';
import { AtsInlineView } from '@/components/resumes/ats-inline-view';
import { useTranslations } from '@/lib/i18n';
import { withLocalizedDefaultSections } from '@/lib/utils/section-helpers';
import { useLanguage } from '@/lib/context/language-context';
import { downloadBlobAsFile, openUrlInNewTab, sanitizeFilename } from '@/lib/utils/download';
import { type TemplateSettings, DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';
type TabId = 'resume' | 'cv' | 'coverLetter' | 'outreach';

const TAB_IDS: readonly TabId[] = ['resume', 'cv', 'coverLetter', 'outreach'] as const;

function parseTab(value: string | null): TabId {
  return (TAB_IDS as readonly string[]).includes(value ?? '') ? (value as TabId) : 'resume';
}

export default function ResumeViewerPage() {
  const { t } = useTranslations();
  const { uiLanguage } = useLanguage();
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { decrementResumes, setHasMasterResume } = useStatusCache();
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [coverLetter, setCoverLetter] = useState<string | null>(null);
  const [outreachMessage, setOutreachMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [isMasterResume, setIsMasterResume] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showDeleteSuccessDialog, setShowDeleteSuccessDialog] = useState(false);
  const [showDownloadSuccessDialog, setShowDownloadSuccessDialog] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showEnrichmentModal, setShowEnrichmentModal] = useState(false);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [resumeTitle, setResumeTitle] = useState<string | null>(null);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitleValue, setEditingTitleValue] = useState('');
  const [templateSettings, setTemplateSettings] =
    useState<TemplateSettings>(DEFAULT_TEMPLATE_SETTINGS);

  // Cover letter editing / generation
  const [coverLetterDraft, setCoverLetterDraft] = useState('');
  const [isEditingCoverLetter, setIsEditingCoverLetter] = useState(false);
  const [isSavingCoverLetter, setIsSavingCoverLetter] = useState(false);
  const [isGeneratingCoverLetter, setIsGeneratingCoverLetter] = useState(false);
  const [showRegenerateCoverDialog, setShowRegenerateCoverDialog] = useState(false);

  // Outreach editing / generation
  const [outreachDraft, setOutreachDraft] = useState('');
  const [isEditingOutreach, setIsEditingOutreach] = useState(false);
  const [isSavingOutreach, setIsSavingOutreach] = useState(false);
  const [isGeneratingOutreach, setIsGeneratingOutreach] = useState(false);
  const [showRegenerateOutreachDialog, setShowRegenerateOutreachDialog] = useState(false);
  const [outreachCopied, setOutreachCopied] = useState(false);

  // Resume in-place editor
  const [isEditingResume, setIsEditingResume] = useState(false);
  const [resumeDraft, setResumeDraft] = useState<ResumeData | null>(null);
  const [templateDraft, setTemplateDraft] = useState<TemplateSettings>(DEFAULT_TEMPLATE_SETTINGS);
  const [isSavingResume, setIsSavingResume] = useState(false);

  // Document group: master may hold a Resume, a CV, or one of each.
  // resumeDocId/cvDocId point to whichever record holds that document's
  // data — they may equal `resumeId` (when the master IS that document)
  // or point to a linked child row.
  const [resumeDocId, setResumeDocId] = useState<string | null>(null);
  const [cvDocId, setCvDocId] = useState<string | null>(null);
  const [cvData, setCvData] = useState<ResumeData | null>(null);
  const [cvLoading, setCvLoading] = useState(false);
  const [cvTemplateSettings, setCvTemplateSettings] =
    useState<TemplateSettings>(DEFAULT_TEMPLATE_SETTINGS);
  const [isGeneratingResume, setIsGeneratingResume] = useState(false);
  const [isGeneratingCV, setIsGeneratingCV] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);

  // CV in-place editor (independent of the Resume editor — CV and resume
  // are distinct documents with their own drafts and template settings).
  const [isEditingCv, setIsEditingCv] = useState(false);
  const [cvDraft, setCvDraft] = useState<ResumeData | null>(null);
  const [cvTemplateDraft, setCvTemplateDraft] =
    useState<TemplateSettings>(DEFAULT_TEMPLATE_SETTINGS);
  const [isSavingCv, setIsSavingCv] = useState(false);

  // Analysis side panel (jdmatch only — ATS now uses inline view)
  const [analysisPanel, setAnalysisPanel] = useState<AnalysisMode | null>(null);

  // Inline ATS view (replaces preview when toggled on)
  const [atsView, setAtsView] = useState(false);
  const [atsEverOpened, setAtsEverOpened] = useState(false);

  const activeTab = parseTab(searchParams?.get('tab') ?? null);
  const savedQrCode =
    templateSettings.qrCode.enabled && templateSettings.qrCode.url ? templateSettings.qrCode : null;

  const resumeId = params?.id as string;

  const localizedResumeData = useMemo(() => {
    if (!resumeData) return null;
    return withLocalizedDefaultSections(resumeData, t);
  }, [resumeData, t]);

  const localizedResumeDraft = useMemo(() => {
    if (!resumeDraft) return null;
    return withLocalizedDefaultSections(resumeDraft, t);
  }, [resumeDraft, t]);

  const handleDraftQrChange = useCallback((qrCode: TemplateSettings['qrCode']) => {
    setTemplateDraft((prev) => ({ ...prev, qrCode }));
  }, []);

  const setActiveTab = useCallback(
    (next: TabId) => {
      if (next === activeTab) return;
      const sp = new URLSearchParams(searchParams?.toString() ?? '');
      if (next === 'resume') {
        sp.delete('tab');
      } else {
        sp.set('tab', next);
      }
      const query = sp.toString();
      router.replace(`/resumes/${resumeId}${query ? `?${query}` : ''}`, { scroll: false });
    },
    [activeTab, resumeId, router, searchParams]
  );

  useEffect(() => {
    if (!resumeId) return;

    const loadResume = async () => {
      try {
        setLoading(true);
        setError(null);
        const data = await fetchResume(resumeId);

        const status = (data.raw_resume?.processing_status || 'pending') as ProcessingStatus;
        setProcessingStatus(status);

        setResumeTitle(data.title ?? null);
        setCoverLetter(data.cover_letter ?? null);
        setOutreachMessage(data.outreach_message ?? null);
        setIsMasterResume(Boolean(data.is_master));
        setResumeDocId(data.resume_doc_id ?? null);
        setCvDocId(data.cv_doc_id ?? null);

        if (data.template_settings) {
          const saved = data.template_settings as Partial<TemplateSettings>;
          setTemplateSettings({
            ...DEFAULT_TEMPLATE_SETTINGS,
            ...saved,
            margins: { ...DEFAULT_TEMPLATE_SETTINGS.margins, ...(saved.margins ?? {}) },
            spacing: { ...DEFAULT_TEMPLATE_SETTINGS.spacing, ...(saved.spacing ?? {}) },
            fontSize: { ...DEFAULT_TEMPLATE_SETTINGS.fontSize, ...(saved.fontSize ?? {}) },
            textStyle: { ...DEFAULT_TEMPLATE_SETTINGS.textStyle, ...(saved.textStyle ?? {}) },
            qrCode: { ...DEFAULT_TEMPLATE_SETTINGS.qrCode, ...(saved.qrCode ?? {}) },
          });
        }

        if (data.processed_resume) {
          setResumeData(data.processed_resume as ResumeData);
          setError(null);
        } else if (status === 'failed') {
          setError(t('resumeViewer.errors.processingFailed'));
        } else if (status === 'processing') {
          setError(t('resumeViewer.errors.stillProcessing'));
        } else if (data.raw_resume?.content) {
          try {
            const parsed = JSON.parse(data.raw_resume.content);
            setResumeData(parsed as ResumeData);
          } catch {
            setError(t('resumeViewer.errors.notProcessedYet'));
          }
        } else {
          setError(t('resumeViewer.errors.noDataAvailable'));
        }
      } catch (err) {
        console.error('Failed to load resume:', err);
        setError(t('resumeViewer.errors.failedToLoad'));
      } finally {
        setLoading(false);
      }
    };

    loadResume();
  }, [resumeId, t]);

  const handleRetryProcessing = async () => {
    if (!resumeId) return;
    setIsRetrying(true);
    try {
      const result = await retryProcessing(resumeId);
      if (result.processing_status === 'ready') {
        window.location.reload();
      } else {
        setError(t('resumeViewer.errors.processingFailed'));
      }
    } catch (err) {
      console.error('Retry processing failed:', err);
      setError(t('resumeViewer.errors.processingFailed'));
    } finally {
      setIsRetrying(false);
    }
  };

  const handleEdit = () => {
    if (!resumeData) return;
    setResumeDraft(resumeData);
    setTemplateDraft(templateSettings);
    setIsEditingResume(true);
  };

  const handleCancelEditResume = () => {
    setIsEditingResume(false);
    setResumeDraft(null);
  };

  const handleSaveResume = async () => {
    if (!resumeDraft) return;
    setIsSavingResume(true);
    try {
      const [updated] = await Promise.all([
        updateResume(resumeId, resumeDraft),
        saveTemplateSettings(resumeId, templateDraft),
      ]);
      const next = (updated.processed_resume || resumeDraft) as ResumeData;
      setResumeData(next);
      setTemplateSettings(templateDraft);
      setIsEditingResume(false);
      setResumeDraft(null);
    } catch (err) {
      console.error('Failed to save resume:', err);
    } finally {
      setIsSavingResume(false);
    }
  };

  const handleTitleSave = async () => {
    const trimmed = editingTitleValue.trim();
    if (!trimmed || trimmed === resumeTitle) {
      setIsEditingTitle(false);
      return;
    }
    try {
      await renameResume(resumeId, trimmed);
      setResumeTitle(trimmed);
    } catch (err) {
      console.error('Failed to rename resume:', err);
    }
    setIsEditingTitle(false);
  };

  const handleTitleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      handleTitleSave();
    } else if (e.key === 'Escape') {
      setIsEditingTitle(false);
    }
  };

  const reloadResumeData = async () => {
    try {
      const data = await fetchResume(resumeId);
      if (data.processed_resume) {
        setResumeData(data.processed_resume as ResumeData);
        setError(null);
      }
      setCoverLetter(data.cover_letter ?? null);
      setOutreachMessage(data.outreach_message ?? null);
      setResumeDocId(data.resume_doc_id ?? null);
      setCvDocId(data.cv_doc_id ?? null);
    } catch (err) {
      console.error('Failed to reload resume:', err);
    }
  };

  // Lazy-load the CV document when its data lives in a separate row.
  // (When the master itself IS the CV, `resumeData` already holds it.)
  useEffect(() => {
    if (activeTab !== 'cv') return;
    if (!cvDocId) return;
    if (cvDocId === resumeId) return; // master is the CV; reuse resumeData
    if (cvData) return; // already loaded
    let cancelled = false;
    setCvLoading(true);
    fetchResume(cvDocId)
      .then((data) => {
        if (cancelled) return;
        if (data.processed_resume) setCvData(data.processed_resume as ResumeData);
        if (data.template_settings) {
          const saved = data.template_settings as Partial<TemplateSettings>;
          setCvTemplateSettings({
            ...DEFAULT_TEMPLATE_SETTINGS,
            ...saved,
            margins: { ...DEFAULT_TEMPLATE_SETTINGS.margins, ...(saved.margins ?? {}) },
            spacing: { ...DEFAULT_TEMPLATE_SETTINGS.spacing, ...(saved.spacing ?? {}) },
            fontSize: { ...DEFAULT_TEMPLATE_SETTINGS.fontSize, ...(saved.fontSize ?? {}) },
            textStyle: { ...DEFAULT_TEMPLATE_SETTINGS.textStyle, ...(saved.textStyle ?? {}) },
            qrCode: { ...DEFAULT_TEMPLATE_SETTINGS.qrCode, ...(saved.qrCode ?? {}) },
          });
        }
      })
      .catch((err) => console.error('Failed to load CV document:', err))
      .finally(() => {
        if (!cancelled) setCvLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [activeTab, cvDocId, cvData, resumeId]);

  // The CV's structured data lives on the master row when master IS the CV,
  // otherwise in the lazy-loaded cvData. Both editor + viewer pull from here.
  const activeCvData = cvDocId === resumeId ? resumeData : cvData;
  const activeCvTemplate =
    cvDocId === resumeId ? templateSettings : cvTemplateSettings;

  const handleEditCv = () => {
    if (!cvDocId || !activeCvData) return;
    setCvDraft(activeCvData);
    setCvTemplateDraft(activeCvTemplate);
    setIsEditingCv(true);
  };

  const handleCancelEditCv = () => {
    setIsEditingCv(false);
    setCvDraft(null);
  };

  const handleDraftCvQrChange = useCallback((qrCode: TemplateSettings['qrCode']) => {
    setCvTemplateDraft((prev) => ({ ...prev, qrCode }));
  }, []);

  const localizedCvDraft = useMemo(
    () => (cvDraft ? withLocalizedDefaultSections(cvDraft, t) : null),
    [cvDraft, t]
  );

  const handleSaveCv = async () => {
    if (!cvDocId || !cvDraft) return;
    setIsSavingCv(true);
    try {
      const [updated] = await Promise.all([
        updateResume(cvDocId, cvDraft),
        saveTemplateSettings(cvDocId, cvTemplateDraft),
      ]);
      const next = (updated.processed_resume || cvDraft) as ResumeData;
      // When the master IS the CV, the CV's data is also resumeData/templateSettings.
      if (cvDocId === resumeId) {
        setResumeData(next);
        setTemplateSettings(cvTemplateDraft);
      } else {
        setCvData(next);
        setCvTemplateSettings(cvTemplateDraft);
      }
      setIsEditingCv(false);
      setCvDraft(null);
    } catch (err) {
      console.error('Failed to save CV:', err);
    } finally {
      setIsSavingCv(false);
    }
  };

  const masterIdForGenerate = isMasterResume ? resumeId : null;

  const handleGenerate = async (target: 'resume' | 'cv') => {
    if (!masterIdForGenerate) return;
    setGenerateError(null);
    if (target === 'cv') setIsGeneratingCV(true);
    else setIsGeneratingResume(true);
    try {
      await generateCounterpart(masterIdForGenerate, target);
      // Refresh master to pick up the new resume_doc_id / cv_doc_id pointers,
      // then drop cached CV data so the lazy-load effect refetches it.
      setCvData(null);
      const data = await fetchResume(resumeId);
      setResumeDocId(data.resume_doc_id ?? null);
      setCvDocId(data.cv_doc_id ?? null);
      // If the master itself was the empty slot, its processed_resume just
      // changed — refresh it too.
      if (data.processed_resume) {
        setResumeData(data.processed_resume as ResumeData);
      }
    } catch (err) {
      console.error(`Failed to generate ${target}:`, err);
      setGenerateError(
        err instanceof Error ? err.message : t('resumeViewer.generateFailed', { target })
      );
    } finally {
      if (target === 'cv') setIsGeneratingCV(false);
      else setIsGeneratingResume(false);
    }
  };

  const handleEnrichmentComplete = () => {
    setShowEnrichmentModal(false);
    reloadResumeData();
  };

  const buildQrSettings = () =>
    templateSettings.qrCode.enabled && templateSettings.qrCode.url
      ? {
          url: templateSettings.qrCode.url,
          sizeMm: templateSettings.qrCode.sizeMm,
          xMm: templateSettings.qrCode.xMm,
          yMm: templateSettings.qrCode.yMm,
        }
      : undefined;

  const handleDownloadCv = async (cvId: string) => {
    setIsDownloading(true);
    try {
      const qrSettings = buildQrSettings();
      const blob = await downloadResumePdf(cvId, templateSettings, uiLanguage, qrSettings);
      const dataForName = cvId === resumeId ? resumeData : cvData;
      const filename = sanitizeFilename(dataForName?.personalInfo?.name, cvId, 'cv');
      downloadBlobAsFile(blob, filename);
      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, '_blank');
      setShowDownloadSuccessDialog(true);
    } catch (err) {
      console.error('Failed to download CV:', err);
    } finally {
      setIsDownloading(false);
    }
  };

  const handleDownload = async () => {
    setIsDownloading(true);
    try {
      const qrSettings = buildQrSettings();
      const blob = await downloadResumePdf(resumeId, templateSettings, uiLanguage, qrSettings);
      const filename = sanitizeFilename(resumeData?.personalInfo?.name, resumeId, 'resume');

      downloadBlobAsFile(blob, filename);

      const pdfBlob = new Blob([blob], { type: 'application/pdf' });
      const pdfUrl = URL.createObjectURL(pdfBlob);
      window.open(pdfUrl, '_blank');

      setShowDownloadSuccessDialog(true);
    } catch (err) {
      console.error('Failed to download resume:', err);
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        const fallbackUrl = getResumePdfUrl(
          resumeId,
          templateSettings,
          uiLanguage,
          buildQrSettings()
        );

        const didOpen = openUrlInNewTab(fallbackUrl);
        if (!didOpen) {
          alert(t('common.popupBlocked', { url: fallbackUrl }));
        }
        return;
      }
    } finally {
      setIsDownloading(false);
    }
  };

  // ---- Cover letter handlers ----

  const doGenerateCoverLetter = async () => {
    setShowRegenerateCoverDialog(false);
    setIsGeneratingCoverLetter(true);
    try {
      const content = await generateCoverLetter(resumeId);
      setCoverLetter(content);
      setCoverLetterDraft(content);
    } catch (err) {
      console.error('Failed to generate cover letter:', err);
    } finally {
      setIsGeneratingCoverLetter(false);
    }
  };

  const handleGenerateCoverLetter = () => {
    if (coverLetter) {
      setShowRegenerateCoverDialog(true);
      return;
    }
    doGenerateCoverLetter();
  };

  const handleStartEditCoverLetter = () => {
    setCoverLetterDraft(coverLetter ?? '');
    setIsEditingCoverLetter(true);
  };

  const handleSaveCoverLetter = async () => {
    setIsSavingCoverLetter(true);
    try {
      await updateCoverLetter(resumeId, coverLetterDraft);
      setCoverLetter(coverLetterDraft);
      setIsEditingCoverLetter(false);
    } catch (err) {
      console.error('Failed to save cover letter:', err);
    } finally {
      setIsSavingCoverLetter(false);
    }
  };

  const handleDownloadCoverLetter = async () => {
    if (!coverLetter) return;
    setIsDownloading(true);
    try {
      const blob = await downloadCoverLetterPdf(resumeId, templateSettings.pageSize, uiLanguage);
      const filename = sanitizeFilename(resumeData?.personalInfo?.name, resumeId, 'cover-letter');
      downloadBlobAsFile(blob, filename);
    } catch (err) {
      console.error('Failed to download cover letter:', err);
      if (err instanceof TypeError && err.message.includes('Failed to fetch')) {
        const fallbackUrl = getCoverLetterPdfUrl(resumeId, templateSettings.pageSize, uiLanguage);
        openUrlInNewTab(fallbackUrl);
      }
    } finally {
      setIsDownloading(false);
    }
  };

  // ---- Outreach handlers ----

  const doGenerateOutreach = async () => {
    setShowRegenerateOutreachDialog(false);
    setIsGeneratingOutreach(true);
    try {
      const content = await generateOutreachMessage(resumeId);
      setOutreachMessage(content);
      setOutreachDraft(content);
    } catch (err) {
      console.error('Failed to generate outreach message:', err);
    } finally {
      setIsGeneratingOutreach(false);
    }
  };

  const handleGenerateOutreach = () => {
    if (outreachMessage) {
      setShowRegenerateOutreachDialog(true);
      return;
    }
    doGenerateOutreach();
  };

  const handleStartEditOutreach = () => {
    setOutreachDraft(outreachMessage ?? '');
    setIsEditingOutreach(true);
  };

  const handleSaveOutreach = async () => {
    setIsSavingOutreach(true);
    try {
      await updateOutreachMessage(resumeId, outreachDraft);
      setOutreachMessage(outreachDraft);
      setIsEditingOutreach(false);
    } catch (err) {
      console.error('Failed to save outreach message:', err);
    } finally {
      setIsSavingOutreach(false);
    }
  };

  const handleCopyOutreach = async () => {
    if (!outreachMessage) return;
    try {
      await navigator.clipboard.writeText(outreachMessage);
      setOutreachCopied(true);
      setTimeout(() => setOutreachCopied(false), 1200);
    } catch (err) {
      console.error('Failed to copy outreach message:', err);
    }
  };

  const handleDownloadOutreach = () => {
    if (!outreachMessage) return;
    const blob = new Blob([outreachMessage], { type: 'text/plain;charset=utf-8' });
    const base = sanitizeFilename(resumeData?.personalInfo?.name, resumeId).replace(/\.pdf$/i, '');
    downloadBlobAsFile(blob, `${base}-outreach.txt`);
  };

  // ---- Analysis panel ----

  const toggleAnalysisPanel = (mode: AnalysisMode) => {
    setAnalysisPanel((prev) => (prev === mode ? null : mode));
  };

  const toggleAtsView = () => {
    setAtsView((prev) => {
      const next = !prev;
      if (next) setAtsEverOpened(true);
      return next;
    });
  };

  // ---- Delete ----

  const handleDeleteResume = async () => {
    try {
      setDeleteError(null);
      await deleteResume(resumeId);
      decrementResumes();
      if (isMasterResume) {
        localStorage.removeItem('master_resume_id');
        setHasMasterResume(false);
      }
      setShowDeleteDialog(false);
      setShowDeleteSuccessDialog(true);
    } catch (err) {
      console.error('Failed to delete resume:', err);
      setDeleteError(t('resumeViewer.errors.failedToDelete'));
      setShowDeleteDialog(false);
    }
  };

  const handleDeleteSuccessConfirm = () => {
    setShowDeleteSuccessDialog(false);
    router.push('/dashboard');
  };

  const handleDownloadSuccessConfirm = () => {
    setShowDownloadSuccessDialog(false);
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background">
        <Loader2 className="w-10 h-10 animate-spin text-primary mb-4" />
        <p className="font-mono text-sm font-bold uppercase text-primary">
          {t('resumeViewer.loading')}
        </p>
      </div>
    );
  }

  if (error || !resumeData) {
    const isProcessing = processingStatus === 'processing';
    const isFailed = processingStatus === 'failed';

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-background p-4">
        <div
          className={`border p-6 text-center max-w-md shadow-sw-default ${
            isProcessing
              ? 'bg-blue-50 border-blue-200'
              : isFailed
                ? 'bg-orange-50 border-orange-200'
                : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex justify-center mb-4">
            {isProcessing ? (
              <Loader2 className="w-8 h-8 animate-spin text-primary" />
            ) : isFailed ? (
              <AlertCircle className="w-8 h-8 text-orange-600" />
            ) : (
              <AlertCircle className="w-8 h-8 text-red-600" />
            )}
          </div>
          <p
            className={`font-bold mb-4 ${
              isProcessing ? 'text-primary' : isFailed ? 'text-orange-700' : 'text-red-700'
            }`}
          >
            {error || t('resumeViewer.resumeNotFound')}
          </p>
          <div className="flex flex-col gap-2">
            {isFailed && (
              <>
                <Button onClick={handleRetryProcessing} disabled={isRetrying}>
                  {isRetrying ? (
                    <>
                      <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                      {t('common.processing')}
                    </>
                  ) : (
                    t('resumeViewer.retryProcessing')
                  )}
                </Button>
                <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                  {t('resumeViewer.deleteAndStartOver')}
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              {t('resumeViewer.returnToDashboard')}
            </Button>
          </div>
        </div>
      </div>
    );
  }

  const candidateName =
    resumeData.personalInfo?.name?.trim() || t('resume.defaults.name') || 'Resume';

  const tabs: SegmentedTab[] = [
    { id: 'resume', label: t('resumeViewer.tabs.resume') },
    { id: 'cv', label: t('resumeViewer.tabs.cv') },
    { id: 'coverLetter', label: t('resumeViewer.tabs.coverLetter') },
    { id: 'outreach', label: t('resumeViewer.tabs.outreach') },
  ];

  const tabLabel = tabs.find((tab) => tab.id === activeTab)?.label ?? '';
  const showTools = activeTab === 'resume' || activeTab === 'cv' || activeTab === 'coverLetter';

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Page header: breadcrumb + title + segmented tabs */}
      <header className="flex flex-col gap-[18px] px-7 py-[18px] border-b border-border bg-background no-print md:flex-row md:items-center md:gap-[18px]">
        <div className="flex flex-col gap-1 min-w-0">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => router.push('/dashboard')}
              className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft hover:text-foreground hover:underline bg-transparent border-none p-0 cursor-pointer inline-flex items-center gap-1"
            >
              <ChevronLeft className="w-3 h-3" aria-hidden="true" />
              {t('resumeViewer.meta.dashboard')}
            </button>
            {resumeTitle && (
              <>
                <span className="font-mono text-xs text-ink-soft" aria-hidden="true">
                  /
                </span>
                <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-foreground truncate">
                  {resumeTitle}
                </span>
              </>
            )}
          </div>

          {!isMasterResume ? (
            isEditingTitle ? (
              <input
                type="text"
                value={editingTitleValue}
                onChange={(e) => setEditingTitleValue(e.target.value)}
                onBlur={handleTitleSave}
                onKeyDown={handleTitleKeyDown}
                autoFocus
                maxLength={80}
                placeholder={t('resumeViewer.titlePlaceholder')}
                className="font-sans text-[22px] font-semibold tracking-[-0.01em] border-b border-border bg-transparent outline-none w-full max-w-xl px-0 py-0"
              />
            ) : (
              <button
                type="button"
                onClick={() => {
                  setEditingTitleValue(resumeTitle || candidateName);
                  setIsEditingTitle(true);
                }}
                className="group flex items-center gap-2 bg-transparent border-none p-0 cursor-pointer text-left"
                aria-label="Edit resume title"
              >
                <h1 className="font-sans text-[22px] font-semibold tracking-[-0.01em] m-0">
                  {candidateName}
                </h1>
                <Pencil className="w-4 h-4 opacity-0 group-hover:opacity-60 transition-opacity" />
              </button>
            )
          ) : (
            <h1 className="font-sans text-[22px] font-semibold tracking-[-0.01em] m-0">
              {candidateName}
            </h1>
          )}
        </div>

        <div className="md:ml-auto">
          <SegmentedTabs
            tabs={tabs}
            activeTab={activeTab}
            onTabChange={(id) => setActiveTab(id as TabId)}
            ariaLabel={t('resumeViewer.tabs.ariaLabel')}
          />
        </div>
      </header>

      {/* Sub-toolbar: VIEWING · {tab} + per-tab actions */}
      <div className="flex flex-wrap justify-between items-center gap-3 px-7 py-3 border-b border-border bg-background no-print">
        <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft">
          {t('resumeViewer.meta.viewing')} · {tabLabel}
        </div>
        <div className="flex flex-wrap gap-2 items-center">
          {activeTab === 'resume' && !isEditingResume && (
            <>
              {isMasterResume && !resumeDocId && (
                <Button
                  size="sm"
                  onClick={() => handleGenerate('resume')}
                  disabled={isGeneratingResume || !cvDocId}
                  title={
                    !cvDocId
                      ? t('resumeViewer.generateNeedsCV')
                      : t('resumeViewer.actions.generateResume')
                  }
                >
                  {isGeneratingResume ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {t('common.generating')}
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-3.5 h-3.5" />
                      {t('resumeViewer.actions.generateResume')}
                    </>
                  )}
                </Button>
              )}
              {isMasterResume && resumeDocId && (
                <Button size="sm" onClick={() => setShowEnrichmentModal(true)}>
                  <Wand2 className="w-3.5 h-3.5" />
                  {t('resumeViewer.actions.enhance')}
                </Button>
              )}
              <Button size="sm" variant="outline" onClick={handleEdit}>
                <Pencil className="w-3.5 h-3.5" />
                {t('resumeViewer.actions.editResume')}
              </Button>
              <Button size="sm" variant="outline" onClick={handleDownload} disabled={isDownloading}>
                {isDownloading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t('common.generating')}
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    {t('resumeViewer.actions.download')}
                  </>
                )}
              </Button>
            </>
          )}
          {activeTab === 'resume' && isEditingResume && (
            <>
              <Button size="sm" variant="outline" onClick={handleCancelEditResume}>
                <XIcon className="w-3.5 h-3.5" />
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={handleSaveResume} disabled={isSavingResume}>
                {isSavingResume ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    {t('common.save')}
                  </>
                )}
              </Button>
            </>
          )}
          {activeTab === 'cv' && !isEditingCv && (
            <>
              {isMasterResume && !cvDocId && (
                <Button
                  size="sm"
                  onClick={() => handleGenerate('cv')}
                  disabled={isGeneratingCV || !resumeDocId}
                  title={
                    !resumeDocId
                      ? t('resumeViewer.generateNeedsResume')
                      : t('resumeViewer.actions.generateCV')
                  }
                >
                  {isGeneratingCV ? (
                    <>
                      <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      {t('common.generating')}
                    </>
                  ) : (
                    <>
                      <Wand2 className="w-3.5 h-3.5" />
                      {t('resumeViewer.actions.generateCV')}
                    </>
                  )}
                </Button>
              )}
              {cvDocId && (
                <Button size="sm" disabled>
                  <Wand2 className="w-3.5 h-3.5" />
                  {t('resumeViewer.actions.enhanceCV')}
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                disabled={!cvDocId || !activeCvData}
                onClick={handleEditCv}
              >
                <Pencil className="w-3.5 h-3.5" />
                {t('resumeViewer.actions.editCV')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={!cvDocId || isDownloading}
                onClick={() => cvDocId && handleDownloadCv(cvDocId)}
              >
                {isDownloading ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t('common.generating')}
                  </>
                ) : (
                  <>
                    <Download className="w-3.5 h-3.5" />
                    {t('resumeViewer.actions.download')}
                  </>
                )}
              </Button>
            </>
          )}
          {activeTab === 'cv' && isEditingCv && (
            <>
              <Button size="sm" variant="outline" onClick={handleCancelEditCv}>
                <XIcon className="w-3.5 h-3.5" />
                {t('common.cancel')}
              </Button>
              <Button size="sm" onClick={handleSaveCv} disabled={isSavingCv}>
                {isSavingCv ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t('common.saving')}
                  </>
                ) : (
                  <>
                    <Save className="w-3.5 h-3.5" />
                    {t('common.save')}
                  </>
                )}
              </Button>
            </>
          )}
          {activeTab === 'coverLetter' && (
            <>
              <Button
                size="sm"
                onClick={handleGenerateCoverLetter}
                disabled={isGeneratingCoverLetter}
              >
                {isGeneratingCoverLetter ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t('common.generating')}
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    {coverLetter
                      ? t('resumeViewer.actions.regenerate')
                      : t('resumeViewer.actions.generate')}
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleStartEditCoverLetter}
                disabled={!coverLetter}
              >
                <Pencil className="w-3.5 h-3.5" />
                {t('resumeViewer.actions.editLetter')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadCoverLetter}
                disabled={!coverLetter || isDownloading}
              >
                {isDownloading ? (
                  <Loader2 className="w-3.5 h-3.5 animate-spin" />
                ) : (
                  <Download className="w-3.5 h-3.5" />
                )}
                {t('resumeViewer.actions.download')}
              </Button>
            </>
          )}
          {activeTab === 'outreach' && (
            <>
              <Button size="sm" onClick={handleGenerateOutreach} disabled={isGeneratingOutreach}>
                {isGeneratingOutreach ? (
                  <>
                    <Loader2 className="w-3.5 h-3.5 animate-spin" />
                    {t('common.generating')}
                  </>
                ) : (
                  <>
                    <Wand2 className="w-3.5 h-3.5" />
                    {outreachMessage
                      ? t('resumeViewer.actions.regenerate')
                      : t('resumeViewer.actions.generate')}
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleStartEditOutreach}
                disabled={!outreachMessage}
              >
                <Pencil className="w-3.5 h-3.5" />
                {t('resumeViewer.actions.editMessage')}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleCopyOutreach}
                disabled={!outreachMessage}
              >
                {outreachCopied ? (
                  <>
                    <Check className="w-3.5 h-3.5" />
                    {t('resumeViewer.actions.copied')}
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" />
                    {t('resumeViewer.actions.copy')}
                  </>
                )}
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={handleDownloadOutreach}
                disabled={!outreachMessage}
              >
                <Download className="w-3.5 h-3.5" />
                {t('resumeViewer.actions.download')}
              </Button>
            </>
          )}

          {showTools && (
            <>
              <span aria-hidden="true" className="inline-block w-px h-5 bg-border/40 mx-1" />
              <ToolButton
                active={analysisPanel === 'jdmatch'}
                onClick={() => toggleAnalysisPanel('jdmatch')}
                icon={<Target className="w-3.5 h-3.5" />}
                label={t('resumeViewer.tools.jdMatch')}
              />
              <ToolButton
                active={atsView}
                onClick={toggleAtsView}
                icon={<BarChart3 className="w-3.5 h-3.5" />}
                label={t('resumeViewer.tools.ats')}
              />
            </>
          )}
        </div>
      </div>

      {/* Inline ATS view (stays mounted once opened so the result survives toggles) */}
      {atsEverOpened && (
        <div className={atsView ? 'flex-1 min-h-0 overflow-y-auto px-4 md:px-8 py-8' : 'hidden'}>
          <div className="max-w-7xl mx-auto">
            <AtsInlineView resumeId={resumeId} resumeTitle={resumeTitle} />
          </div>
        </div>
      )}

      {/* Body — hidden when ATS view is active */}
      {!atsView &&
        (activeTab === 'resume' && isEditingResume && resumeDraft ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 bg-border gap-[1px] no-print">
            {/* Left: editor */}
            <div className="bg-background overflow-y-auto p-6 md:p-8">
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex items-center gap-2 border-b-2 border-border pb-2">
                  <div className="w-3 h-3 bg-primary" />
                  <h2 className="font-mono text-lg font-bold uppercase tracking-wider m-0">
                    {t('builder.leftPanel.editorPanel')}
                  </h2>
                </div>
                <FormattingControls settings={templateDraft} onChange={setTemplateDraft} />
                <ResumeForm resumeData={resumeDraft} onUpdate={setResumeDraft} />
              </div>
            </div>
            {/* Right: live preview with drag-and-drop QR */}
            <div className="bg-secondary overflow-hidden flex flex-col">
              <div className="flex-1 overflow-y-auto">
                <PaginatedPreview
                  resumeData={localizedResumeDraft || resumeDraft}
                  settings={templateDraft}
                  onQrCodeChange={handleDraftQrChange}
                />
              </div>
            </div>
          </div>
        ) : activeTab === 'cv' && isEditingCv && cvDraft ? (
          <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-2 bg-border gap-[1px] no-print">
            {/* Left: CV editor (separate from the resume editor) */}
            <div className="bg-background overflow-y-auto p-6 md:p-8">
              <div className="max-w-3xl mx-auto space-y-6">
                <div className="flex items-center gap-2 border-b-2 border-border pb-2">
                  <div className="w-3 h-3 bg-primary" />
                  <h2 className="font-mono text-lg font-bold uppercase tracking-wider m-0">
                    {t('builder.leftPanel.editorPanel')} · {t('resumeViewer.tabs.cv')}
                  </h2>
                </div>
                <FormattingControls settings={cvTemplateDraft} onChange={setCvTemplateDraft} />
                <ResumeForm resumeData={cvDraft} onUpdate={setCvDraft} />
              </div>
            </div>
            {/* Right: CV live preview */}
            <div className="bg-secondary overflow-hidden flex flex-col">
              <div className="flex-1 overflow-y-auto">
                <PaginatedPreview
                  resumeData={localizedCvDraft || cvDraft}
                  settings={cvTemplateDraft}
                  onQrCodeChange={handleDraftCvQrChange}
                />
              </div>
            </div>
          </div>
        ) : (
          <div className="flex-1 min-h-0 overflow-y-auto px-4 md:px-8 py-8">
            <div className="max-w-7xl mx-auto">
              {activeTab === 'resume' && isMasterResume && !resumeDocId && (
                <div className="flex flex-col items-center gap-4 py-12">
                  <EmptyState
                    headline={t('resumeViewer.empty.resumeHeadline')}
                    body={t('resumeViewer.empty.resumeBody')}
                    bare
                  />
                  <Button
                    onClick={() => handleGenerate('resume')}
                    disabled={isGeneratingResume || !cvDocId}
                    title={
                      !cvDocId
                        ? t('resumeViewer.generateNeedsCV')
                        : t('resumeViewer.actions.generateResume')
                    }
                  >
                    {isGeneratingResume ? (
                      <>
                        <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                        {t('common.generating')}
                      </>
                    ) : (
                      <>
                        <Wand2 className="w-4 h-4 mr-2" />
                        {t('resumeViewer.actions.generateResume')}
                      </>
                    )}
                  </Button>
                  {generateError && (
                    <p className="font-mono text-xs text-red-600">{generateError}</p>
                  )}
                </div>
              )}
              {activeTab === 'resume' && (!isMasterResume || resumeDocId) && (
                <div className="flex justify-center pb-4">
                  <div
                    className="resume-print w-full max-w-[250mm] shadow-sw-lg border-2 border-black bg-white"
                    style={{ position: 'relative' }}
                  >
                    {savedQrCode ? (
                      <div
                        style={{
                          position: 'absolute',
                          top: `${savedQrCode.yMm}mm`,
                          left: `${savedQrCode.xMm}mm`,
                          width: `${savedQrCode.sizeMm}mm`,
                          height: `${savedQrCode.sizeMm}mm`,
                          zIndex: 10,
                        }}
                      >
                        <QRCodeSVG
                          value={savedQrCode.url}
                          level="M"
                          includeMargin={false}
                          style={{ width: '100%', height: '100%', display: 'block' }}
                        />
                      </div>
                    ) : null}
                    <Resume
                      resumeData={localizedResumeData || resumeData}
                      additionalSectionLabels={{
                        technicalSkills: t('resume.additionalLabels.technicalSkills'),
                        languages: t('resume.additionalLabels.languages'),
                        certifications: t('resume.additionalLabels.certifications'),
                        awards: t('resume.additionalLabels.awards'),
                      }}
                      sectionHeadings={{
                        summary: t('resume.sections.summary'),
                        experience: t('resume.sections.experience'),
                        education: t('resume.sections.education'),
                        projects: t('resume.sections.projects'),
                        certifications: t('resume.sections.certifications'),
                        skills: t('resume.sections.skillsOnly'),
                        languages: t('resume.sections.languages'),
                        awards: t('resume.sections.awards'),
                        links: t('resume.sections.links'),
                      }}
                      fallbackLabels={{ name: t('resume.defaults.name') }}
                    />
                  </div>
                </div>
              )}

              {activeTab === 'cv' &&
                (() => {
                  // CV content lives either on the master row (when the master
                  // IS the CV) or on a child row that we lazy-load into cvData.
                  const cvContent = cvDocId === resumeId ? resumeData : cvDocId ? cvData : null;
                  if (cvContent) {
                    return (
                      <div className="flex justify-center pb-4">
                        <div className="resume-print w-full max-w-[250mm] shadow-sw-lg border-2 border-black bg-white">
                          <Resume
                            resumeData={cvContent}
                            additionalSectionLabels={{
                              technicalSkills: t('resume.additionalLabels.technicalSkills'),
                              languages: t('resume.additionalLabels.languages'),
                              certifications: t('resume.additionalLabels.certifications'),
                              awards: t('resume.additionalLabels.awards'),
                            }}
                            sectionHeadings={{
                              summary: t('resume.sections.summary'),
                              experience: t('resume.sections.experience'),
                              education: t('resume.sections.education'),
                              projects: t('resume.sections.projects'),
                              certifications: t('resume.sections.certifications'),
                              skills: t('resume.sections.skillsOnly'),
                              languages: t('resume.sections.languages'),
                              awards: t('resume.sections.awards'),
                              links: t('resume.sections.links'),
                            }}
                            fallbackLabels={{ name: t('resume.defaults.name') }}
                          />
                        </div>
                      </div>
                    );
                  }
                  if (cvLoading) {
                    return (
                      <div className="flex flex-col items-center py-16 gap-3">
                        <Loader2 className="w-8 h-8 animate-spin text-primary" />
                        <p className="font-mono text-xs uppercase tracking-[0.18em] text-ink-soft">
                          {t('common.loading')}
                        </p>
                      </div>
                    );
                  }
                  return (
                    <div className="flex flex-col items-center gap-4 py-12">
                      <EmptyState
                        headline={t('resumeViewer.empty.cvHeadline')}
                        body={t('resumeViewer.empty.cvBody')}
                        bare
                      />
                      {isMasterResume && (
                        <Button
                          onClick={() => handleGenerate('cv')}
                          disabled={isGeneratingCV || !resumeDocId}
                          title={
                            !resumeDocId
                              ? t('resumeViewer.generateNeedsResume')
                              : t('resumeViewer.actions.generateCV')
                          }
                        >
                          {isGeneratingCV ? (
                            <>
                              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                              {t('common.generating')}
                            </>
                          ) : (
                            <>
                              <Wand2 className="w-4 h-4 mr-2" />
                              {t('resumeViewer.actions.generateCV')}
                            </>
                          )}
                        </Button>
                      )}
                      {generateError && (
                        <p className="font-mono text-xs text-red-600">{generateError}</p>
                      )}
                    </div>
                  );
                })()}

              {activeTab === 'coverLetter' && (
                <div className="flex justify-center pb-4">
                  <div className="w-full max-w-[210mm] border border-black bg-white shadow-sw-default">
                    {isEditingCoverLetter ? (
                      <CoverLetterEditor
                        content={coverLetterDraft}
                        onChange={setCoverLetterDraft}
                        onSave={handleSaveCoverLetter}
                        isSaving={isSavingCoverLetter}
                      />
                    ) : (
                      <div className="p-[28px_32px]">
                        {coverLetter ? (
                          <>
                            <h2 className="font-sans text-[22px] font-semibold tracking-[-0.01em] m-0">
                              {t('resumeViewer.tabs.coverLetter')}
                              {resumeTitle ? ` · ${resumeTitle}` : ''}
                            </h2>
                            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft mt-1 mb-6">
                              {'// SHAPE YOUR COVER LETTER'}
                            </div>
                            <pre className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap break-words m-0">
                              {coverLetter}
                            </pre>
                          </>
                        ) : (
                          <EmptyState
                            headline={t('resumeViewer.empty.coverHeadline')}
                            body={t('resumeViewer.empty.coverBody')}
                            bare
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'outreach' && (
                <div className="flex justify-center pb-4">
                  <div className="w-full max-w-[210mm] border border-black bg-white shadow-sw-default">
                    {isEditingOutreach ? (
                      <OutreachEditor
                        content={outreachDraft}
                        onChange={setOutreachDraft}
                        onSave={handleSaveOutreach}
                        isSaving={isSavingOutreach}
                      />
                    ) : (
                      <div className="p-[28px_32px]">
                        {outreachMessage ? (
                          <>
                            <h2 className="font-sans text-[22px] font-semibold tracking-[-0.01em] m-0">
                              {t('resumeViewer.tabs.outreach')}
                              {resumeTitle ? ` · ${resumeTitle}` : ''}
                            </h2>
                            <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft mt-1 mb-6">
                              {'// OUTREACH MESSAGE'}
                            </div>
                            <pre className="font-serif text-[15px] leading-relaxed whitespace-pre-wrap break-words m-0">
                              {outreachMessage}
                            </pre>
                          </>
                        ) : (
                          <EmptyState
                            headline={t('resumeViewer.empty.outreachHeadline')}
                            body={t('resumeViewer.empty.outreachBody')}
                            bare
                          />
                        )}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'resume' && !isEditingResume && (
                <div className="flex justify-end pt-4 no-print">
                  <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
                    {isMasterResume
                      ? t('confirmations.deleteMasterResumeTitle')
                      : t('dashboard.deleteResume')}
                  </Button>
                </div>
              )}
            </div>
          </div>
        ))}

      <AnalysisPanel
        open={analysisPanel !== null}
        mode={analysisPanel ?? 'jdmatch'}
        resumeId={resumeId}
        documentTab={activeTab}
        documentLabel={tabLabel}
        onClose={() => setAnalysisPanel(null)}
      />

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={
          isMasterResume ? t('confirmations.deleteMasterResumeTitle') : t('dashboard.deleteResume')
        }
        description={
          isMasterResume
            ? t('confirmations.deleteMasterResumeDescription')
            : t('confirmations.deleteResumeFromSystemDescription')
        }
        confirmLabel={t('confirmations.deleteResumeConfirmLabel')}
        cancelLabel={t('confirmations.keepResumeCancelLabel')}
        onConfirm={handleDeleteResume}
        variant="danger"
      />

      <ConfirmDialog
        open={showDeleteSuccessDialog}
        onOpenChange={setShowDeleteSuccessDialog}
        title={t('resumeViewer.deletedTitle')}
        description={
          isMasterResume
            ? t('resumeViewer.deletedDescriptionMaster')
            : t('resumeViewer.deletedDescriptionRegular')
        }
        confirmLabel={t('resumeViewer.returnToDashboard')}
        onConfirm={handleDeleteSuccessConfirm}
        variant="success"
        showCancelButton={false}
      />

      <ConfirmDialog
        open={showDownloadSuccessDialog}
        onOpenChange={setShowDownloadSuccessDialog}
        title={t('common.success')}
        description={t('builder.alerts.downloadSuccess')}
        confirmLabel={t('common.ok')}
        onConfirm={handleDownloadSuccessConfirm}
        variant="success"
        showCancelButton={false}
      />

      <ConfirmDialog
        open={showRegenerateCoverDialog}
        onOpenChange={(open) => !open && setShowRegenerateCoverDialog(false)}
        title={t('builder.regenerateDialog.title', { title: t('coverLetter.title') })}
        description={t('builder.regenerateDialog.description', { title: t('coverLetter.title') })}
        confirmLabel={t('coverLetter.regenerate')}
        cancelLabel={t('common.cancel')}
        onConfirm={doGenerateCoverLetter}
        variant="warning"
      />

      <ConfirmDialog
        open={showRegenerateOutreachDialog}
        onOpenChange={(open) => !open && setShowRegenerateOutreachDialog(false)}
        title={t('builder.regenerateDialog.title', { title: t('outreach.title') })}
        description={t('builder.regenerateDialog.description', { title: t('outreach.title') })}
        confirmLabel={t('outreach.regenerate')}
        cancelLabel={t('common.cancel')}
        onConfirm={doGenerateOutreach}
        variant="warning"
      />

      {deleteError && (
        <ConfirmDialog
          open={!!deleteError}
          onOpenChange={() => setDeleteError(null)}
          title={t('resumeViewer.deleteFailedTitle')}
          description={deleteError}
          confirmLabel={t('common.ok')}
          onConfirm={() => setDeleteError(null)}
          variant="danger"
          showCancelButton={false}
        />
      )}

      {isMasterResume && (
        <EnrichmentModal
          resumeId={resumeId}
          isOpen={showEnrichmentModal}
          onClose={() => setShowEnrichmentModal(false)}
          onComplete={handleEnrichmentComplete}
        />
      )}
    </div>
  );
}

interface EmptyStateProps {
  headline: string;
  body: string;
  bare?: boolean;
}

function EmptyState({ headline, body, bare = false }: EmptyStateProps) {
  const inner = (
    <>
      <div className="font-mono text-[12px] uppercase tracking-[0.18em] text-foreground mb-3">
        {headline}
      </div>
      <p className="font-sans text-sm text-ink-soft max-w-md m-0">{body}</p>
    </>
  );

  if (bare) {
    return <div className="py-8">{inner}</div>;
  }

  return (
    <div className="flex justify-center pb-4">
      <div className="w-full max-w-[210mm] border border-dashed border-orange-500 bg-white shadow-sw-default p-[28px_32px]">
        {inner}
      </div>
    </div>
  );
}

interface ToolButtonProps {
  active: boolean;
  onClick: () => void;
  icon: React.ReactNode;
  label: string;
}

function ToolButton({ active, onClick, icon, label }: ToolButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={
        'inline-flex items-center gap-[7px] font-mono text-[11px] uppercase tracking-[0.14em] ' +
        'px-[14px] py-[7px] border border-dashed rounded-none transition-colors duration-100 ease-out ' +
        'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 ' +
        (active
          ? 'border-border bg-foreground text-background'
          : 'border-border bg-transparent text-foreground hover:bg-paper-tint')
      }
    >
      {icon}
      {label}
    </button>
  );
}
