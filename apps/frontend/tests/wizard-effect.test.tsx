import React from 'react';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ResumeWizardPage } from '@/components/resume-wizard/resume-wizard-page';
import {
  createInitialResumeWizardState,
  finalizeResumeWizard,
  postResumeWizardTurn,
  type ResumeWizardState,
} from '@/lib/api';

const router = { push: vi.fn() };
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({ incrementResumes: vi.fn(), setHasMasterResume: vi.fn() }),
}));
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, finalizeResumeWizard: vi.fn(), postResumeWizardTurn: vi.fn() };
});
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

const mockedPostTurn = vi.mocked(postResumeWizardTurn);
const mockedFinalize = vi.mocked(finalizeResumeWizard);

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}

const frame = () => screen.getByTestId('frame');

function reviewState(): ResumeWizardState {
  const initial = createInitialResumeWizardState();
  return {
    ...initial,
    step: 'review',
    current_question: { text: 'Review', section: 'review' },
    resume_data: { ...initial.resume_data, personalInfo: { name: 'James' } },
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
});

describe('Resume wizard background effect', () => {
  it('shows the quiet beams while the wizard waits for the user', () => {
    render(<ResumeWizardPage />);
    expect(frame()).toHaveAttribute('data-effect', 'beams');
    expect(frame()).toHaveAttribute('data-intensity', 'idle');
  });

  it('shows Retro Bitrate, active, while a turn is generating, and the beams again after', async () => {
    const pending = deferred<{ state: ResumeWizardState }>();
    mockedPostTurn.mockReturnValue(pending.promise);
    render(<ResumeWizardPage />);

    fireEvent.change(screen.getByRole('textbox'), { target: { value: "I'm James." } });
    await act(async () =>
      screen.getByRole('button', { name: 'resumeWizard.actions.continue' }).click()
    );
    expect(frame()).toHaveAttribute('data-effect', 'bitrate');
    expect(frame()).toHaveAttribute('data-intensity', 'active');

    await act(async () => pending.resolve({ state: reviewState() }));
    expect(frame()).toHaveAttribute('data-effect', 'beams');
    expect(frame()).toHaveAttribute('data-intensity', 'idle');
  });

  it('shows Retro Bitrate, active, while the resume is being created', async () => {
    localStorage.setItem('resume_wizard_draft', JSON.stringify(reviewState()));
    const pending = deferred<Awaited<ReturnType<typeof finalizeResumeWizard>>>();
    mockedFinalize.mockReturnValue(pending.promise);
    render(<ResumeWizardPage />);

    await act(async () =>
      (await screen.findByRole('button', { name: 'resumeWizard.actions.create' })).click()
    );
    expect(mockedFinalize).toHaveBeenCalledTimes(1);
    expect(frame()).toHaveAttribute('data-effect', 'bitrate');
    expect(frame()).toHaveAttribute('data-intensity', 'active');

    await act(async () =>
      pending.resolve({ resume_id: 'created', is_default_master: true } as Awaited<
        ReturnType<typeof finalizeResumeWizard>
      >)
    );
    expect(frame()).toHaveAttribute('data-effect', 'beams');
  });

  it('goes back to the beams when the finalize fails', async () => {
    localStorage.setItem('resume_wizard_draft', JSON.stringify(reviewState()));
    mockedFinalize.mockRejectedValue(new Error('boom'));
    render(<ResumeWizardPage />);

    await act(async () =>
      (await screen.findByRole('button', { name: 'resumeWizard.actions.create' })).click()
    );
    expect(frame()).toHaveAttribute('data-effect', 'beams');
    expect(frame()).toHaveAttribute('data-intensity', 'idle');
    expect(screen.getByRole('alert')).toBeInTheDocument();
  });
});
