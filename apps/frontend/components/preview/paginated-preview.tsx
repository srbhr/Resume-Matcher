'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  MagnifyingGlassPlus,
  MagnifyingGlassMinus,
  Eye,
  EyeSlash,
  FileText,
} from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import Resume, { type ResumeData } from '@/components/dashboard/resume-component';
import { type TemplateSettings } from '@/lib/types/template-settings';
import { PageContainer } from './page-container';
import { usePagination } from './use-pagination';
import { PAGE_DIMENSIONS, mmToPx, getContentAreaPx } from '@/lib/constants/page-dimensions';
import { useTranslations } from '@/lib/i18n';
import { useLanguage } from '@/lib/context/language-context';

interface PaginatedPreviewProps {
  resumeData: ResumeData;
  settings: TemplateSettings;
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
// Opening zoom, and the ceiling for fit-to-width: a panel with room for at least 85% of the page opens here.
const DEFAULT_ZOOM = 0.85;
const ZOOM_STEP = 0.1;

/**
 * PaginatedPreview shows a WYSIWYG preview of the resume with actual page dimensions,
 * margin guides, and automatic pagination.
 */
export function PaginatedPreview({ resumeData, settings }: PaginatedPreviewProps) {
  const { t } = useTranslations();
  // Orders the CJK font fallback so the preview matches the generated PDF.
  const { contentLanguage } = useLanguage();
  const measurementRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(DEFAULT_ZOOM);
  const [showMargins, setShowMargins] = useState(false);
  const [autoZoom, setAutoZoom] = useState(true);
  const resumeSettings: TemplateSettings = {
    ...settings,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  };

  const additionalSectionLabels = React.useMemo(
    () => ({
      technicalSkills: t('resume.additionalLabels.technicalSkills'),
      languages: t('resume.additionalLabels.languages'),
      certifications: t('resume.additionalLabels.certifications'),
      awards: t('resume.additionalLabels.awards'),
    }),
    [t]
  );
  const sectionHeadings = React.useMemo(
    () => ({
      summary: t('resume.sections.summary'),
      experience: t('resume.sections.experience'),
      education: t('resume.sections.education'),
      projects: t('resume.sections.projects'),
      certifications: t('resume.sections.certifications'),
      skills: t('resume.sections.skillsOnly'),
      languages: t('resume.sections.languages'),
      awards: t('resume.sections.awards'),
      links: t('resume.sections.links'),
    }),
    [t]
  );
  const fallbackLabels = React.useMemo(
    () => ({
      name: t('resume.defaults.name'),
    }),
    [t]
  );

  const { pages, isCalculating } = usePagination({
    pageSize: settings.pageSize,
    margins: settings.margins,
    measurementRef,
  });

  // Calculate auto-zoom to fit container width
  const calculateAutoZoom = useCallback(() => {
    if (!containerRef.current || !autoZoom) return;

    const containerWidth = containerRef.current.clientWidth - 48; // Padding
    const pageWidthPx = mmToPx(PAGE_DIMENSIONS[settings.pageSize].width);
    const optimalZoom = Math.min(containerWidth / pageWidthPx, MAX_ZOOM);
    // Fit to the panel, but never open larger than the default zoom.
    setZoom(Math.max(MIN_ZOOM, Math.min(optimalZoom, DEFAULT_ZOOM)));
  }, [settings.pageSize, autoZoom]);

  // Auto-zoom on mount and when page size changes
  useEffect(() => {
    calculateAutoZoom();
    // Add resize listener
    const handleResize = () => calculateAutoZoom();
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, [calculateAutoZoom]);

  const handleZoomIn = () => {
    setAutoZoom(false);
    setZoom((z) => Math.min(z + ZOOM_STEP, MAX_ZOOM));
  };

  const handleZoomOut = () => {
    setAutoZoom(false);
    setZoom((z) => Math.max(z - ZOOM_STEP, MIN_ZOOM));
  };

  const toggleMargins = () => setShowMargins((s) => !s);

  // Get content area dimensions for the hidden measurement container
  const contentArea = getContentAreaPx(settings.pageSize, settings.margins);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Controls bar */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-steel bg-panel shrink-0">
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="hover:bg-panel-hover"
            aria-label={t('preview.zoomOut')}
            title={t('preview.zoomOut')}
          >
            <MagnifyingGlassMinus aria-hidden="true" />
          </Button>
          <span className="font-mono text-xs w-12 text-center text-ink-soft tabular-nums">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon-sm"
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="hover:bg-panel-hover"
            aria-label={t('preview.zoomIn')}
            title={t('preview.zoomIn')}
          >
            <MagnifyingGlassPlus aria-hidden="true" />
          </Button>

          <div aria-hidden="true" className="w-px h-4 bg-steel mx-2" />

          {/* Margin toggle */}
          <Button
            variant={showMargins ? 'secondary' : 'ghost'}
            size="sm"
            onClick={toggleMargins}
            aria-pressed={showMargins}
            className="hover:bg-panel-hover"
          >
            {showMargins ? <Eye aria-hidden="true" /> : <EyeSlash aria-hidden="true" />}
            <span className="font-mono text-xs uppercase">{t('preview.margins')}</span>
          </Button>
        </div>

        {/* Page count */}
        <div className="flex items-center gap-2 text-ink-soft">
          <FileText aria-hidden="true" className="size-4" />
          <span className="font-mono text-xs uppercase tabular-nums">
            {isCalculating
              ? t('preview.calculating')
              : pages.length === 1
                ? t('preview.pageCountSingular', { count: pages.length })
                : t('preview.pageCountPlural', { count: pages.length })}
          </span>
        </div>
      </div>

      {/* Scrollable preview area */}
      <div ref={containerRef} className="flex-1 overflow-auto bg-panel-hover p-6">
        {/* Hidden measurement container - renders content at actual size */}
        <div
          ref={measurementRef}
          className="absolute opacity-0 pointer-events-none"
          style={{
            width: contentArea.width,
            left: -9999,
            top: 0,
          }}
          aria-hidden="true"
          // aria-hidden alone leaves the template's links tabbable; inert removes
          // them from the tab order without changing layout, so measuring is unaffected.
          inert
        >
          <Resume
            resumeData={resumeData}
            template={settings.template}
            settings={resumeSettings}
            locale={contentLanguage}
            additionalSectionLabels={additionalSectionLabels}
            sectionHeadings={sectionHeadings}
            fallbackLabels={fallbackLabels}
          />
        </div>

        {/* Visible pages */}
        <div className="flex flex-col items-center gap-4">
          {pages.map((page, index) => (
            <React.Fragment key={page.pageNumber}>
              {index > 0 && (
                <div className="flex items-center gap-2 py-2">
                  <div aria-hidden="true" className="h-px w-8 bg-steel" />
                  <span className="font-mono text-xs text-ink-soft uppercase tracking-wider">
                    {t('preview.pageBreak')}
                  </span>
                  <div aria-hidden="true" className="h-px w-8 bg-steel" />
                </div>
              )}
              <PageContainer
                pageSize={settings.pageSize}
                margins={settings.margins}
                pageNumber={page.pageNumber}
                totalPages={pages.length}
                scale={zoom}
                showMarginGuides={showMargins}
                contentOffset={page.contentOffset}
                contentEnd={page.contentEnd}
              >
                <Resume
                  resumeData={resumeData}
                  template={settings.template}
                  settings={resumeSettings}
                  locale={contentLanguage}
                  additionalSectionLabels={additionalSectionLabels}
                  sectionHeadings={sectionHeadings}
                  fallbackLabels={fallbackLabels}
                />
              </PageContainer>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
