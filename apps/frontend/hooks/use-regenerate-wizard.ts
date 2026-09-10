'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useOperationOwner } from './use-operation-owner';
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
  /** Refresh the acknowledged resume; reject if refresh fails so Retry can fetch again. */
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
  needsRefresh: boolean;

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
  const { begin, isCurrent, invalidate } = useOperationOwner(resumeId);
  const applied = useRef(false);
  const applying = useRef(false);
  const [needsRefresh, setNeedsRefresh] = useState(false);

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
    const token = begin();
    if (token === null) return;
    applied.current = false;
    setNeedsRefresh(false);
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
      if (!isCurrent(token)) return;
      setRegeneratedItems(response.regenerated_items);
      setRegenerateErrors(response.errors ?? []);
      setStep('previewing');
    } catch (err) {
      if (!isCurrent(token)) return;
      const errorMessage = err instanceof Error ? err.message : 'Failed to generate content';
      setError(errorMessage);
      setStep('instructing'); // Go back to instruction step on error
      onError?.(errorMessage);
    } finally {
      if (isCurrent(token)) setIsGenerating(false);
    }
  }, [resumeId, selectedItems, instruction, outputLanguage, onError, t, begin, isCurrent]);

  // Reset all state
  const reset = useCallback(() => {
    invalidate();
    applied.current = false;
    applying.current = false;
    setNeedsRefresh(false);
    setStep('idle');
    setSelectedItems([]);
    setInstruction('');
    setRegeneratedItems([]);
    setRegenerateErrors([]);
    setError(null);
    setIsGenerating(false);
    setIsApplying(false);
  }, [invalidate]);

  useEffect(() => reset(), [resumeId, reset]);

  // Accept and apply the changes
  const acceptChanges = useCallback(async () => {
    if (applying.current) return;
    if (regeneratedItems.length === 0) {
      setError('No changes to apply');
      return;
    }
    const token = begin();
    if (token === null) return;
    applying.current = true;
    setIsApplying(true);
    setError(null);

    try {
      if (!applied.current) {
        await applyRegeneratedItems(resumeId, regeneratedItems);
        if (!isCurrent(token)) return;
        applied.current = true;
        setNeedsRefresh(true);
      }
      await onSuccess?.();
      if (!isCurrent(token)) return;
      reset();
    } catch (err) {
      if (!isCurrent(token)) return;
      const errorMessage = applied.current
        ? t('builder.regenerate.errors.refreshFailed')
        : err instanceof Error
          ? err.message
          : 'Failed to apply changes';
      setError(errorMessage);
      onError?.(errorMessage);
    } finally {
      if (isCurrent(token)) {
        applying.current = false;
        setIsApplying(false);
      }
    }
  }, [resumeId, regeneratedItems, onSuccess, onError, reset, begin, isCurrent, t]);

  // Reject changes and go back to instruction step
  const rejectAndRegenerate = useCallback(() => {
    if (applied.current) return;
    invalidate();
    setRegeneratedItems([]);
    setRegenerateErrors([]);
    setError(null);
    setStep('instructing');
  }, [invalidate]);

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
    needsRefresh,
    error,
    startRegenerate,
    generate,
    acceptChanges,
    rejectAndRegenerate,
    reset,
  };
}

export default useRegenerateWizard;
