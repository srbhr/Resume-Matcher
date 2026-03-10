'use client';

import { useState } from 'react';
import { AlertTriangle, CheckCircle, X, ChevronDown, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { useTranslations } from '@/lib/i18n';
import type {
  ResumeDiffSummary,
  ResumeFieldDiff,
} from '@/components/common/resume_previewer_context';

interface DiffPreviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  onReject: () => void;
  onConfirm: () => void;
  onConfirmPartial: (acceptedIndices: Set<number>) => void;
  isLoading?: boolean;
  diffSummary?: ResumeDiffSummary;
  detailedChanges?: ResumeFieldDiff[];
  errorMessage?: string;
}

export function DiffPreviewModal({
  isOpen,
  onClose,
  onReject,
  onConfirm,
  onConfirmPartial,
  isLoading,
  diffSummary,
  detailedChanges,
  errorMessage,
}: DiffPreviewModalProps) {
  const { t } = useTranslations();
  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(['summary', 'skills', 'descriptions', 'experience'])
  );
  const [acceptedIndices, setAcceptedIndices] = useState<Set<number>>(
    () => new Set(detailedChanges?.map((_, i) => i) ?? [])
  );

  if (!diffSummary || !detailedChanges) {
    return (
      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!open) {
            onClose();
          }
        }}
      >
        <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-6 bg-[#F0F0E8] border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
          <DialogHeader className="border-b-2 border-black pb-4 bg-white -mx-6 -mt-6 px-6 pt-6">
            <DialogTitle className="font-serif text-2xl font-bold uppercase tracking-tight">
              {t('tailor.missingDiffDialog.title')}
            </DialogTitle>
          </DialogHeader>

          <div className="mt-6 border-2 border-black bg-white p-4 font-mono text-xs text-gray-700">
            {t('tailor.missingDiffDialog.description')}
          </div>
          <div className="mt-3 flex items-center gap-2 font-mono text-xs text-amber-700">
            <AlertTriangle className="w-4 h-4" />
            <span>{t('tailor.missingDiffDialog.confirmLabel')}</span>
          </div>

          <div className="flex justify-end items-center gap-3 pt-4 border-t-2 border-black bg-white -mx-6 -mb-6 px-6 py-4">
            <Button variant="outline" onClick={onClose} className="gap-2">
              {t('common.cancel')}
            </Button>
            <Button variant="warning" onClick={onConfirm} className="gap-2">
              {t('tailor.missingDiffDialog.confirmLabel')}
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

  const toggleChange = (idx: number) => {
    setAcceptedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(idx)) {
        next.delete(idx);
      } else {
        next.add(idx);
      }
      return next;
    });
  };

  const allCount = detailedChanges.length;
  const acceptedCount = acceptedIndices.size;

  const handleSelectAll = () => {
    setAcceptedIndices(new Set(detailedChanges.map((_, i) => i)));
  };

  const handleDeselectAll = () => {
    setAcceptedIndices(new Set());
  };

  const handleConfirmClick = () => {
    if (acceptedCount === allCount) {
      onConfirm();
    } else {
      onConfirmPartial(acceptedIndices);
    }
  };

  // Group changes by type
  const summaryChanges = detailedChanges.filter((c) => c.field_type === 'summary');
  const skillChanges = detailedChanges.filter((c) => c.field_type === 'skill');
  const descChanges = detailedChanges.filter((c) => c.field_type === 'description');
  const certChanges = detailedChanges.filter((c) => c.field_type === 'certification');
  const experienceChanges = detailedChanges.filter((c) => c.field_type === 'experience');
  const educationChanges = detailedChanges.filter((c) => c.field_type === 'education');
  const projectChanges = detailedChanges.filter((c) => c.field_type === 'project');

  return (
    <Dialog
      open={isOpen}
      onOpenChange={(open) => {
        if (!open) {
          onClose();
        }
      }}
    >
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-hidden flex flex-col p-6 bg-[#F0F0E8] border-2 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
        <DialogHeader className="border-b-2 border-black pb-4 bg-white -mx-6 -mt-6 px-6 pt-6">
          <DialogTitle className="font-serif text-2xl font-bold uppercase tracking-tight">
            {t('tailor.diffModal.title')}
          </DialogTitle>
          <p className="font-mono text-xs text-gray-600 mt-2">
            {'// '}
            {t('tailor.diffModal.subtitle')}
          </p>
        </DialogHeader>

        {/* Summary cards */}
        <div className="border-2 border-black bg-white p-4 mt-4">
          <div className="flex items-center gap-2 mb-3">
            <div className="w-3 h-3 bg-[#1D4ED8]"></div>
            <h3 className="font-mono text-sm font-bold uppercase tracking-wider">
              {t('tailor.diffModal.summary')}
            </h3>
          </div>

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

          {diffSummary.high_risk_changes > 0 && (
            <div className="mt-4 border-2 border-[#F97316] bg-[#FFF7ED] p-3 flex items-start gap-3">
              <AlertTriangle className="w-5 h-5 text-[#F97316] shrink-0 mt-0.5" />
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
          {/* Summary changes */}
          {summaryChanges.length > 0 && (
            <ChangeSection
              title={t('tailor.diffModal.summaryChanges')}
              count={summaryChanges.length}
              isExpanded={expandedSections.has('summary')}
              onToggle={() => toggleSection('summary')}
            >
              {summaryChanges.map((change) => {
                const gi = detailedChanges.indexOf(change);
                return (
                  <ChangeItem
                    key={gi}
                    change={change}
                    globalIndex={gi}
                    isAccepted={acceptedIndices.has(gi)}
                    onToggle={toggleChange}
                  />
                );
              })}
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
              {skillChanges.map((change) => {
                const gi = detailedChanges.indexOf(change);
                return (
                  <ChangeItem
                    key={gi}
                    change={change}
                    globalIndex={gi}
                    isAccepted={acceptedIndices.has(gi)}
                    onToggle={toggleChange}
                  />
                );
              })}
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
              {experienceChanges.map((change) => {
                const gi = detailedChanges.indexOf(change);
                return (
                  <ChangeItem
                    key={gi}
                    change={change}
                    globalIndex={gi}
                    isAccepted={acceptedIndices.has(gi)}
                    onToggle={toggleChange}
                  />
                );
              })}
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
              {descChanges.map((change) => {
                const gi = detailedChanges.indexOf(change);
                return (
                  <ChangeItem
                    key={gi}
                    change={change}
                    globalIndex={gi}
                    isAccepted={acceptedIndices.has(gi)}
                    onToggle={toggleChange}
                  />
                );
              })}
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
              {educationChanges.map((change) => {
                const gi = detailedChanges.indexOf(change);
                return (
                  <ChangeItem
                    key={gi}
                    change={change}
                    globalIndex={gi}
                    isAccepted={acceptedIndices.has(gi)}
                    onToggle={toggleChange}
                  />
                );
              })}
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
              {projectChanges.map((change) => {
                const gi = detailedChanges.indexOf(change);
                return (
                  <ChangeItem
                    key={gi}
                    change={change}
                    globalIndex={gi}
                    isAccepted={acceptedIndices.has(gi)}
                    onToggle={toggleChange}
                  />
                );
              })}
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
              {certChanges.map((change) => {
                const gi = detailedChanges.indexOf(change);
                return (
                  <ChangeItem
                    key={gi}
                    change={change}
                    globalIndex={gi}
                    isAccepted={acceptedIndices.has(gi)}
                    onToggle={toggleChange}
                  />
                );
              })}
            </ChangeSection>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex justify-between items-center pt-4 border-t-2 border-black bg-white -mx-6 -mb-6 px-6 py-4">
          <Button variant="outline" onClick={onReject} disabled={isLoading} className="gap-2">
            <X className="w-4 h-4" />
            {t('tailor.diffModal.rejectButton')}
          </Button>
          <div className="flex items-center gap-4">
            <button
              onClick={acceptedCount === allCount ? handleDeselectAll : handleSelectAll}
              className="font-mono text-xs text-[#1D4ED8] underline hover:text-blue-900 disabled:opacity-50"
              disabled={isLoading}
            >
              {acceptedCount === allCount
                ? t('tailor.diffModal.deselectAll')
                : t('tailor.diffModal.selectAll')}
            </button>
            <Button
              onClick={handleConfirmClick}
              disabled={isLoading || acceptedCount === 0}
              className="gap-2 bg-[#15803D] hover:bg-[#166534]"
            >
              <CheckCircle className="w-4 h-4" />
              {acceptedCount === allCount
                ? t('tailor.diffModal.confirmButton')
                : t('tailor.diffModal.confirmPartialButton', {
                    accepted: acceptedCount,
                    total: allCount,
                  })}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// Helper component: stat card
interface StatCardProps {
  label: string;
  value: number;
  variant: 'success' | 'warning' | 'danger' | 'info';
}

function StatCard({ label, value, variant }: StatCardProps) {
  const colors = {
    success: 'border-[#15803D] bg-[#F0FDF4] text-[#15803D]',
    warning: 'border-[#F97316] bg-[#FFF7ED] text-[#F97316]',
    danger: 'border-[#DC2626] bg-[#FEF2F2] text-[#DC2626]',
    info: 'border-[#1D4ED8] bg-[#EFF6FF] text-[#1D4ED8]',
  };

  return (
    <div className={`border-2 p-3 ${colors[variant]}`}>
      <div className="font-mono text-2xl font-bold">{value}</div>
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
    <div className="border-2 border-black bg-white">
      <button
        onClick={onToggle}
        className="w-full flex items-center justify-between p-3 hover:bg-gray-50"
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

// Helper component: change item with checkbox
interface ChangeItemProps {
  change: ResumeFieldDiff;
  globalIndex: number;
  isAccepted: boolean;
  onToggle: (idx: number) => void;
}

function ChangeItem({ change, globalIndex, isAccepted, onToggle }: ChangeItemProps) {
  const typeColors = {
    added: 'border-l-4 border-[#15803D] bg-[#F0FDF4]',
    removed: 'border-l-4 border-[#DC2626] bg-[#FEF2F2]',
    modified: 'border-l-4 border-[#1D4ED8] bg-[#EFF6FF]',
  };

  const typeLabels = {
    added: '+',
    removed: '-',
    modified: '~',
  };

  return (
    <div className={`p-3 ${typeColors[change.change_type]} ${!isAccepted ? 'opacity-50' : ''}`}>
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={isAccepted}
          onChange={() => onToggle(globalIndex)}
          className="mt-1 shrink-0 cursor-pointer accent-[#15803D]"
        />
        <span className="font-mono text-xs font-bold uppercase tracking-wider text-gray-500">
          {typeLabels[change.change_type]}
        </span>
        <div className="flex-1">
          {change.original_value && (
            <div className="line-through text-[#DC2626] font-mono text-sm mb-1">
              {change.original_value}
            </div>
          )}
          {change.new_value && (
            <div className="text-gray-900 font-mono text-sm">{change.new_value}</div>
          )}
        </div>
        {change.change_type === 'added' && change.confidence === 'high' && (
          <AlertTriangle className="w-4 h-4 text-[#F97316] shrink-0" />
        )}
      </div>
    </div>
  );
}
