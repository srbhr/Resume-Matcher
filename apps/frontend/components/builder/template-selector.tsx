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
  const templateLabels: Record<string, { name: string; description: string }> = {
    'swiss-single': {
      name: t('builder.formatting.templates.swissSingle.name'),
      description: t('builder.formatting.templates.swissSingle.description'),
    },
  };

  return (
    <div className="flex gap-3">
      {TEMPLATE_OPTIONS.map((template) => (
        <button
          key={template.id}
          onClick={() => onChange(template.id)}
          className={`group flex flex-col items-center p-3 border-2 transition-all ${
            value === template.id
              ? 'border-blue-700 bg-white shadow-[3px_3px_0px_0px_#1D4ED8]'
              : 'border-black bg-white hover:bg-[#F0F0E8] hover:shadow-[2px_2px_0px_0px_#000]'
          }`}
          title={templateLabels[template.id].description}
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

export const TemplateThumbnail: React.FC<TemplateThumbnailProps> = ({ isActive }) => {
  const lineColor = isActive ? 'bg-blue-700' : 'bg-gray-400';
  const borderColor = isActive ? 'border-blue-700' : 'border-gray-400';

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
};

export default TemplateSelector;
