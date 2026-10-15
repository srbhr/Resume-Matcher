import { beforeEach, describe, expect, it, vi } from 'vitest';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { AgentPromptDialog } from '@/components/agent/agent-prompt-dialog';
import DashboardPage from '@/app/(default)/dashboard/page';
import type { ResumeListItem } from '@/lib/api/resume';

const state = vi.hoisted(() => ({
  list: vi.fn(),
  get: vi.fn(),
  push: vi.fn(),
  agentMode: true,
}));

vi.mock('next/navigation', () => ({ useRouter: () => ({ push: state.push }) }));
// Shows each key with its parameters, so a test can see what the prompt holds.
vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string, params?: Record<string, string>) =>
      params ? `${key} ${JSON.stringify(params)}` : key,
    locale: 'en',
  }),
}));
vi.mock('@/lib/context/status-cache', () => ({
  useStatusCache: () => ({
    status: { llm_configured: false, agent_mode: state.agentMode },
    isLoading: false,
    incrementResumes: vi.fn(),
    decrementResumes: vi.fn(),
    setHasMasterResume: vi.fn(),
  }),
}));
vi.mock('@/lib/api/resume', () => ({
  MAX_MASTER_RESUMES: 5,
  fetchResumeList: (...args: unknown[]) => state.list(...args),
  fetchResume: (...args: unknown[]) => state.get(...args),
  setDefaultMasterResume: vi.fn(),
  deleteResume: vi.fn(),
  retryProcessing: vi.fn(),
  fetchJobDescription: vi.fn().mockResolvedValue(null),
}));
vi.mock('@/components/dashboard/resume-upload-dialog', () => ({ ResumeUploadDialog: () => null }));
vi.mock('@/components/dashboard/master-resume-choice-dialog', () => ({
  MasterResumeChoiceDialog: ({ open }: { open: boolean }) =>
    open ? <div>choice dialog open</div> : null,
}));

const master: ResumeListItem = {
  resume_id: 'm1',
  title: 'Master',
  filename: 'm1.pdf',
  is_master: true,
  is_default_master: true,
  processing_status: 'ready',
  created_at: '2026-01-01',
  updated_at: '2026-01-01',
  parent_id: null,
};

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  state.agentMode = true;
  state.get.mockResolvedValue({
    resume_id: 'm1',
    processed_resume: { personalInfo: { name: 'Ada' } },
    raw_resume: { id: 1, content: 'Ada', content_type: 'md', created_at: '', processing_status: 'ready' },
  });
});

describe('AgentPromptDialog', () => {
  it('shows the prompt for the task with the resume, and copies exactly that', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(<AgentPromptDialog task="coverLetter" resumeId="r42" onClose={vi.fn()} />);

    const dialog = screen.getByRole('dialog', { name: 'agentPrompt.coverLetter.title' });
    const prompt = 'agentPrompt.coverLetter.prompt {"resumeId":"r42"}';
    expect(within(dialog).getByText(prompt)).toBeInTheDocument();
    expect(within(dialog).getByText('agentPrompt.refresh')).toBeInTheDocument();

    await act(async () => {
      fireEvent.click(within(dialog).getByRole('button', { name: 'agentPrompt.copy' }));
    });
    expect(writeText).toHaveBeenCalledWith(prompt);
    expect(within(dialog).getByRole('button', { name: 'agentPrompt.copied' })).toBeInTheDocument();
  });

  it('puts a pasted job description into the tailor prompt', () => {
    render(
      <AgentPromptDialog
        task="tailor"
        resumeId="m1"
        jobDescription="  Rust engineer at Acme  "
        onClose={vi.fn()}
      />
    );
    expect(
      screen.getByText('agentPrompt.tailor.promptWithJob {"resumeId":"m1","job":"Rust engineer at Acme"}')
    ).toBeInTheDocument();
    expect(screen.getByText('agentPrompt.tailor.note')).toBeInTheDocument();
  });

  it('says interview prep stays in the agent chat instead of asking for a refresh', () => {
    render(<AgentPromptDialog task="interviewPrep" resumeId="t1" onClose={vi.fn()} />);
    expect(screen.getByText('agentPrompt.interviewPrep.note')).toBeInTheDocument();
    expect(screen.queryByText('agentPrompt.refresh')).toBeNull();
  });

  it('stays closed without a task', () => {
    render(<AgentPromptDialog task={null} onClose={vi.fn()} />);
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('dashboard in agent mode', () => {
  it('drops the API key alert and hands tailoring to the agent', async () => {
    state.list.mockResolvedValue([master]);
    render(<DashboardPage />);

    const create = await screen.findByRole('button', { name: 'dashboard.createResume' });
    await waitFor(() => expect(create).toBeEnabled());
    expect(screen.queryByText('dashboard.llmNotConfiguredTitle')).toBeNull();

    fireEvent.click(create);
    expect(screen.getByRole('dialog', { name: 'agentPrompt.tailor.title' })).toBeInTheDocument();
    expect(state.push).not.toHaveBeenCalled();
  });

  it('asks the agent to create the master resume instead of showing setup required', async () => {
    state.list.mockResolvedValue([]);
    render(<DashboardPage />);

    fireEvent.click(
      await screen.findByRole('button', { name: 'dashboard.initializeMasterResume' })
    );
    expect(
      screen.getByRole('dialog', { name: 'agentPrompt.createMaster.title' })
    ).toBeInTheDocument();
    expect(screen.queryByText('choice dialog open')).toBeNull();
    expect(screen.queryByText('dashboard.setupRequiredTitle')).toBeNull();
  });

  it('still asks for setup when neither a model nor agent mode is configured', async () => {
    state.agentMode = false;
    state.list.mockResolvedValue([]);
    render(<DashboardPage />);

    expect(await screen.findByText('dashboard.setupRequiredTitle')).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'dashboard.initializeMasterResume' })
    ).toBeNull();
  });
});
