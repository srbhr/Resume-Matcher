import React from 'react';
import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import TailorPage from '@/app/(default)/tailor/page';
import { ATSScoreCard } from '@/components/tailor/ats-score-card';
import type { ResumeListItem } from '@/lib/api/resume';

const api = vi.hoisted(() => ({
  list: vi.fn(),
  push: vi.fn(),
  llmConfigured: true,
}));
const router = { push: api.push, back: vi.fn() };
const t = (key: string) => key;
vi.mock('next/navigation', () => ({ useRouter: () => router }));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t, locale: 'en' }) }));
vi.mock('@/lib/api/resume', () => ({
  uploadJobDescriptions: vi.fn(),
  previewImproveResume: vi.fn(),
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
    status: { llm_configured: api.llmConfigured },
    isLoading: false,
    incrementJobs: vi.fn(),
    incrementImprovements: vi.fn(),
    incrementResumes: vi.fn(),
  }),
}));

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

const JOB = 'A software engineer role building useful tools with Python and SQL.';
const PICKER_NAME = /^tailor\.selectResume\b/;

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  api.llmConfigured = true;
  api.list.mockResolvedValue([master('m1', true, 'DevRel')]);
});

async function renderPage() {
  const view = render(<TailorPage />);
  await act(async () => {});
  return view;
}

const generateButton = () => screen.getByRole('button', { name: 'tailor.generateTailored' });

describe('tailor page: narrow centred card', () => {
  it('sits in the narrow page frame', async () => {
    await renderPage();
    const frame = screen
      .getByRole('heading', { level: 1, name: 'tailor.heroTitle' })
      .closest('.shadow-sw-lg') as HTMLElement;
    expect(frame).not.toBeNull();
    expect(frame.className).toMatch(/(^|\s)max-w-4xl(\s|$)/);
    expect(frame.className).not.toContain('max-w-[86rem]');
  });

  it('shows the three steps in order, with step 1 current and nothing clickable', async () => {
    await renderPage();
    const strip = screen.getByRole('list', { name: 'tailor.steps.label' });
    const steps = within(strip).getAllByRole('listitem');
    expect(steps.map((step) => step.textContent)).toEqual([
      '1tailor.steps.paste',
      '2tailor.steps.generate',
      '3tailor.steps.review',
    ]);
    expect(steps[0]).toHaveAttribute('aria-current', 'step');
    expect(steps[1]).not.toHaveAttribute('aria-current');
    expect(steps[2]).not.toHaveAttribute('aria-current');
    expect(within(strip).queryAllByRole('button')).toHaveLength(0);
    expect(within(strip).queryAllByRole('link')).toHaveLength(0);
  });

  it('names the single master resume being tailored', async () => {
    await renderPage();
    const line = screen.getByText('tailor.tailoringLabel').parentElement as HTMLElement;
    expect(within(line).getByText('DevRel')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: PICKER_NAME })).toBeNull();
  });

  it('uses the picker instead of a name line when there are several masters', async () => {
    api.list.mockResolvedValue([master('m1', false, 'DevRel'), master('m2', true, 'SWE')]);
    await renderPage();
    expect(screen.getByRole('button', { name: PICKER_NAME })).toHaveTextContent('SWE');
    expect(screen.queryByText('tailor.tailoringLabel')).toBeNull();
  });

  it('says the master is still loading while Generate waits for it', async () => {
    api.list.mockReturnValue(new Promise(() => {}));
    await renderPage();
    const line = screen.getByText('tailor.tailoringLabel').parentElement as HTMLElement;
    expect(within(line).getByText('common.loading')).toBeInTheDocument();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: JOB } });
    expect(generateButton()).toBeDisabled();
  });

  it('describes what to paste under the job description field', async () => {
    await renderPage();
    const field = screen.getByRole('textbox', { name: 'tailor.pasteJobDescription' });
    expect(field).toHaveAccessibleDescription('tailor.jobDescriptionHint');
    expect(screen.getByText('tailor.jobDescriptionHint')).toBeInTheDocument();
    // The counter stays on the field.
    expect(screen.getByText('tailor.charactersCount')).toBeInTheDocument();
  });
});

describe('tailor page: Generate enablement is unchanged', () => {
  it('is disabled while the job description is empty or blank, enabled once filled', async () => {
    await renderPage();
    expect(generateButton()).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: '   \n ' } });
    expect(generateButton()).toBeDisabled();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: JOB } });
    expect(generateButton()).toBeEnabled();
  });

  it('stays enabled for a short description (the 50-character rule runs on click)', async () => {
    await renderPage();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: 'Too short' } });
    expect(generateButton()).toBeEnabled();
    fireEvent.click(generateButton());
    expect(screen.getByText('tailor.errors.jobDescriptionTooShort')).toBeInTheDocument();
  });

  it('is disabled and says why when no LLM is configured', async () => {
    api.llmConfigured = false;
    await renderPage();
    fireEvent.change(screen.getByRole('textbox'), { target: { value: JOB } });
    expect(screen.getByRole('button', { name: 'tailor.configureApiKeyFirst' })).toBeDisabled();
  });
});

describe('ATS score card', () => {
  it('uses the nested shadow inside the page frame', () => {
    render(
      <ATSScoreCard
        atsScore={{
          overall_score: 72.5,
          sub_scores: { keyword_match: 70, skills_coverage: 80, section_completeness: 65 },
          missing_keywords: [],
          injectable_keywords: [],
          recommendations: [],
        }}
      />
    );
    const card = screen.getByRole('region', { name: 'ATS Score Breakdown' });
    expect(card.className).toContain('shadow-sw-nested');
    expect(card.className).not.toContain('shadow-sw-default');
  });
});
