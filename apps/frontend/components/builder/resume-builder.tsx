'use client';

import React, { useState, useEffect, Suspense, useCallback, useMemo } from 'react';
import Image from 'next/image';
import { useSearchParams, useRouter } from 'next/navigation';
import { type ResumeData } from '@/components/dashboard/resume-component';
import { ResumeForm } from './resume-form';
import { FormattingControls } from './formatting-controls';
import { Button } from '@/components/ui/button';
import { ConfirmDialog, type ConfirmDialogProps } from '@/components/ui/confirm-dialog';
import { Download, Save, AlertTriangle, ArrowLeft, RotateCcw, Sparkles } from 'lucide-react';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import { PaginatedPreview } from '@/components/preview';
import {
  downloadResumePdf,
  getResumePdfUrl,
  fetchResume,
  updateResume,
  saveTemplateSettings,
} from '@/lib/api/resume';
import { RegenerateWizard } from './regenerate-wizard';
import { useRegenerateWizard } from '@/hooks/use-regenerate-wizard';
import { useTranslations } from '@/lib/i18n';
import { type TemplateSettings, DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';
import { withLocalizedDefaultSections } from '@/lib/utils/section-helpers';
import { useLanguage } from '@/lib/context/language-context';
import { buildResumeFilename, downloadBlobAsFile, openUrlInNewTab } from '@/lib/utils/download';
import type { RegenerateItemInput } from '@/lib/api/enrichment';

const STORAGE_KEY = 'resume_builder_draft';
const SETTINGS_STORAGE_KEY = 'resume_builder_settings';

type Translate = (key: string, params?: Record<string, string | number>) => string;

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
  const [isDownloading, setIsDownloading] = useState(false);
  const [, setLoadingState] = useState<'idle' | 'loading' | 'loaded' | 'error'>('idle');
  const [templateSettings, setTemplateSettings] =
    useState<TemplateSettings>(DEFAULT_TEMPLATE_SETTINGS);
  const { improvedData } = useResumePreview();
  const improvedPreview = improvedData?.data?.resume_preview;
  const searchParams = useSearchParams();
  const router = useRouter();
  const resumeId = searchParams.get('id');

  useEffect(() => {
    if (resumeId || hasUnsavedChanges || improvedPreview) {
      return;
    }
    const savedDraft = localStorage.getItem(STORAGE_KEY);
    if (savedDraft) {
      return;
    }
    setResumeData(initialData);
    setLastSavedData(initialData);
  }, [initialData, resumeId, hasUnsavedChanges, improvedPreview]);

  const [resumeTitle, setResumeTitle] = useState<string | null>(null);

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
        }
      } catch (error) {
        console.error('Failed to reload resume after applying regenerated changes:', error);
        showNotification(t('builder.alerts.reloadFailed'), 'danger');
        throw error;
      }
    },
    onError: (errorMessage) => {
      console.error('Error during regeneration or applying regenerated changes:', errorMessage);

      if (/network|fetch/i.test(errorMessage) || errorMessage.includes('Failed to fetch')) {
        showNotification(t('builder.regenerate.errors.networkError'), 'danger');
        return;
      }

      if (/resume content changed|uniquely matched|please regenerate/i.test(errorMessage)) {
        showNotification(t('builder.regenerate.errors.resumeChanged'), 'danger');
        return;
      }

      if (/generate/i.test(errorMessage)) {
        showNotification(t('builder.regenerate.errors.generationFailed'), 'danger');
        return;
      }

      showNotification(t('builder.regenerate.errors.applyFailed'), 'danger');
    },
  });

  // Build regenerate items from resume data
  const experienceItemsForRegenerate: RegenerateItemInput[] = useMemo(() => {
    return (resumeData.workExperience || []).map((exp, idx) => ({
      item_id: `exp_${idx}`,
      item_type: 'experience' as const,
      title: exp.title ?? '',
      subtitle: exp.company || undefined,
      current_content: Array.isArray(exp.description) ? exp.description : [],
    }));
  }, [resumeData.workExperience]);

  const projectItemsForRegenerate: RegenerateItemInput[] = useMemo(() => {
    return (resumeData.personalProjects || []).map((proj, idx) => ({
      item_id: `proj_${idx}`,
      item_type: 'project' as const,
      title: proj.name ?? '',
      subtitle: proj.role || undefined,
      current_content: Array.isArray(proj.description) ? proj.description : [],
    }));
  }, [resumeData.personalProjects]);

  const skillsItemForRegenerate: RegenerateItemInput | null = useMemo(() => {
    const skills = resumeData.additional?.technicalSkills;
    if (skills && skills.length > 0) {
      return {
        item_id: 'skills',
        item_type: 'skills' as const,
        title: t('builder.regenerate.selectDialog.skills'),
        current_content: skills,
      };
    }
    return null;
  }, [resumeData.additional?.technicalSkills, t]);

  const localizedResumeDataForPreview = useMemo(
    () => withLocalizedDefaultSections(resumeData, t),
    [resumeData, t]
  );

  // Load template settings from localStorage on mount
  useEffect(() => {
    const savedSettings = localStorage.getItem(SETTINGS_STORAGE_KEY);
    if (savedSettings) {
      try {
        const parsed = JSON.parse(savedSettings);
        setTemplateSettings({
          ...DEFAULT_TEMPLATE_SETTINGS,
          ...parsed,
          margins: { ...DEFAULT_TEMPLATE_SETTINGS.margins, ...parsed.margins },
          spacing: { ...DEFAULT_TEMPLATE_SETTINGS.spacing, ...parsed.spacing },
          fontSize: { ...DEFAULT_TEMPLATE_SETTINGS.fontSize, ...parsed.fontSize },
          textStyle: { ...DEFAULT_TEMPLATE_SETTINGS.textStyle, ...parsed.textStyle },
        });
      } catch {
        // Use defaults
      }
    }
  }, []);

  // Save template settings to localStorage when they change
  useEffect(() => {
    localStorage.setItem(SETTINGS_STORAGE_KEY, JSON.stringify(templateSettings));
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
    const loadResumeData = async () => {
      setLoadingState('loading');

      // Priority 1: Fetch from API if ID is in URL (most reliable)
      if (resumeId) {
        try {
          const data = await fetchResume(resumeId);
          // Store resume title for downloads
          setResumeTitle(data.title ?? null);
          // Load persisted template settings if available, otherwise keep localStorage
          if (data.template_settings) {
            const saved = data.template_settings as Partial<TemplateSettings>;
            setTemplateSettings({
              ...DEFAULT_TEMPLATE_SETTINGS,
              ...saved,
              margins: { ...DEFAULT_TEMPLATE_SETTINGS.margins, ...(saved.margins ?? {}) },
              spacing: { ...DEFAULT_TEMPLATE_SETTINGS.spacing, ...(saved.spacing ?? {}) },
              fontSize: { ...DEFAULT_TEMPLATE_SETTINGS.fontSize, ...(saved.fontSize ?? {}) },
              textStyle: { ...DEFAULT_TEMPLATE_SETTINGS.textStyle, ...(saved.textStyle ?? {}) },
            });
          }
          // Prefer processed_resume if available
          if (data.processed_resume) {
            setResumeData(data.processed_resume as ResumeData);
            setLastSavedData(data.processed_resume as ResumeData);
            setLoadingState('loaded');
            return;
          }
          // Fallback to parsing raw content
          if (data.raw_resume?.content) {
            try {
              const parsed = JSON.parse(data.raw_resume.content);
              setResumeData(parsed);
              setLastSavedData(parsed);
              setLoadingState('loaded');
              return;
            } catch {
              // Raw content is markdown, not JSON
            }
          }
        } catch (err) {
          console.error('Failed to load resume from API:', err);
        }
      }

      // Priority 2: Improved Data from Context (Tailor Flow)
      if (improvedPreview) {
        setResumeData(improvedPreview);
        setLastSavedData(improvedPreview);
        // Persist to localStorage as backup
        localStorage.setItem(STORAGE_KEY, JSON.stringify(improvedPreview));
        setLoadingState('loaded');
        return;
      }

      // Priority 3: Restore from localStorage (browser refresh recovery)
      const savedDraft = localStorage.getItem(STORAGE_KEY);
      if (savedDraft) {
        try {
          const parsed = JSON.parse(savedDraft);
          setResumeData(parsed);
          setLastSavedData(parsed);
          setHasUnsavedChanges(true); // Mark as unsaved since it's a draft
          setLoadingState('loaded');
          return;
        } catch {
          localStorage.removeItem(STORAGE_KEY);
        }
      }

      // Fallback: Use initial data
      setLoadingState('loaded');
    };

    loadResumeData();
  }, [improvedPreview, resumeId]);

  const handleUpdate = useCallback((newData: ResumeData) => {
    setResumeData(newData);
    setHasUnsavedChanges(true);
    // Auto-save draft to localStorage
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newData));
  }, []);

  const handleSettingsChange = useCallback((newSettings: TemplateSettings) => {
    setTemplateSettings(newSettings);
  }, []);

  const handleQrCodeChange = useCallback((qrCode: TemplateSettings['qrCode']) => {
    setTemplateSettings((prev) => ({ ...prev, qrCode }));
  }, []);

  const handleSave = async () => {
    if (!resumeId) {
      showNotification(t('builder.alerts.saveNotAvailable'), 'warning');
      return;
    }
    try {
      setIsSaving(true);
      const [updated] = await Promise.all([
        updateResume(resumeId, resumeData),
        saveTemplateSettings(resumeId, templateSettings),
      ]);
      const nextData = (updated.processed_resume || resumeData) as ResumeData;
      setResumeData(nextData);
      setLastSavedData(nextData);
      setHasUnsavedChanges(false);
      localStorage.setItem(STORAGE_KEY, JSON.stringify(nextData));
    } catch (error) {
      console.error('Failed to save resume:', error);
      showNotification(t('builder.alerts.saveFailed'), 'danger');
    } finally {
      setIsSaving(false);
    }
  };

  const handleReset = () => {
    setResumeData(lastSavedData);
    setHasUnsavedChanges(false);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lastSavedData));
  };

  const getCompanyFromTitle = (title: string | null | undefined): string | null => {
    if (!title) return null;
    const atIdx = title.lastIndexOf(' @ ');
    return atIdx !== -1 ? title.substring(atIdx + 3).trim() : null;
  };

  const handleDownload = async () => {
    if (!resumeId) {
      showNotification(t('builder.alerts.downloadNotAvailable'), 'warning');
      return;
    }
    try {
      setIsDownloading(true);
      const qrSettings =
        templateSettings.qrCode.enabled && templateSettings.qrCode.url
          ? {
              url: templateSettings.qrCode.url,
              sizeMm: templateSettings.qrCode.sizeMm,
              xMm: templateSettings.qrCode.xMm,
              yMm: templateSettings.qrCode.yMm,
            }
          : undefined;
      const blob = await downloadResumePdf(resumeId, templateSettings, uiLanguage, qrSettings);
      const company = getCompanyFromTitle(resumeTitle);
      const userName = resumeData.personalInfo?.name?.trim() || null;
      const filename = buildResumeFilename(userName, company, resumeId, 'resume');
      downloadBlobAsFile(blob, filename);
      showNotification(t('builder.alerts.downloadSuccess'), 'success');
    } catch (error) {
      console.error('Failed to download resume:', error);
      if (error instanceof TypeError && error.message.includes('Failed to fetch')) {
        const qrSettings =
          templateSettings.qrCode.enabled && templateSettings.qrCode.url
            ? {
                url: templateSettings.qrCode.url,
                sizeMm: templateSettings.qrCode.sizeMm,
                xMm: templateSettings.qrCode.xMm,
                yMm: templateSettings.qrCode.yMm,
              }
            : undefined;
        const fallbackUrl = getResumePdfUrl(resumeId, templateSettings, uiLanguage, qrSettings);
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

  return (
    <div className="h-screen w-full bg-background flex justify-center items-center p-4 md:p-8">
      {/* Main Container */}
      <div className="w-full h-full max-w-[90%] md:max-w-[95%] xl:max-w-[1800px] border border-black bg-background shadow-sw-lg flex flex-col">
        {/* Header Section */}
        <div className="border-b border-black p-6 md:p-8 bg-background no-print">
          {/* Top Row: Back button and Actions */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center mb-6">
            <div>
              <Button
                variant="link"
                onClick={() => router.push('/dashboard')}
                className="mb-2 -ml-1"
              >
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
                {hasUnsavedChanges && (
                  <span className="flex items-center gap-1 text-xs font-mono text-amber-600 bg-amber-50 px-2 py-1 border border-amber-200">
                    <AlertTriangle className="w-3 h-3" />
                    {t('builder.unsavedDraft')}
                  </span>
                )}
              </div>
            </div>

            <div className="flex gap-3 mt-4 md:mt-0">
              <Button
                variant="outline"
                size="sm"
                onClick={() => regenerateWizard.startRegenerate()}
                disabled={!resumeId}
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
              <Button size="sm" onClick={handleSave} disabled={!resumeId || isSaving}>
                <Save className="w-4 h-4" />
                {isSaving ? t('common.saving') : t('common.save')}
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
                  {t('builder.leftPanel.editorPanel')}
                </h2>
              </div>

              <FormattingControls settings={templateSettings} onChange={handleSettingsChange} />
              <ResumeForm resumeData={resumeData} onUpdate={handleUpdate} />
            </div>
          </div>

          {/* Right Panel: Resume Preview */}
          <div className="bg-secondary overflow-hidden flex flex-col no-print">
            <div className="flex-1 overflow-y-auto">
              <PaginatedPreview
                resumeData={localizedResumeDataForPreview}
                settings={templateSettings}
                onQrCodeChange={handleQrCodeChange}
              />
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
                templateSettings.template === 'modern'
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
