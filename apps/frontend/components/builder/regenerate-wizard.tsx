'use client';

import React from 'react';
import { RegenerateDialog } from './regenerate-dialog';
import { RegenerateInstructionDialog } from './regenerate-instruction-dialog';
import { RegenerateDiffPreview } from './regenerate-diff-preview';
import type {
  RegenerateItemError,
  RegenerateItemInput,
  RegeneratedItem,
} from '@/lib/api/enrichment';

export type RegenerateWizardStep =
  | 'idle'
  | 'selecting'
  | 'instructing'
  | 'generating'
  | 'previewing'
  | 'complete';

interface RegenerateWizardProps {
  // Step state
  step: RegenerateWizardStep;
  onStepChange: (step: RegenerateWizardStep) => void;

  // Data from resume
  experienceItems: RegenerateItemInput[];
  projectItems: RegenerateItemInput[];
  skillsItem: RegenerateItemInput | null;

  // Selection state
  selectedItems: RegenerateItemInput[];
  onSelectionChange: (items: RegenerateItemInput[]) => void;

  // Instruction state
  instruction: string;
  onInstructionChange: (instruction: string) => void;

  // Generated content
  regeneratedItems: RegeneratedItem[];
  regenerateErrors: RegenerateItemError[];

  // Loading states
  isGenerating: boolean;
  isApplying: boolean;

  // Error state
  error: string | null;

  // Actions
  onGenerate: () => void;
  onAccept: () => void;
  onReject: () => void;
  onClose: () => void;
}

/**
 * RegenerateWizard Component
 *
 * Main container that coordinates the 3-step regenerate flow:
 * 1. Select items to regenerate
 * 2. Enter improvement instructions
 * 3. Preview diff and accept/reject
 */
export const RegenerateWizard: React.FC<RegenerateWizardProps> = ({
  step,
  onStepChange,
  experienceItems,
  projectItems,
  skillsItem,
  selectedItems,
  onSelectionChange,
  instruction,
  onInstructionChange,
  regeneratedItems,
  regenerateErrors,
  isGenerating,
  isApplying,
  error,
  onGenerate,
  onAccept,
  onReject,
  onClose,
}) => {
  // Handle dialog open state based on step
  const isSelectDialogOpen = step === 'selecting';
  const isInstructionDialogOpen = step === 'instructing' || step === 'generating';
  const isDiffPreviewOpen = step === 'previewing';

  // Handle selection dialog close
  const handleSelectDialogClose = (open: boolean) => {
    if (!open) {
      onClose();
    }
  };

  // Handle instruction dialog close
  const handleInstructionDialogClose = (open: boolean) => {
    if (!open && !isGenerating) {
      onClose();
    }
  };

  // Handle diff preview dialog close
  const handleDiffPreviewClose = (open: boolean) => {
    if (!open && !isApplying) {
      onClose();
    }
  };

  // Move to instruction step
  const handleContinueToInstruction = () => {
    onStepChange('instructing');
  };

  // Go back to selection step
  const handleBackToSelection = () => {
    onStepChange('selecting');
  };

  return (
    <>
      {/* Step 1: Select Items */}
      <RegenerateDialog
        open={isSelectDialogOpen}
        onOpenChange={handleSelectDialogClose}
        experienceItems={experienceItems}
        projectItems={projectItems}
        skillsItem={skillsItem}
        selectedItems={selectedItems}
        onSelectionChange={onSelectionChange}
        onContinue={handleContinueToInstruction}
      />

      {/* Step 2: Enter Instructions */}
      <RegenerateInstructionDialog
        open={isInstructionDialogOpen}
        onOpenChange={handleInstructionDialogClose}
        selectedItems={selectedItems}
        instruction={instruction}
        onInstructionChange={onInstructionChange}
        error={error}
        onBack={handleBackToSelection}
        onGenerate={onGenerate}
        isGenerating={isGenerating}
      />

      {/* Step 3: Preview Diff */}
      <RegenerateDiffPreview
        open={isDiffPreviewOpen}
        onOpenChange={handleDiffPreviewClose}
        regeneratedItems={regeneratedItems}
        regenerateErrors={regenerateErrors}
        error={error}
        onAccept={onAccept}
        onReject={onReject}
        isApplying={isApplying}
      />
    </>
  );
};

export default RegenerateWizard;
