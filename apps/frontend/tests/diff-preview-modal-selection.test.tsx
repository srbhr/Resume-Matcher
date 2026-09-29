import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiffPreviewModal } from '@/components/tailor/diff-preview-modal';
import type { BulletSelectionSummary } from '@/lib/api/resume';
import type { ResumeDiffSummary } from '@/components/common/resume_previewer_context';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params ? `${key}${JSON.stringify(params)}` : key,
  }),
}));

const diffSummary: ResumeDiffSummary = {
  total_changes: 0,
  skills_added: 0,
  skills_removed: 0,
  descriptions_modified: 0,
  certifications_added: 0,
  high_risk_changes: 0,
};

const selection = (overrides: Partial<BulletSelectionSummary> = {}): BulletSelectionSummary => ({
  max_per_entry: 3,
  bullets_before: 9,
  bullets_after: 6,
  trimmed_for_fit: 0,
  scoring: 'llm',
  page_fit: 'fits',
  final_pages: 1,
  ...overrides,
});

function renderModal(selectionSummary?: BulletSelectionSummary | null) {
  render(
    <DiffPreviewModal
      isOpen
      onClose={vi.fn()}
      onReject={vi.fn()}
      onConfirm={vi.fn()}
      diffSummary={diffSummary}
      detailedChanges={[]}
      selectionSummary={selectionSummary}
    />
  );
}

const KEPT = 'tailor.selectionSummary{"kept":6,"total":9,"max":3}';

describe('DiffPreviewModal bullet selection summary', () => {
  it.each([
    ['fits', {}, 'tailor.pageFit.fits'],
    ['trimmed', { trimmed_for_fit: 2 }, 'tailor.pageFit.trimmed{"count":2}'],
    ['over', {}, 'tailor.pageFit.over'],
    ['unavailable', {}, 'tailor.pageFit.unavailable'],
  ] as const)('renders the kept count and the %s page-fit label', (page_fit, extra, label) => {
    renderModal(selection({ page_fit, ...extra }));
    const line = screen.getByText(`${KEPT} · ${label}`);
    expect(line).toHaveClass('font-mono', 'text-xs', 'uppercase');
  });

  it.each([
    ['trimmed', { trimmed_for_fit: 2 }],
    ['fits', {}],
  ] as const)(
    'warns instead of claiming a fit when the %s draft measured over one page after rewriting',
    (page_fit, extra) => {
      renderModal(selection({ page_fit, final_pages: 2, ...extra }));
      expect(screen.getByText(`${KEPT} · tailor.pageFit.finalOver`)).toBeInTheDocument();
      expect(screen.queryByText(/tailor\.pageFit\.(trimmed|fits)/)).toBeNull();
    }
  );

  it.each([
    ['fits', {}],
    ['trimmed', { trimmed_for_fit: 2 }],
  ] as const)(
    'does not claim a verified fit when the %s result was not re-checked after rewriting',
    (page_fit, extra) => {
      // final_pages is still the pre-rewrite measurement when the final check is skipped.
      renderModal(selection({ page_fit, final_pages: 1, final_check: 'skipped', ...extra }));
      expect(screen.getByText(`${KEPT} · tailor.pageFit.notRechecked`)).toBeInTheDocument();
      expect(screen.queryByText(/tailor\.pageFit\.(trimmed|fits|finalOver)/)).toBeNull();
    }
  );

  it.each([
    ['fits', {}, 1, 'tailor.pageFit.fits'],
    ['trimmed', { trimmed_for_fit: 2 }, 1, 'tailor.pageFit.trimmed{"count":2}'],
    ['fits', {}, 2, 'tailor.pageFit.finalOver'],
  ] as const)(
    'keeps the measured %s label when the final check ran (%#)',
    (page_fit, extra, final_pages, label) => {
      renderModal(selection({ page_fit, final_pages, final_check: 'ok', ...extra }));
      expect(screen.getByText(`${KEPT} · ${label}`)).toBeInTheDocument();
    }
  );

  it('keeps the over label when page fit itself could not reach one page', () => {
    renderModal(selection({ page_fit: 'over', final_pages: 2 }));
    expect(screen.getByText(`${KEPT} · tailor.pageFit.over`)).toBeInTheDocument();
  });

  it('renders only the kept count when page fit was skipped', () => {
    renderModal(selection({ page_fit: 'skipped' }));
    expect(screen.getByText(KEPT)).toBeInTheDocument();
    expect(screen.queryByText(/tailor\.pageFit/)).toBeNull();
  });

  it.each([undefined, null])('renders no summary line when selectionSummary is %s', (value) => {
    renderModal(value);
    expect(screen.queryByText(/tailor\.selectionSummary/)).toBeNull();
  });
});
