import { afterEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { AtsCheckView } from '@/components/builder/ats-check-view';
import type { ParseCheckReport } from '@/lib/api/ats';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

const checkResumeParse = vi.fn();

vi.mock('@/lib/api/ats', () => ({
  checkResumeParse: (...args: unknown[]) => checkResumeParse(...args),
}));

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      params && Object.keys(params).length ? `${key} ${JSON.stringify(params)}` : key,
  }),
}));

const report: ParseCheckReport = {
  schema_version: '1.0',
  source: 'render',
  extractability: 'full',
  overall_score: 88,
  content_score: 94,
  page_count: 1,
  template: 'swiss-two-column',
  extracted_text_preview: 'JOHN DOE\nEXPERIENCE',
  checks: [
    {
      id: 'multi_column',
      category: 'layout',
      severity: 'medium',
      status: 'fail',
      params: { pages: [1], expected_by_template: true },
    },
    {
      id: 'section_headings',
      category: 'content',
      severity: 'medium',
      status: 'warn',
      params: { found: ['experience', 'skills'], missing: ['education'], render_locale: 'en' },
    },
    {
      id: 'contact_info',
      category: 'content',
      severity: 'high',
      status: 'pass',
      params: { email: true, phone: true, email_position: 0 },
    },
  ],
  roundtrip: {
    content_recall: 0.968,
    order_fidelity: 0.776,
    truncated: false,
    fields: [
      { field: 'summary', status: 'found', score: 1 },
      { field: 'workExperience[0].description[1]', status: 'garbled', score: 0.6 },
    ],
  },
};

afterEach(() => checkResumeParse.mockReset());

describe('AtsCheckView', () => {
  it('runs the check with the builder settings and renders the report', async () => {
    checkResumeParse.mockResolvedValue(report);
    render(<AtsCheckView resumeId="r1" settings={DEFAULT_TEMPLATE_SETTINGS} locale="en" />);

    fireEvent.click(screen.getByRole('button', { name: 'builder.atsCheck.runButton' }));
    await screen.findByText('88');

    expect(checkResumeParse).toHaveBeenCalledWith('r1', DEFAULT_TEMPLATE_SETTINGS, 'en');
    expect(screen.getByText('94')).toBeInTheDocument();
    expect(screen.getByText('builder.atsCheck.status.fail')).toBeInTheDocument();
    expect(screen.getByText('builder.atsCheck.status.warn')).toBeInTheDocument();
    expect(
      screen.getByText('builder.atsCheck.checks.multi_column.templateHint')
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        /builder\.atsCheck\.checks\.section_headings\.warn .*builder\.atsCheck\.sectionKinds\.education/
      )
    ).toBeInTheDocument();
    expect(screen.getByText('workExperience[0].description[1]')).toBeInTheDocument();
    expect(screen.queryByText('summary')).not.toBeInTheDocument();
    expect(screen.getByText('78%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'builder.atsCheck.rerunButton' })).toBeEnabled();
  });

  it('asks to save first when there is no resume id', () => {
    render(<AtsCheckView resumeId={null} settings={DEFAULT_TEMPLATE_SETTINGS} />);
    expect(screen.getByRole('alert')).toHaveTextContent('builder.atsCheck.saveFirst');
    expect(screen.getByRole('button', { name: 'builder.atsCheck.runButton' })).toBeDisabled();
  });

  it('shows the unsaved notice and a generic error on failure', async () => {
    checkResumeParse.mockRejectedValue(new Error('boom'));
    vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<AtsCheckView resumeId="r1" settings={DEFAULT_TEMPLATE_SETTINGS} hasUnsavedChanges />);
    expect(screen.getByText('builder.atsCheck.unsavedNotice')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'builder.atsCheck.runButton' }));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent('builder.atsCheck.error')
    );
    expect(screen.queryByText('boom')).not.toBeInTheDocument();
  });
});
