import { act, renderHook, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useJobDetails } from '@/hooks/use-job-details';

const api = vi.hoisted(() => ({ parse: vi.fn() }));
vi.mock('@/lib/api/resume', () => ({ parseJobMetadata: api.parse }));

beforeEach(() => {
  api.parse.mockReset();
});

const ACME = { role: 'Staff Engineer', company: 'Acme', job_req_id: 'R-1' };

describe('useJobDetails', () => {
  it('detects the details and sends them once they belong to the current text', async () => {
    api.parse.mockResolvedValue(ACME);
    const { result } = renderHook(({ text }) => useJobDetails(text), {
      initialProps: { text: 'Acme job' },
    });
    await waitFor(() => expect(result.current.company).toBe('Acme'));
    expect(result.current.current()).toEqual({
      role: 'Staff Engineer',
      company: 'Acme',
      jobReqId: 'R-1',
    });
  });

  it('leaves out details detected for earlier text until the new text is read', async () => {
    api.parse.mockResolvedValueOnce(ACME).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(({ text }) => useJobDetails(text), {
      initialProps: { text: 'Acme job' },
    });
    await waitFor(() => expect(result.current.company).toBe('Acme'));

    rerender({ text: 'Globex job' });
    // Still shown, so the fields don't flicker while typing, but not sent.
    expect(result.current.company).toBe('Acme');
    expect(result.current.current()).toEqual({ role: '', company: '', jobReqId: '' });
  });

  it('always sends what the user typed, even while detection catches up', async () => {
    api.parse.mockResolvedValueOnce(ACME).mockReturnValueOnce(new Promise(() => {}));
    const { result, rerender } = renderHook(({ text }) => useJobDetails(text), {
      initialProps: { text: 'Acme job' },
    });
    await waitFor(() => expect(result.current.company).toBe('Acme'));
    act(() => result.current.edit('company', 'Acme Bank'));
    rerender({ text: 'Acme job, edited' });

    expect(result.current.current().company).toBe('Acme Bank');
    expect(result.current.isEdited('company')).toBe(true);
    expect(result.current.isEdited('role')).toBe(false);
  });

  it('clears the detected details when detection fails, keeping hand edits', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    api.parse.mockResolvedValueOnce(ACME).mockRejectedValueOnce(new Error('offline'));
    const { result, rerender } = renderHook(({ text }) => useJobDetails(text), {
      initialProps: { text: 'Acme job' },
    });
    await waitFor(() => expect(result.current.company).toBe('Acme'));
    act(() => result.current.edit('role', 'Principal Engineer'));

    rerender({ text: 'Another job' });
    await waitFor(() => expect(result.current.company).toBe(''));
    expect(result.current.role).toBe('Principal Engineer');
    expect(result.current.current()).toEqual({
      role: 'Principal Engineer',
      company: '',
      jobReqId: '',
    });
  });

  it('hands an emptied field back to detection: empty while retyped, not sent as typed', async () => {
    api.parse.mockResolvedValue(ACME);
    const { result } = renderHook(({ text }) => useJobDetails(text), {
      initialProps: { text: 'Acme job' },
    });
    await waitFor(() => expect(result.current.company).toBe('Acme'));
    act(() => result.current.edit('company', 'Acme Bank'));
    act(() => result.current.edit('company', ''));

    expect(result.current.company).toBe('');
    expect(result.current.isEdited('company')).toBe(false);
  });
});
