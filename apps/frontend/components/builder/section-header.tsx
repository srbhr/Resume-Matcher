'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { ChevronUp, ChevronDown, Trash2, Eye, EyeOff, Pencil, Check, X } from 'lucide-react';
import type { SectionMeta } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';

interface SectionHeaderProps {
  section: SectionMeta;
  onRename: (newName: string) => void;
  onDelete: () => void;
  onMoveUp: () => void;
  onMoveDown: () => void;
  onToggleVisibility: () => void;
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
 */
export const SectionHeader: React.FC<SectionHeaderProps> = ({
  section,
  onRename,
  onDelete,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
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
        isHidden ? 'border-dashed border-steel-grey opacity-60' : 'border-black'
      }`}
    >
      {/* Section Header */}
      <div className="flex justify-between items-center border-b border-black pb-2 mb-4">
        {/* Section Name (editable) */}
        <div className="flex items-center gap-2">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <Input
                value={editedName}
                onChange={(e) => setEditedName(e.target.value)}
                onKeyDown={handleKeyDown}
                className="h-8 w-48 rounded-none border-black font-serif text-lg font-bold"
                autoFocus
              />
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-green-700 hover:text-green-800 hover:bg-green-50"
                onClick={handleSaveEdit}
                aria-label={t('common.save')}
                title={t('common.save')}
              >
                <Check className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-steel-grey hover:text-ink-soft hover:bg-paper-tint"
                onClick={handleCancelEdit}
                aria-label={t('common.cancel')}
                title={t('common.cancel')}
              >
                <X className="w-4 h-4" />
              </Button>
            </div>
          ) : (
            <>
              <h3 className="font-serif text-xl font-bold">{section.displayName}</h3>
              {!isPersonalInfo && (
                <Button
                  variant="ghost"
                  size="icon"
                  // Visible 24×24 (matches the small inline pencil aesthetic
                  // next to the section title), but the touch area is
                  // extended to 44×44 via -inset-[10px] to meet WCAG 2.5.8.
                  // The default Button overlay (-inset-1.5) only gives 36×36
                  // for h-6 buttons; this override adds 4 more px per side.
                  className="h-6 w-6 text-steel-grey hover:text-ink-soft before:-inset-[10px]"
                  onClick={handleStartEdit}
                  aria-label={t('builder.sectionHeader.renameSection')}
                  title={t('builder.sectionHeader.renameSection')}
                >
                  <Pencil className="w-3 h-3" />
                </Button>
              )}
              {!section.isDefault && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-steel-grey bg-paper-tint px-1.5 py-0.5 border border-paper-tint">
                  {t('builder.sectionHeader.customTag')}
                </span>
              )}
              {isHidden && (
                <span className="font-mono text-[10px] uppercase tracking-wider text-orange-600 bg-white px-1.5 py-0.5 border border-orange-500">
                  {t('builder.sectionHeader.hiddenFromPdfTag')}
                </span>
              )}
            </>
          )}
        </div>

        {/* Section Controls */}
        <div className="flex items-center gap-1">
          {/* Visibility Toggle. The parent container already applies
              opacity-60 when hidden (line 91), which carries the visual
              "faded" cue for the hidden state. A conditional text color
              here would be redundant — just use steel-grey. */}
          {!isPersonalInfo && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-steel-grey"
              onClick={onToggleVisibility}
              aria-label={
                section.isVisible
                  ? t('builder.sectionHeader.hideSection')
                  : t('builder.sectionHeader.showSection')
              }
              aria-pressed={!section.isVisible}
              title={
                section.isVisible
                  ? t('builder.sectionHeader.hideSection')
                  : t('builder.sectionHeader.showSection')
              }
            >
              {section.isVisible ? <Eye className="w-4 h-4" /> : <EyeOff className="w-4 h-4" />}
            </Button>
          )}

          {/* Move Up */}
          {!isPersonalInfo && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-steel-grey hover:text-ink-soft disabled:opacity-30"
              onClick={onMoveUp}
              disabled={isFirst}
              aria-label={t('builder.sectionHeader.moveUp')}
              title={t('builder.sectionHeader.moveUp')}
            >
              <ChevronUp className="w-4 h-4" />
            </Button>
          )}

          {/* Move Down */}
          {!isPersonalInfo && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-steel-grey hover:text-ink-soft disabled:opacity-30"
              onClick={onMoveDown}
              disabled={isLast}
              aria-label={t('builder.sectionHeader.moveDown')}
              title={t('builder.sectionHeader.moveDown')}
            >
              <ChevronDown className="w-4 h-4" />
            </Button>
          )}

          {/* Delete / Hide */}
          {canDelete && (
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10"
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
              <Trash2 className="w-4 h-4" />
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
