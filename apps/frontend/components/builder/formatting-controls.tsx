'use client';

import React, { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import {
  type TemplateSettings,
  type TemplateType,
  type PageSize,
  type SpacingLevel,
  type HeaderFontFamily,
  type BodyFontFamily,
  type AccentColor,
  DEFAULT_TEMPLATE_SETTINGS,
  applyTemplatePreset,
  SECTION_SPACING_MAP,
  ITEM_SPACING_MAP,
  LINE_HEIGHT_MAP,
  FONT_SIZE_MAP,
  HEADER_SCALE_MAP,
  COMPACT_MULTIPLIER,
  COMPACT_LINE_HEIGHT_MULTIPLIER,
  TEMPLATE_OPTIONS,
  PAGE_SIZE_INFO,
  ACCENT_COLOR_MAP,
} from '@/lib/types/template-settings';
import { TemplateThumbnail } from './template-selector';
import { useTranslations } from '@/lib/i18n';

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
  const { t } = useTranslations();
  const [isExpanded, setIsExpanded] = useState(true);
  const contentId = useId();
  const compactMultiplier = settings.compactMode ? COMPACT_MULTIPLIER : 1;
  const sectionGapRem =
    parseFloat(SECTION_SPACING_MAP[settings.spacing.section]) * compactMultiplier;
  const itemGapRem = parseFloat(ITEM_SPACING_MAP[settings.spacing.item]) * compactMultiplier;
  const lineHeightValue = settings.compactMode
    ? LINE_HEIGHT_MAP[settings.spacing.lineHeight] * COMPACT_LINE_HEIGHT_MULTIPLIER
    : LINE_HEIGHT_MAP[settings.spacing.lineHeight];

  const formatRem = (value: number) =>
    `${value.toFixed(2).replace(/\.00$/, '').replace(/0$/, '')}rem`;

  const handleTemplateChange = (template: TemplateType) => {
    // Single-typeface templates (latex/clean) seed their signature fonts on selection
    // so they match their reference look by default; both font controls stay live.
    onChange(applyTemplatePreset(settings, template));
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

  const handleBodyFontChange = (bodyFont: BodyFontFamily) => {
    onChange({
      ...settings,
      fontSize: { ...settings.fontSize, bodyFont },
    });
  };

  const handleCompactModeToggle = (compactMode: boolean) => {
    onChange({ ...settings, compactMode });
  };

  const handleShowContactIconsToggle = (showContactIcons: boolean) => {
    onChange({ ...settings, showContactIcons });
  };

  const handleAccentColorChange = (accentColor: AccentColor) => {
    onChange({ ...settings, accentColor });
  };

  const handleReset = () => {
    onChange(DEFAULT_TEMPLATE_SETTINGS);
  };

  const templateLabels = React.useMemo(
    () => ({
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
    }),
    [t]
  );

  const getFontLabel = (font: HeaderFontFamily | BodyFontFamily) => {
    if (font === 'sans-serif') return t('builder.formatting.fontNames.sans');
    if (font === 'serif') return t('builder.formatting.fontNames.serif');
    return t('builder.formatting.fontNames.mono');
  };

  return (
    <div className="border border-ink bg-white shadow-sw-default">
      {/* Header - Always Visible */}
      <button
        type="button"
        onClick={() => setIsExpanded(!isExpanded)}
        aria-expanded={isExpanded}
        aria-controls={contentId}
        className="w-full flex items-center justify-between p-3 hover:bg-panel transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary"
      >
        <span className="flex items-center gap-2">
          <span aria-hidden="true" className="size-3 bg-primary" />
          <span className="font-mono text-xs font-bold uppercase tracking-wider">
            {t('builder.formatting.panelTitle')}
          </span>
        </span>
        {isExpanded ? (
          <ChevronUp aria-hidden="true" className="size-4 text-steel" />
        ) : (
          <ChevronDown aria-hidden="true" className="size-4 text-steel" />
        )}
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div id={contentId} className="border-t border-ink p-4 space-y-6">
          {/* Template Selection */}
          <div>
            <h4
              id={`${contentId}-template`}
              className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft"
            >
              {t('builder.formatting.template')}
            </h4>
            <SegmentedControl
              variant="outline"
              size="sm"
              aria-labelledby={`${contentId}-template`}
              className="gap-3"
              value={settings.template}
              onChange={handleTemplateChange}
              items={TEMPLATE_OPTIONS.map((template) => ({
                value: template.id,
                title: templateLabels[template.id].description,
                label: (
                  // Fixed-width tile (owner F3): every tile matches the thumbnail and
                  // the name wraps onto at most two balanced lines.
                  <span className="flex w-24 flex-col items-center gap-2">
                    <TemplateThumbnail
                      type={template.id}
                      isActive={settings.template === template.id}
                    />
                    <span className="whitespace-normal text-balance text-center font-bold leading-tight">
                      {templateLabels[template.id].name}
                    </span>
                  </span>
                ),
              }))}
            />
          </div>

          {/* Accent Color Selection - Visible for Modern templates */}
          {(settings.template === 'modern' ||
            settings.template === 'modern-two-column' ||
            settings.template === 'vivid') && (
            <div>
              <h4
                id={`${contentId}-accent`}
                className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft"
              >
                {t('builder.formatting.accentColor')}
              </h4>
              <SegmentedControl
                size="sm"
                aria-labelledby={`${contentId}-accent`}
                value={settings.accentColor}
                onChange={handleAccentColorChange}
                items={(Object.keys(ACCENT_COLOR_MAP) as AccentColor[]).map((color) => ({
                  value: color,
                  label: (
                    <span className="flex items-center gap-2">
                      <span
                        aria-hidden="true"
                        className="size-4 border border-steel"
                        style={{ backgroundColor: ACCENT_COLOR_MAP[color].primary }}
                      />
                      {t(`builder.formatting.accentColors.${color}`)}
                    </span>
                  ),
                }))}
              />
            </div>
          )}

          {/* Page Size Selection */}
          <div>
            <h4
              id={`${contentId}-page-size`}
              className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft"
            >
              {t('builder.formatting.pageSize')}
            </h4>
            <SegmentedControl
              size="sm"
              aria-labelledby={`${contentId}-page-size`}
              className="grid grid-cols-2"
              value={settings.pageSize}
              onChange={handlePageSizeChange}
              items={(Object.keys(PAGE_SIZE_INFO) as PageSize[]).map((size) => ({
                value: size,
                label: (
                  <span className="flex flex-col items-center py-1">
                    <span className="font-bold">
                      {size === 'A4' ? 'A4' : t('builder.pageSize.usLetter')}
                    </span>
                    <span className="normal-case tracking-normal tabular-nums">
                      {PAGE_SIZE_INFO[size].dimensions}
                    </span>
                  </span>
                ),
              }))}
            />
          </div>

          {/* Margins Section */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft">
              {t('builder.formatting.margins')}
            </h4>
            <div className="grid grid-cols-2 gap-4">
              <MarginSlider
                label={t('builder.formatting.margin.top')}
                value={settings.margins.top}
                onChange={(v) => handleMarginChange('top', v)}
              />
              <MarginSlider
                label={t('builder.formatting.margin.bottom')}
                value={settings.margins.bottom}
                onChange={(v) => handleMarginChange('bottom', v)}
              />
              <MarginSlider
                label={t('builder.formatting.margin.left')}
                value={settings.margins.left}
                onChange={(v) => handleMarginChange('left', v)}
              />
              <MarginSlider
                label={t('builder.formatting.margin.right')}
                value={settings.margins.right}
                onChange={(v) => handleMarginChange('right', v)}
              />
            </div>
          </div>

          {/* Spacing Section */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft">
              {t('builder.formatting.spacing')}
            </h4>
            <div className="space-y-3">
              <SpacingSelector
                label={t('builder.formatting.spacingSection')}
                value={settings.spacing.section}
                onChange={(v) => handleSpacingChange('section', v)}
              />
              <SpacingSelector
                label={t('builder.formatting.spacingItems')}
                value={settings.spacing.item}
                onChange={(v) => handleSpacingChange('item', v)}
              />
              <SpacingSelector
                label={t('builder.formatting.spacingLines')}
                value={settings.spacing.lineHeight}
                onChange={(v) => handleSpacingChange('lineHeight', v)}
              />
            </div>
          </div>

          {/* Font Size Section */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft">
              {t('builder.formatting.fontSize')}
            </h4>
            <div className="space-y-3">
              <SpacingSelector
                label={t('builder.formatting.baseFontSize')}
                value={settings.fontSize.base}
                onChange={(v) => handleFontChange('base', v)}
              />
              <SpacingSelector
                label={t('builder.formatting.headerScale')}
                value={settings.fontSize.headerScale}
                onChange={(v) => handleFontChange('headerScale', v)}
              />
              {/* Header Font Family */}
              <div className="flex items-center gap-2">
                <span
                  id={`${contentId}-header-font`}
                  className="font-mono text-xs w-16 text-ink-soft"
                >
                  {t('builder.formatting.headerFontFamily')}:
                </span>
                <SegmentedControl
                  size="sm"
                  className="gap-1"
                  aria-labelledby={`${contentId}-header-font`}
                  value={settings.fontSize.headerFont}
                  onChange={handleHeaderFontChange}
                  items={(['serif', 'sans-serif', 'mono'] as HeaderFontFamily[]).map((font) => ({
                    value: font,
                    label: (
                      <span style={{ fontFamily: FONT_PREVIEW[font] }}>{getFontLabel(font)}</span>
                    ),
                  }))}
                />
              </div>
              {/* Body Font Family */}
              <div className="flex items-center gap-2">
                <span
                  id={`${contentId}-body-font`}
                  className="font-mono text-xs w-16 text-ink-soft"
                >
                  {t('builder.formatting.bodyFontFamily')}:
                </span>
                <SegmentedControl
                  size="sm"
                  className="gap-1"
                  aria-labelledby={`${contentId}-body-font`}
                  value={settings.fontSize.bodyFont}
                  onChange={handleBodyFontChange}
                  items={(['serif', 'sans-serif', 'mono'] as BodyFontFamily[]).map((font) => ({
                    value: font,
                    label: (
                      <span style={{ fontFamily: FONT_PREVIEW[font] }}>{getFontLabel(font)}</span>
                    ),
                  }))}
                />
              </div>
            </div>
          </div>

          {/* Options Section */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft">
              {t('builder.formatting.options')}
            </h4>
            <div className="space-y-3">
              <ToggleSwitch
                variant="inline"
                label={t('builder.formatting.compactMode')}
                checked={settings.compactMode}
                onCheckedChange={handleCompactModeToggle}
              />
              <ToggleSwitch
                variant="inline"
                label={t('builder.formatting.contactIcons')}
                checked={settings.showContactIcons}
                onCheckedChange={handleShowContactIconsToggle}
              />
            </div>
          </div>

          {/* Reset Button */}
          <div className="pt-2 border-t border-paper space-y-3">
            <div>
              <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-ink-soft mb-2">
                {t('builder.formatting.effectiveOutput')}
              </h4>
              <div className="font-mono text-xs text-ink-soft space-y-1 tabular-nums">
                <div title={t('builder.formatting.margins')}>
                  {t('builder.formatting.effectiveMargins', {
                    top: settings.margins.top,
                    bottom: settings.margins.bottom,
                    left: settings.margins.left,
                    right: settings.margins.right,
                  })}
                </div>
                <div>
                  {t('builder.formatting.effectiveSectionGap')}: {formatRem(sectionGapRem)}
                </div>
                <div>
                  {t('builder.formatting.effectiveItemGap')}: {formatRem(itemGapRem)}
                </div>
                <div>
                  {t('builder.formatting.effectiveLineHeight')}: {lineHeightValue.toFixed(2)}
                </div>
                <div>
                  {t('builder.formatting.effectiveBaseFont')}:{' '}
                  {FONT_SIZE_MAP[settings.fontSize.base]}
                </div>
                <div>
                  {t('builder.formatting.effectiveHeaderScale')}:{' '}
                  {HEADER_SCALE_MAP[settings.fontSize.headerScale]}x
                </div>
                <div>
                  {t('builder.formatting.effectiveHeaderFont')}:{' '}
                  {getFontLabel(settings.fontSize.headerFont)}
                </div>
                <div>
                  {t('builder.formatting.effectiveBodyFont')}:{' '}
                  {getFontLabel(settings.fontSize.bodyFont)}
                </div>
              </div>
              {settings.compactMode && (
                <div className="font-mono text-xs text-steel mt-2">
                  {t('builder.formatting.compactHint')}
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleReset} className="w-full">
              <RotateCcw aria-hidden="true" className="size-3" />
              {t('builder.formatting.resetDefaults')}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
};

/** Font stacks for the font-family option labels, so each option previews its face. */
const FONT_PREVIEW: Record<HeaderFontFamily, string> = {
  serif: 'Georgia, serif',
  'sans-serif': 'system-ui, sans-serif',
  mono: 'monospace',
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
  const inputId = useId();
  return (
    <div className="flex items-center gap-2">
      <label htmlFor={inputId} className="font-mono text-xs w-12 text-ink-soft">
        {label}:
      </label>
      <input
        id={inputId}
        type="range"
        min={5}
        max={25}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="w-full accent-ink"
      />
      <span className="font-mono text-xs w-6 text-right text-ink-soft tabular-nums">{value}</span>
    </div>
  );
};

/**
 * Spacing Selector Component
 *
 * Segmented control for selecting spacing levels (1-5)
 */
interface SpacingSelectorProps {
  label: string;
  value: SpacingLevel;
  onChange: (value: SpacingLevel) => void;
}

const SPACING_LEVELS: SpacingLevel[] = [1, 2, 3, 4, 5];

const SpacingSelector: React.FC<SpacingSelectorProps> = ({ label, value, onChange }) => {
  const labelId = useId();
  return (
    <div className="flex items-center gap-2">
      <span id={labelId} className="font-mono text-xs w-16 text-ink-soft">
        {label}:
      </span>
      <SegmentedControl
        size="sm"
        className="gap-1"
        aria-labelledby={labelId}
        value={String(value)}
        onChange={(level) => onChange(Number(level) as SpacingLevel)}
        items={SPACING_LEVELS.map((level) => ({
          value: String(level),
          label: <span className="tabular-nums">{level}</span>,
        }))}
      />
    </div>
  );
};

export default FormattingControls;
