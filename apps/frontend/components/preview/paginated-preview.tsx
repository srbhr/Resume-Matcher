'use client';

import React, { useRef, useState, useCallback, useEffect } from 'react';
import { ZoomIn, ZoomOut, Eye, EyeOff, FileText } from 'lucide-react';
import { Button } from '@/components/ui/button';
import Resume, { type ResumeData } from '@/components/dashboard/resume-component';
import { type TemplateSettings } from '@/lib/types/template-settings';
import { PageContainer } from './page-container';
import { usePagination } from './use-pagination';
import { PAGE_DIMENSIONS, mmToPx, getContentAreaPx } from '@/lib/constants/page-dimensions';

interface PaginatedPreviewProps {
  resumeData: ResumeData;
  settings: TemplateSettings;
}

const MIN_ZOOM = 0.4;
const MAX_ZOOM = 1.5;
const ZOOM_STEP = 0.1;

/**
 * PaginatedPreview shows a WYSIWYG preview of the resume with actual page dimensions,
 * margin guides, and automatic pagination.
 */
export function PaginatedPreview({ resumeData, settings }: PaginatedPreviewProps) {
  const measurementRef = useRef<HTMLDivElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(0.6);
  const [showMargins, setShowMargins] = useState(false);
  const [autoZoom, setAutoZoom] = useState(true);
  const resumeSettings: TemplateSettings = {
    ...settings,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
  };

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
    setZoom(Math.max(MIN_ZOOM, Math.min(optimalZoom, 0.75))); // Cap at 75% for usability
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
      <div className="flex items-center justify-between px-4 py-2 border-b border-gray-300 bg-[#E5E5E0] shrink-0">
        <div className="flex items-center gap-2">
          {/* Zoom controls */}
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomOut}
            disabled={zoom <= MIN_ZOOM}
            className="h-8 w-8"
          >
            <ZoomOut className="w-4 h-4" />
          </Button>
          <span className="font-mono text-xs w-12 text-center text-gray-600">
            {Math.round(zoom * 100)}%
          </span>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleZoomIn}
            disabled={zoom >= MAX_ZOOM}
            className="h-8 w-8"
          >
            <ZoomIn className="w-4 h-4" />
          </Button>

          <div className="w-px h-5 bg-gray-400 mx-2" />

          {/* Margin toggle */}
          <Button
            variant={showMargins ? 'secondary' : 'ghost'}
            size="sm"
            onClick={toggleMargins}
            className="h-8 gap-1.5"
          >
            {showMargins ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            <span className="font-mono text-xs uppercase">Margins</span>
          </Button>
        </div>

        {/* Page count */}
        <div className="flex items-center gap-2 text-gray-600">
          <FileText className="w-4 h-4" />
          <span className="font-mono text-xs uppercase">
            {isCalculating
              ? 'Calculating...'
              : `${pages.length} page${pages.length !== 1 ? 's' : ''}`}
          </span>
        </div>
      </div>

      {/* Scrollable preview area */}
      <div
        ref={containerRef}
        className="flex-1 overflow-auto bg-[#D5D5D0] p-6"
        style={{
          backgroundImage:
            'linear-gradient(rgba(0, 0, 0, 0.03) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 0, 0, 0.03) 1px, transparent 1px)',
          backgroundSize: '20px 20px',
        }}
      >
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
        >
          <Resume resumeData={resumeData} template={settings.template} settings={resumeSettings} />
        </div>

        {/* Visible pages */}
        <div className="flex flex-col items-center gap-4">
          {pages.map((page, index) => (
            <React.Fragment key={page.pageNumber}>
              {index > 0 && (
                <div className="flex items-center gap-2 py-2">
                  <div className="h-px w-8 bg-gray-400" />
                  <span className="font-mono text-[10px] text-gray-500 uppercase tracking-wider">
                    Page Break
                  </span>
                  <div className="h-px w-8 bg-gray-400" />
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
                <Resume resumeData={resumeData} template={settings.template} settings={resumeSettings} />
              </PageContainer>
            </React.Fragment>
          ))}
        </div>
      </div>
    </div>
  );
}
