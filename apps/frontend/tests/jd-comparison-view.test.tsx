import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { JDComparisonView } from '@/components/builder/jd-comparison-view';
import type { ResumeData } from '@/components/dashboard/resume-component';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}${JSON.stringify(params)}` : key,
  }),
}));

const resume = {
  summary: 'Built machine learning services in Python at TechCorp.',
  additional: { technicalSkills: ['Docker'] },
} as unknown as ResumeData;

const JD = 'Join TechCorp: Python, Kubernetes, machine learning and Docker using CI/CD.';

describe('JDComparisonView', () => {
  it("shows the ATS keyword match on the job's saved keywords", () => {
    render(
      <JDComparisonView
        jobDescription={JD}
        resumeData={resume}
        jobKeywords={['Python', 'Kubernetes', 'machine learning']}
        company="TechCorp"
      />
    );
    expect(screen.getByText('builder.jdMatch.stats.jobKeywords{"count":3}')).toBeInTheDocument();
    expect(screen.getByText('builder.jdMatch.stats.matchesFound{"count":2}')).toBeInTheDocument();
    expect(screen.getByText('builder.jdMatch.stats.keywordMatchLabel')).toBeInTheDocument();
    // 66.7 is below the ATS card's 80/60 green band edge, above its red one.
    expect(screen.getByText('66.7%')).toHaveClass('text-warning-text');
    const marks = [...document.querySelectorAll('mark')].map((m) => m.textContent);
    expect(marks).toEqual(['machine learning', 'Python']);
  });

  it('falls back to word overlap without the company name when no keywords are saved', () => {
    render(
      <JDComparisonView
        jobDescription={JD}
        resumeData={resume}
        jobKeywords={null}
        company="TechCorp"
      />
    );
    // python, kubernetes, machine, learning, docker, ci/cd: no "join", "using" or "techcorp".
    expect(
      screen.getByText('builder.jdMatch.stats.keywordsExtracted{"count":6}')
    ).toBeInTheDocument();
    expect(screen.getByText('builder.jdMatch.stats.matchesFound{"count":4}')).toBeInTheDocument();
    expect(screen.getByText('builder.jdMatch.stats.wordOverlapLabel')).toBeInTheDocument();
    expect(screen.getByText('66.7%')).toHaveClass('text-success');
  });
});
