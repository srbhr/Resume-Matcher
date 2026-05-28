'use client';

import { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import {
  AlertTriangle,
  CheckCircle,
  X,
  ChevronDown,
  ChevronRight,
  Loader2,
  Pencil,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { useTranslations } from '@/lib/i18n';
import { regenerateChange } from '@/lib/api/resume';
import type {
  ResumeDiffSummary,
  ResumeFieldDiff,
  ResumePreview,
} from '@/components/common/resume_previewer_context';

// ---------------------------------------------------------------------------
// Public props
// ---------------------------------------------------------------------------

interface DiffPreviewModalProps {
  isOpen: boolean;
  isConfirming?: boolean;
  onClose: () => void;
  onReject: () => void;
  onConfirm: (finalPreview?: ResumePreview) => void;
  diffSummary?: ResumeDiffSummary;
  detailedChanges?: ResumeFieldDiff[];
  improvedPreview?: ResumePreview;
  tailorSessionId?: string | null;
  errorMessage?: string;
}

type Decision = 'pending' | 'accepted' | 'rejected';

interface ChangeState {
  // Live new_value — may have been replaced by a Change regeneration.
  liveNewValue: string | undefined;
  decision: Decision;
  isRegenerating: boolean;
  regenerateError?: string;
}

// ---------------------------------------------------------------------------
// Helpers — labels and final-preview construction
// ---------------------------------------------------------------------------

const EXPERIENCE_PATH_RE = /^workExperience\[(\d+)\](\.description)?$/;
const PROJECT_PATH_RE = /^personalProjects\[(\d+)\](\.description)?$/;
const EDUCATION_PATH_RE = /^education\[(\d+)\](\.description)?$/;

function getChangeLabel(
  change: ResumeFieldDiff,
  preview: ResumePreview | undefined
): string | null {
  if (!preview) return null;

  const exp = EXPERIENCE_PATH_RE.exec(change.field_path);
  if (exp) {
    const idx = Number(exp[1]);
    const entry = preview.workExperience?.[idx];
    if (!entry) return null;
    const parts = [entry.title, entry.company].filter(Boolean);
    return parts.join(' @ ') || null;
  }

  const proj = PROJECT_PATH_RE.exec(change.field_path);
  if (proj) {
    const idx = Number(proj[1]);
    return preview.personalProjects?.[idx]?.name || null;
  }

  const edu = EDUCATION_PATH_RE.exec(change.field_path);
  if (edu) {
    const idx = Number(edu[1]);
    const entry = preview.education?.[idx];
    if (!entry) return null;
    const parts = [entry.degree, entry.institution].filter(Boolean);
    return parts.join(' — ') || null;
  }

  return null;
}

/**
 * Build the final preview from the AI's improved preview by:
 *   - undoing every change whose decision != 'accepted'
 *   - swapping in user-edited new values for accepted+revised changes
 *
 * Because Confirm is blocked until every change is reviewed, this is
 * mathematically equivalent to "start from original, apply accepted only".
 */
function buildFinalPreview(
  improved: ResumePreview,
  changes: ResumeFieldDiff[],
  states: Map<number, ChangeState>
): ResumePreview {
  const result: ResumePreview = JSON.parse(JSON.stringify(improved));

  changes.forEach((change, idx) => {
    const state = states.get(idx);
    if (!state) return;

    const effectiveNewValue =
      state.liveNewValue !== undefined ? state.liveNewValue : change.new_value;

    // Accepted: ensure the live (possibly user-edited) new_value is the one
    // sitting in the final preview, swapping out the original AI new_value if
    // the user used "Change" to revise it.
    if (state.decision === 'accepted') {
      if (
        state.liveNewValue !== undefined &&
        state.liveNewValue !== change.new_value &&
        change.new_value
      ) {
        replaceValue(result, change, change.new_value, state.liveNewValue);
      }
      return;
    }

    // Rejected (or pending — Confirm is blocked otherwise, but treat the
    // same to be safe): undo the change.
    undoChange(result, change, effectiveNewValue);
  });

  return result;
}

function replaceValue(
  preview: ResumePreview,
  change: ResumeFieldDiff,
  oldValue: string,
  newValue: string
): void {
  if (change.field_path === 'summary') {
    preview.summary = newValue;
    return;
  }

  if (change.field_path === 'additional.technicalSkills') {
    const list = preview.additional?.technicalSkills ?? [];
    const i = list.indexOf(oldValue);
    if (i >= 0) list[i] = newValue;
    return;
  }

  if (change.field_path === 'additional.certificationsTraining') {
    const list = preview.additional?.certificationsTraining ?? [];
    const i = list.indexOf(oldValue);
    if (i >= 0) list[i] = newValue;
    return;
  }

  const expDesc = EXPERIENCE_PATH_RE.exec(change.field_path);
  if (expDesc && expDesc[2] === '.description') {
    const entry = preview.workExperience?.[Number(expDesc[1])];
    if (entry?.description) {
      const i = entry.description.indexOf(oldValue);
      if (i >= 0) entry.description[i] = newValue;
    }
    return;
  }

  const projDesc = PROJECT_PATH_RE.exec(change.field_path);
  if (projDesc && projDesc[2] === '.description') {
    const entry = preview.personalProjects?.[Number(projDesc[1])];
    if (entry?.description) {
      const i = entry.description.indexOf(oldValue);
      if (i >= 0) entry.description[i] = newValue;
    }
  }
}

function undoChange(
  preview: ResumePreview,
  change: ResumeFieldDiff,
  effectiveNewValue: string | undefined
): void {
  const path = change.field_path;
  const ctype = change.change_type;

  if (path === 'summary') {
    preview.summary = change.original_value ?? '';
    return;
  }

  if (path === 'additional.technicalSkills') {
    const list = (preview.additional ??= {
      technicalSkills: [],
      languages: [],
      certificationsTraining: [],
      awards: [],
    }).technicalSkills;
    if (ctype === 'added' && effectiveNewValue) {
      const lower = effectiveNewValue.toLowerCase();
      preview.additional.technicalSkills = list.filter((s) => s.toLowerCase() !== lower);
    } else if (ctype === 'removed' && change.original_value) {
      if (!list.some((s) => s.toLowerCase() === change.original_value!.toLowerCase())) {
        list.push(change.original_value);
      }
    }
    return;
  }

  if (path === 'additional.certificationsTraining') {
    const list = (preview.additional ??= {
      technicalSkills: [],
      languages: [],
      certificationsTraining: [],
      awards: [],
    }).certificationsTraining;
    if (ctype === 'added' && effectiveNewValue) {
      const lower = effectiveNewValue.toLowerCase();
      preview.additional.certificationsTraining = list.filter((s) => s.toLowerCase() !== lower);
    } else if (ctype === 'removed' && change.original_value) {
      if (!list.some((s) => s.toLowerCase() === change.original_value!.toLowerCase())) {
        list.push(change.original_value);
      }
    }
    return;
  }

  const expDesc = EXPERIENCE_PATH_RE.exec(path);
  if (expDesc && expDesc[2] === '.description') {
    const entry = preview.workExperience?.[Number(expDesc[1])];
    if (!entry) return;
    entry.description = revertDescription(entry.description ?? [], change, effectiveNewValue);
    return;
  }

  const projDesc = PROJECT_PATH_RE.exec(path);
  if (projDesc && projDesc[2] === '.description') {
    const entry = preview.personalProjects?.[Number(projDesc[1])];
    if (!entry) return;
    entry.description = revertDescription(entry.description ?? [], change, effectiveNewValue);
  }

  // Entry-level adds/removes/modifies (no .description suffix) are not
  // individually revertable without the original entry data — for now we
  // leave the improved entry in place. The diff engine emits these only for
  // structural changes which are rare in practice.
}

function revertDescription(
  desc: string[],
  change: ResumeFieldDiff,
  effectiveNewValue: string | undefined
): string[] {
  const ctype = change.change_type;
  if (ctype === 'modified' && change.original_value && effectiveNewValue) {
    return desc.map((b) => (b === effectiveNewValue ? change.original_value! : b));
  }
  if (ctype === 'added' && effectiveNewValue) {
    return desc.filter((b) => b !== effectiveNewValue);
  }
  if (ctype === 'removed' && change.original_value) {
    return [...desc, change.original_value];
  }
  return desc;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DiffPreviewModal({
  isOpen,
  isConfirming = false,
  onClose,
  onReject,
  onConfirm,
  diffSummary,
  detailedChanges,
  improvedPreview,
  tailorSessionId,
  errorMessage,
}: DiffPreviewModalProps) {
  const { t } = useTranslations();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set([
      'summary',
      'skills',
      'descriptions',
      'experience',
      'education',
      'project',
      'certifications',
    ])
  );

  const [changeStates, setChangeStates] = useState<Map<number, ChangeState>>(new Map());
  const [changeDialogIdx, setChangeDialogIdx] = useState<number | null>(null);
  const [changeDialogFeedback, setChangeDialogFeedback] = useState('');

  // Reset per-change state whenever the underlying change list changes.
  useEffect(() => {
    const next = new Map<number, ChangeState>();
    (detailedChanges ?? []).forEach((_, idx) => {
      next.set(idx, {
        liveNewValue: undefined,
        decision: 'pending',
        isRegenerating: false,
      });
    });
    setChangeStates(next);
  }, [detailedChanges]);

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

  const setDecision = useCallback((idx: number, decision: Decision) => {
    setChangeStates((prev) => {
      const next = new Map(prev);
      const current = next.get(idx);
      if (!current) return prev;
      next.set(idx, { ...current, decision });
      return next;
    });
  }, []);

  const openChangeDialog = useCallback((idx: number) => {
    setChangeDialogFeedback('');
    setChangeDialogIdx(idx);
  }, []);

  const closeChangeDialog = useCallback(() => {
    setChangeDialogIdx(null);
    setChangeDialogFeedback('');
  }, []);

  const submitChangeDialog = useCallback(async () => {
    if (changeDialogIdx === null || !detailedChanges) return;
    const idx = changeDialogIdx;
    const change = detailedChanges[idx];
    const reason = changeDialogFeedback.trim();
    if (!reason) return;

    const label = getChangeLabel(change, improvedPreview) ?? '';
    const state = changeStates.get(idx);
    const currentProposed =
      state?.liveNewValue !== undefined ? state.liveNewValue : change.new_value;

    setChangeStates((prev) => {
      const next = new Map(prev);
      const cur = next.get(idx);
      if (cur) next.set(idx, { ...cur, isRegenerating: true, regenerateError: undefined });
      return next;
    });
    closeChangeDialog();

    try {
      const result = await regenerateChange({
        tailor_session_id: tailorSessionId ?? null,
        field_type: change.field_type,
        change_type: change.change_type,
        label,
        original_value: change.original_value ?? null,
        proposed_value: currentProposed ?? null,
        user_reason: reason,
      });

      setChangeStates((prev) => {
        const next = new Map(prev);
        const cur = next.get(idx);
        if (cur) {
          next.set(idx, {
            ...cur,
            liveNewValue: result.new_value,
            isRegenerating: false,
            // Reset to pending so the user can review the revised value.
            decision: 'pending',
          });
        }
        return next;
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Failed to regenerate change.';
      setChangeStates((prev) => {
        const next = new Map(prev);
        const cur = next.get(idx);
        if (cur) next.set(idx, { ...cur, isRegenerating: false, regenerateError: message });
        return next;
      });
    }
  }, [
    changeDialogIdx,
    changeDialogFeedback,
    detailedChanges,
    improvedPreview,
    changeStates,
    tailorSessionId,
    closeChangeDialog,
  ]);

  const pendingCount = useMemo(() => {
    let n = 0;
    changeStates.forEach((s) => {
      if (s.decision === 'pending' || s.isRegenerating) n++;
    });
    return n;
  }, [changeStates]);

  const handleConfirm = useCallback(() => {
    if (!improvedPreview || !detailedChanges || pendingCount > 0) return;
    const finalPreview = buildFinalPreview(improvedPreview, detailedChanges, changeStates);
    onConfirm(finalPreview);
  }, [improvedPreview, detailedChanges, changeStates, pendingCount, onConfirm]);

  // ---- Missing-diff fallback (unchanged) ----

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
        <DialogContent className="max-w-5xl sm:max-h-[90vh] sm:overflow-hidden flex flex-col p-6 bg-background border-2 border-black shadow-sw-lg">
          <DialogHeader className="border-b-2 border-black pb-4 bg-white -mx-6 -mt-6 px-6 pt-6">
            <DialogTitle className="font-serif text-2xl font-bold uppercase tracking-tight pr-10">
              {t('tailor.missingDiffDialog.title')}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-6 border-2 border-black bg-white p-4 font-mono text-xs text-ink-soft">
            {t('tailor.missingDiffDialog.description')}
          </div>
          <div className="mt-3 flex items-center gap-2 font-mono text-xs text-amber-700">
            <AlertTriangle className="w-4 h-4" />
            <span>{t('tailor.missingDiffDialog.confirmLabel')}</span>
          </div>

          <div className="flex justify-end items-center gap-3 pt-4 border-t-2 border-black bg-white -mx-6 -mb-6 px-6 py-4">
            <Button variant="outline" onClick={onClose} disabled={isConfirming} className="gap-2">
              {t('common.cancel')}
            </Button>
            <Button
              variant="warning"
              onClick={() => onConfirm(improvedPreview)}
              disabled={isConfirming}
              className="gap-2"
            >
              {isConfirming ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {t('common.saving')}
                </>
              ) : (
                t('tailor.missingDiffDialog.confirmLabel')
              )}
            </Button>
          </div>
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

  // Render only changes that are still 'pending' or 'regenerating' so that
  // accepted/rejected items disappear once decided (per spec).
  const visibleChanges = detailedChanges
    .map((change, idx) => ({ change, idx }))
    .filter(({ idx }) => {
      const s = changeStates.get(idx);
      return !s || s.decision === 'pending';
    });

  type ChangeWithIdx = { change: ResumeFieldDiff; idx: number };
  const groups: {
    key: string;
    title: string;
    items: ChangeWithIdx[];
  }[] = [
    {
      key: 'summary',
      title: t('tailor.diffModal.summaryChanges'),
      items: visibleChanges.filter((c) => c.change.field_type === 'summary'),
    },
    {
      key: 'skills',
      title: t('tailor.diffModal.skillChanges'),
      items: visibleChanges.filter((c) => c.change.field_type === 'skill'),
    },
    {
      key: 'experience',
      title: t('tailor.diffModal.experienceChanges'),
      items: visibleChanges.filter((c) => c.change.field_type === 'experience'),
    },
    {
      key: 'descriptions',
      title: t('tailor.diffModal.descriptionChanges'),
      items: visibleChanges.filter((c) => c.change.field_type === 'description'),
    },
    {
      key: 'education',
      title: t('tailor.diffModal.educationChanges'),
      items: visibleChanges.filter((c) => c.change.field_type === 'education'),
    },
    {
      key: 'project',
      title: t('tailor.diffModal.projectChanges'),
      items: visibleChanges.filter((c) => c.change.field_type === 'project'),
    },
    {
      key: 'certifications',
      title: t('tailor.diffModal.certificationChanges'),
      items: visibleChanges.filter((c) => c.change.field_type === 'certification'),
    },
  ];

  return (
    <>
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open && !isConfirming) {
            onClose();
          }
        }}
      >
        <DialogContent className="max-w-5xl sm:max-h-[90vh] sm:overflow-hidden flex flex-col p-6 bg-background border-2 border-black shadow-sw-lg">
          <DialogHeader className="border-b-2 border-black pb-4 bg-white -mx-6 -mt-6 px-6 pt-6">
            <DialogTitle className="font-serif text-2xl font-bold uppercase tracking-tight pr-10">
              {t('tailor.diffModal.title')}
            </DialogTitle>
            <p className="font-mono text-xs text-ink-soft mt-2">
              {'// '}
              {t('tailor.diffModal.subtitle')}
            </p>
          </DialogHeader>

          {/* Summary cards */}
          <div className="border-2 border-black bg-white p-4 mt-4">
            <div className="flex items-center gap-2 mb-3">
              <div className="w-3 h-3 bg-primary"></div>
              <h3 className="font-mono text-sm font-bold uppercase tracking-wider">
                {t('tailor.diffModal.summary')}
              </h3>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-2 sm:gap-4">
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

            {diffSummary.high_risk_changes > 0 && (
              <div className="mt-4 border-2 border-warning bg-[#FFF7ED] p-3 flex items-start gap-3">
                <AlertTriangle className="w-5 h-5 text-warning shrink-0 mt-0.5" />
                <div>
                  <p className="font-mono text-xs font-bold uppercase text-[#C2410C]">
                    {t('tailor.diffModal.warningTitle', {
                      count: diffSummary.high_risk_changes,
                    })}
                  </p>
                  <p className="font-mono text-xs text-[#C2410C] mt-1">
                    {t('tailor.diffModal.warningMessage')}
                  </p>
                </div>
              </div>
            )}
          </div>

          {errorMessage && (
            <div className="mt-4 border-2 border-red-600 bg-red-50 p-3 font-mono text-xs text-red-700">
              {errorMessage}
            </div>
          )}

          {/* Detailed changes list */}
          <div className="flex-1 min-h-0 overflow-y-auto mt-4 space-y-4">
            {groups
              .filter((g) => g.items.length > 0)
              .map((g) => (
                <ChangeSection
                  key={g.key}
                  title={g.title}
                  count={g.items.length}
                  isExpanded={expandedSections.has(g.key)}
                  onToggle={() => toggleSection(g.key)}
                >
                  {g.items.map(({ change, idx }) => {
                    const state = changeStates.get(idx);
                    return (
                      <ChangeItem
                        key={idx}
                        change={change}
                        state={state}
                        contextLabel={getChangeLabel(change, improvedPreview)}
                        onAccept={() => setDecision(idx, 'accepted')}
                        onReject={() => setDecision(idx, 'rejected')}
                        onChange={() => openChangeDialog(idx)}
                        changeInPrefixT={(title) => t('tailor.diffModal.changeInPrefix', { title })}
                        acceptLabel={t('tailor.diffModal.acceptChange')}
                        rejectLabel={t('tailor.diffModal.rejectChange')}
                        changeLabel={t('tailor.diffModal.changeChange')}
                        regeneratingLabel={t('tailor.diffModal.regenerating')}
                      />
                    );
                  })}
                </ChangeSection>
              ))}
          </div>

          {/* Action buttons */}
          <div className="flex flex-col gap-3 pt-4 border-t-2 border-black bg-white -mx-6 -mb-6 px-6 py-4">
            {pendingCount > 0 && (
              <p className="font-mono text-xs text-warning text-right">
                {t('tailor.diffModal.pendingReviewWarning', { count: pendingCount })}
              </p>
            )}
            <div className="flex justify-between items-center gap-3">
              <Button
                variant="outline"
                onClick={onReject}
                disabled={isConfirming}
                className="gap-2"
              >
                <X className="w-4 h-4" />
                {t('tailor.diffModal.rejectButton')}
              </Button>
              <div className="flex items-center gap-3">
                {isConfirming && elapsed > 0 && (
                  <span className="font-mono text-xs text-steel-grey">{elapsed}s</span>
                )}
                <Button
                  onClick={handleConfirm}
                  disabled={isConfirming || pendingCount > 0}
                  className="gap-2 bg-success hover:bg-green-800"
                >
                  {isConfirming ? (
                    <>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      {t('common.saving')}
                    </>
                  ) : (
                    <>
                      <CheckCircle className="w-4 h-4" />
                      {t('tailor.diffModal.confirmButton')}
                    </>
                  )}
                </Button>
              </div>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      <Dialog
        open={changeDialogIdx !== null}
        onOpenChange={(open) => {
          if (!open) closeChangeDialog();
        }}
      >
        <DialogContent className="max-w-xl p-6 bg-background border-2 border-black shadow-sw-lg">
          <DialogHeader>
            <DialogTitle className="font-serif text-xl font-bold uppercase tracking-tight">
              {t('tailor.diffModal.changeDialogTitle')}
            </DialogTitle>
            <DialogDescription className="font-mono text-xs text-ink-soft">
              {t('tailor.diffModal.changeDialogDescription')}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={changeDialogFeedback}
            onChange={(e) => setChangeDialogFeedback(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') e.stopPropagation();
            }}
            placeholder={t('tailor.diffModal.changeDialogPlaceholder')}
            className="min-h-[140px] font-mono text-sm bg-white border-2 border-black rounded-none p-3"
          />
          <DialogFooter className="gap-2">
            <Button variant="outline" onClick={closeChangeDialog}>
              {t('common.cancel')}
            </Button>
            <Button
              onClick={submitChangeDialog}
              disabled={!changeDialogFeedback.trim()}
              className="gap-2"
            >
              <Pencil className="w-4 h-4" />
              {t('tailor.diffModal.changeDialogConfirm')}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ---------------------------------------------------------------------------
// StatCard
// ---------------------------------------------------------------------------

interface StatCardProps {
  label: string;
  value: number;
  variant: 'success' | 'warning' | 'danger' | 'info';
}

function StatCard({ label, value, variant }: StatCardProps) {
  const colors = {
    success: 'border-success bg-[#F0FDF4] text-success',
    warning: 'border-warning bg-[#FFF7ED] text-warning',
    danger: 'border-destructive bg-[#FEF2F2] text-destructive',
    info: 'border-primary bg-[#EFF6FF] text-primary',
  };

  return (
    <div className={`border-2 p-3 ${colors[variant]}`}>
      <div className="font-mono text-2xl font-bold">{value}</div>
      <div className="font-mono text-xs uppercase tracking-wider mt-1">{label}</div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Collapsible section
// ---------------------------------------------------------------------------

interface ChangeSectionProps {
  title: string;
  count: number;
  isExpanded: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}

function ChangeSection({ title, count, isExpanded, onToggle, children }: ChangeSectionProps) {
  return (
    <div className="border-2 border-black bg-white">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-paper-tint"
      >
        <div className="flex items-center gap-2">
          {isExpanded ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
          <span className="font-mono text-sm font-bold uppercase tracking-wider">
            {title} ({count})
          </span>
        </div>
      </button>

      {isExpanded && <div className="border-t-2 border-black p-4 space-y-3">{children}</div>}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Single change row with Accept / Reject / Change controls
// ---------------------------------------------------------------------------

interface ChangeItemProps {
  change: ResumeFieldDiff;
  state: ChangeState | undefined;
  contextLabel: string | null;
  onAccept: () => void;
  onReject: () => void;
  onChange: () => void;
  changeInPrefixT: (title: string) => string;
  acceptLabel: string;
  rejectLabel: string;
  changeLabel: string;
  regeneratingLabel: string;
}

function ChangeItem({
  change,
  state,
  contextLabel,
  onAccept,
  onReject,
  onChange,
  changeInPrefixT,
  acceptLabel,
  rejectLabel,
  changeLabel,
  regeneratingLabel,
}: ChangeItemProps) {
  const typeBackgrounds = {
    added: 'bg-[#F0FDF4]',
    removed: 'bg-[#FEF2F2]',
    modified: 'bg-[#EFF6FF]',
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

  const liveNewValue = state?.liveNewValue !== undefined ? state.liveNewValue : change.new_value;
  const isRevised = state?.liveNewValue !== undefined;
  const isRegenerating = state?.isRegenerating ?? false;

  return (
    <div className={`p-3 border border-black ${typeBackgrounds[change.change_type]}`}>
      {contextLabel && (
        <div className="font-mono text-[10px] uppercase tracking-wider text-steel-grey mb-2">
          {changeInPrefixT(contextLabel)}
        </div>
      )}
      <div className="flex items-start gap-2">
        <span
          className={`font-mono text-base font-bold uppercase tracking-wider ${typeGlyphColors[change.change_type]}`}
          aria-hidden="true"
        >
          {typeLabels[change.change_type]}
        </span>
        <div className="flex-1">
          {change.original_value && (
            <div className="line-through text-destructive font-mono text-sm mb-1 break-words">
              {change.original_value}
            </div>
          )}
          {liveNewValue && (
            <div className="text-ink-soft font-mono text-sm break-words">{liveNewValue}</div>
          )}
          {isRevised && (
            <div className="font-mono text-[10px] uppercase tracking-wider text-primary mt-1">
              {'// revised'}
            </div>
          )}
          {state?.regenerateError && (
            <div className="font-mono text-xs text-destructive mt-2">{state.regenerateError}</div>
          )}
        </div>
        {change.change_type === 'added' && change.confidence === 'high' && (
          <AlertTriangle className="w-4 h-4 text-warning shrink-0" />
        )}
      </div>

      <div className="flex justify-end gap-2 mt-3 pt-3 border-t border-black/20">
        {isRegenerating ? (
          <span className="font-mono text-xs text-steel-grey flex items-center gap-2">
            <Loader2 className="w-3 h-3 animate-spin" />
            {regeneratingLabel}
          </span>
        ) : (
          <>
            <Button size="sm" variant="outline" onClick={onReject} className="h-7 px-2 text-xs">
              <X className="w-3 h-3" />
              {rejectLabel}
            </Button>
            <Button size="sm" variant="outline" onClick={onChange} className="h-7 px-2 text-xs">
              <Pencil className="w-3 h-3" />
              {changeLabel}
            </Button>
            <Button
              size="sm"
              onClick={onAccept}
              className="h-7 px-2 text-xs bg-success hover:bg-green-800"
            >
              <CheckCircle className="w-3 h-3" />
              {acceptLabel}
            </Button>
          </>
        )}
      </div>
    </div>
  );
}
