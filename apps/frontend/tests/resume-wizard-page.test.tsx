import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { ResumeWizardPage } from '@/components/resume-wizard/resume-wizard-page';
import {
  createInitialResumeWizardState,
  finalizeResumeWizard,
  postResumeWizardTurn,
  type ResumeWizardState,
} from '@/lib/api';

const push = vi.fn();
const incrementResumes = vi.fn();
const setHasMasterResume = vi.fn();

vi.mock('next/navigation', () => ({ useRouter: () => ({ push }) }));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({ incrementResumes, setHasMasterResume }),
}));
vi.mock('@/lib/api', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/api')>();
  return { ...actual, finalizeResumeWizard: vi.fn(), postResumeWizardTurn: vi.fn() };
});

const mockedPostTurn = vi.mocked(postResumeWizardTurn);
const mockedFinalize = vi.mocked(finalizeResumeWizard);

function makeState(overrides: Partial<ResumeWizardState> = {}): ResumeWizardState {
  return { ...createInitialResumeWizardState(), ...overrides };
}

describe('ResumeWizardPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('renders the intro question and answer textbox', () => {
    render(<ResumeWizardPage />);
    expect(screen.getByText(/Hi — I'll help you build your master resume/)).toBeInTheDocument();
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('submits the intro answer and shows the next question', async () => {
    mockedPostTurn.mockResolvedValueOnce({
      state: makeState({
        step: 'question',
        current_question: { text: 'Where have you worked?', section: 'workExperience' },
        resume_data: {
          ...createInitialResumeWizardState().resume_data,
          personalInfo: { name: 'James' },
        },
        asked_count: 1,
      }),
    });

    render(<ResumeWizardPage />);
    fireEvent.change(screen.getByRole('textbox'), { target: { value: "I'm James." } });
    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.continue' }));

    await waitFor(() => {
      expect(mockedPostTurn).toHaveBeenCalledWith({
        state: expect.objectContaining({ step: 'intro' }),
        action: 'answer',
        answer: { text: "I'm James." },
      });
    });
    expect(await screen.findByText('Where have you worked?')).toBeInTheDocument();
    expect(screen.getByText('James')).toBeInTheDocument();
    expect(screen.queryByText('resumeWizard.draftStorageUnavailable.description')).toBeNull();
  });

  it('moves to review via the Review action', async () => {
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify(
        makeState({
          step: 'question',
          current_question: { text: 'Skills?', section: 'skills' },
          asked_count: 2,
        })
      )
    );
    mockedPostTurn.mockResolvedValueOnce({
      state: makeState({
        step: 'review',
        current_question: { text: 'Review', section: 'review' },
        warnings: ['Add at least one contact method.'],
        resume_data: {
          ...createInitialResumeWizardState().resume_data,
          personalInfo: { name: 'James' },
        },
      }),
    });

    render(<ResumeWizardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'resumeWizard.actions.review' }));

    await waitFor(() => {
      expect(mockedPostTurn).toHaveBeenCalledWith({
        state: expect.objectContaining({
          current_question: expect.objectContaining({ section: 'skills' }),
        }),
        action: 'review',
      });
    });
    expect(
      await screen.findByRole('button', { name: 'resumeWizard.actions.create' })
    ).toBeInTheDocument();
  });

  it('finalizes a review draft, updates status cache, clears the draft, and routes to builder', async () => {
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify(
        makeState({
          step: 'review',
          current_question: { text: 'Review', section: 'review' },
          resume_data: {
            ...createInitialResumeWizardState().resume_data,
            personalInfo: { name: 'James' },
          },
        })
      )
    );
    mockedFinalize.mockResolvedValueOnce({
      message: 'Created',
      request_id: 'req_1',
      resume_id: 'resume_123',
      processing_status: 'ready',
      is_master: true,
    });

    render(<ResumeWizardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'resumeWizard.actions.create' }));

    await waitFor(() => {
      expect(mockedFinalize).toHaveBeenCalledWith(expect.objectContaining({ step: 'review' }));
      expect(localStorage.getItem('master_resume_id')).toBe('resume_123');
      expect(localStorage.getItem('resume_wizard_draft')).toBeNull();
      expect(incrementResumes).toHaveBeenCalledTimes(1);
      expect(setHasMasterResume).toHaveBeenCalledWith(true);
      expect(push).toHaveBeenCalledWith('/builder?id=resume_123');
    });
  });

  it('shows an error and preserves the question when a turn fails', async () => {
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify(
        makeState({
          step: 'question',
          current_question: { text: 'Skills?', section: 'skills' },
          asked_count: 1,
        })
      )
    );
    mockedPostTurn.mockRejectedValueOnce(new Error('boom'));

    render(<ResumeWizardPage />);
    fireEvent.change(await screen.findByRole('textbox'), { target: { value: 'Python' } });
    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.continue' }));

    expect(await screen.findByRole('alert')).toHaveTextContent('resumeWizard.errors.turnFailed');
    expect(screen.getByText('Skills?')).toBeInTheDocument();
  });

  it('recovers from a corrupt saved draft without crashing the render', async () => {
    // workExperience is a string, not an array — the unguarded path would crash
    // when the preview calls .map(). The normalizer must coerce it to [].
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify({
        step: 'question',
        current_question: { text: 'Recovered question?', section: 'skills' },
        resume_data: { workExperience: 'x', additional: 'nope', personalInfo: { name: 'James' } },
        asked_count: 1,
      })
    );

    render(<ResumeWizardPage />);

    expect(await screen.findByText('Recovered question?')).toBeInTheDocument();
    expect(screen.getByText('James')).toBeInTheDocument(); // preview rendered, no crash
  });

  it('recovers from a draft with non-string personalInfo fields', async () => {
    // A numeric name would make a later personalInfo.name.trim() throw; the
    // normalizer must coerce personalInfo fields to strings.
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify({
        step: 'question',
        current_question: { text: 'Recovered q2?', section: 'skills' },
        resume_data: {
          personalInfo: { name: 123, title: { bad: 1 } },
          workExperience: [{ id: 1, title: 'Engineer', company: 'Acme' }],
        },
        asked_count: 1,
      })
    );

    render(<ResumeWizardPage />);

    // No crash: the question renders and the (coerced) experience shows in the preview.
    expect(await screen.findByText('Recovered q2?')).toBeInTheDocument();
    expect(screen.getByText(/Engineer/)).toBeInTheDocument();
  });

  it('normalizes malformed nested leaves and history before the restored state is used', async () => {
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify({
        step: 'question',
        current_question: { text: 'Safe recovery?', section: 'skills' },
        resume_data: {
          personalInfo: { name: 'Ada' },
          workExperience: [
            {
              id: 8,
              title: 'Engineer',
              company: 'Acme',
              years: 2024,
              description: 'Built a safe parser',
            },
          ],
          education: [],
          personalProjects: [],
          additional: { technicalSkills: [null, 42, 'TypeScript'] },
        },
        history: [null, { question: 9, answer: {}, section: 'skills' }],
        asked_count: 99,
        inferred_skills: [null, 'React'],
      })
    );

    render(<ResumeWizardPage />);

    expect(await screen.findByText('Safe recovery?')).toBeInTheDocument();
    expect(screen.getByText('Built a safe parser')).toBeInTheDocument();
    expect(screen.getByText('TypeScript')).toBeInTheDocument();
    expect(screen.getByText('React')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'resumeWizard.actions.back' })
    ).not.toBeInTheDocument();
  });

  it('stores a versioned wizard draft and ignores an unknown saved schema version', async () => {
    const poisonedState = makeState({
      step: 'question',
      current_question: { text: 'Do not restore this', section: 'skills' },
    });
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify({ schemaVersion: 999, state: poisonedState })
    );

    render(<ResumeWizardPage />);

    expect(
      await screen.findByText(/Hi — I'll help you build your master resume/)
    ).toBeInTheDocument();
    expect(screen.queryByText('Do not restore this')).not.toBeInTheDocument();
    await waitFor(() => {
      const persisted = JSON.parse(localStorage.getItem('resume_wizard_draft') ?? '{}');
      expect(persisted.schemaVersion).toBe(1);
      expect(persisted.state.current_question.section).toBe('intro');
    });
  });

  it('dispatches a skip turn', async () => {
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify(
        makeState({
          step: 'question',
          current_question: { text: 'Skills?', section: 'skills' },
          asked_count: 1,
        })
      )
    );
    mockedPostTurn.mockResolvedValueOnce({
      state: makeState({
        step: 'question',
        current_question: { text: 'Next?', section: 'education' },
        asked_count: 2,
      }),
    });

    render(<ResumeWizardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'resumeWizard.actions.skip' }));

    await waitFor(() => {
      expect(mockedPostTurn).toHaveBeenCalledWith(expect.objectContaining({ action: 'skip' }));
    });
    expect(await screen.findByText('Next?')).toBeInTheDocument();
  });

  it('dispatches a back turn when history exists', async () => {
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify(
        makeState({
          step: 'question',
          current_question: { text: 'Skills?', section: 'skills' },
          asked_count: 1,
          history: [
            {
              question: 'Where did you work?',
              answer: 'Acme',
              section: 'workExperience',
              resume_data_before: createInitialResumeWizardState().resume_data,
            },
          ],
        })
      )
    );
    mockedPostTurn.mockResolvedValueOnce({
      state: makeState({
        step: 'question',
        current_question: { text: 'Where did you work?', section: 'workExperience' },
        asked_count: 0,
      }),
    });

    render(<ResumeWizardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'resumeWizard.actions.back' }));

    await waitFor(() => {
      expect(mockedPostTurn).toHaveBeenCalledWith(expect.objectContaining({ action: 'back' }));
    });
  });

  it('keep-adding returns to a question step locally without an API call', async () => {
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify(
        makeState({
          step: 'review',
          current_question: { text: 'Review', section: 'review' },
          resume_data: {
            ...createInitialResumeWizardState().resume_data,
            personalInfo: { name: 'James' },
          },
          warnings: ['Add skills.'],
        })
      )
    );

    render(<ResumeWizardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'resumeWizard.actions.keepAdding' }));

    // Returns to a question step (textbox visible) — no backend turn dispatched.
    expect(await screen.findByRole('textbox')).toBeInTheDocument();
    expect(mockedPostTurn).not.toHaveBeenCalled();
  });

  it('retains an acknowledged creation when browser storage and navigation fail', async () => {
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify(
        makeState({
          step: 'review',
          current_question: { text: 'Review', section: 'review' },
          resume_data: {
            ...createInitialResumeWizardState().resume_data,
            personalInfo: { name: 'Ada' },
          },
        })
      )
    );
    mockedFinalize.mockResolvedValueOnce({
      message: 'Created',
      request_id: 'req_2',
      resume_id: 'resume_committed',
      processing_status: 'ready',
      is_master: true,
    });
    const nativeSetItem = Storage.prototype.setItem;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'master_resume_id') throw new DOMException('quota', 'QuotaExceededError');
      return nativeSetItem.call(this, key, value);
    });
    push.mockImplementation(() => {
      throw new Error('navigation unavailable');
    });

    render(<ResumeWizardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'resumeWizard.actions.create' }));

    expect(await screen.findByRole('alert')).toHaveTextContent(
      'resumeWizard.errors.createdNavigationFailed'
    );
    expect(mockedFinalize).toHaveBeenCalledTimes(1);
    expect(
      screen.queryByRole('button', { name: 'resumeWizard.actions.create' })
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.openCreated' }));
    expect(push).toHaveBeenLastCalledWith('/builder?id=resume_committed');
    expect(mockedFinalize).toHaveBeenCalledTimes(1);
  });

  it('protects updated wizard state when its local backup fails and can retry the backup', async () => {
    push.mockImplementation(() => undefined);
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify(
        makeState({
          step: 'question',
          current_question: { text: 'Current question?', section: 'skills' },
          asked_count: 1,
        })
      )
    );
    mockedPostTurn.mockResolvedValueOnce({
      state: makeState({
        step: 'question',
        current_question: { text: 'Next question?', section: 'workExperience' },
        resume_data: {
          ...createInitialResumeWizardState().resume_data,
          personalInfo: { name: 'New in-memory answer' },
        },
        asked_count: 2,
      }),
    });

    const nativeSetItem = Storage.prototype.setItem;
    let draftWritesFail = false;
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(function (this: Storage, key, value) {
      if (key === 'resume_wizard_draft' && draftWritesFail) {
        throw new DOMException('full', 'QuotaExceededError');
      }
      return nativeSetItem.call(this, key, value);
    });

    render(<ResumeWizardPage />);
    expect(await screen.findByText('Current question?')).toBeInTheDocument();
    draftWritesFail = true;

    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'New in-memory answer' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.continue' }));

    expect(await screen.findByText('Next question?')).toBeInTheDocument();
    expect(screen.getByText('New in-memory answer')).toBeInTheDocument();
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'resumeWizard.draftStorageUnavailable.description'
    );

    const blockedReload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(blockedReload);
    expect(blockedReload.defaultPrevented).toBe(true);

    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.backToDashboard' }));
    expect(push).not.toHaveBeenCalled();
    expect(screen.getByRole('dialog')).toHaveTextContent(
      'resumeWizard.leaveWithoutDraft.description'
    );

    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.stay' }));
    expect(push).not.toHaveBeenCalled();

    draftWritesFail = false;
    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.retryDraftBackup' }));

    await waitFor(() => {
      expect(screen.queryByText('resumeWizard.draftStorageUnavailable.description')).toBeNull();
    });
    const persisted = JSON.parse(localStorage.getItem('resume_wizard_draft') ?? '{}');
    expect(persisted.state.resume_data.personalInfo.name).toBe('New in-memory answer');

    const allowedReload = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(allowedReload);
    expect(allowedReload.defaultPrevented).toBe(false);

    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.backToDashboard' }));
    expect(push).toHaveBeenCalledWith('/dashboard');
  });

  it('leaves an unprotected wizard draft only after explicit confirmation', async () => {
    push.mockImplementation(() => undefined);
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });

    render(<ResumeWizardPage />);
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'resumeWizard.draftStorageUnavailable.description'
    );

    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.actions.backToDashboard' }));
    expect(push).not.toHaveBeenCalled();

    fireEvent.click(
      screen.getByRole('button', { name: 'resumeWizard.actions.leaveWithoutSaving' })
    );
    expect(push).toHaveBeenCalledWith('/dashboard');
  });
  it('retains recovery until the initially scheduled builder navigation actually loads', async () => {
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify(makeState({ step: 'review', resume_data: { personalInfo: { name: 'Ada' } } }))
    );
    mockedFinalize.mockResolvedValue({
      message: 'Created',
      request_id: 'ack',
      resume_id: 'saved-resume',
      processing_status: 'ready',
      is_master: true,
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementationOnce(() => {
      throw new Error('Transient remove failure');
    });
    push.mockImplementation(() => undefined);
    const view = render(<ResumeWizardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'resumeWizard.actions.create' }));
    await waitFor(() => expect(push).toHaveBeenCalledWith('/builder?id=saved-resume'));
    view.unmount();
    render(<ResumeWizardPage />);
    expect(
      await screen.findByRole('button', { name: 'resumeWizard.actions.openCreated' })
    ).toBeVisible();
    expect(mockedFinalize).toHaveBeenCalledTimes(1);
  });

  it('reopens the acknowledged resume after reload when draft removal fails', async () => {
    localStorage.setItem(
      'resume_wizard_draft',
      JSON.stringify(makeState({ step: 'review', resume_data: { personalInfo: { name: 'Ada' } } }))
    );
    mockedFinalize.mockResolvedValue({
      message: 'Created',
      request_id: 'ack',
      resume_id: 'saved-resume',
      processing_status: 'ready',
      is_master: true,
    });
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('blocked remove');
    });
    push.mockImplementation(() => {
      throw new Error('navigation failed');
    });
    const view = render(<ResumeWizardPage />);
    fireEvent.click(await screen.findByRole('button', { name: 'resumeWizard.actions.create' }));
    await screen.findByRole('button', { name: 'resumeWizard.actions.openCreated' });
    view.unmount();
    render(<ResumeWizardPage />);
    fireEvent.click(
      await screen.findByRole('button', { name: 'resumeWizard.actions.openCreated' })
    );
    expect(push).toHaveBeenLastCalledWith('/builder?id=saved-resume');
    expect(mockedFinalize).toHaveBeenCalledTimes(1);
    expect(screen.queryByRole('button', { name: 'resumeWizard.actions.create' })).toBeNull();
  });
});
