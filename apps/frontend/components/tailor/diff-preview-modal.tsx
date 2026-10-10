'use client';

import { useState, useEffect, useRef } from 'react';
import { AlertTriangle, X, ChevronDown, ChevronRight, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Alert } from '@/components/ui/alert';
import { PanelHeader } from '@/components/ui/panel-header';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslations } from '@/lib/i18n';
import type {
  ResumeDiffSummary,
  ResumeFieldDiff,
} from '@/components/common/resume_previewer_context';
import type { BulletSelectionSummary } from '@/lib/api/resume';

interface DiffPreviewModalProps {
  isOpen: boolean;
  isConfirming?: boolean;
  onClose: () => void;
  onReject: () => void;
  onConfirm: () => void;
  diffSummary?: ResumeDiffSummary;
  detailedChanges?: ResumeFieldDiff[];
  errorMessage?: string;
  selectionSummary?: BulletSelectionSummary | null;
}

export function DiffPreviewModal({
  isOpen,
  isConfirming = false,
  onClose,
  onReject,
  onConfirm,
  diffSummary,
  detailedChanges,
  errorMessage,
  selectionSummary,
}: DiffPreviewModalProps) {
  const { t } = useTranslations();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['summary', 'skills', 'descriptions', 'experience'])
  );

  // Elapsed timer while confirming
  const [elapsed, setElapsed] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (isConfirming) {
      setElapsed(0);
      intervalRef.current = setInterval(() => setElapsed((s) => s + 1), 1000);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
      setElapsed(0);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isConfirming]);

  if (!diffSummary || !detailedChanges) {
    return (
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open && !isConfirming) {
            onClose();
          }
        }}
      >
        <DialogContent size="xl">
          <DialogHeader>
            <DialogTitle>{t('tailor.missingDiffDialog.title')}</DialogTitle>
          </DialogHeader>

          <DialogBody className="space-y-3">
            <div className="border-2 border-ink bg-white p-4 text-sm text-ink-soft">
              {t('tailor.missingDiffDialog.description')}
            </div>
            <div className="flex items-center gap-2 font-mono text-xs text-warning-text">
              <AlertTriangle className="size-4" />
              <span>{t('tailor.missingDiffDialog.confirmLabel')}</span>
            </div>
          </DialogBody>

          <DialogFooter>
            <Button variant="outline" onClick={onClose} disabled={isConfirming}>
              {t('common.cancel')}
            </Button>
            <Button variant="warning" onClick={onConfirm} disabled={isConfirming}>
              {isConfirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                t('tailor.missingDiffDialog.confirmLabel')
              )}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    );
  }

  const toggleSection = (section: string) => {
    const newExpanded = new Set(expandedSections);
    if (newExpanded.has(section)) {
      newExpanded.delete(section);
    } else {
      newExpanded.add(section);
    }
    setExpandedSections(newExpanded);
  };

  const selectionLine = selectionSummary ? formatSelectionSummary(selectionSummary, t) : null;

  // Group changes by type
  const summaryChanges = detailedChanges.filter((c) => c.field_type === 'summary');
  const skillChanges = detailedChanges.filter((c) => c.field_type === 'skill');
  const descChanges = detailedChanges.filter((c) => c.field_type === 'description');
  const certChanges = detailedChanges.filter((c) => c.field_type === 'certification');
  const experienceChanges = detailedChanges.filter((c) => c.field_type === 'experience');
  const educationChanges = detailedChanges.filter((c) => c.field_type === 'education');
  const projectChanges = detailedChanges.filter((c) => c.field_type === 'project');
  const languageChanges = detailedChanges.filter((c) => c.field_type === 'language');
  const awardChanges = detailedChanges.filter((c) => c.field_type === 'award');

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open && !isConfirming) {
          onClose();
        }
      }}
    >
      <DialogContent size="xl">
        <DialogHeader>
          <DialogTitle>{t('tailor.diffModal.title')}</DialogTitle>
          <p className="font-mono text-xs text-ink-soft">
            {'// '}
            {t('tailor.diffModal.subtitle')}
          </p>
        </DialogHeader>

        <DialogBody className="space-y-4">
          {/* Summary cards */}
          <div className="border-2 border-ink bg-white p-4">
            <PanelHeader level="h3" title={t('tailor.diffModal.summary')} />

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-4">
              <StatCard
                label={t('tailor.diffModal.skillsAdded')}
                value={diffSummary.skills_added}
                variant="success"
              />
              <StatCard
                label={t('tailor.diffModal.skillsRemoved')}
                value={diffSummary.skills_removed}
                variant="warning"
              />
              <StatCard
                label={t('tailor.diffModal.certificationsAdded')}
                value={diffSummary.certifications_added}
                variant="info"
              />
              <StatCard
                label={t('tailor.diffModal.descriptionsModified')}
                value={diffSummary.descriptions_modified}
                variant="info"
              />
              <StatCard
                label={t('tailor.diffModal.highRiskChanges')}
                value={diffSummary.high_risk_changes}
                variant={diffSummary.high_risk_changes > 0 ? 'danger' : 'success'}
              />
            </div>

            {selectionLine && (
              <p className="mt-4 font-mono text-xs uppercase tracking-wider text-ink-soft">
                {selectionLine}
              </p>
            )}

            {diffSummary.high_risk_changes > 0 && (
              <div className="mt-4 flex items-start gap-3 border-2 border-warning bg-warning-tint p-3">
                <AlertTriangle className="size-5 shrink-0 text-warning-text" />
                <div>
                  <p className="font-mono text-xs font-bold uppercase tracking-wider text-warning-text">
                    {t('tailor.diffModal.warningTitle', {
                      count: diffSummary.high_risk_changes,
                    })}
                  </p>
                  <p className="mt-1 text-sm text-ink-soft">
                    {t('tailor.diffModal.warningMessage')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {/* Detailed changes list */}
          <div className="space-y-4">
            {/* Summary changes */}
            {summaryChanges.length > 0 && (
              <ChangeSection
                title={t('tailor.diffModal.summaryChanges')}
                count={summaryChanges.length}
                isExpanded={expandedSections.has('summary')}
                onToggle={() => toggleSection('summary')}
              >
                {summaryChanges.map((change, idx) => (
                  <ChangeItem key={idx} change={change} />
                ))}
              </ChangeSection>
            )}

            {/* Skill changes */}
            {skillChanges.length > 0 && (
              <ChangeSection
                title={t('tailor.diffModal.skillChanges')}
                count={skillChanges.length}
                isExpanded={expandedSections.has('skills')}
                onToggle={() => toggleSection('skills')}
              >
                {skillChanges.map((change, idx) => (
                  <ChangeItem key={idx} change={change} />
                ))}
              </ChangeSection>
            )}

            {/* Experience changes */}
            {experienceChanges.length > 0 && (
              <ChangeSection
                title={t('tailor.diffModal.experienceChanges')}
                count={experienceChanges.length}
                isExpanded={expandedSections.has('experience')}
                onToggle={() => toggleSection('experience')}
              >
                {experienceChanges.map((change, idx) => (
                  <ChangeItem key={idx} change={change} />
                ))}
              </ChangeSection>
            )}

            {/* Description changes */}
            {descChanges.length > 0 && (
              <ChangeSection
                title={t('tailor.diffModal.descriptionChanges')}
                count={descChanges.length}
                isExpanded={expandedSections.has('descriptions')}
                onToggle={() => toggleSection('descriptions')}
              >
                {descChanges.map((change, idx) => (
                  <ChangeItem key={idx} change={change} />
                ))}
              </ChangeSection>
            )}

            {/* Education changes */}
            {educationChanges.length > 0 && (
              <ChangeSection
                title={t('tailor.diffModal.educationChanges')}
                count={educationChanges.length}
                isExpanded={expandedSections.has('education')}
                onToggle={() => toggleSection('education')}
              >
                {educationChanges.map((change, idx) => (
                  <ChangeItem key={idx} change={change} />
                ))}
              </ChangeSection>
            )}

            {/* Project changes */}
            {projectChanges.length > 0 && (
              <ChangeSection
                title={t('tailor.diffModal.projectChanges')}
                count={projectChanges.length}
                isExpanded={expandedSections.has('project')}
                onToggle={() => toggleSection('project')}
              >
                {projectChanges.map((change, idx) => (
                  <ChangeItem key={idx} change={change} />
                ))}
              </ChangeSection>
            )}

            {/* Certification changes */}
            {certChanges.length > 0 && (
              <ChangeSection
                title={t('tailor.diffModal.certificationChanges')}
                count={certChanges.length}
                isExpanded={expandedSections.has('certifications')}
                onToggle={() => toggleSection('certifications')}
              >
                {certChanges.map((change, idx) => (
                  <ChangeItem key={idx} change={change} />
                ))}
              </ChangeSection>
            )}

            {/* Language changes */}
            {languageChanges.length > 0 && (
              <ChangeSection
                title={t('tailor.diffModal.languageChanges')}
                count={languageChanges.length}
                isExpanded={expandedSections.has('languages')}
                onToggle={() => toggleSection('languages')}
              >
                {languageChanges.map((change, idx) => (
                  <ChangeItem key={idx} change={change} />
                ))}
              </ChangeSection>
            )}

            {/* Award changes */}
            {awardChanges.length > 0 && (
              <ChangeSection
                title={t('tailor.diffModal.awardChanges')}
                count={awardChanges.length}
                isExpanded={expandedSections.has('awards')}
                onToggle={() => toggleSection('awards')}
              >
                {awardChanges.map((change, idx) => (
                  <ChangeItem key={idx} change={change} />
                ))}
              </ChangeSection>
            )}
          </div>
        </DialogBody>

        {/* Pinned status: stays visible while the changes list scrolls */}
        {errorMessage && (
          <div className="shrink-0 space-y-2 border-t border-ink px-6 py-3">
            <Alert tone="error">{errorMessage}</Alert>
          </div>
        )}

        {/* Action buttons */}
        <DialogFooter className="justify-between">
          <Button variant="outline" onClick={onReject} disabled={isConfirming}>
            <X className="w-4 h-4" />
            {t('tailor.diffModal.rejectButton')}
          </Button>
          <div className="flex items-center gap-3">
            {isConfirming && elapsed > 0 && (
              <span className="font-mono text-xs tabular-nums text-ink-soft">{elapsed}s</span>
            )}
            <Button variant="success" onClick={onConfirm} disabled={isConfirming}>
              {isConfirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                t('tailor.diffModal.confirmButton')
              )}
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// Helper: one-line "kept X of Y bullets" summary with the page-fit outcome
function formatSelectionSummary(
  summary: BulletSelectionSummary,
  t: (key: string, params?: Record<string, string | number>) => string
): string {
  const kept =
    summary.max_per_entry == null
      ? t('tailor.selectionSummaryAll', {
          kept: summary.bullets_after,
          total: summary.bullets_before,
        })
      : t('tailor.selectionSummary', {
          kept: summary.bullets_after,
          total: summary.bullets_before,
          max: summary.max_per_entry,
        });
  if (summary.page_fit === 'skipped') return kept;
  const fitBeforeRewrite = summary.page_fit === 'fits' || summary.page_fit === 'trimmed';
  // Without the final re-render, the page fit of the rewritten result is unverified.
  if (fitBeforeRewrite && summary.final_check === 'skipped') {
    return `${kept} · ${t('tailor.pageFit.notRechecked')}`;
  }
  // A draft that fit before rewriting can still spill over; the final check reports it.
  const maxPages = summary.max_pages ?? 1;
  const finalOver =
    fitBeforeRewrite && summary.final_pages != null && summary.final_pages > maxPages;
  const fit = finalOver
    ? t('tailor.pageFit.finalOver')
    : summary.page_fit === 'trimmed'
      ? t('tailor.pageFit.trimmed', { count: summary.trimmed_for_fit })
      : t(`tailor.pageFit.${summary.page_fit}`);
  return `${kept} · ${fit}`;
}

// Helper component: stat card
interface StatCardProps {
  label: string;
  value: number;
  variant: 'success' | 'warning' | 'danger' | 'info';
}

function StatCard({ label, value, variant }: StatCardProps) {
  const colors = {
    success: 'border-success bg-success-tint text-success',
    warning: 'border-warning bg-warning-tint text-warning-text',
    danger: 'border-destructive bg-destructive-tint text-destructive',
    info: 'border-primary bg-info-tint text-primary',
  };

  return (
    <div className={`border-2 p-3 ${colors[variant]}`}>
      <div className="font-mono text-2xl font-bold tabular-nums">{value}</div>
      <div className="font-mono text-xs uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

// Helper component: collapsible change section
interface ChangeSectionProps {
  title: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function ChangeSection({ title, count, isExpanded, onToggle, children }: ChangeSectionProps) {
  return (
    <div className="border-2 border-ink bg-white">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={isExpanded}
        className="flex w-full items-center justify-between p-3 transition-colors hover:bg-panel focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronDown className="size-4" /> : <ChevronRight className="size-4" />}
          <span className="font-mono text-sm font-bold uppercase tracking-wider tabular-nums">
            {title} ({count})
          </span>
        </div>
      </button>

      {isExpanded && <div className="space-y-3 border-t-2 border-ink p-4">{children}</div>}
    </div>
  );
}

// Helper component: change item
interface ChangeItemProps {
  change: ResumeFieldDiff;
}

function ChangeItem({ change }: ChangeItemProps) {
  // Background tint + leading glyph instead of left-stripe borders.
  // Side-stripe borders are an impeccable absolute_ban (BAN 1) — the most
  // overused dashboard "design touch". The leading +/-/~ glyph carries the
  // semantic load and the bg tint reinforces it.
  const typeBackgrounds = {
    added: 'bg-success-tint',
    removed: 'bg-destructive-tint',
    modified: 'bg-info-tint',
  };

  const typeGlyphColors = {
    added: 'text-success',
    removed: 'text-destructive',
    modified: 'text-primary',
  };

  const typeLabels = {
    added: '+',
    removed: '-',
    modified: '~',
  };

  return (
    <div className={`border border-ink p-3 ${typeBackgrounds[change.change_type]}`}>
      <div className="flex items-start gap-2">
        <span
          className={`font-mono text-base font-bold uppercase tracking-wider ${typeGlyphColors[change.change_type]}`}
          aria-hidden="true"
        >
          {typeLabels[change.change_type]}
        </span>
        <div className="flex-1">
          {change.original_value && (
            <div className="mb-1 text-sm text-destructive line-through">
              {change.original_value}
            </div>
          )}
          {change.new_value && <div className="text-sm text-ink-soft">{change.new_value}</div>}
        </div>
        {change.change_type === 'added' && change.confidence === 'high' && (
          <AlertTriangle className="size-4 shrink-0 text-warning-text" />
        )}
      </div>
    </div>
  );
}
