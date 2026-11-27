import { act, fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { JobInput } from '@/components/jobs/job-input';
import type { JobDetails } from '@/hooks/use-job-details';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k, locale: 'en' }) }));

const details: JobDetails = {
  role: '',
  company: '',
  jobReqId: '',
  current: () => ({ role: '', company: '', jobReqId: '' }),
  isEdited: () => false,
  edit: vi.fn(),
  reset: vi.fn(),
};

function Field({ initial = '' }: { initial?: string }) {
  const [value, setValue] = useState(initial);
  return <JobInput id="jd" value={value} onChange={setValue} details={details} />;
}

function clipboardReturns(read: () => Promise<string>) {
  Object.defineProperty(navigator, 'clipboard', {
    configurable: true,
    value: { readText: vi.fn(read) },
  });
}

afterEach(() => {
  Reflect.deleteProperty(navigator, 'clipboard');
  vi.restoreAllMocks();
});

describe('JobInput', () => {
  it('keeps the paste prompt for a field holding only spaces, which counts as empty', () => {
    render(<Field initial="   " />);
    expect(screen.getByText('jobInput.emptyTitle')).toBeInTheDocument();
  });

  it('pastes the clipboard and keeps focus in the field once the button goes', async () => {
    clipboardReturns(async () => 'A pasted job description');
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      callback(0);
      return 0;
    });
    render(<Field />);

    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'jobInput.paste' }));
    });

    const field = screen.getByRole('textbox', { name: 'tailor.pasteJobDescription' });
    expect(field).toHaveValue('A pasted job description');
    expect(field).toHaveFocus();
  });

  it('says the clipboard was empty rather than doing nothing', async () => {
    clipboardReturns(async () => '  ');
    render(<Field />);
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'jobInput.paste' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('jobInput.pasteEmpty');
  });

  it('drops a failed-paste note once the user types', async () => {
    clipboardReturns(async () => {
      throw new Error('denied');
    });
    render(<Field />);
    await act(async () => {
      fireEvent.click(await screen.findByRole('button', { name: 'jobInput.paste' }));
    });
    expect(screen.getByRole('status')).toHaveTextContent('jobInput.pasteFailed');

    const field = screen.getByRole('textbox', { name: 'tailor.pasteJobDescription' });
    fireEvent.change(field, { target: { value: 'typed' } });
    fireEvent.change(field, { target: { value: '' } });
    // Empty again: the prompt is back, without the old failure.
    expect(screen.getByText('jobInput.emptyTitle')).toBeInTheDocument();
    expect(screen.queryByText('jobInput.pasteFailed')).toBeNull();
  });
});
