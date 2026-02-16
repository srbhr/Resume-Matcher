'use client';

import { useMemo } from 'react';
import { type ResumeData } from '@/components/dashboard/resume-component';
import {
  extractKeywords,
  calculateMatchStats,
  buildKeywordsFromStructured,
  calculateStructuredMatchStats,
} from '@/lib/utils/keyword-matcher';
import type { JobKeywords } from '@/lib/api/resume';
import { JDDisplay } from './jd-display';
import { HighlightedResumeView } from './highlighted-resume-view';
import { CheckCircle, Target } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

interface JDComparisonViewProps {
  jobDescription: string;
  resumeData: ResumeData;
  jobKeywords?: JobKeywords;
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
}: JDComparisonViewProps) {
  const { t } = useTranslations();

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
      </div>

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
