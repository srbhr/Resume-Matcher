'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ChevronUp, ChevronDown, Trash2, Eye, EyeOff, Pencil, Check, X, Copy } from 'lucide-react';
import type { SectionMeta } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';

interface SectionHeaderProps {
  section: SectionMeta;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleVisibility: () => void;
  /** Custom sections only: renders a Copy button that duplicates the whole section. */
  onDuplicate?: () => void;
  isFirst: boolean;
  isLast: boolean;
  canDelete: boolean;
  children?: React.ReactNode;
}

/**
 * SectionHeader Component
 *
 * Provides controls for section management:
 * - Editable display name
 * - Move up/down buttons for reordering
 * - Delete button with confirmation
 * - Visibility toggle
 * - Optional duplicate button (custom sections)
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  section,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  onDuplicate,
  isFirst,
  isLast,
  canDelete,
  children,
}) => {
  const { t } = useTranslations();
  const [isEditing, setIsEditing] = useState(false);
  const [editedName, setEditedName] = useState(section.displayName);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  const handleStartEdit = () => {
    setEditedName(section.displayName);
    setIsEditing(true);
  };

  const handleSaveEdit = () => {
    if (editedName.trim()) {
      onRename(editedName.trim());
    }
    setIsEditing(false);
  };

  const handleCancelEdit = () => {
    setEditedName(section.displayName);
    setIsEditing(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      handleCancelEdit();
    }
  };

  const handleDeleteClick = () => {
    if (section.isDefault) {
      // For default sections, just toggle visibility
      onToggleVisibility();
    } else {
      // For custom sections, show confirmation
      setShowDeleteConfirm(true);
    }
  };

  const isPersonalInfo = section.id === 'personalInfo';
  const isHidden = !section.isVisible;

  return (
    <div
      className={`space-y-0 border p-6 bg-white shadow-sw-default ${
        isHidden ? 'border-dashed border-steel opacity-60' : 'border-ink'
      }`}
    >
      {/* Section Header */}
      <div className="flex justify-between items-center border-b border-ink pb-2 mb-4">
        {/* Section Name (editable) */}
        <div className="flex items-center gap-2">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={handleKeyDown}
                aria-label={t('builder.sectionHeader.renameSection')}
                className="h-8 w-48 font-serif text-lg font-bold"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-success hover:text-success-hover hover:bg-success-tint"
                onClick={handleSaveEdit}
                aria-label={t('common.save')}
                title={t('common.save')}
              >
                <Check aria-hidden="true" />
              </Button>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-steel hover:text-ink-soft"
                onClick={handleCancelEdit}
                aria-label={t('common.cancel')}
                title={t('common.cancel')}
              >
                <X aria-hidden="true" />
              </Button>
            </div>
          ) : (
            <>
              <h3 className="font-serif text-xl font-bold">{section.displayName}</h3>
              {!isPersonalInfo && (
                <Button
                  variant="ghost"
                  size="icon-xs"
                  // Visible 24×24 next to the section title; the touch area is
                  // extended to 44×44 via -inset-[10px] (house target, WCAG 2.5.5).
                  className="text-steel hover:text-ink-soft before:-inset-[10px]"
                  onClick={handleStartEdit}
                  aria-label={t('builder.sectionHeader.renameSection')}
                  title={t('builder.sectionHeader.renameSection')}
                >
                  <Pencil aria-hidden="true" size={16} />
                </Button>
              )}
              {!section.isDefault && (
                <span className="font-mono text-xs uppercase tracking-wider text-steel bg-paper px-2 py-1 border border-paper">
                  {t('builder.sectionHeader.customTag')}
                </span>
              )}
              {isHidden && (
                <span className="font-mono text-xs uppercase tracking-wider text-warning-text bg-white px-2 py-1 border border-warning">
                  {t('builder.sectionHeader.hiddenFromPdfTag')}
                </span>
              )}
            </>
          )}
        </div>

        {/* Section Controls */}
        <div className="flex items-center gap-1">
          {/* Visibility Toggle. The parent container already applies
              opacity-60 when hidden, which carries the visual "faded" cue for
              the hidden state. The name stays static; aria-pressed carries the
              state. */}
          {!isPersonalInfo && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-steel"
              onClick={onToggleVisibility}
              aria-label={t('builder.sectionHeader.hideSection')}
              aria-pressed={!section.isVisible}
              title={
                section.isVisible
                  ? t('builder.sectionHeader.hideSection')
                  : t('builder.sectionHeader.showSection')
              }
            >
              {section.isVisible ? <Eye aria-hidden="true" /> : <EyeOff aria-hidden="true" />}
            </Button>
          )}

          {/* Move Up. A disabled button gets no pointer events, so the tooltip
              lives on a wrapping span. */}
          {!isPersonalInfo && (
            <span title={t('builder.sectionHeader.moveUp')}>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-steel hover:text-ink-soft disabled:opacity-30"
                onClick={onMoveUp}
                disabled={isFirst}
                aria-label={t('builder.sectionHeader.moveUp')}
              >
                <ChevronUp aria-hidden="true" />
              </Button>
            </span>
          )}

          {/* Move Down */}
          {!isPersonalInfo && (
            <span title={t('builder.sectionHeader.moveDown')}>
              <Button
                variant="ghost"
                size="icon-sm"
                className="text-steel hover:text-ink-soft disabled:opacity-30"
                onClick={onMoveDown}
                disabled={isLast}
                aria-label={t('builder.sectionHeader.moveDown')}
              >
                <ChevronDown aria-hidden="true" />
              </Button>
            </span>
          )}

          {/* Duplicate (custom sections only) */}
          {onDuplicate && (
            <Button
              variant="ghost"
              size="icon-sm"
              className="text-steel hover:text-ink-soft"
              onClick={onDuplicate}
              aria-label={t('builder.sectionHeader.duplicateSection')}
              title={t('builder.sectionHeader.duplicateSection')}
            >
              <Copy aria-hidden="true" />
            </Button>
          )}

          {/* Delete (custom) / Hide (default sections are only ever hidden) */}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon-sm"
              className={
                section.isDefault
                  ? 'text-steel hover:text-ink-soft'
                  : 'text-destructive hover:text-destructive hover:bg-destructive-tint'
              }
              onClick={handleDeleteClick}
              aria-label={
                section.isDefault
                  ? section.isVisible
                    ? t('builder.sectionHeader.hideSection')
                    : t('builder.sectionHeader.showSection')
                  : t('builder.sectionHeader.deleteSection')
              }
              title={
                section.isDefault
                  ? section.isVisible
                    ? t('builder.sectionHeader.hideSection')
                    : t('builder.sectionHeader.showSection')
                  : t('builder.sectionHeader.deleteSection')
              }
            >
              {section.isDefault ? (
                section.isVisible ? (
                  <EyeOff aria-hidden="true" />
                ) : (
                  <Eye aria-hidden="true" />
                )
              ) : (
                <Trash2 aria-hidden="true" />
              )}
            </Button>
          )}
        </div>
      </div>

      {/* Section Content */}
      {children}

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={showDeleteConfirm}
        onOpenChange={setShowDeleteConfirm}
        title={t('builder.sectionHeader.deleteTitle')}
        description={t('builder.sectionHeader.deleteDescription', { name: section.displayName })}
        confirmLabel={t('common.delete')}
        cancelLabel={t('common.cancel')}
        variant="danger"
        onConfirm={onDelete}
      />
    </div>
  );
};
