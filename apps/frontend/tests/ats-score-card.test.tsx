import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ATSScoreCard } from '@/components/tailor/ats-score-card';
import type { ATSScore } from '@/components/common/resume_previewer_context';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

const atsScore: ATSScore = {
  overall_score: 72.4,
  sub_scores: {
    keyword_match: 64.0,
    skills_coverage: 80.0,
    title_match: 75.0,
    section_completeness: 90.0,
    date_consistency: null,
  },
  missing_keywords: ['kubernetes'],
  injectable_keywords: ['terraform'],
  recommendations: ['Mention kubernetes experience'],
};

describe('ATSScoreCard', () => {
  it('renders the breakdown with translated labels', () => {
    render(<ATSScoreCard atsScore={atsScore} />);

    expect(screen.getByText('tailor.atsScore.title')).toBeInTheDocument();
    expect(screen.getByText('72.4')).toBeInTheDocument();
    expect(screen.getByText('tailor.atsScore.keywordMatch')).toBeInTheDocument();
    expect(screen.getByText('64.0%')).toBeInTheDocument();
    expect(screen.getByText('tailor.atsScore.missingKeywords')).toBeInTheDocument();
    expect(screen.getByText('kubernetes')).toBeInTheDocument();
    expect(screen.getByText('tailor.atsScore.injectableKeywords')).toBeInTheDocument();
    expect(screen.getByText('terraform')).toBeInTheDocument();
    expect(screen.getByText('tailor.atsScore.recommendations')).toBeInTheDocument();
  });

  it('shows title and date sub-scores only when they were scored', () => {
    render(<ATSScoreCard atsScore={atsScore} />);

    expect(screen.getByText('tailor.atsScore.titleMatch')).toBeInTheDocument();
    expect(screen.getByText('75.0%')).toBeInTheDocument();
    // date_consistency is null (fewer than two dates) and must not render as 0%.
    expect(screen.queryByText('tailor.atsScore.dateConsistency')).not.toBeInTheDocument();
  });

  it('keeps working for scores without the newer sub-scores', () => {
    const legacy: ATSScore = {
      ...atsScore,
      sub_scores: { keyword_match: 50, skills_coverage: 40, section_completeness: 100 },
    };
    render(<ATSScoreCard atsScore={legacy} />);

    expect(screen.getByText('tailor.atsScore.sectionCompleteness')).toBeInTheDocument();
    expect(screen.queryByText('tailor.atsScore.titleMatch')).not.toBeInTheDocument();
  });

  it.each(['swiss-two-column', 'modern-two-column', 'vivid'] as const)(
    'warns that the %s layout may be misread by an ATS',
    (template) => {
      render(<ATSScoreCard atsScore={atsScore} template={template} />);
      expect(screen.getByText('tailor.atsScore.twoColumnWarning')).toBeInTheDocument();
    }
  );

  it.each(['swiss-single', 'modern', 'latex', 'clean'] as const)(
    'shows no layout warning for the single-column %s template',
    (template) => {
      render(<ATSScoreCard atsScore={atsScore} template={template} />);
      expect(screen.queryByText('tailor.atsScore.twoColumnWarning')).not.toBeInTheDocument();
    }
  );
});
