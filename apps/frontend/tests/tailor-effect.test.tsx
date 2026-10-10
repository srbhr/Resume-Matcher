import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TailorPage from '@/app/(default)/tailor/page';

const api = vi.hoisted(() => ({
  upload: vi.fn(),
  preview: vi.fn(),
  list: vi.fn(),
}));
const t = (key: string) => key;
// A stable router: the page re-loads its masters whenever `router` changes identity.
const router = { push: vi.fn(), back: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t }) }));
vi.mock('@/lib/api/resume', () => ({
  uploadJobDescriptions: api.upload,
  previewImproveResume: api.preview,
  confirmImproveResume: vi.fn(),
  fetchResumeList: api.list,
  toPageFitSettings: () => ({}),
}));
vi.mock('@/lib/api/config', () => ({
  fetchPromptConfig: async () => ({ prompt_options: [], default_prompt_id: 'keywords' }),
}));
vi.mock('@/components/common/resume_previewer_context', () => ({
  useResumePreview: () => ({ setImprovedData: vi.fn() }),
}));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({
    status: { llm_configured: true },
    isLoading: false,
    incrementJobs: vi.fn(),
    incrementImprovements: vi.fn(),
    incrementResumes: vi.fn(),
  }),
}));
vi.mock('@/components/tailor/diff-preview-modal', () => ({
  DiffPreviewModal: ({ onClose }: { onClose: () => void }) => (
    <div role="dialog">
      <button onClick={onClose}>Close preview</button>
    </div>
  ),
}));
// Only the effect wiring matters: report what the page asks its frame for.
vi.mock('@/components/ui/page-frame', () => ({
  PageFrame: ({
    effect,
    effectIntensity,
    children,
  }: {
    effect?: string;
    effectIntensity?: string;
    children: React.ReactNode;
  }) => (
    <div data-testid="frame" data-effect={effect} data-intensity={effectIntensity}>
      {children}
    </div>
  ),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const preview = {
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

const frame = () => screen.getByTestId('frame');

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  localStorage.setItem('master_resume_id', 'master');
  api.list.mockResolvedValue([
    {
      resume_id: 'master',
      is_master: true,
      is_default_master: true,
      processing_status: 'ready',
      title: 'M',
      filename: null,
      parent_id: null,
      created_at: '',
      updated_at: '',
    },
  ]);
  api.upload.mockResolvedValue('job');
});

async function startGenerate() {
  fireEvent.change(screen.getByRole('textbox'), {
    target: { value: 'A software engineer role building useful tools with Python and SQL.' },
  });
  await act(async () => screen.getByRole('button', { name: 'tailor.generateTailored' }).click());
}

describe('Tailor page background effect', () => {
  it('shows Retro Bitrate instead of the beams, idle while the page waits for input', async () => {
    render(<TailorPage />);
    await act(async () => {});
    expect(frame()).toHaveAttribute('data-effect', 'bitrate');
    expect(frame()).toHaveAttribute('data-intensity', 'idle');
  });

  it('goes active while generating, and back to idle when the diff modal opens', async () => {
    const pending = deferred<typeof preview>();
    api.preview.mockReturnValue(pending.promise);
    render(<TailorPage />);
    await act(async () => {});

    await startGenerate();
    expect(frame()).toHaveAttribute('data-effect', 'bitrate');
    expect(frame()).toHaveAttribute('data-intensity', 'active');
    expect(screen.queryByRole('dialog')).toBeNull();

    await act(async () => pending.resolve(preview));
    expect(screen.getByRole('dialog')).toBeInTheDocument();
    expect(frame()).toHaveAttribute('data-intensity', 'idle');

    // Closing the modal leaves it idle; a second run goes active again.
    await act(async () => screen.getByRole('button', { name: 'Close preview' }).click());
    expect(frame()).toHaveAttribute('data-intensity', 'idle');
    const second = deferred<typeof preview>();
    api.preview.mockReturnValue(second.promise);
    await act(async () => screen.getByRole('button', { name: 'tailor.generateTailored' }).click());
    expect(frame()).toHaveAttribute('data-intensity', 'active');
    await act(async () => second.resolve(preview));
    expect(frame()).toHaveAttribute('data-intensity', 'idle');
  });

  it('goes back to idle when the run fails', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    const pending = deferred<typeof preview>();
    api.preview.mockReturnValue(pending.promise);
    render(<TailorPage />);
    await act(async () => {});

    await startGenerate();
    expect(frame()).toHaveAttribute('data-intensity', 'active');

    await act(async () => pending.reject(new Error('Preview offline')));
    expect(frame()).toHaveAttribute('data-intensity', 'idle');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
