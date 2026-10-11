import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen } from '@testing-library/react';
import type { ATSScore } from '@/components/common/resume_previewer_context';
import type { ATSScoreRecord } from '@/lib/api/resume';

const api = vi.hoisted(() => ({ last: vi.fn(), recalculate: vi.fn() }));
vi.mock('@/lib/api/resume', () => ({
  fetchLastAtsScore: (...args: unknown[]) => api.last(...args),
  recalculateAtsScore: (...args: unknown[]) => api.recalculate(...args),
}));
vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string, params?: Record<string, unknown>) =>
      params ? `${key}${JSON.stringify(params)}` : key,
  }),
}));

import { AtsScorePanel } from '@/components/builder/ats-score-panel';

const record = (overall: number, at = '2026-10-10T10:00:00+00:00'): ATSScoreRecord => ({
  score: {
    overall_score: overall,
    sub_scores: {
      keyword_match: 80,
      skills_coverage: 80,
      title_match: 100,
      section_completeness: 100,
      date_consistency: 100,
    },
    missing_keywords: [],
    injectable_keywords: [],
    recommendations: [],
  } satisfies ATSScore,
  calculated_at: at,
});

async function renderPanel(hasUnsavedChanges = false) {
  const view = render(<AtsScorePanel resumeId="r1" hasUnsavedChanges={hasUnsavedChanges} />);
  await act(async () => {});
  return view;
}

const recalcButton = () =>
  screen.getByRole('button', { name: /builder\.jdMatch\.atsScore\.recalculate/ });

beforeEach(() => {
  api.last.mockReset();
  api.recalculate.mockReset();
});

describe('AtsScorePanel', () => {
  it('shows the last calculated score with its time, without recalculating', async () => {
    api.last.mockResolvedValue(record(88.5));
    await renderPanel();
    expect(api.last).toHaveBeenCalledWith('r1');
    expect(api.recalculate).not.toHaveBeenCalled();
    expect(screen.getByText('88.5')).toBeInTheDocument();
    expect(screen.getByText(/builder\.jdMatch\.atsScore\.lastCalculated/)).toBeInTheDocument();
  });

  it('recalculates on demand and shows the new score', async () => {
    api.last.mockResolvedValue(record(70));
    api.recalculate.mockResolvedValue(record(85, '2026-10-11T09:00:00+00:00'));
    await renderPanel();
    expect(screen.getByText('70.0')).toBeInTheDocument();

    await act(async () => fireEvent.click(recalcButton()));

    expect(api.recalculate).toHaveBeenCalledWith('r1');
    expect(screen.getByText('85.0')).toBeInTheDocument();
    expect(screen.queryByText('70.0')).not.toBeInTheDocument();
  });

  it('offers a first calculation when none was saved', async () => {
    api.last.mockResolvedValue(null);
    api.recalculate.mockResolvedValue(record(77));
    await renderPanel();
    expect(screen.getByText('builder.jdMatch.atsScore.notCalculated')).toBeInTheDocument();

    await act(async () => fireEvent.click(recalcButton()));

    expect(screen.getByText('77.0')).toBeInTheDocument();
  });

  it('keeps the last score and explains when recalculation fails', async () => {
    api.last.mockResolvedValue(record(70));
    api.recalculate.mockImplementation(() => Promise.reject(new Error('status 409')));
    await renderPanel();

    await act(async () => fireEvent.click(recalcButton()));

    expect(screen.getByText('70.0')).toBeInTheDocument();
    expect(screen.getByText('builder.jdMatch.atsScore.recalculateFailed')).toBeInTheDocument();
  });

  it('reports a failed load instead of claiming no score exists', async () => {
    api.last.mockImplementation(() => Promise.reject(new Error('status 500')));
    await renderPanel();
    expect(screen.getByText('builder.jdMatch.atsScore.loadFailed')).toBeInTheDocument();
    expect(screen.queryByText('builder.jdMatch.atsScore.notCalculated')).not.toBeInTheDocument();
  });

  it('asks to save first while there are unsaved edits', async () => {
    api.last.mockResolvedValue(record(70));
    await renderPanel(true);
    expect(recalcButton()).toBeDisabled();
    expect(screen.getByText('builder.jdMatch.atsScore.saveFirst')).toBeInTheDocument();
  });
});
