'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import {
  type TemplateSettings,
  type TemplateType,
  type PageSize,
  type SpacingLevel,
  type HeaderFontFamily,
  DEFAULT_TEMPLATE_SETTINGS,
  TEMPLATE_OPTIONS,
  PAGE_SIZE_INFO,
} from '@/lib/types/template-settings';
import { TemplateThumbnail } from './template-selector';

interface FormattingControlsProps {
  settings: TemplateSettings;
  onChange: (settings: TemplateSettings) => void;
}

/**
 * Formatting Controls Panel
 *
 * Provides user controls for adjusting resume layout:
 * - Template selection with visual thumbnails
 * - Page size (A4 / US Letter)
 * - Margins (top, bottom, left, right)
 * - Section/item spacing
 * - Line height
 * - Font sizes
 *
 * Swiss design: Square buttons, monospace labels, high contrast
 */
export const FormattingControls: React.FC<FormattingControlsProps> = ({ settings, onChange }) => {
  const [isExpanded, setIsExpanded] = useState(true);

  const handleTemplateChange = (template: TemplateType) => {
    onChange({ ...settings, template });
  };

  const handlePageSizeChange = (pageSize: PageSize) => {
    onChange({ ...settings, pageSize });
  };

  const handleMarginChange = (key: keyof TemplateSettings['margins'], value: number) => {
    onChange({
      ...settings,
      margins: { ...settings.margins, [key]: value },
    });
  };

  const handleSpacingChange = (key: keyof TemplateSettings['spacing'], value: SpacingLevel) => {
    onChange({
      ...settings,
      spacing: { ...settings.spacing, [key]: value },
    });
  };

  const handleFontChange = (key: keyof TemplateSettings['fontSize'], value: SpacingLevel) => {
    onChange({
      ...settings,
      fontSize: { ...settings.fontSize, [key]: value },
    });
  };

  const handleHeaderFontChange = (headerFont: HeaderFontFamily) => {
    onChange({
      ...settings,
      fontSize: { ...settings.fontSize, headerFont },
    });
  };

  const handleCompactModeToggle = () => {
    onChange({ ...settings, compactMode: !settings.compactMode });
  };

  const handleShowContactIconsToggle = () => {
    onChange({ ...settings, showContactIcons: !settings.showContactIcons });
  };

  const handleReset = () => {
    onChange(DEFAULT_TEMPLATE_SETTINGS);
  };

  return (
    <div className="border border-black bg-white">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-700"></div>
          <span className="font-mono text-xs font-bold uppercase tracking-wider">
            Template & Formatting
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-gray-500" />
        ) : (
          <ChevronDown className="w-4 h-4 text-gray-500" />
        )}
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="border-t border-black p-4 space-y-6">
          {/* Template Selection */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-gray-600">
              Template
            </h4>
            <div className="flex gap-3">
              {TEMPLATE_OPTIONS.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateChange(template.id)}
                  className={`group flex flex-col items-center p-2 border-2 transition-all ${
                    settings.template === template.id
                      ? 'border-blue-700 bg-blue-50 shadow-[2px_2px_0px_0px_#1D4ED8]'
                      : 'border-black bg-white hover:bg-gray-50 hover:shadow-[1px_1px_0px_0px_#000]'
                  }`}
                  title={template.description}
                >
                  <div className="w-12 h-16 mb-1.5 flex items-center justify-center">
                    <TemplateThumbnail
                      type={template.id}
                      isActive={settings.template === template.id}
                    />
                  </div>
                  <span
                    className={`font-mono text-[9px] uppercase tracking-wider font-bold ${
                      settings.template === template.id ? 'text-blue-700' : 'text-gray-700'
                    }`}
                  >
                    {template.name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Page Size Selection */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-gray-600">
              Page Size
            </h4>
            <div className="flex gap-2">
              {(Object.keys(PAGE_SIZE_INFO) as PageSize[]).map((size) => (
                <button
                  key={size}
                  onClick={() => handlePageSizeChange(size)}
                  className={`flex-1 px-3 py-2 border-2 font-mono text-xs transition-all ${
                    settings.pageSize === size
                      ? 'border-blue-700 bg-blue-50 text-blue-700 shadow-[2px_2px_0px_0px_#1D4ED8]'
                      : 'border-black bg-white text-gray-700 hover:bg-gray-50'
                  }`}
                  title={PAGE_SIZE_INFO[size].dimensions}
                >
                  <div className="font-bold">{PAGE_SIZE_INFO[size].name}</div>
                  <div className="text-[9px] opacity-70">{PAGE_SIZE_INFO[size].dimensions}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Margins Section */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-gray-600">
              Margins (mm)
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <MarginSlider
                label="Top"
                value={settings.margins.top}
                onChange={(v) => handleMarginChange('top', v)}
              />
              <MarginSlider
                label="Bottom"
                value={settings.margins.bottom}
                onChange={(v) => handleMarginChange('bottom', v)}
              />
              <MarginSlider
                label="Left"
                value={settings.margins.left}
                onChange={(v) => handleMarginChange('left', v)}
              />
              <MarginSlider
                label="Right"
                value={settings.margins.right}
                onChange={(v) => handleMarginChange('right', v)}
              />
            </div>
          </div>

          {/* Spacing Section */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-gray-600">
              Spacing
            </h4>
            <div className="space-y-3">
              <SpacingSelector
                label="Section"
                value={settings.spacing.section}
                onChange={(v) => handleSpacingChange('section', v)}
              />
              <SpacingSelector
                label="Items"
                value={settings.spacing.item}
                onChange={(v) => handleSpacingChange('item', v)}
              />
              <SpacingSelector
                label="Lines"
                value={settings.spacing.lineHeight}
                onChange={(v) => handleSpacingChange('lineHeight', v)}
              />
            </div>
          </div>

          {/* Font Size Section */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-gray-600">
              Font Size
            </h4>
            <div className="space-y-3">
              <SpacingSelector
                label="Base"
                value={settings.fontSize.base}
                onChange={(v) => handleFontChange('base', v)}
              />
              <SpacingSelector
                label="Headers"
                value={settings.fontSize.headerScale}
                onChange={(v) => handleFontChange('headerScale', v)}
              />
              {/* Header Font Family */}
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs w-16 text-gray-600">Font:</span>
                <div className="flex gap-1">
                  {(['serif', 'sans-serif', 'mono'] as HeaderFontFamily[]).map((font) => (
                    <button
                      key={font}
                      onClick={() => handleHeaderFontChange(font)}
                      className={`px-2 py-1 font-mono text-xs border transition-all ${
                        settings.fontSize.headerFont === font
                          ? 'bg-blue-700 text-white border-blue-700 shadow-[1px_1px_0px_0px_#000]'
                          : 'bg-white text-gray-700 border-gray-300 hover:border-black'
                      }`}
                      style={{
                        fontFamily:
                          font === 'serif'
                            ? 'Georgia, serif'
                            : font === 'mono'
                              ? 'monospace'
                              : 'system-ui, sans-serif',
                      }}
                    >
                      {font === 'sans-serif' ? 'Sans' : font.charAt(0).toUpperCase() + font.slice(1)}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Options Section */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-gray-600">
              Options
            </h4>
            <div className="space-y-3">
              {/* Compact Mode Toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  onClick={handleCompactModeToggle}
                  className={`relative w-10 h-5 border-2 transition-all ${
                    settings.compactMode
                      ? 'bg-blue-700 border-blue-700'
                      : 'bg-white border-gray-400'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-3.5 h-3.5 bg-white border transition-all ${
                      settings.compactMode
                        ? 'left-5 border-blue-700'
                        : 'left-0.5 border-gray-400'
                    }`}
                  />
                </button>
                <span className="font-mono text-xs text-gray-700">Compact Mode</span>
              </label>

              {/* Show Contact Icons Toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  onClick={handleShowContactIconsToggle}
                  className={`relative w-10 h-5 border-2 transition-all ${
                    settings.showContactIcons
                      ? 'bg-blue-700 border-blue-700'
                      : 'bg-white border-gray-400'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-3.5 h-3.5 bg-white border transition-all ${
                      settings.showContactIcons
                        ? 'left-5 border-blue-700'
                        : 'left-0.5 border-gray-400'
                    }`}
                  />
                </button>
                <span className="font-mono text-xs text-gray-700">Contact Icons</span>
              </label>
            </div>
          </div>

          {/* Reset Button */}
          <div className="pt-2 border-t border-gray-200">
            <Button variant="outline" size="sm" onClick={handleReset} className="w-full">
              <RotateCcw className="w-3 h-3" />
              Reset to Defaults
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

/**
 * Margin Slider Component
 *
 * Range input for margin values (5-25mm)
 */
interface MarginSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

const MarginSlider: React.FC<MarginSliderProps> = ({ label, value, onChange }) => {
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs w-12 text-gray-600">{label}:</span>
      <input
        type="range"
        min={5}
        max={25}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="flex-1 h-1 bg-gray-200 rounded-none appearance-none cursor-pointer
                   [&::-webkit-slider-thumb]:appearance-none
                   [&::-webkit-slider-thumb]:w-3
                   [&::-webkit-slider-thumb]:h-3
                   [&::-webkit-slider-thumb]:bg-blue-700
                   [&::-webkit-slider-thumb]:border-none
                   [&::-webkit-slider-thumb]:cursor-pointer
                   [&::-moz-range-thumb]:w-3
                   [&::-moz-range-thumb]:h-3
                   [&::-moz-range-thumb]:bg-blue-700
                   [&::-moz-range-thumb]:border-none
                   [&::-moz-range-thumb]:cursor-pointer"
      />
      <span className="font-mono text-xs w-6 text-right text-gray-800">{value}</span>
    </div>
  );
};

/**
 * Spacing Selector Component
 *
 * Button group for selecting spacing levels (1-5)
 */
interface SpacingSelectorProps {
  label: string;
  value: SpacingLevel;
  onChange: (value: SpacingLevel) => void;
}

const SpacingSelector: React.FC<SpacingSelectorProps> = ({ label, value, onChange }) => {
  const levels: SpacingLevel[] = [1, 2, 3, 4, 5];

  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs w-16 text-gray-600">{label}:</span>
      <div className="flex gap-1">
        {levels.map((level) => (
          <button
            key={level}
            onClick={() => onChange(level)}
            className={`w-6 h-6 font-mono text-xs border transition-all ${
              value === level
                ? 'bg-blue-700 text-white border-blue-700 shadow-[1px_1px_0px_0px_#000]'
                : 'bg-white text-gray-700 border-gray-300 hover:border-black'
            }`}
          >
            {level}
          </button>
        ))}
      </div>
    </div>
  );
};

export default FormattingControls;
