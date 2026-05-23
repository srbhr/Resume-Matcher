'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, RotateCcw } from 'lucide-react';
import {
  type TemplateSettings,
  type TextStyleSettings,
  type TemplateType,
  type PageSize,
  type SpacingLevel,
  type HeaderFontFamily,
  type BodyFontFamily,
  type AccentColor,
  DEFAULT_TEMPLATE_SETTINGS,
  SECTION_SPACING_MAP,
  ITEM_SPACING_MAP,
  LINE_HEIGHT_MAP,
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

  const handleFontSizePtChange = (
    key: 'baseSizePt' | 'sectionHeaderSizePt' | 'nameSizePt' | 'contactSizePt' | 'bodySizePt',
    value: number
  ) => {
    onChange({ ...settings, fontSize: { ...settings.fontSize, [key]: value } });
  };

  const handleTextStyleChange = (key: keyof TextStyleSettings, value: boolean) => {
    onChange({ ...settings, textStyle: { ...settings.textStyle, [key]: value } });
  };

  const handleCompactModeToggle = () => {
    onChange({ ...settings, compactMode: !settings.compactMode });
  };

  const handleShowContactIconsToggle = () => {
    onChange({ ...settings, showContactIcons: !settings.showContactIcons });
  };

  const handleAccentColorChange = (accentColor: AccentColor) => {
    onChange({ ...settings, accentColor });
  };

  const handleQrToggle = () => {
    onChange({ ...settings, qrCode: { ...settings.qrCode, enabled: !settings.qrCode.enabled } });
  };

  const handleQrUrlChange = (url: string) => {
    onChange({ ...settings, qrCode: { ...settings.qrCode, url } });
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
    }),
    [t]
  );

  const getFontLabel = (font: HeaderFontFamily | BodyFontFamily) => {
    if (font === 'sans-serif') return t('builder.formatting.fontNames.sans');
    if (font === 'serif') return t('builder.formatting.fontNames.serif');
    if (font === 'cambria') return t('builder.formatting.fontNames.cambria');
    return t('builder.formatting.fontNames.mono');
  };

  return (
    <div className="border border-black bg-white shadow-sw-default">
      {/* Header - Always Visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full flex items-center justify-between p-3 hover:bg-paper-tint transition-colors"
      >
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-700"></div>
          <span className="font-mono text-xs font-bold uppercase tracking-wider">
            {t('builder.formatting.panelTitle')}
          </span>
        </div>
        {isExpanded ? (
          <ChevronUp className="w-4 h-4 text-steel-grey" />
        ) : (
          <ChevronDown className="w-4 h-4 text-steel-grey" />
        )}
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div className="border-t border-black p-4 space-y-6">
          {/* Template Selection */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft">
              {t('builder.formatting.template')}
            </h4>
            <div className="flex gap-3">
              {TEMPLATE_OPTIONS.map((template) => (
                <button
                  key={template.id}
                  onClick={() => handleTemplateChange(template.id)}
                  className={`group flex flex-col items-center p-2 border transition-all ${
                    settings.template === template.id
                      ? 'border-blue-700 bg-white shadow-[2px_2px_0px_0px_#1D4ED8]'
                      : 'border-black bg-white hover:bg-paper-tint hover:shadow-sw-xs'
                  }`}
                  title={templateLabels[template.id].description}
                >
                  <div className="w-12 h-16 mb-1.5 flex items-center justify-center">
                    <TemplateThumbnail
                      type={template.id}
                      isActive={settings.template === template.id}
                    />
                  </div>
                  <span
                    className={`font-mono text-[9px] uppercase tracking-wider font-bold ${
                      settings.template === template.id ? 'text-blue-700' : 'text-ink-soft'
                    }`}
                  >
                    {templateLabels[template.id].name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Accent Color Selection - Visible for Modern templates */}
          {(settings.template === 'modern' || settings.template === 'modern-two-column') && (
            <div>
              <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft">
                {t('builder.formatting.accentColor')}
              </h4>
              <div className="flex gap-2">
                {(Object.keys(ACCENT_COLOR_MAP) as AccentColor[]).map((color) => (
                  <button
                    key={color}
                    onClick={() => handleAccentColorChange(color)}
                    className={`flex items-center gap-2 px-3 py-2 border font-mono text-xs transition-all ${
                      settings.accentColor === color
                        ? 'border-blue-700 bg-white shadow-[2px_2px_0px_0px_#1D4ED8]'
                        : 'border-black bg-white hover:bg-paper-tint'
                    }`}
                    title={t(`builder.formatting.accentColors.${color}`)}
                  >
                    <span
                      className="w-4 h-4 border border-steel-grey"
                      style={{ backgroundColor: ACCENT_COLOR_MAP[color].primary }}
                    />
                    <span>{t(`builder.formatting.accentColors.${color}`)}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {/* Page Size Selection */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft">
              {t('builder.formatting.pageSize')}
            </h4>
            <div className="flex gap-2">
              {(Object.keys(PAGE_SIZE_INFO) as PageSize[]).map((size) => (
                <button
                  key={size}
                  onClick={() => handlePageSizeChange(size)}
                  className={`flex-1 px-3 py-2 border font-mono text-xs transition-all ${
                    settings.pageSize === size
                      ? 'border-blue-700 bg-white text-blue-700 shadow-[2px_2px_0px_0px_#1D4ED8]'
                      : 'border-black bg-white text-ink-soft hover:bg-paper-tint'
                  }`}
                  title={PAGE_SIZE_INFO[size].dimensions}
                >
                  <div className="font-bold">
                    {size === 'A4' ? 'A4' : t('builder.pageSize.usLetter')}
                  </div>
                  <div className="text-[9px] opacity-70">{PAGE_SIZE_INFO[size].dimensions}</div>
                </button>
              ))}
            </div>
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
              <PtSizeSlider
                label={t('builder.formatting.baseFontSize')}
                value={settings.fontSize.baseSizePt}
                min={7}
                max={14}
                onChange={(v) => handleFontSizePtChange('baseSizePt', v)}
              />
              <PtSizeSlider
                label={t('builder.formatting.headerScale')}
                value={settings.fontSize.sectionHeaderSizePt}
                min={8}
                max={18}
                onChange={(v) => handleFontSizePtChange('sectionHeaderSizePt', v)}
              />
              {/* Header Font Family */}
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs w-16 text-ink-soft">
                  {t('builder.formatting.headerFontFamily')}:
                </span>
                <div className="flex gap-1">
                  {(['serif', 'sans-serif', 'mono', 'cambria'] as HeaderFontFamily[]).map(
                    (font) => (
                      <button
                        key={font}
                        onClick={() => handleHeaderFontChange(font)}
                        className={`px-2 py-1 font-mono text-xs border transition-all ${
                          settings.fontSize.headerFont === font
                            ? 'bg-blue-700 text-white border-blue-700 shadow-sw-xs'
                            : 'bg-white text-ink-soft border-steel-grey hover:border-black'
                        }`}
                        style={{
                          fontFamily:
                            font === 'cambria'
                              ? 'Cambria, Georgia, serif'
                              : font === 'serif'
                                ? 'Georgia, serif'
                                : font === 'mono'
                                  ? 'monospace'
                                  : 'system-ui, sans-serif',
                        }}
                      >
                        {getFontLabel(font)}
                      </button>
                    )
                  )}
                </div>
              </div>
              {/* Body Font Family */}
              <div className="flex items-center gap-2">
                <span className="font-mono text-xs w-16 text-ink-soft">
                  {t('builder.formatting.bodyFontFamily')}:
                </span>
                <div className="flex gap-1">
                  {(['serif', 'sans-serif', 'mono', 'cambria'] as BodyFontFamily[]).map((font) => (
                    <button
                      key={font}
                      onClick={() => handleBodyFontChange(font)}
                      className={`px-2 py-1 font-mono text-xs border transition-all ${
                        settings.fontSize.bodyFont === font
                          ? 'bg-blue-700 text-white border-blue-700 shadow-sw-xs'
                          : 'bg-white text-ink-soft border-steel-grey hover:border-black'
                      }`}
                      style={{
                        fontFamily:
                          font === 'cambria'
                            ? 'Cambria, Georgia, serif'
                            : font === 'serif'
                              ? 'Georgia, serif'
                              : font === 'mono'
                                ? 'monospace'
                                : 'system-ui, sans-serif',
                      }}
                    >
                      {getFontLabel(font)}
                    </button>
                  ))}
                </div>
              </div>
              {/* Per-element pt sizes */}
              <PtSizeSlider
                label={t('builder.formatting.nameSizePt')}
                value={settings.fontSize.nameSizePt}
                min={8}
                max={36}
                onChange={(v) => handleFontSizePtChange('nameSizePt', v)}
              />
              <PtSizeSlider
                label={t('builder.formatting.contactSizePt')}
                value={settings.fontSize.contactSizePt}
                min={6}
                max={16}
                onChange={(v) => handleFontSizePtChange('contactSizePt', v)}
              />
              <PtSizeSlider
                label={t('builder.formatting.bodySizePt')}
                value={settings.fontSize.bodySizePt}
                min={6}
                max={16}
                onChange={(v) => handleFontSizePtChange('bodySizePt', v)}
              />
            </div>
          </div>

          {/* Text Style Section */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft">
              {t('builder.formatting.textStyle')}
            </h4>
            <div className="space-y-2">
              <StyleToggleRow
                label={t('builder.formatting.styleSection')}
                bold={settings.textStyle.sectionHeaderBold}
                italic={settings.textStyle.sectionHeaderItalic}
                onBold={(v) => handleTextStyleChange('sectionHeaderBold', v)}
                onItalic={(v) => handleTextStyleChange('sectionHeaderItalic', v)}
              />
              <StyleToggleRow
                label={t('builder.formatting.stylePosition')}
                bold={settings.textStyle.itemTitleBold}
                italic={settings.textStyle.itemTitleItalic}
                onBold={(v) => handleTextStyleChange('itemTitleBold', v)}
                onItalic={(v) => handleTextStyleChange('itemTitleItalic', v)}
              />
              <StyleToggleRow
                label={t('builder.formatting.styleCompany')}
                bold={settings.textStyle.itemSubtitleBold}
                italic={settings.textStyle.itemSubtitleItalic}
                onBold={(v) => handleTextStyleChange('itemSubtitleBold', v)}
                onItalic={(v) => handleTextStyleChange('itemSubtitleItalic', v)}
              />
            </div>
          </div>

          {/* Options Section */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft">
              {t('builder.formatting.options')}
            </h4>
            <div className="space-y-3">
              {/* Compact Mode Toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  onClick={handleCompactModeToggle}
                  className={`relative w-10 h-5 border-2 transition-all ${
                    settings.compactMode
                      ? 'bg-blue-700 border-blue-700'
                      : 'bg-white border-steel-grey'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-3.5 h-3.5 bg-white border transition-all ${
                      settings.compactMode ? 'left-5 border-blue-700' : 'left-0.5 border-steel-grey'
                    }`}
                  />
                </button>
                <span className="font-mono text-xs text-ink-soft">
                  {t('builder.formatting.compactMode')}
                </span>
              </label>

              {/* Show Contact Icons Toggle */}
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  onClick={handleShowContactIconsToggle}
                  className={`relative w-10 h-5 border-2 transition-all ${
                    settings.showContactIcons
                      ? 'bg-blue-700 border-blue-700'
                      : 'bg-white border-steel-grey'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-3.5 h-3.5 bg-white border transition-all ${
                      settings.showContactIcons
                        ? 'left-5 border-blue-700'
                        : 'left-0.5 border-steel-grey'
                    }`}
                  />
                </button>
                <span className="font-mono text-xs text-ink-soft">
                  {t('builder.formatting.contactIcons')}
                </span>
              </label>
            </div>
          </div>

          {/* QR Code Section */}
          <div>
            <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft">
              QR Code
            </h4>
            <div className="space-y-3">
              <label className="flex items-center gap-3 cursor-pointer">
                <button
                  onClick={handleQrToggle}
                  className={`relative w-10 h-5 border-2 transition-all ${
                    settings.qrCode.enabled
                      ? 'bg-blue-700 border-blue-700'
                      : 'bg-white border-steel-grey'
                  }`}
                >
                  <span
                    className={`absolute top-0.5 w-3.5 h-3.5 bg-white border transition-all ${
                      settings.qrCode.enabled
                        ? 'left-5 border-blue-700'
                        : 'left-0.5 border-steel-grey'
                    }`}
                  />
                </button>
                <span className="font-mono text-xs text-ink-soft">Show QR code</span>
              </label>
              {settings.qrCode.enabled && (
                <>
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-xs w-12 text-ink-soft">URL:</span>
                    <input
                      type="url"
                      value={settings.qrCode.url}
                      onChange={(e) => handleQrUrlChange(e.target.value)}
                      placeholder="https://example.com"
                      className="flex-1 px-2 py-1 border border-steel-grey font-mono text-xs bg-white focus:outline-none focus:border-blue-700"
                    />
                  </div>
                  <div className="font-mono text-[10px] text-steel-grey">
                    Drag the QR on the preview to reposition. Drag a corner to resize (always
                    square).
                  </div>
                  <div className="font-mono text-[10px] text-ink-soft">
                    Position: {settings.qrCode.xMm.toFixed(0)}mm, {settings.qrCode.yMm.toFixed(0)}mm
                    &nbsp;·&nbsp; Size: {settings.qrCode.sizeMm.toFixed(0)}mm
                  </div>
                </>
              )}
            </div>
          </div>

          {/* Reset Button */}
          <div className="pt-2 border-t border-paper-tint space-y-3">
            <div>
              <h4 className="font-mono text-[10px] font-bold uppercase tracking-wider text-ink-soft mb-2">
                {t('builder.formatting.effectiveOutput')}
              </h4>
              <div className="font-mono text-[10px] text-ink-soft space-y-1">
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
                  {Number.isInteger(settings.fontSize.baseSizePt)
                    ? settings.fontSize.baseSizePt
                    : settings.fontSize.baseSizePt.toFixed(1)}
                  pt
                </div>
                <div>
                  {t('builder.formatting.effectiveHeaderScale')}:{' '}
                  {Number.isInteger(settings.fontSize.sectionHeaderSizePt)
                    ? settings.fontSize.sectionHeaderSizePt
                    : settings.fontSize.sectionHeaderSizePt.toFixed(1)}
                  pt
                </div>
                <div>
                  {t('builder.formatting.effectiveHeaderFont')}:{' '}
                  {getFontLabel(settings.fontSize.headerFont)}
                </div>
                <div>
                  {t('builder.formatting.effectiveBodyFont')}:{' '}
                  {getFontLabel(settings.fontSize.bodyFont)}
                </div>
                <div>
                  {t('builder.formatting.effectiveNameSize')}:{' '}
                  {Number.isInteger(settings.fontSize.nameSizePt)
                    ? settings.fontSize.nameSizePt
                    : settings.fontSize.nameSizePt.toFixed(1)}
                  pt
                </div>
                <div>
                  {t('builder.formatting.effectiveContactSize')}:{' '}
                  {Number.isInteger(settings.fontSize.contactSizePt)
                    ? settings.fontSize.contactSizePt
                    : settings.fontSize.contactSizePt.toFixed(1)}
                  pt
                </div>
                <div>
                  {t('builder.formatting.effectiveBodySize')}:{' '}
                  {Number.isInteger(settings.fontSize.bodySizePt)
                    ? settings.fontSize.bodySizePt
                    : settings.fontSize.bodySizePt.toFixed(1)}
                  pt
                </div>
              </div>
              {settings.compactMode && (
                <div className="font-mono text-[10px] text-steel-grey mt-2">
                  {t('builder.formatting.compactHint')}
                </div>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={handleReset} className="w-full">
              <RotateCcw className="w-3 h-3" />
              {t('builder.formatting.resetDefaults')}
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
      <span className="font-mono text-xs w-12 text-ink-soft">{label}:</span>
      <input
        type="range"
        min={5}
        max={25}
        value={value}
        onChange={(e) => onChange(parseInt(e.target.value, 10))}
        className="flex-1 h-1 bg-paper-tint rounded-none appearance-none cursor-pointer
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
      <span className="font-mono text-xs w-6 text-right text-ink-soft">{value}</span>
    </div>
  );
};

/**
 * Pt Size Slider Component
 *
 * Range input for direct pt font-size values.
 */
interface PtSizeSliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (value: number) => void;
}

const PtSizeSlider: React.FC<PtSizeSliderProps> = ({ label, value, min, max, onChange }) => {
  const display = Number.isInteger(value) ? String(value) : value.toFixed(1);
  return (
    <div className="flex items-center gap-2">
      <span className="font-mono text-xs w-16 text-ink-soft">{label}:</span>
      <input
        type="range"
        min={min}
        max={max}
        step={0.5}
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="flex-1 h-1 bg-paper-tint rounded-none appearance-none cursor-pointer
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
      <span className="font-mono text-xs w-8 text-right text-ink-soft">{display}pt</span>
    </div>
  );
};

/**
 * Style Toggle Row Component
 *
 * Bold / Italic toggle buttons for a labelled element group.
 */
interface StyleToggleRowProps {
  label: string;
  bold: boolean;
  italic: boolean;
  onBold: (v: boolean) => void;
  onItalic: (v: boolean) => void;
}

const StyleToggleRow: React.FC<StyleToggleRowProps> = ({
  label,
  bold,
  italic,
  onBold,
  onItalic,
}) => (
  <div className="flex items-center gap-2">
    <span className="font-mono text-xs w-16 text-ink-soft truncate">{label}:</span>
    <div className="flex gap-1">
      <button
        onClick={() => onBold(!bold)}
        className={`w-6 h-6 font-serif text-xs font-bold border transition-all ${
          bold
            ? 'bg-blue-700 text-white border-blue-700 shadow-sw-xs'
            : 'bg-white text-ink-soft border-steel-grey hover:border-black'
        }`}
        title="Bold"
      >
        B
      </button>
      <button
        onClick={() => onItalic(!italic)}
        className={`w-6 h-6 font-serif text-xs italic border transition-all ${
          italic
            ? 'bg-blue-700 text-white border-blue-700 shadow-sw-xs'
            : 'bg-white text-ink-soft border-steel-grey hover:border-black'
        }`}
        title="Italic"
      >
        I
      </button>
    </div>
  </div>
);

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
      <span className="font-mono text-xs w-16 text-ink-soft">{label}:</span>
      <div className="flex gap-1">
        {levels.map((level) => (
          <button
            key={level}
            onClick={() => onChange(level)}
            className={`w-6 h-6 font-mono text-xs border transition-all ${
              value === level
                ? 'bg-blue-700 text-white border-blue-700 shadow-sw-xs'
                : 'bg-white text-ink-soft border-steel-grey hover:border-black'
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
