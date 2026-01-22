import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

const diffSummary = {
  total_changes: 2,
  skills_added: 1,
  skills_removed: 0,
  descriptions_modified: 1,
  certifications_added: 0,
  high_risk_changes: 1,
};

const detailedChanges = [
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

  it('shows warning banner and renders high-risk icon only for added high changes', () => {
    const { container } = render(
      <DiffPreviewModal
        isOpen
        onClose={vi.fn()}
        onReject={vi.fn()}
        onConfirm={vi.fn()}
        diffSummary={diffSummary}
        detailedChanges={detailedChanges}
      />
    );

    expect(screen.getByText('tailor.diffModal.warningTitle', { exact: false })).toBeInTheDocument();
    const alertIcons = container.querySelectorAll('.lucide-triangle-alert');
    expect(alertIcons.length).toBe(2);
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
    fireEvent.click(screen.getByRole('button', { name: /tailor\.diffModal\.summaryChanges/i }));
    expect(screen.queryByText('new summary')).not.toBeInTheDocument();
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
});
