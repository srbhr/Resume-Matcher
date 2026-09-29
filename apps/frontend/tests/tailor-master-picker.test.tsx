import React from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TailorPage from '@/app/(default)/tailor/page';
import type { ResumeListItem } from '@/lib/api/resume';

const api = vi.hoisted(() => ({
  upload: vi.fn(),
  preview: vi.fn(),
  confirm: vi.fn(),
  list: vi.fn(),
  push: vi.fn(),
  back: vi.fn(),
  setPreview: vi.fn(),
  jobs: vi.fn(),
  improvements: vi.fn(),
  resumes: vi.fn(),
}));
const router = { push: api.push, back: api.back };
const t = (key: string) => key;
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t, locale: 'es' }) }));
vi.mock('@/lib/api/resume', () => ({
  uploadJobDescriptions: api.upload,
  previewImproveResume: api.preview,
  confirmImproveResume: api.confirm,
  fetchResumeList: api.list,
  toPageFitSettings: (settings: { template: string }, locale?: string) => ({
    template: settings.template,
    lang: locale,
  }),
}));
vi.mock('@/lib/api/config', () => ({
  fetchPromptConfig: async () => ({ prompt_options: [], default_prompt_id: 'keywords' }),
}));
vi.mock('@/components/common/resume_previewer_context', () => ({
  useResumePreview: () => ({ setImprovedData: api.setPreview }),
}));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({
    status: { llm_configured: true },
    isLoading: false,
    incrementJobs: api.jobs,
    incrementImprovements: api.improvements,
    incrementResumes: api.resumes,
  }),
}));
vi.mock('@/components/tailor/diff-preview-modal', () => ({
  DiffPreviewModal: ({
    onConfirm,
    selectionSummary,
  }: {
    onConfirm: () => void;
    selectionSummary?: { bullets_after: number } | null;
  }) => (
    <div role="dialog">
      <button onClick={onConfirm}>Confirm preview</button>
      {selectionSummary && <span data-testid="selection">{selectionSummary.bullets_after}</span>}
    </div>
  ),
}));

const PROMPT_ID = 'keywords';

function master(id: string, isDefault: boolean, title: string): ResumeListItem {
  return {
    resume_id: id,
    filename: null,
    is_master: true,
    is_default_master: isDefault,
    parent_id: null,
    processing_status: 'ready',
    created_at: '',
    updated_at: '',
    title,
  };
}

const PREVIEW_RESULT = {
  request_id: 'preview-request',
  data: {
    job_id: 'job',
    preview_id: 'preview',
    resume_id: null,
    resume_preview: { personalInfo: { name: 'Ada' } },
    improvements: [],
    diff_summary: { total_changes: 1 },
    detailed_changes: [],
  },
};
const CONFIRMED = {
  request_id: 'confirmed-request',
  data: { job_id: 'job', resume_id: 'tailored' },
};

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  api.upload.mockResolvedValue('job');
  api.preview.mockResolvedValue(PREVIEW_RESULT);
  api.confirm.mockResolvedValue(CONFIRMED);
});

async function renderPage() {
  const view = render(<TailorPage />);
  await act(async () => {});
  return view;
}

async function fillJobDescriptionAndGenerate() {
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'A software engineer role building useful tools with Python and SQL.' },
  });
  await act(async () => screen.getByRole('button', { name: 'tailor.generateTailored' }).click());
}

function chooseMaster(label: string, options: { hidden?: boolean } = {}) {
  fireEvent.click(screen.getByRole('button', { name: 'tailor.selectResume', ...options }));
  fireEvent.click(screen.getByRole('menuitemradio', { name: new RegExp(label), ...options }));
}

async function confirmDiff() {
  await act(async () => screen.getByRole('button', { name: 'Confirm preview' }).click());
}

describe('tailor page master picker', () => {
  it('preselects the default master and sends the bullet cap', async () => {
    api.list.mockResolvedValue([
      master('m1', false, 'DevRel'),
      master('m2', true, 'Solutions Eng'),
    ]);
    await renderPage();
    expect(await screen.findByText('Solutions Eng')).toBeInTheDocument();
    await fillJobDescriptionAndGenerate();
    expect(api.preview).toHaveBeenCalledWith(
      'm2',
      'job',
      PROMPT_ID,
      expect.objectContaining({ maxBulletsPerEntry: 3 })
    );
  });

  it('sends page-fit settings built from the stored builder settings and UI locale', async () => {
    localStorage.setItem('resume_builder_settings', JSON.stringify({ template: 'modern' }));
    api.list.mockResolvedValue([master('m1', true, 'DevRel')]);
    await renderPage();
    await fillJobDescriptionAndGenerate();
    expect(api.preview).toHaveBeenCalledWith('m1', 'job', PROMPT_ID, {
      maxBulletsPerEntry: 3,
      pageFit: { template: 'modern', lang: 'es' },
    });
  });

  it('keeps Generate disabled until a source master is resolved', async () => {
    api.list.mockReturnValue(new Promise(() => {})); // the resume list never arrives
    await renderPage();
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'A software engineer role building useful tools with Python and SQL.' },
    });
    expect(screen.getByRole('button', { name: 'tailor.generateTailored' })).toBeDisabled();
  });

  it('shows no picker when there is a single ready master', async () => {
    api.list.mockResolvedValue([master('m1', true, 'DevRel')]);
    await renderPage();
    expect(screen.queryByRole('button', { name: 'tailor.selectResume' })).toBeNull();
  });

  it('lists only ready masters in the picker', async () => {
    api.list.mockResolvedValue([
      master('m1', true, 'DevRel'),
      { ...master('m2', false, 'Half Parsed'), processing_status: 'processing' },
      { ...master('m3', false, 'Tailored'), is_master: false },
      master('m4', false, 'SWE'),
    ]);
    await renderPage();
    fireEvent.click(screen.getByRole('button', { name: 'tailor.selectResume' }));
    expect(screen.getAllByRole('menuitemradio').map((el) => el.textContent)).toEqual([
      expect.stringContaining('DevRel'),
      expect.stringContaining('SWE'),
    ]);
  });

  it('falls back to the stored master id when no master is the default', async () => {
    localStorage.setItem('master_resume_id', 'm2');
    api.list.mockResolvedValue([master('m1', false, 'DevRel'), master('m2', false, 'SWE')]);
    await renderPage();
    await fillJobDescriptionAndGenerate();
    expect(api.preview).toHaveBeenCalledWith('m2', 'job', PROMPT_ID, expect.anything());
  });

  it('uses the stored master id when the list request fails', async () => {
    localStorage.setItem('master_resume_id', 'stored');
    api.list.mockRejectedValue(new Error('offline'));
    await renderPage();
    await fillJobDescriptionAndGenerate();
    expect(api.preview).toHaveBeenCalledWith('stored', 'job', PROMPT_ID, expect.anything());
    expect(api.push).not.toHaveBeenCalled();
  });

  it('redirects to the dashboard when the list request fails and nothing is stored', async () => {
    api.list.mockRejectedValue(new Error('offline'));
    await renderPage();
    await waitFor(() => expect(api.push).toHaveBeenCalledWith('/dashboard'));
  });

  it('redirects to the dashboard when no ready master exists, even with a stored id', async () => {
    localStorage.setItem('master_resume_id', 'm1');
    api.list.mockResolvedValue([{ ...master('m1', true, 'X'), processing_status: 'processing' }]);
    await renderPage();
    await waitFor(() => expect(api.push).toHaveBeenCalledWith('/dashboard'));
  });
});

describe('tailor page pinned preview source', () => {
  it('locks the picker while a preview runs and confirms with the source it was built from', async () => {
    api.list.mockResolvedValue([master('m1', true, 'DevRel'), master('m2', false, 'SWE')]);
    let resolvePreview!: (value: unknown) => void;
    api.preview.mockReturnValue(new Promise((resolve) => (resolvePreview = resolve)));
    await renderPage();
    await fillJobDescriptionAndGenerate();
    expect(api.preview).toHaveBeenCalledWith('m1', 'job', PROMPT_ID, expect.anything());
    const picker = screen.getByRole('button', { name: 'tailor.selectResume' });
    expect(picker).toBeDisabled();
    await act(async () => resolvePreview(PREVIEW_RESULT));
    expect(picker).toBeDisabled(); // still locked while the diff modal is open
    await confirmDiff();
    expect(api.confirm).toHaveBeenCalledWith(expect.objectContaining({ resume_id: 'm1' }));
  });

  it('previews and confirms the master chosen before generating', async () => {
    api.list.mockResolvedValue([master('m1', true, 'DevRel'), master('m2', false, 'SWE')]);
    await renderPage();
    chooseMaster('SWE');
    await fillJobDescriptionAndGenerate();
    await confirmDiff();
    expect(api.preview).toHaveBeenCalledWith('m2', 'job', PROMPT_ID, expect.anything());
    expect(api.confirm).toHaveBeenCalledWith(expect.objectContaining({ resume_id: 'm2' }));
  });

  it('confirms the pinned source even if the picker changes after the preview was built', async () => {
    api.list.mockResolvedValue([master('m1', true, 'DevRel'), master('m2', false, 'SWE')]);
    api.preview.mockResolvedValue({
      ...PREVIEW_RESULT,
      data: { ...PREVIEW_RESULT.data, diff_summary: null },
    });
    await renderPage();
    await fillJobDescriptionAndGenerate();
    // The missing-diff dialog is open and the picker is not disabled by page state;
    // switching it must not redirect the pending confirmation to another master.
    chooseMaster('SWE', { hidden: true });
    await act(async () =>
      screen
        .getByRole('button', { name: 'tailor.missingDiffDialog.confirmLabel', hidden: true })
        .click()
    );
    expect(api.confirm).toHaveBeenCalledWith(expect.objectContaining({ resume_id: 'm1' }));
  });

  it('passes the bullet selection summary to the diff modal', async () => {
    api.list.mockResolvedValue([master('m1', true, 'DevRel')]);
    api.preview.mockResolvedValue({
      ...PREVIEW_RESULT,
      data: {
        ...PREVIEW_RESULT.data,
        bullet_selection: {
          max_per_entry: 3,
          bullets_before: 9,
          bullets_after: 6,
          trimmed_for_fit: 0,
          scoring: 'llm',
          page_fit: 'fits',
          final_pages: 1,
        },
      },
    });
    await renderPage();
    await fillJobDescriptionAndGenerate();
    expect(screen.getByTestId('selection')).toHaveTextContent('6');
  });
});
