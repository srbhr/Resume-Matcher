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
import { Hatch } from '@/components/ui/hatch';
import { cn } from '@/lib/utils';
import { PageContainer } from './page-container';
import { usePagination } from './use-pagination';
import { PAGE_DIMENSIONS, mmToPx, getContentAreaPx } from '@/lib/constants/page-dimensions';
import { useTranslations } from '@/lib/i18n';
import { useLanguage } from '@/lib/context/language-context';

interface PaginatedPreviewProps {
  resumeData: ResumeData;
  settings: TemplateSettings;
  /** A photo CV's photo; it takes room in the header, so pages are measured with it. */
  photo?: string | null;
  /**
   * `panel` (the builder): zoom and margin controls on a grey panel.
   * `page` (the resume viewer): the pages alone under their count.
   */
  variant?: 'panel' | 'page';
  /** The `page` variant shows this beside the page count, above the sheet (the viewer's Edit). */
  action?: React.ReactNode;
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
// Opening zoom, and the ceiling for fit-to-width: a view with room for the page at this
// size opens at it, a narrower one fits the page to its width.
const DEFAULT_ZOOM = { panel: 0.85, page: 1.05 } as const;
// Width fit-to-width leaves free: the panel's 32px padding a side; in the page
// variant, the 24px a side the sheet's trim marks reach past its edge.
const RESERVED_WIDTH = { panel: 64, page: 48 } as const;
const ZOOM_STEP = 0.1;

/**
 * PaginatedPreview shows a WYSIWYG preview of the resume with actual page dimensions,
 * margin guides, and automatic pagination.
 */
export function PaginatedPreview({
  resumeData,
  settings,
  photo,
  variant = 'panel',
  action,
}: PaginatedPreviewProps) {
  const { t } = useTranslations();
  // Orders the CJK font fallback so the preview matches the generated PDF.
  const { contentLanguage } = useLanguage();
  const measurementRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState<number>(DEFAULT_ZOOM[variant]);
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
      earlierExperience: t('resume.sections.earlierExperience'),
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

    const containerWidth = containerRef.current.clientWidth - RESERVED_WIDTH[variant];
    const pageWidthPx = mmToPx(PAGE_DIMENSIONS[settings.pageSize].width);
    const optimalZoom = Math.min(containerWidth / pageWidthPx, MAX_ZOOM);
    // Fit to the view, but never open larger than the default zoom.
    setZoom(Math.max(MIN_ZOOM, Math.min(optimalZoom, DEFAULT_ZOOM[variant])));
  }, [settings.pageSize, autoZoom, variant]);

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

  const pageCount = (
    <div className="flex items-center gap-2 text-ink-soft">
      <FileText aria-hidden="true" className="size-4" />
      <span
        className={cn(
          'font-mono text-xs uppercase tabular-nums',
          // On the viewer's hatch the label needs a canvas backing; the panel's toolbar is solid.
          variant === 'page' && '-mx-1 bg-canvas px-1'
        )}
      >
        {isCalculating
          ? t('preview.calculating')
          : pages.length === 1
            ? t('preview.pageCountSingular', { count: pages.length })
            : t('preview.pageCountPlural', { count: pages.length })}
      </span>
    </div>
  );

  const isPanel = variant === 'panel';

  return (
    <div className={isPanel ? 'flex flex-col h-full overflow-hidden' : 'flex flex-col'}>
      {!isPanel && (
        // As wide as the shown page, so the count lines up with its right edge.
        <div
          className="mx-auto flex max-w-full items-center justify-end gap-4 pb-8"
          style={{ width: mmToPx(PAGE_DIMENSIONS[settings.pageSize].width) * zoom }}
        >
          {pageCount}
          {action}
        </div>
      )}
      {/* Controls bar */}
      {isPanel && (
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
          {pageCount}
        </div>
      )}

      {/* Scrollable preview area */}
      <div ref={containerRef} className={isPanel ? 'flex-1 overflow-auto bg-canvas' : 'relative'}>
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
            photo={photo}
            template={settings.template}
            settings={resumeSettings}
            locale={contentLanguage}
            additionalSectionLabels={additionalSectionLabels}
            sectionHeadings={sectionHeadings}
            fallbackLabels={fallbackLabels}
          />
        </div>

        {/* Visible pages. In the panel they sit on a quiet hatch that grows with them;
            the viewer page hatches its own body instead. */}
        <div
          className={
            isPanel
              ? 'relative isolate flex min-h-full flex-col items-center gap-4 p-8'
              : 'flex flex-col items-center gap-4'
          }
        >
          {isPanel && <Hatch className="-z-10 text-panel-hover" />}
          {pages.map((page, index) => (
            <React.Fragment key={page.pageNumber}>
              {index > 0 && (
                <div className="flex items-center gap-2 py-2">
                  <div aria-hidden="true" className="h-px w-8 bg-steel" />
                  <span className="bg-canvas px-1 font-mono text-xs text-ink-soft uppercase tracking-wider">
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
                  photo={photo}
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
