'use client';

import { useState, useCallback } from 'react';
import { regenerateItems as regenerateItemsApi, applyRegeneratedItems } from '@/lib/api/enrichment';
import type {
  RegenerateItemError,
  RegenerateItemInput,
  RegeneratedItem,
  RegenerateRequest,
} from '@/lib/api/enrichment';
import type { RegenerateWizardStep } from '@/components/builder/regenerate-wizard';
import { useTranslations } from '@/lib/i18n';

interface UseRegenerateWizardProps {
  resumeId: string;
  outputLanguage?: string;
  onSuccess?: () => void | Promise<void>;
  onError?: (error: string) => void;
}

interface UseRegenerateWizardReturn {
  // Step state
  step: RegenerateWizardStep;
  setStep: (step: RegenerateWizardStep) => void;

  // Selection state
  selectedItems: RegenerateItemInput[];
  setSelectedItems: (items: RegenerateItemInput[]) => void;

  // Instruction state
  instruction: string;
  setInstruction: (instruction: string) => void;

  // Generated content
  regeneratedItems: RegeneratedItem[];
  regenerateErrors: RegenerateItemError[];

  // Loading states
  isGenerating: boolean;
  isApplying: boolean;

  // Error state
  error: string | null;

  // Actions
  startRegenerate: () => void;
  generate: () => Promise<void>;
  acceptChanges: () => Promise<void>;
  rejectAndRegenerate: () => void;
  reset: () => void;
}

/**
 * useRegenerateWizard Hook
 *
 * Manages the state and logic for the AI regenerate wizard flow.
 * Handles API calls, step transitions, and error handling.
 */
export function useRegenerateWizard({
  resumeId,
  outputLanguage = 'en',
  onSuccess,
  onError,
}: UseRegenerateWizardProps): UseRegenerateWizardReturn {
  const { t } = useTranslations();

  // Step state
  const [step, setStep] = useState<RegenerateWizardStep>('idle');

  // Selection state
  const [selectedItems, setSelectedItems] = useState<RegenerateItemInput[]>([]);

  // Instruction state
  const [instruction, setInstruction] = useState<string>('');

  // Generated content
  const [regeneratedItems, setRegeneratedItems] = useState<RegeneratedItem[]>([]);
  const [regenerateErrors, setRegenerateErrors] = useState<RegenerateItemError[]>([]);

  // Loading states
  const [isGenerating, setIsGenerating] = useState(false);
  const [isApplying, setIsApplying] = useState(false);

  // Error state
  const [error, setError] = useState<string | null>(null);

  // Start the regenerate flow
  const startRegenerate = useCallback(() => {
    setStep('selecting');
    setError(null);
    setRegenerateErrors([]);
  }, []);

  // Generate new content using AI
  const generate = useCallback(async () => {
    if (selectedItems.length === 0) {
      setError('No items selected');
      return;
    }

    setIsGenerating(true);
    setStep('generating');
    setError(null);

    try {
      const request: RegenerateRequest = {
        resume_id: resumeId,
        items: selectedItems,
        instruction: instruction || t('builder.regenerate.instructionDialog.defaultInstruction'),
        output_language: outputLanguage,
      };

      const response = await regenerateItemsApi(request);
      setRegeneratedItems(response.regenerated_items);
      setRegenerateErrors(response.errors ?? []);
      setStep('previewing');
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate content';
      setError(errorMessage);
      setStep('instructing'); // Go back to instruction step on error
      onError?.(errorMessage);
    } finally {
      setIsGenerating(false);
    }
  }, [resumeId, selectedItems, instruction, outputLanguage, onError, t]);

  // Reset all state
  const reset = useCallback(() => {
    setStep('idle');
    setSelectedItems([]);
    setInstruction('');
    setRegeneratedItems([]);
    setRegenerateErrors([]);
    setError(null);
    setIsGenerating(false);
    setIsApplying(false);
  }, []);

  // Accept and apply the changes
  const acceptChanges = useCallback(async () => {
    if (regeneratedItems.length === 0) {
      setError('No changes to apply');
      return;
    }

    setIsApplying(true);
    setError(null);

    try {
      await applyRegeneratedItems(resumeId, regeneratedItems);
      if (onSuccess) {
        await onSuccess();
      }

      setStep('complete');
      // Let the UI flush before closing the wizard.
      await new Promise((resolve) => setTimeout(resolve, 0));
      reset();
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to apply changes';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      setIsApplying(false);
    }
  }, [resumeId, regeneratedItems, onSuccess, onError, reset]);

  // Reject changes and go back to instruction step
  const rejectAndRegenerate = useCallback(() => {
    setRegeneratedItems([]);
    setRegenerateErrors([]);
    setError(null);
    setStep('instructing');
  }, []);

  return {
    step,
    setStep,
    selectedItems,
    setSelectedItems,
    instruction,
    setInstruction,
    regeneratedItems,
    regenerateErrors,
    isGenerating,
    isApplying,
    error,
    startRegenerate,
    generate,
    acceptChanges,
    rejectAndRegenerate,
    reset,
  };
}

export default useRegenerateWizard;
