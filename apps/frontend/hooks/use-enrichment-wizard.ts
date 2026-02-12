/**
 * Hook for managing the AI-powered resume enrichment wizard state.
 * Uses useReducer for clean state transitions.
 */

import { useReducer, useCallback } from 'react';
import {
  analyzeResume,
  generateEnhancements,
  applyEnhancements,
  type EnrichmentItem,
  type EnrichmentQuestion,
  type EnhancedDescription,
  type AnswerInput,
} from '@/lib/api/enrichment';
import { testLlmConnection } from '@/lib/api/config';

// Wizard steps
export type WizardStep =
  | 'idle'
  | 'analyzing'
  | 'questions'
  | 'generating'
  | 'preview'
  | 'applying'
  | 'complete'
  | 'error'
  | 'no-improvements';

// State type
export interface WizardState {
  step: WizardStep;
  items: EnrichmentItem[];
  questions: EnrichmentQuestion[];
  currentQuestionIndex: number;
  answers: Record<string, string>; // question_id -> answer
  preview: EnhancedDescription[];
  analysisSummary: string | null;
  error: string | null;
}

// Action types
type WizardAction =
  | { type: 'START_ANALYSIS' }
  | {
      type: 'ANALYSIS_COMPLETE';
      items: EnrichmentItem[];
      questions: EnrichmentQuestion[];
      summary?: string;
    }
  | { type: 'NO_IMPROVEMENTS'; summary?: string }
  | { type: 'SET_ANSWER'; questionId: string; answer: string }
  | { type: 'NEXT_QUESTION' }
  | { type: 'PREV_QUESTION' }
  | { type: 'GO_TO_QUESTION'; index: number }
  | { type: 'START_GENERATION' }
  | { type: 'GENERATION_COMPLETE'; preview: EnhancedDescription[] }
  | { type: 'START_APPLY' }
  | { type: 'APPLY_COMPLETE' }
  | { type: 'SET_ERROR'; error: string }
  | { type: 'RESET' };

// Initial state
const initialState: WizardState = {
  step: 'idle',
  items: [],
  questions: [],
  currentQuestionIndex: 0,
  answers: {},
  preview: [],
  analysisSummary: null,
  error: null,
};

// Reducer function
function wizardReducer(state: WizardState, action: WizardAction): WizardState {
  switch (action.type) {
    case 'START_ANALYSIS':
      return {
        ...initialState,
        step: 'analyzing',
      };

    case 'ANALYSIS_COMPLETE':
      return {
        ...state,
        step: 'questions',
        items: action.items,
        questions: action.questions,
        analysisSummary: action.summary || null,
        currentQuestionIndex: 0,
      };

    case 'NO_IMPROVEMENTS':
      return {
        ...state,
        step: 'no-improvements',
        analysisSummary: action.summary || null,
      };

    case 'SET_ANSWER':
      return {
        ...state,
        answers: {
          ...state.answers,
          [action.questionId]: action.answer,
        },
      };

    case 'NEXT_QUESTION':
      return {
        ...state,
        currentQuestionIndex: Math.min(state.currentQuestionIndex + 1, state.questions.length - 1),
      };

    case 'PREV_QUESTION':
      return {
        ...state,
        currentQuestionIndex: Math.max(state.currentQuestionIndex - 1, 0),
      };

    case 'GO_TO_QUESTION':
      return {
        ...state,
        currentQuestionIndex: Math.max(0, Math.min(action.index, state.questions.length - 1)),
      };

    case 'START_GENERATION':
      return {
        ...state,
        step: 'generating',
      };

    case 'GENERATION_COMPLETE':
      return {
        ...state,
        step: 'preview',
        preview: action.preview,
      };

    case 'START_APPLY':
      return {
        ...state,
        step: 'applying',
      };

    case 'APPLY_COMPLETE':
      return {
        ...state,
        step: 'complete',
      };

    case 'SET_ERROR':
      return {
        ...state,
        step: 'error',
        error: action.error,
      };

    case 'RESET':
      return initialState;

    default:
      return state;
  }
}

// Hook
export function useEnrichmentWizard(resumeId: string) {
  const [state, dispatch] = useReducer(wizardReducer, initialState);

  // Start analysis
  const startAnalysis = useCallback(async () => {
    dispatch({ type: 'START_ANALYSIS' });

    try {
      // First, check if LLM is authenticated/healthy
      const healthCheck = await testLlmConnection();
      
      if (!healthCheck.healthy) {
        const errorMsg = healthCheck.error_code === 'not_authenticated'
          ? 'AI provider not authenticated. Please authenticate in Settings before using enrichment.'
          : healthCheck.error || 'AI provider connection failed. Please check your settings.';
        
        dispatch({
          type: 'SET_ERROR',
          error: errorMsg,
        });
        return;
      }

      const result = await analyzeResume(resumeId);

      // Check if there are any improvements needed
      if (result.items_to_enrich.length === 0 || result.questions.length === 0) {
        dispatch({
          type: 'NO_IMPROVEMENTS',
          summary: result.analysis_summary,
        });
        return;
      }

      dispatch({
        type: 'ANALYSIS_COMPLETE',
        items: result.items_to_enrich,
        questions: result.questions,
        summary: result.analysis_summary,
      });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        error: error instanceof Error ? error.message : 'Failed to analyze resume',
      });
    }
  }, [resumeId]);

  // Set answer for current question
  const setAnswer = useCallback((questionId: string, answer: string) => {
    dispatch({ type: 'SET_ANSWER', questionId, answer });
  }, []);

  // Navigate questions
  const nextQuestion = useCallback(() => {
    dispatch({ type: 'NEXT_QUESTION' });
  }, []);

  const prevQuestion = useCallback(() => {
    dispatch({ type: 'PREV_QUESTION' });
  }, []);

  const goToQuestion = useCallback((index: number) => {
    dispatch({ type: 'GO_TO_QUESTION', index });
  }, []);

  // Generate enhancements from answers
  const generateEnhancementsFromAnswers = useCallback(async () => {
    dispatch({ type: 'START_GENERATION' });

    try {
      // Convert answers to API format
      const answersArray: AnswerInput[] = Object.entries(state.answers)
        .filter(([, answer]) => answer.trim() !== '')
        .map(([questionId, answer]) => ({
          question_id: questionId,
          answer,
        }));

      const result = await generateEnhancements(resumeId, answersArray);

      dispatch({
        type: 'GENERATION_COMPLETE',
        preview: result.enhancements,
      });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        error: error instanceof Error ? error.message : 'Failed to generate enhancements',
      });
    }
  }, [resumeId, state.answers]);

  // Apply enhancements to resume
  const applyChanges = useCallback(async () => {
    dispatch({ type: 'START_APPLY' });

    try {
      await applyEnhancements(resumeId, state.preview);
      dispatch({ type: 'APPLY_COMPLETE' });
    } catch (error) {
      dispatch({
        type: 'SET_ERROR',
        error: error instanceof Error ? error.message : 'Failed to apply enhancements',
      });
    }
  }, [resumeId, state.preview]);

  // Reset wizard
  const reset = useCallback(() => {
    dispatch({ type: 'RESET' });
  }, []);

  // Retry after error
  const retry = useCallback(() => {
    // Go back to the step before the error based on what we have
    if (state.preview.length > 0) {
      // We had preview, retry apply
      dispatch({ type: 'GENERATION_COMPLETE', preview: state.preview });
    } else if (Object.keys(state.answers).length > 0) {
      // We had answers, go back to questions
      dispatch({
        type: 'ANALYSIS_COMPLETE',
        items: state.items,
        questions: state.questions,
        summary: state.analysisSummary || undefined,
      });
    } else {
      // Start fresh
      startAnalysis();
    }
  }, [state, startAnalysis]);

  // Get current question
  const currentQuestion =
    state.questions.length > 0 ? state.questions[state.currentQuestionIndex] : undefined;

  // Get item for current question
  const currentItem = currentQuestion
    ? state.items.find((item) => item.item_id === currentQuestion.item_id)
    : undefined;

  // Check if on last question
  const isLastQuestion = state.currentQuestionIndex === state.questions.length - 1;
  const isFirstQuestion = state.currentQuestionIndex === 0;

  // Count answered questions
  const answeredCount = Object.values(state.answers).filter((a) => a.trim() !== '').length;

  return {
    state,
    // Actions
    startAnalysis,
    setAnswer,
    nextQuestion,
    prevQuestion,
    goToQuestion,
    generateEnhancements: generateEnhancementsFromAnswers,
    applyChanges,
    reset,
    retry,
    // Derived state
    currentQuestion,
    currentItem,
    isLastQuestion,
    isFirstQuestion,
    answeredCount,
    totalQuestions: state.questions.length,
  };
}
