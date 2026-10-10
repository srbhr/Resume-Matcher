import { describe, expect, it, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';
import type {
  ATSScore,
  ResumeDiffSummary,
  ResumeFieldDiff,
} from '@/components/common/resume_previewer_context';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

const diffSummary: ResumeDiffSummary = {
  total_changes: 1,
  skills_added: 0,
  skills_removed: 0,
  descriptions_modified: 1,
  certifications_added: 0,
  high_risk_changes: 0,
};

const detailedChanges: ResumeFieldDiff[] = [
  {
    field_path: 'summary',
    field_type: 'summary',
    change_type: 'modified',
    original_value: 'old summary',
    new_value: 'new summary',
    confidence: 'medium',
  },
];

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

function renderModal(props: Partial<Parameters<typeof DiffPreviewModal>[0]> = {}) {
  return render(
    <DiffPreviewModal
      isOpen
      onClose={vi.fn()}
      onReject={vi.fn()}
      onConfirm={vi.fn()}
      diffSummary={diffSummary}
      detailedChanges={detailedChanges}
      {...props}
    />
  );
}

describe('DiffPreviewModal ATS score', () => {
  it('renders the ATS score breakdown inside the dialog', () => {
    renderModal({ atsScore });

    // The score must live inside the dialog: anything rendered outside it is
    // hidden behind the full-screen overlay (the original bug).
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('tailor.atsScore.title')).toBeInTheDocument();
    expect(within(dialog).getByText('72.4')).toBeInTheDocument();
    expect(within(dialog).getByText('tailor.atsScore.keywordMatch')).toBeInTheDocument();
    expect(within(dialog).getByText('64.0%')).toBeInTheDocument();
    expect(within(dialog).getByText('kubernetes')).toBeInTheDocument();
    expect(within(dialog).getByText('terraform')).toBeInTheDocument();
    expect(within(dialog).getByText('Mention kubernetes experience')).toBeInTheDocument();
  });

  it('shows title and date sub-scores only when they were scored', () => {
    renderModal({ atsScore });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('tailor.atsScore.titleMatch')).toBeInTheDocument();
    expect(within(dialog).getByText('75.0%')).toBeInTheDocument();
    // date_consistency is null (fewer than two dates) and must not render as 0%.
    expect(within(dialog).queryByText('tailor.atsScore.dateConsistency')).not.toBeInTheDocument();
  });

  it.each(['swiss-two-column', 'modern-two-column', 'vivid'] as const)(
    'warns that the %s layout may be misread by an ATS',
    (template) => {
      renderModal({ atsScore, layoutTemplate: template });
      expect(
        within(screen.getByRole('dialog')).getByText('tailor.atsScore.twoColumnWarning')
      ).toBeInTheDocument();
    }
  );

  it.each(['swiss-single', 'modern', 'latex', 'clean'] as const)(
    'shows no layout warning for the single-column %s template',
    (template) => {
      renderModal({ atsScore, layoutTemplate: template });
      expect(screen.queryByText('tailor.atsScore.twoColumnWarning')).not.toBeInTheDocument();
    }
  );

  it('omits the ATS section when no score was returned', () => {
    renderModal();
    expect(screen.queryByText('tailor.atsScore.title')).not.toBeInTheDocument();
  });

  it('shows the ATS score in the missing-diff fallback dialog too', () => {
    renderModal({ atsScore, diffSummary: undefined, detailedChanges: undefined });
    const dialog = screen.getByRole('dialog');
    expect(within(dialog).getByText('tailor.missingDiffDialog.title')).toBeInTheDocument();
    expect(within(dialog).getByText('72.4')).toBeInTheDocument();
  });
});
