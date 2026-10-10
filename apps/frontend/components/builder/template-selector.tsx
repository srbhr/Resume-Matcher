'use client';

import React from 'react';
import { type TemplateType, TEMPLATE_OPTIONS } from '@/lib/types/template-settings';
import { useTranslations } from '@/lib/i18n';

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
  const { t } = useTranslations();
  const templateLabels = {
    'swiss-single': {
      name: t('builder.formatting.templates.swissSingle.name'),
      description: t('builder.formatting.templates.swissSingle.description'),
    },
    'swiss-two-column': {
      name: t('builder.formatting.templates.swissTwoColumn.name'),
      description: t('builder.formatting.templates.swissTwoColumn.description'),
    },
    modern: {
      name: t('builder.formatting.templates.modern.name'),
      description: t('builder.formatting.templates.modern.description'),
    },
    'modern-two-column': {
      name: t('builder.formatting.templates.modernTwoColumn.name'),
      description: t('builder.formatting.templates.modernTwoColumn.description'),
    },
    latex: {
      name: t('builder.formatting.templates.latex.name'),
      description: t('builder.formatting.templates.latex.description'),
    },
    clean: {
      name: t('builder.formatting.templates.clean.name'),
      description: t('builder.formatting.templates.clean.description'),
    },
    vivid: {
      name: t('builder.formatting.templates.vivid.name'),
      description: t('builder.formatting.templates.vivid.description'),
    },
  };

  return (
    <div className="flex flex-wrap gap-3">
      {TEMPLATE_OPTIONS.map((template) => (
        <button
          key={template.id}
          type="button"
          onClick={() => onChange(template.id)}
          aria-pressed={value === template.id}
          className={`group flex flex-col items-center p-3 border border-ink bg-white transition-colors focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-4 focus-visible:ring-offset-canvas ${
            value === template.id
              ? 'outline-2 outline-offset-2 outline-ink'
              : 'hover:bg-canvas focus-visible:outline-none'
          }`}
          title={templateLabels[template.id].description}
        >
          {/* Template Thumbnail */}
          <div className="mb-2">
            <TemplateThumbnail type={template.id} isActive={value === template.id} />
          </div>

          {/* Template Name */}
          <span
            className={`font-mono text-xs uppercase tracking-wider font-bold ${
              value === template.id ? 'text-ink' : 'text-ink-soft'
            }`}
          >
            {templateLabels[template.id].name}
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
  const lineColor = isActive ? 'bg-primary' : 'bg-steel';
  const borderColor = isActive ? 'border-primary' : 'border-steel';
  const accentColor = isActive ? 'bg-primary/70' : 'bg-primary/50';

  if (type === 'swiss-single') {
    // Single column thumbnail
    return (
      <div className={`w-16 h-20 border ${borderColor} bg-white p-2 flex flex-col gap-1`}>
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

  if (type === 'latex') {
    // LaTeX thumbnail - centered name + Title-Case ruled section headers (serif feel)
    return (
      <div className={`w-16 h-20 border ${borderColor} bg-white p-2 flex flex-col gap-1`}>
        {/* Centered name + contact */}
        <div className="flex flex-col items-center gap-1">
          <div className={`h-1.5 ${lineColor} w-2/3`}></div>
          <div className={`h-0.5 ${lineColor} w-1/2 opacity-60`}></div>
        </div>
        {/* Sections: each header is a full-width line with a bottom rule */}
        <div className="flex-1 space-y-1 mt-1">
          <div className={`h-0.5 ${lineColor} w-2/5 border-b ${borderColor} pb-1`}></div>
          <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
          <div className={`h-0.5 ${lineColor} w-4/6 opacity-50`}></div>
          <div className="h-0.5"></div>
          <div className={`h-0.5 ${lineColor} w-1/3 border-b ${borderColor} pb-1`}></div>
          <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
        </div>
      </div>
    );
  }

  if (type === 'clean') {
    // Clean thumbnail - centered light name + large understated gray uppercase headers
    return (
      <div className={`w-16 h-20 border ${borderColor} bg-white p-2 flex flex-col gap-1`}>
        {/* Centered light name + contact line */}
        <div className="flex flex-col items-center gap-1">
          <div className={`h-1.5 ${lineColor} w-1/2 opacity-70`}></div>
          <div className={`h-0.5 ${lineColor} w-2/3 opacity-40`}></div>
        </div>
        {/* Large gray section headers (taller, lower opacity) + thin rule */}
        <div className="flex-1 space-y-1 mt-1">
          <div className={`h-1 ${lineColor} w-1/2 opacity-30 border-b ${borderColor}`}></div>
          <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
          <div className={`h-0.5 ${lineColor} w-4/6 opacity-50`}></div>
          <div className="h-0.5"></div>
          <div className={`h-1 ${lineColor} w-2/5 opacity-30 border-b ${borderColor}`}></div>
          <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
        </div>
      </div>
    );
  }

  if (type === 'modern') {
    // Modern template thumbnail - with accent color highlights
    return (
      <div className={`w-16 h-20 border ${borderColor} bg-white p-2 flex flex-col gap-1`}>
        {/* Header with accent underline */}
        <div className="flex flex-col items-center gap-1">
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
      <div className={`w-16 h-20 border ${borderColor} bg-white p-2 flex flex-col gap-1`}>
        {/* Header with accent underline */}
        <div className="flex flex-col items-center gap-1">
          <div className={`h-1.5 ${lineColor} w-3/4`}></div>
          <div className={`h-0.5 ${accentColor} w-1/3`}></div>
        </div>
        {/* Two columns */}
        <div className="flex-1 flex gap-1 mt-1">
          {/* Left column (wider) - with accent headers */}
          <div className="w-2/3 space-y-1">
            <div className={`h-0.5 ${accentColor} w-full`}></div>
            <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
            <div className={`h-0.5 ${lineColor} w-4/6 opacity-50`}></div>
            <div className="h-0.5"></div>
            <div className={`h-0.5 ${accentColor} w-full`}></div>
            <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
          </div>
          {/* Right column (narrower). Active state uses a heavier full
              border instead of a left stripe (impeccable BAN 1). */}
          <div
            className={`w-1/3 border ${isActive ? 'border-primary/70' : 'border-primary/30'} pl-1 space-y-1`}
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

  if (type === 'vivid') {
    // Vivid thumbnail - two-tone accent name + accent headers + accent arrow bullets
    return (
      <div className={`w-16 h-20 border ${borderColor} bg-white p-2 flex flex-col gap-1`}>
        {/* Two-tone name (left-aligned) */}
        <div className="flex items-center gap-1">
          <div className={`h-1.5 ${accentColor} w-1/3`}></div>
          <div className={`h-1.5 ${accentColor} w-1/4 opacity-50`}></div>
        </div>
        <div className={`h-0.5 ${lineColor} w-2/3 opacity-40`}></div>
        {/* Two columns (no divider) */}
        <div className="flex-1 flex gap-1 mt-1">
          {/* Left column with arrow ticks */}
          <div className="w-2/3 space-y-1">
            <div className={`h-0.5 ${accentColor} w-1/2`}></div>
            <div className="flex items-center gap-1">
              <div className={`h-0.5 w-0.5 ${accentColor}`}></div>
              <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
            </div>
            <div className="flex items-center gap-1">
              <div className={`h-0.5 w-0.5 ${accentColor}`}></div>
              <div className={`h-0.5 ${lineColor} w-4/6 opacity-50`}></div>
            </div>
            <div className="h-0.5"></div>
            <div className={`h-0.5 ${accentColor} w-2/5`}></div>
          </div>
          {/* Right column (sidebar) */}
          <div className="w-1/3 space-y-1">
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
    <div className={`w-16 h-20 border ${borderColor} bg-white p-2 flex flex-col gap-1`}>
      {/* Header - centered */}
      <div className="flex flex-col items-center gap-1">
        <div className={`h-1.5 ${lineColor} w-3/4`}></div>
        <div className={`h-0.5 ${lineColor} w-1/2 opacity-70`}></div>
      </div>
      {/* Two columns */}
      <div className="flex-1 flex gap-1 mt-1">
        {/* Left column (wider) */}
        <div className="w-2/3 space-y-1">
          <div className={`h-0.5 ${lineColor} w-full`}></div>
          <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
          <div className={`h-0.5 ${lineColor} w-4/6 opacity-50`}></div>
          <div className="h-0.5"></div>
          <div className={`h-0.5 ${lineColor} w-full`}></div>
          <div className={`h-0.5 ${lineColor} w-5/6 opacity-50`}></div>
        </div>
        {/* Right column (narrower) */}
        <div className="w-1/3 border-l border-paper pl-1 space-y-1">
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
