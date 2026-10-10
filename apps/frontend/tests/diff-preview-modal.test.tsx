import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';
import type {
  ResumeDiffSummary,
  ResumeFieldDiff,
} from '@/components/common/resume_previewer_context';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

const diffSummary: ResumeDiffSummary = {
  total_changes: 2,
  skills_added: 1,
  skills_removed: 0,
  descriptions_modified: 1,
  certifications_added: 0,
  high_risk_changes: 1,
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
  {
    field_path: 'additional.technicalSkills',
    field_type: 'skill',
    change_type: 'added',
    new_value: 'Go',
    confidence: 'high',
  },
];

describe('DiffPreviewModal', () => {
  it('renders fallback dialog when diff data is missing', () => {
    const onClose = vi.fn();
    const onConfirm = vi.fn();
    render(<DiffPreviewModal isOpen onClose={onClose} onReject={vi.fn()} onConfirm={onConfirm} />);

    expect(screen.getByText('tailor.missingDiffDialog.title')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'tailor.missingDiffDialog.confirmLabel' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('uses the warning Alert for the missing-diff notice without repeating the confirm label', () => {
    render(<DiffPreviewModal isOpen onClose={vi.fn()} onReject={vi.fn()} onConfirm={vi.fn()} />);

    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('tailor.missingDiffDialog.description');
    expect(alert.className).toMatch(/border-warning/);
    // The confirm button already carries this text; no second copy as an icon line.
    expect(screen.getAllByText('tailor.missingDiffDialog.confirmLabel')).toHaveLength(1);
  });

  it('shows the high-risk Alert and a named risk icon only for added high changes', () => {
    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        detailedChanges={detailedChanges}
      />
    );

    const banner = screen.getByRole('alert');
    expect(banner).toHaveTextContent('tailor.diffModal.warningTitle');
    expect(banner).toHaveTextContent('tailor.diffModal.warningMessage');
    expect(banner.className).toMatch(/border-warning/);
    // Dialog uses createPortal to document.body, so the test's `container`
    // wrapper does not contain the rendered dialog content. Query
    // document.body directly to find the icons rendered inside the portal.
    const alertIcons = document.body.querySelectorAll('.lucide-triangle-alert');
    expect(alertIcons.length).toBe(1);
    // The risk marker has a name, so it is not colour- or glyph-only.
    expect(screen.getByRole('img', { name: 'tailor.diffModal.highRiskChanges' })).toBe(
      alertIcons[0]
    );
  });

  it('marks removed and added text with native del and ins semantics', () => {
    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        detailedChanges={detailedChanges}
      />
    );

    expect(document.body.querySelector('del')).toHaveTextContent('old summary');
    const inserted = [...document.body.querySelectorAll('ins')].map((el) => el.textContent);
    expect(inserted).toEqual(['new summary', 'Go']);
  });

  it('toggles section visibility on header click', () => {
    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        detailedChanges={detailedChanges}
      />
    );

    expect(screen.getByText('new summary')).toBeInTheDocument();
    const toggle = screen.getByRole('button', { name: /tailor\.diffModal\.summaryChanges/i });
    expect(toggle).toHaveAttribute('type', 'button');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(screen.queryByText('new summary')).not.toBeInTheDocument();
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
  });

  it('fires confirm and reject handlers', () => {
    const onConfirm = vi.fn();
    const onReject = vi.fn();

    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={onReject}
        onConfirm={onConfirm}
        diffSummary={diffSummary}
        detailedChanges={detailedChanges}
      />
    );

    fireEvent.click(screen.getByRole('button', { name: 'tailor.diffModal.confirmButton' }));
    fireEvent.click(screen.getByRole('button', { name: 'tailor.diffModal.rejectButton' }));

    expect(onConfirm).toHaveBeenCalledTimes(1);
    expect(onReject).toHaveBeenCalledTimes(1);
  });

  it('pins the confirm error outside the scrolling body', () => {
    render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        detailedChanges={detailedChanges}
        errorMessage="Could not save the tailored resume"
      />
    );

    const error = screen.getByText('Could not save the tailored resume');
    expect(error).toBeVisible();
    expect(error.closest('.overflow-y-auto')).toBeNull();
    // The summary card is content and still scrolls with the body.
    expect(screen.getByText('tailor.diffModal.summary').closest('.overflow-y-auto')).not.toBeNull();
  });
});
