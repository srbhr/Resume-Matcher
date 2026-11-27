'use client';

import React, { useId, useState } from 'react';
import { Button } from '@/components/ui/button';
import { SegmentedControl } from '@/components/ui/segmented-control';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { RangeSlider } from '@/components/ui/range-slider';
import { cn } from '@/lib/utils';
import { CaretDown, CaretUp, ArrowCounterClockwise } from '@phosphor-icons/react';
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
  LINK_STYLES,
  LINK_STYLE_TEMPLATES,
  LIST_STYLE_ROWS,
  type ListRow,
  type ListStyle,
} from '@/lib/types/template-settings';

/** Each list row is named as the resume names its section. */
const LIST_ROW_LABELS: Record<ListRow, string> = {
  skills: 'resume.sections.skillsOnly',
  languages: 'resume.sections.languages',
  certifications: 'resume.sections.certifications',
  awards: 'resume.sections.awards',
};
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
    Number.parseFloat(SECTION_SPACING_MAP[settings.spacing.section]) * compactMultiplier;
  const itemGapRem = Number.parseFloat(ITEM_SPACING_MAP[settings.spacing.item]) * compactMultiplier;
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

  // "Same on all sides" starts on when the four margins already match.
  const [marginsLinked, setMarginsLinked] = useState(() => {
    const { top, bottom, left, right } = settings.margins;
    return top === bottom && top === left && top === right;
  });

  const handleAllMarginsChange = (value: number) => {
    onChange({ ...settings, margins: { top: value, bottom: value, left: value, right: value } });
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
      'vivid-single': {
        name: t('builder.formatting.templates.vividSingle.name'),
        description: t('builder.formatting.templates.vividSingle.description'),
      },
      'modern-deedy': {
        name: t('builder.formatting.templates.modernDeedy.name'),
        description: t('builder.formatting.templates.modernDeedy.description'),
      },
      deedy: {
        name: t('builder.formatting.templates.deedy.name'),
        description: t('builder.formatting.templates.deedy.description'),
      },
    }),
    [t]
  );

  // Settings saved before these options existed have neither; they print the defaults.
  const linkStyle = settings.linkStyle ?? DEFAULT_TEMPLATE_SETTINGS.linkStyle;
  const listStyle = { ...DEFAULT_TEMPLATE_SETTINGS.listStyle, ...settings.listStyle };
  const listRows = LIST_STYLE_ROWS[settings.template] ?? [];

  const spacingEnds: [string, string] = [
    t('builder.formatting.tight'),
    t('builder.formatting.loose'),
  ];

  const getFontLabel = (font: HeaderFontFamily | BodyFontFamily) => {
    if (font === 'sans-serif') return t('builder.formatting.fontNames.sans');
    if (font === 'serif') return t('builder.formatting.fontNames.serif');
    return t('builder.formatting.fontNames.mono');
  };

  const { top, bottom, left, right } = settings.margins;
  const effectiveRows: Array<[string, string]> = [
    [
      t('builder.formatting.margins'),
      `${t('builder.formatting.margin.top')} ${top} · ${t('builder.formatting.margin.bottom')} ${bottom} · ${t('builder.formatting.margin.left')} ${left} · ${t('builder.formatting.margin.right')} ${right}`,
    ],
    [t('builder.formatting.effectiveSectionGap'), formatRem(sectionGapRem)],
    [t('builder.formatting.effectiveItemGap'), formatRem(itemGapRem)],
    [t('builder.formatting.effectiveLineHeight'), lineHeightValue.toFixed(2)],
    [t('builder.formatting.effectiveBaseFont'), FONT_SIZE_MAP[settings.fontSize.base]],
    [
      t('builder.formatting.effectiveHeaderScale'),
      `${HEADER_SCALE_MAP[settings.fontSize.headerScale]}x`,
    ],
    [t('builder.formatting.effectiveHeaderFont'), getFontLabel(settings.fontSize.headerFont)],
    [t('builder.formatting.effectiveBodyFont'), getFontLabel(settings.fontSize.bodyFont)],
  ];

  return (
    <div className="border border-ink bg-white shadow-sw-nested">
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
          <CaretUp aria-hidden="true" className="size-4 text-steel" />
        ) : (
          <CaretDown aria-hidden="true" className="size-4 text-steel" />
        )}
      </button>

      {/* Expandable Content */}
      {isExpanded && (
        <div id={contentId} className="@container border-t border-ink p-4 space-y-6">
          {/* Template Selection */}
          <div>
            <h4
              id={`${contentId}-template`}
              className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft"
            >
              {t('builder.formatting.template')}
            </h4>
            {/* Tiles fill the panel's width (no dead strip), at least 6.5rem each. The
                selected tile's name sits on an ink band; every name area is two lines
                tall, so the tiles match. */}
            <SegmentedControl
              variant="tile"
              size="sm"
              aria-labelledby={`${contentId}-template`}
              className="grid grid-cols-[repeat(auto-fill,minmax(6.5rem,1fr))] gap-3"
              value={settings.template}
              onChange={handleTemplateChange}
              items={TEMPLATE_OPTIONS.map((template) => {
                const selected = settings.template === template.id;
                return {
                  value: template.id,
                  title: templateLabels[template.id].description,
                  label: (
                    <span className="flex w-full flex-col">
                      <span className="flex justify-center p-2">
                        <TemplateThumbnail type={template.id} isActive={selected} />
                      </span>
                      <span
                        className={cn(
                          'flex min-h-10 items-center justify-center border-t border-ink px-1 text-center font-bold leading-tight whitespace-normal text-balance',
                          selected && 'bg-ink text-white'
                        )}
                      >
                        {templateLabels[template.id].name}
                      </span>
                    </span>
                  ),
                };
              })}
            />
          </div>

          {/* Accent Color Selection - Visible for Modern templates */}
          {(settings.template === 'modern' ||
            settings.template === 'modern-two-column' ||
            settings.template === 'vivid' ||
            settings.template === 'vivid-single') && (
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
            <div className="mb-3 flex items-center justify-between gap-4">
              <h4 className="font-mono text-xs font-bold uppercase tracking-wider text-ink-soft">
                {t('builder.formatting.margins')}
              </h4>
              <Button
                variant="link"
                size="sm"
                className="h-auto px-0"
                onClick={() =>
                  onChange({ ...settings, margins: { ...DEFAULT_TEMPLATE_SETTINGS.margins } })
                }
              >
                {t('builder.formatting.resetMargins')}
              </Button>
            </div>
            <div className="space-y-3">
              <ToggleSwitch
                variant="inline"
                label={t('builder.formatting.marginsLinked')}
                checked={marginsLinked}
                onCheckedChange={(linked) => {
                  setMarginsLinked(linked);
                  // Linking takes the top margin for every side.
                  if (linked) handleAllMarginsChange(settings.margins.top);
                }}
              />
              {marginsLinked ? (
                <MarginSlider
                  label={t('builder.formatting.margin.all')}
                  value={settings.margins.top}
                  onChange={handleAllMarginsChange}
                />
              ) : (
                <div className="grid grid-cols-1 gap-x-6 gap-y-3 @md:grid-cols-2">
                  {(['top', 'bottom', 'left', 'right'] as const).map((side) => (
                    <MarginSlider
                      key={side}
                      label={t(`builder.formatting.margin.${side}`)}
                      value={settings.margins[side]}
                      onChange={(v) => handleMarginChange(side, v)}
                    />
                  ))}
                </div>
              )}
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
                ends={spacingEnds}
              />
              <SpacingSelector
                label={t('builder.formatting.spacingItems')}
                value={settings.spacing.item}
                onChange={(v) => handleSpacingChange('item', v)}
                ends={spacingEnds}
              />
              <SpacingSelector
                label={t('builder.formatting.spacingLines')}
                value={settings.spacing.lineHeight}
                onChange={(v) => handleSpacingChange('lineHeight', v)}
                ends={spacingEnds}
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
                  className="w-32 shrink-0 font-mono text-xs text-ink-soft"
                >
                  {t('builder.formatting.headerFontFamily')}
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
                  className="w-32 shrink-0 font-mono text-xs text-ink-soft"
                >
                  {t('builder.formatting.bodyFontFamily')}
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

          {/* Project links: how GitHub and website links print, where the template shows them. */}
          {LINK_STYLE_TEMPLATES.has(settings.template) && (
            <div>
              <h4
                id={`${contentId}-links`}
                className="font-mono text-xs font-bold uppercase tracking-wider mb-1 text-ink-soft"
              >
                {t('builder.formatting.links')}
              </h4>
              <p className="mb-3 text-xs text-steel">{t('builder.formatting.linksHint')}</p>
              <SegmentedControl
                size="sm"
                aria-labelledby={`${contentId}-links`}
                className="gap-1"
                value={linkStyle}
                onChange={(value) => onChange({ ...settings, linkStyle: value })}
                items={LINK_STYLES.map((style) => ({
                  value: style,
                  label: t(`builder.formatting.linkStyles.${style}`),
                }))}
              />
            </div>
          )}

          {/* Lists: pills or one comma-separated line, row by row, where the template draws pills. */}
          {listRows.length > 0 && (
            <div>
              <h4 className="font-mono text-xs font-bold uppercase tracking-wider mb-3 text-ink-soft">
                {t('builder.formatting.lists')}
              </h4>
              <div className="space-y-3">
                {listRows.map((row) => (
                  <ListStyleRow
                    key={row}
                    label={t(LIST_ROW_LABELS[row])}
                    value={listStyle[row]}
                    pills={t('builder.formatting.listStyles.pills')}
                    commas={t('builder.formatting.listStyles.comma')}
                    onChange={(value) =>
                      onChange({ ...settings, listStyle: { ...listStyle, [row]: value } })
                    }
                  />
                ))}
              </div>
            </div>
          )}

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
            {/* The numbers the settings produce, for whoever wants them: closed until
                asked for, then a two-column table. */}
            <details className="group border border-ink bg-white">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 px-3 py-2 font-mono text-xs font-bold uppercase tracking-wider text-ink-soft hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary [&::-webkit-details-marker]:hidden">
                {t('builder.formatting.effectiveOutput')}
                <CaretDown
                  aria-hidden="true"
                  className="size-4 text-steel transition-transform group-open:rotate-180"
                />
              </summary>
              <table className="w-full border-t border-ink font-mono text-xs tabular-nums">
                <tbody>
                  {effectiveRows.map(([label, value]) => (
                    <tr key={label} className="border-t border-panel-hover first:border-t-0">
                      <th scope="row" className="px-3 py-2 text-left font-normal text-ink-soft">
                        {label}
                      </th>
                      <td className="px-3 py-2 text-right text-ink">{value}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {settings.compactMode && (
                <p className="border-t border-ink px-3 py-2 font-mono text-xs text-steel">
                  {t('builder.formatting.compactHint')}
                </p>
              )}
            </details>
            <Button variant="outline" size="sm" onClick={handleReset} className="w-full">
              <ArrowCounterClockwise aria-hidden="true" />
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
 * One margin: label, slider and a number field in mm that edit the same value
 * (5-25mm). Typing past either end is held to it.
 */
interface MarginSliderProps {
  label: string;
  value: number;
  onChange: (value: number) => void;
}

const MARGIN_MIN = 5;
const MARGIN_MAX = 25;

const MarginSlider: React.FC<MarginSliderProps> = ({ label, value, onChange }) => {
  const sliderId = useId();
  const clamp = (n: number) => Math.min(MARGIN_MAX, Math.max(MARGIN_MIN, Math.round(n)));
  return (
    <div className="flex items-center gap-3">
      <label htmlFor={sliderId} className="w-16 shrink-0 font-mono text-xs text-ink-soft">
        {label}
      </label>
      <RangeSlider
        id={sliderId}
        min={MARGIN_MIN}
        max={MARGIN_MAX}
        value={value}
        onChange={(e) => onChange(Number.parseInt(e.target.value, 10))}
      />
      <span className="flex shrink-0 items-center gap-1">
        <input
          type="number"
          inputMode="numeric"
          min={MARGIN_MIN}
          max={MARGIN_MAX}
          value={value}
          aria-label={`${label} (mm)`}
          onChange={(e) => {
            const n = Number(e.target.value);
            if (e.target.value !== '' && Number.isFinite(n)) onChange(clamp(n));
          }}
          className="h-8 w-12 border border-ink bg-white px-1 text-right font-mono text-xs tabular-nums text-ink focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary"
        />
        <span aria-hidden="true" className="font-mono text-xs text-steel">
          mm
        </span>
      </span>
    </div>
  );
};

/**
 * Spacing Selector Component
 *
 * Segmented control for selecting levels 1-5, with optional captions at the two
 * ends ("Tight" ... "Loose") saying which way the scale runs.
 */
interface SpacingSelectorProps {
  label: string;
  value: SpacingLevel;
  onChange: (value: SpacingLevel) => void;
  ends?: [string, string];
}

const SPACING_LEVELS: SpacingLevel[] = [1, 2, 3, 4, 5];

const SpacingSelector: React.FC<SpacingSelectorProps> = ({ label, value, onChange, ends }) => {
  const labelId = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span id={labelId} className="w-32 shrink-0 font-mono text-xs text-ink-soft">
        {label}
      </span>
      <span className="flex items-center gap-2">
        {ends && (
          <span aria-hidden="true" className="font-mono text-xs text-steel">
            {ends[0]}
          </span>
        )}
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
        {ends && (
          <span aria-hidden="true" className="font-mono text-xs text-steel">
            {ends[1]}
          </span>
        )}
      </span>
    </div>
  );
};

/** One list row: its name, then Pills | Commas. */
const ListStyleRow: React.FC<{
  label: string;
  value: ListStyle;
  pills: string;
  commas: string;
  onChange: (value: ListStyle) => void;
}> = ({ label, value, pills, commas, onChange }) => {
  const labelId = useId();
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
      <span id={labelId} className="w-32 shrink-0 font-mono text-xs text-ink-soft">
        {label}
      </span>
      <SegmentedControl
        size="sm"
        className="gap-1"
        aria-labelledby={labelId}
        value={value}
        onChange={onChange}
        items={[
          { value: 'pills', label: pills },
          { value: 'comma', label: commas },
        ]}
      />
    </div>
  );
};

export default FormattingControls;
