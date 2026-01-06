'use client';

import React from 'react';
import { type TemplateType, TEMPLATE_OPTIONS } from '@/lib/types/template-settings';

interface TemplateSelectorProps {
  value: TemplateType;
  onChange: (template: TemplateType) => void;
}

/**
 * Template Selector Component
 *
 * Visual thumbnail buttons for selecting resume templates.
 * Swiss design: Square corners, high contrast, monospace labels.
 */
export const TemplateSelector: React.FC<TemplateSelectorProps> = ({ value, onChange }) => {
  return (
    <div className="flex gap-3">
      {TEMPLATE_OPTIONS.map((template) => (
        <button
          key={template.id}
          onClick={() => onChange(template.id)}
          className={`group flex flex-col items-center p-3 border-2 transition-all ${
            value === template.id
              ? 'border-blue-700 bg-blue-50 shadow-[3px_3px_0px_0px_#1D4ED8]'
              : 'border-black bg-white hover:bg-gray-50 hover:shadow-[2px_2px_0px_0px_#000]'
          }`}
          title={template.description}
        >
          {/* Template Thumbnail */}
          <div className="w-16 h-20 mb-2 flex items-center justify-center">
            <TemplateThumbnail type={template.id} isActive={value === template.id} />
          </div>

          {/* Template Name */}
          <span
            className={`font-mono text-[10px] uppercase tracking-wider font-bold ${
              value === template.id ? 'text-blue-700' : 'text-gray-700'
            }`}
          >
            {template.name}
          </span>
        </button>
      ))}
    </div>
  );
};

/**
 * Template Thumbnail
 *
 * Visual representation of each template layout
 * Exported for use in FormattingControls
 */
interface TemplateThumbnailProps {
  type: TemplateType;
  isActive: boolean;
}

export const TemplateThumbnail: React.FC<TemplateThumbnailProps> = ({ type, isActive }) => {
  const lineColor = isActive ? 'bg-blue-700' : 'bg-gray-400';
  const borderColor = isActive ? 'border-blue-700' : 'border-gray-400';
  const accentColor = isActive ? 'bg-blue-600' : 'bg-blue-400';

  if (type === 'swiss-single') {
    // Single column thumbnail
    return (
      <div className={`w-14 h-18 border ${borderColor} bg-white p-1.5 flex flex-col gap-1`}>
        {/* Header */}
        <div className={`h-2 ${lineColor} w-full`}></div>
        <div className={`h-0.5 ${lineColor} w-3/4`}></div>
        {/* Sections */}
        <div className="flex-1 space-y-1 mt-1">
          <div className={`h-0.5 ${lineColor} w-full`}></div>
          <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
          <div className={`h-0.5 ${lineColor} w-4/6 opacity-50`}></div>
          <div className="h-1"></div>
          <div className={`h-0.5 ${lineColor} w-full`}></div>
          <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
          <div className={`h-0.5 ${lineColor} w-3/6 opacity-50`}></div>
        </div>
      </div>
    );
  }

  if (type === 'modern') {
    // Modern template thumbnail - with accent color highlights
    return (
      <div className={`w-14 h-18 border ${borderColor} bg-white p-1.5 flex flex-col gap-1`}>
        {/* Header with accent underline */}
        <div className="flex flex-col items-center gap-0.5">
          <div className={`h-2 ${lineColor} w-3/4`}></div>
          <div className={`h-0.5 ${accentColor} w-1/3`}></div>
        </div>
        {/* Sections with accent headers */}
        <div className="flex-1 space-y-1 mt-1">
          <div className={`h-0.5 ${accentColor} w-full`}></div>
          <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
          <div className={`h-0.5 ${lineColor} w-4/6 opacity-50`}></div>
          <div className="h-0.5"></div>
          <div className={`h-0.5 ${accentColor} w-full`}></div>
          <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
          <div className={`h-0.5 ${lineColor} w-3/6 opacity-50`}></div>
        </div>
      </div>
    );
  }

  if (type === 'modern-two-column') {
    // Modern two-column template thumbnail - accent colors + two columns
    return (
      <div className={`w-14 h-18 border ${borderColor} bg-white p-1.5 flex flex-col gap-1`}>
        {/* Header with accent underline */}
        <div className="flex flex-col items-center gap-0.5">
          <div className={`h-1.5 ${lineColor} w-3/4`}></div>
          <div className={`h-0.5 ${accentColor} w-1/3`}></div>
        </div>
        {/* Two columns */}
        <div className="flex-1 flex gap-1 mt-1">
          {/* Left column (wider) - with accent headers */}
          <div className="w-2/3 space-y-0.5">
            <div className={`h-0.5 ${accentColor} w-full`}></div>
            <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
            <div className={`h-0.5 ${lineColor} w-4/6 opacity-50`}></div>
            <div className="h-0.5"></div>
            <div className={`h-0.5 ${accentColor} w-full`}></div>
            <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
          </div>
          {/* Right column (narrower) - with accent border and headers */}
          <div
            className={`w-1/3 border-l-2 ${borderColor === 'border-blue-700' ? 'border-l-blue-600' : 'border-l-blue-400'} pl-1 space-y-0.5`}
          >
            <div className={`h-0.5 ${accentColor} w-full`}></div>
            <div className={`h-0.5 ${lineColor} w-4/5 opacity-50`}></div>
            <div className="h-0.5"></div>
            <div className={`h-0.5 ${accentColor} w-full`}></div>
            <div className={`h-0.5 ${lineColor} w-3/5 opacity-50`}></div>
          </div>
        </div>
      </div>
    );
  }

  // Two column thumbnail (swiss-two-column)
  return (
    <div className={`w-14 h-18 border ${borderColor} bg-white p-1.5 flex flex-col gap-1`}>
      {/* Header - centered */}
      <div className="flex flex-col items-center gap-0.5">
        <div className={`h-1.5 ${lineColor} w-3/4`}></div>
        <div className={`h-0.5 ${lineColor} w-1/2 opacity-70`}></div>
      </div>
      {/* Two columns */}
      <div className="flex-1 flex gap-1 mt-1">
        {/* Left column (wider) */}
        <div className="w-2/3 space-y-0.5">
          <div className={`h-0.5 ${lineColor} w-full`}></div>
          <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
          <div className={`h-0.5 ${lineColor} w-4/6 opacity-50`}></div>
          <div className="h-0.5"></div>
          <div className={`h-0.5 ${lineColor} w-full`}></div>
          <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
        </div>
        {/* Right column (narrower) */}
        <div className="w-1/3 border-l border-gray-200 pl-1 space-y-0.5">
          <div className={`h-0.5 ${lineColor} w-full`}></div>
          <div className={`h-0.5 ${lineColor} w-4/5 opacity-50`}></div>
          <div className="h-0.5"></div>
          <div className={`h-0.5 ${lineColor} w-full`}></div>
          <div className={`h-0.5 ${lineColor} w-3/5 opacity-50`}></div>
        </div>
      </div>
    </div>
  );
};

export default TemplateSelector;
