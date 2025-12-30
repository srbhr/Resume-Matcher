/**
 * API functions for AI-powered resume enrichment.
 */

import { apiFetch, apiPost } from './client';

// Types matching backend schemas

export interface EnrichmentItem {
  item_id: string;
  item_type: 'experience' | 'project';
  title: string;
  subtitle?: string;
  current_description: string[];
  weakness_reason: string;
}

export interface EnrichmentQuestion {
  question_id: string;
  item_id: string;
  question: string;
  placeholder: string;
}

export interface AnalysisResponse {
  items_to_enrich: EnrichmentItem[];
  questions: EnrichmentQuestion[];
  analysis_summary?: string;
}

export interface AnswerInput {
  question_id: string;
  answer: string;
}

export interface EnhancedDescription {
  item_id: string;
  item_type: 'experience' | 'project';
  title: string;
  original_description: string[];
  enhanced_description: string[];
}

export interface EnhancementPreview {
  enhancements: EnhancedDescription[];
}

/**
 * Analyze a resume to identify items that need enrichment.
 * Returns items with weak descriptions and clarifying questions.
 */
export async function analyzeResume(resumeId: string): Promise<AnalysisResponse> {
  const res = await apiFetch(`/enrichment/analyze/${resumeId}`, {
    method: 'POST',
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to analyze resume (status ${res.status}).`);
  }

  return res.json();
}

/**
 * Generate enhanced descriptions from user answers.
 */
export async function generateEnhancements(
  resumeId: string,
  answers: AnswerInput[]
): Promise<EnhancementPreview> {
  const res = await apiPost('/enrichment/enhance', {
    resume_id: resumeId,
    answers,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to generate enhancements (status ${res.status}).`);
  }

  return res.json();
}

/**
 * Apply enhancements to the master resume.
 */
export async function applyEnhancements(
  resumeId: string,
  enhancements: EnhancedDescription[]
): Promise<{ message: string; updated_items: number }> {
  const res = await apiPost(`/enrichment/apply/${resumeId}`, {
    enhancements,
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to apply enhancements (status ${res.status}).`);
  }

  return res.json();
}
