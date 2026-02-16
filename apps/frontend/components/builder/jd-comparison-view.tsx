'use client';

import { useState, useMemo } from 'react';
import { type ResumeData } from '@/components/dashboard/resume-component';
import {
  extractKeywords,
  calculateMatchStats,
  buildKeywordsFromStructured,
  calculateStructuredMatchStats,
} from '@/lib/utils/keyword-matcher';
import { fetchMatchAnalysis, type MatchAnalysisResponse, type JobKeywords } from '@/lib/api/resume';
import { JDDisplay } from './jd-display';
import { HighlightedResumeView } from './highlighted-resume-view';
import { CheckCircle, Target } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

interface JDComparisonViewProps {
  jobDescription: string;
  resumeData: ResumeData;
  jobKeywords?: JobKeywords;
  resumeId?: string;
}

/**
 * Split view comparing job description with resume.
 * Left: JD (read-only)
 * Right: Resume with matching keywords highlighted
 */
export function JDComparisonView({
  jobDescription,
  resumeData,
  jobKeywords,
  resumeId,
}: JDComparisonViewProps) {
  const { t } = useTranslations();
  const [analysis, setAnalysis] = useState<MatchAnalysisResponse | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysisError, setAnalysisError] = useState<string | null>(null);

  // Use LLM-extracted structured keywords when available, fall back to naive extraction
  const structuredKeywords = useMemo(
    () => (jobKeywords ? buildKeywordsFromStructured(jobKeywords) : null),
    [jobKeywords]
  );

  // Naive keyword extraction (fallback) - also used for text highlighting
  const keywords = useMemo(() => {
    if (structuredKeywords) {
      // Convert structured multi-word phrases to single-word set for highlight rendering
      const highlightWords = new Set<string>();
      for (const phrase of structuredKeywords) {
        for (const word of phrase.split(/\s+/)) {
          const clean = word.toLowerCase().replace(/[^a-z0-9-]/g, '');
          if (clean.length >= 2) highlightWords.add(clean);
        }
      }
      return highlightWords;
    }
    return extractKeywords(jobDescription);
  }, [jobDescription, structuredKeywords]);

  // Build full resume text for stats calculation
  const resumeText = useMemo(() => {
    const parts: string[] = [];

    if (resumeData.summary) parts.push(resumeData.summary);

    resumeData.workExperience?.forEach((exp) => {
      if (exp.title) parts.push(exp.title);
      if (exp.company) parts.push(exp.company);
      exp.description?.forEach((d) => parts.push(d));
    });

    resumeData.education?.forEach((edu) => {
      if (edu.degree) parts.push(edu.degree);
      if (edu.institution) parts.push(edu.institution);
    });

    resumeData.personalProjects?.forEach((proj) => {
      if (proj.name) parts.push(proj.name);
      if (proj.role) parts.push(proj.role);
      proj.description?.forEach((d) => parts.push(d));
    });

    if (resumeData.additional) {
      resumeData.additional.technicalSkills?.forEach((s) => parts.push(s));
      resumeData.additional.languages?.forEach((l) => parts.push(l));
      resumeData.additional.certificationsTraining?.forEach((c) => parts.push(c));
    }

    return parts.join(' ');
  }, [resumeData]);

  // Calculate match statistics - use structured keywords for accuracy when available
  const stats = useMemo(() => {
    if (structuredKeywords) {
      return calculateStructuredMatchStats(resumeText, structuredKeywords);
    }
    return calculateMatchStats(resumeText, keywords);
  }, [resumeText, keywords, structuredKeywords]);

  async function handleAnalyze(): Promise<void> {
    if (!resumeId) return;
    setAnalyzing(true);
    setAnalysisError(null);
    try {
      const result = await fetchMatchAnalysis(resumeId);
      setAnalysis(result);
    } catch (err) {
      setAnalysisError(err instanceof Error ? err.message : 'Analysis failed');
    } finally {
      setAnalyzing(false);
    }
  }

  return (
    <div className="h-full flex flex-col">
      {/* Stats Bar */}
      <div className="flex items-center justify-between px-4 py-3 bg-white border-b border-gray-200">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Target className="w-4 h-4 text-blue-600" />
            <span className="text-sm font-mono">
              {t('builder.jdMatch.stats.keywordsExtracted', { count: keywords.size })}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="w-4 h-4 text-green-600" />
            <span className="text-sm font-mono">
              {t('builder.jdMatch.stats.matchesFound', { count: stats.matchCount })}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <span className="text-sm font-mono text-gray-600">
              {t('builder.jdMatch.stats.matchRateLabel')}
            </span>
            <span
              className={`text-lg font-bold ${
                stats.matchPercentage >= 50
                  ? 'text-green-600'
                  : stats.matchPercentage >= 30
                    ? 'text-yellow-600'
                    : 'text-red-600'
              }`}
            >
              {stats.matchPercentage}%
            </span>
          </div>
          {resumeId && !analysis && (
            <button
              onClick={handleAnalyze}
              disabled={analyzing}
              className="border border-black rounded-none px-3 py-1 text-xs font-mono uppercase tracking-wide hover:bg-black hover:text-white transition-colors disabled:opacity-50"
            >
              {analyzing ? t('builder.jdMatch.analyzing') : t('builder.jdMatch.analyzeButton')}
            </button>
          )}
        </div>
      </div>

      {/* Deep Analysis Results */}
      {analysis && (
        <div className="px-4 py-3 bg-white border-b border-black">
          <div className="space-y-3">
            {/* ATS Score */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono uppercase tracking-wide">
                  {t('builder.jdMatch.atsScore')}
                </span>
                <span
                  className={`text-sm font-bold font-mono ${
                    analysis.ats_score.score >= 50
                      ? 'text-green-700'
                      : analysis.ats_score.score >= 30
                        ? 'text-yellow-600'
                        : 'text-red-600'
                  }`}
                >
                  {analysis.ats_score.score}%
                </span>
              </div>
              <div className="h-1.5 bg-gray-200">
                <div
                  className="h-1.5 bg-black transition-all"
                  style={{ width: `${Math.min(analysis.ats_score.score, 100)}%` }}
                />
              </div>
            </div>

            {/* Semantic Score */}
            <div>
              <div className="flex items-center justify-between mb-1">
                <span className="text-xs font-mono uppercase tracking-wide">
                  {t('builder.jdMatch.semanticScore')}
                </span>
                <span
                  className={`text-sm font-bold font-mono ${
                    analysis.semantic_score.score >= 50
                      ? 'text-green-700'
                      : analysis.semantic_score.score >= 30
                        ? 'text-yellow-600'
                        : 'text-red-600'
                  }`}
                >
                  {analysis.semantic_score.score}%
                </span>
              </div>
              <div className="h-1.5 bg-gray-200">
                <div
                  className="h-1.5 bg-[#1D4ED8] transition-all"
                  style={{ width: `${Math.min(analysis.semantic_score.score, 100)}%` }}
                />
              </div>
            </div>

            {/* Detail rows */}
            <div className="text-xs font-mono space-y-1 pt-1 border-t border-gray-200">
              {analysis.ats_score.synonym_matches.length > 0 && (
                <p className="text-gray-600">
                  {t('builder.jdMatch.synonymsResolved')}:{' '}
                  {analysis.ats_score.synonym_matches
                    .map((s) => `${s.jd_term} → ${s.resume_term}`)
                    .join(', ')}
                </p>
              )}
              {analysis.ats_score.missing_keywords.length > 0 && (
                <p className="text-red-600">
                  {t('builder.jdMatch.missingKeywords')}:{' '}
                  {analysis.ats_score.missing_keywords.join(', ')}
                </p>
              )}
              {analysis.semantic_score.section_scores.length > 0 &&
                (() => {
                  const nonZero = analysis.semantic_score.section_scores.filter((s) => s.score > 0);
                  if (nonZero.length === 0) return null;
                  const weakest = nonZero.reduce((min, s) => (s.score < min.score ? s : min));
                  return (
                    <p className="text-gray-600">
                      {t('builder.jdMatch.weakestSection')}: {weakest.section} ({weakest.score}%)
                    </p>
                  );
                })()}
            </div>
          </div>
        </div>
      )}

      {analysisError && (
        <div className="px-4 py-2 bg-red-50 border-b border-red-200">
          <p className="text-xs font-mono text-red-600">{analysisError}</p>
        </div>
      )}

      {/* Split View */}
      <div className="flex-1 grid grid-cols-2 min-h-0">
        {/* Left: JD */}
        <div className="border-r border-gray-200 overflow-hidden">
          <JDDisplay content={jobDescription} />
        </div>

        {/* Right: Resume with highlights */}
        <div className="overflow-hidden">
          <HighlightedResumeView resumeData={resumeData} keywords={keywords} />
        </div>
      </div>
    </div>
  );
}
