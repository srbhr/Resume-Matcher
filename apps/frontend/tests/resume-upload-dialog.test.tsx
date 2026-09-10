import React, { useState } from 'react';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { flushSync } from 'react-dom';
import { deleteResume, retryProcessing } from '@/lib/api/resume';
import { ResumeUploadDialog } from '@/components/dashboard/resume-upload-dialog';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

vi.mock('@/lib/api/resume', () => ({
  retryProcessing: vi.fn(),
  deleteResume: vi.fn(),
}));

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

function uploadResponse(resumeId: string): Response {
  return new Response(
    JSON.stringify({
      resume_id: resumeId,
      processing_status: 'ready',
      is_master: true,
    }),
    { status: 200, headers: { 'content-type': 'application/json' } }
  );
}

function chooseResume(name = 'resume.pdf') {
  const input = document.querySelector<HTMLInputElement>('input[type="file"]');
  expect(input).not.toBeNull();
  fireEvent.change(input!, {
    target: { files: [new File(['synthetic resume'], name, { type: 'application/pdf' })] },
  });
}

function ControlledDialog({ onUploadComplete }: { onUploadComplete: (resumeId: string) => void }) {
  const [open, setOpen] = useState(true);
  return (
    <>
      <button onClick={() => setOpen(true)}>reopen upload</button>
      <ResumeUploadDialog open={open} onOpenChange={setOpen} onUploadComplete={onUploadComplete} />
    </>
  );
}

beforeEach(() => {
  vi.resetAllMocks();
  localStorage.clear();
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('ResumeUploadDialog upload propagation', () => {
  it('propagates one completed StrictMode upload and closes once', async () => {
    vi.useFakeTimers();
    const onUploadComplete = vi.fn();
    const onOpenChange = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(uploadResponse('resume-1'));
    render(
      <React.StrictMode>
        <ResumeUploadDialog open onOpenChange={onOpenChange} onUploadComplete={onUploadComplete} />
      </React.StrictMode>
    );

    chooseResume();
    await vi.waitFor(() =>
      expect(screen.getByText('dashboard.uploadDialog.successMaster')).toBeInTheDocument()
    );

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1500);
    });

    expect(onUploadComplete).toHaveBeenCalledTimes(1);
    expect(onUploadComplete).toHaveBeenCalledWith('resume-1');
    expect(onOpenChange).toHaveBeenCalledTimes(1);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('closing and reopening cancels the old upload result', async () => {
    const oldRequest = deferred<Response>();
    const onUploadComplete = vi.fn();
    vi.mocked(fetch).mockReturnValueOnce(oldRequest.promise);
    render(<ControlledDialog onUploadComplete={onUploadComplete} />);

    chooseResume('old.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'reopen upload' }));
    expect(screen.getByRole('dialog')).toBeInTheDocument();

    await act(async () => oldRequest.resolve(uploadResponse('old-resume')));

    await waitFor(() => expect(onUploadComplete).not.toHaveBeenCalled());
    expect(screen.queryByText('dashboard.uploadDialog.successMaster')).not.toBeInTheDocument();
  });

  it('does not run the delayed close after teardown', async () => {
    vi.useFakeTimers();
    const onUploadComplete = vi.fn();
    const onOpenChange = vi.fn();
    vi.mocked(fetch).mockResolvedValueOnce(uploadResponse('resume-1'));
    const view = render(
      <ResumeUploadDialog open onOpenChange={onOpenChange} onUploadComplete={onUploadComplete} />
    );

    chooseResume();
    await vi.waitFor(() =>
      expect(screen.getByText('dashboard.uploadDialog.successMaster')).toBeInTheDocument()
    );

    view.unmount();
    await vi.advanceTimersByTimeAsync(1500);

    expect(onUploadComplete).toHaveBeenCalledTimes(1);
    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

it('keeps a second upload open beyond the previous success timer', async () => {
  vi.mocked(fetch)
    .mockResolvedValueOnce(uploadResponse('first'))
    .mockReturnValueOnce(new Promise<Response>(() => undefined));
  const onComplete = vi.fn();
  render(<ControlledDialog onUploadComplete={onComplete} />);
  vi.useFakeTimers();
  chooseResume();
  await vi.waitFor(() =>
    expect(screen.getByText('dashboard.uploadDialog.successMaster')).toBeInTheDocument()
  );
  fireEvent.click(screen.getByRole('button', { name: 'a11y.removeFile' }));
  chooseResume('second.pdf');
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1600);
  });
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(screen.getByText('common.uploading')).toBeInTheDocument();
});

it('does not retain a close timer when the success callback synchronously unmounts', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(uploadResponse('first'));
  const onOpenChange = vi.fn();
  let unmount = () => {};
  const view = render(
    <ResumeUploadDialog
      open
      onOpenChange={onOpenChange}
      onUploadComplete={() => flushSync(unmount)}
    />
  );
  unmount = view.unmount;
  vi.useFakeTimers();
  chooseResume();
  await act(async () => {
    await vi.advanceTimersByTimeAsync(0);
  });
  await act(async () => {
    await vi.advanceTimersByTimeAsync(1600);
  });
  expect(onOpenChange).not.toHaveBeenCalled();
});

it('discards a processing retry after close and allows a new upload immediately', async () => {
  const retry = deferred<Awaited<ReturnType<typeof retryProcessing>>>();
  vi.mocked(retryProcessing).mockReturnValueOnce(retry.promise);
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ resume_id: 'failed', processing_status: 'failed' }), {
      headers: { 'content-type': 'application/json' },
    })
  );
  const onComplete = vi.fn();
  render(<ControlledDialog onUploadComplete={onComplete} />);
  chooseResume();
  fireEvent.click(await screen.findByRole('button', { name: 'dashboard.retryProcessing' }));
  fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
  fireEvent.click(screen.getByRole('button', { name: 'reopen upload' }));
  await act(async () =>
    retry.resolve({
      resume_id: 'failed',
      processing_status: 'ready',
    })
  );
  expect(onComplete).not.toHaveBeenCalled();
  expect(screen.getByRole('dialog')).toBeInTheDocument();
  expect(document.querySelector('input[type="file"]')).not.toBeDisabled();
});

it('shows a deleted-record message and allows another file after retry returns 404', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(
    new Response(JSON.stringify({ resume_id: 'gone', processing_status: 'failed' }), {
      headers: { 'content-type': 'application/json' },
    })
  );
  vi.mocked(retryProcessing).mockRejectedValueOnce(
    new Error('Failed to retry processing (status 404)')
  );
  render(<ControlledDialog onUploadComplete={vi.fn()} />);
  chooseResume();
  fireEvent.click(await screen.findByRole('button', { name: 'dashboard.retryProcessing' }));
  expect(await screen.findByText('common.resumeDeleted')).toBeVisible();
  expect(document.querySelector('input[type="file"]')).not.toBeDisabled();
});

function uploadFailure(status = 504, resumeId = 'saved', isMaster = true): Response {
  return new Response(
    JSON.stringify({
      detail: 'Processing unavailable. Please try again.',
      resume_id: resumeId,
      is_master: isMaster,
    }),
    { status, headers: { 'content-type': 'application/json' } }
  );
}

async function confirmSavedDelete(): Promise<void> {
  fireEvent.click(await screen.findByRole('button', { name: 'dashboard.deleteResume' }));
  fireEvent.click(
    await screen.findByRole('button', { name: 'confirmations.deleteResumeConfirmLabel' })
  );
}

describe('saved uploads with failed HTTP responses', () => {
  it.each([422, 503, 504])(
    'retries the exact saved ID from HTTP %s without another upload',
    async (status) => {
      vi.mocked(fetch).mockResolvedValueOnce(uploadFailure(status));
      vi.mocked(retryProcessing).mockResolvedValueOnce({
        resume_id: 'saved',
        processing_status: 'ready',
      });
      const onComplete = vi.fn();
      render(<ControlledDialog onUploadComplete={onComplete} />);
      chooseResume();
      fireEvent.click(await screen.findByRole('button', { name: 'dashboard.retryProcessing' }));
      await waitFor(() => expect(onComplete).toHaveBeenCalledWith('saved'));
      expect(retryProcessing).toHaveBeenCalledExactlyOnceWith('saved');
      expect(fetch).toHaveBeenCalledTimes(1);
      expect(onComplete).toHaveBeenCalledTimes(1);
    }
  );

  it('retains recovery controls when the saved row is still processing', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(uploadFailure());
    vi.mocked(retryProcessing)
      .mockResolvedValueOnce({ resume_id: 'saved', processing_status: 'processing' })
      .mockResolvedValueOnce({ resume_id: 'saved', processing_status: 'ready' });
    const onComplete = vi.fn();
    render(<ControlledDialog onUploadComplete={onComplete} />);
    chooseResume();
    fireEvent.click(await screen.findByRole('button', { name: 'dashboard.retryProcessing' }));
    expect(await screen.findByRole('status')).toHaveTextContent('dashboard.status.processing');
    expect(onComplete).not.toHaveBeenCalled();
    expect(screen.getByRole('button', { name: 'dashboard.deleteResume' })).toBeEnabled();
    fireEvent.click(screen.getByRole('button', { name: 'dashboard.retryProcessing' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledExactlyOnceWith('saved'));
    expect(fetch).toHaveBeenCalledTimes(1);
  });

  it.each([true, false])(
    'deletes the saved row after confirmation (master: %s)',
    async (isMaster) => {
      vi.mocked(fetch).mockResolvedValueOnce(uploadFailure(422, 'saved', isMaster));
      vi.mocked(deleteResume).mockResolvedValueOnce(undefined);
      const onComplete = vi.fn();
      render(<ControlledDialog onUploadComplete={onComplete} />);
      chooseResume();
      fireEvent.click(await screen.findByRole('button', { name: 'dashboard.deleteResume' }));
      expect(
        await screen.findByText(
          isMaster ? 'confirmations.deleteMasterResumeTitle' : 'confirmations.deleteResume'
        )
      ).toBeVisible();
      expect(deleteResume).not.toHaveBeenCalled();
      fireEvent.click(
        screen.getByRole('button', { name: 'confirmations.deleteResumeConfirmLabel' })
      );
      await waitFor(() => expect(deleteResume).toHaveBeenCalledExactlyOnceWith('saved'));
      expect(await screen.findByText('common.resumeDeleted')).toBeVisible();
      expect(document.querySelector('input[type="file"]')).not.toBeDisabled();
      expect(screen.queryByRole('button', { name: 'dashboard.retryProcessing' })).toBeNull();
      expect(onComplete).not.toHaveBeenCalled();
    }
  );

  it('keeps saved recovery after a delete failure and retries deletion', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(uploadFailure());
    vi.mocked(deleteResume)
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValueOnce(undefined);
    render(<ControlledDialog onUploadComplete={vi.fn()} />);
    chooseResume();
    await confirmSavedDelete();
    expect(await screen.findByText('dashboard.errors.deleteFailed')).toBeVisible();
    expect(screen.getByRole('button', { name: 'dashboard.retryProcessing' })).toBeEnabled();
    await confirmSavedDelete();
    expect(await screen.findByText('common.resumeDeleted')).toBeVisible();
    expect(deleteResume).toHaveBeenCalledTimes(2);
  });

  it('discards saved metadata from an old upload after close and reopen', async () => {
    const old = deferred<Response>();
    vi.mocked(fetch)
      .mockReturnValueOnce(old.promise)
      .mockResolvedValueOnce(uploadFailure(422, 'new'));
    vi.mocked(retryProcessing).mockResolvedValueOnce({
      resume_id: 'new',
      processing_status: 'ready',
    });
    const onComplete = vi.fn();
    render(<ControlledDialog onUploadComplete={onComplete} />);
    chooseResume('old.pdf');
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'reopen upload' }));
    chooseResume('new.pdf');
    await screen.findByRole('button', { name: 'dashboard.retryProcessing' });
    await act(async () => old.resolve(uploadFailure(504, 'old')));
    fireEvent.click(screen.getByRole('button', { name: 'dashboard.retryProcessing' }));
    await waitFor(() => expect(onComplete).toHaveBeenCalledExactlyOnceWith('new'));
    expect(retryProcessing).toHaveBeenCalledExactlyOnceWith('new');
  });

  it('does not clear a new upload when an old delete finishes after close and reopen', async () => {
    const old = deferred<void>();
    vi.mocked(fetch)
      .mockResolvedValueOnce(uploadFailure(422, 'old'))
      .mockResolvedValueOnce(uploadFailure(504, 'new'));
    vi.mocked(deleteResume).mockReturnValueOnce(old.promise);
    render(<ControlledDialog onUploadComplete={vi.fn()} />);
    chooseResume('old.pdf');
    await confirmSavedDelete();
    expect(deleteResume).toHaveBeenCalledExactlyOnceWith('old');
    fireEvent.click(screen.getByRole('button', { name: 'common.cancel' }));
    fireEvent.click(screen.getByRole('button', { name: 'reopen upload' }));
    chooseResume('new.pdf');
    await screen.findByRole('button', { name: 'dashboard.retryProcessing' });
    await act(async () => old.resolve());
    expect(screen.getByText('new.pdf')).toBeVisible();
    expect(screen.getByRole('button', { name: 'dashboard.retryProcessing' })).toBeEnabled();
    expect(screen.queryByText('common.resumeDeleted')).toBeNull();
  });

  it('does not offer stored-record actions for malformed metadata', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(
      new Response(JSON.stringify({ detail: 'Failed', resume_id: 'saved', is_master: 'true' }), {
        status: 422,
        headers: { 'content-type': 'application/json' },
      })
    );
    render(<ControlledDialog onUploadComplete={vi.fn()} />);
    chooseResume();
    await screen.findByRole('button', { name: 'dashboard.uploadDialog.tryDifferentFile' });
    expect(screen.queryByRole('button', { name: 'dashboard.retryProcessing' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'dashboard.deleteResume' })).toBeNull();
  });
});

it('recovers from an already deleted saved upload without retrying creation', async () => {
  vi.mocked(fetch).mockResolvedValueOnce(uploadFailure());
  vi.mocked(deleteResume).mockRejectedValueOnce(new Error('Failed to delete resume (status 404)'));
  const onComplete = vi.fn();
  render(<ControlledDialog onUploadComplete={onComplete} />);
  chooseResume();
  await confirmSavedDelete();
  expect(await screen.findByText('common.resumeDeleted')).toBeVisible();
  expect(document.querySelector('input[type="file"]')).not.toBeDisabled();
  expect(onComplete).not.toHaveBeenCalled();
  expect(fetch).toHaveBeenCalledTimes(1);
});

it('serializes saved deletion against retry and ignores completion after unmount', async () => {
  const pending = deferred<void>();
  vi.mocked(fetch).mockResolvedValueOnce(uploadFailure());
  vi.mocked(deleteResume).mockReturnValueOnce(pending.promise);
  const onComplete = vi.fn();
  const view = render(<ControlledDialog onUploadComplete={onComplete} />);
  chooseResume();
  await confirmSavedDelete();
  const retry = screen.getByRole('button', { name: 'dashboard.retryProcessing' });
  const remove = screen.getByRole('button', { name: 'dashboard.deleteResume' });
  expect(retry).toBeDisabled();
  expect(remove).toBeDisabled();
  fireEvent.click(retry);
  fireEvent.click(remove);
  expect(retryProcessing).not.toHaveBeenCalled();
  expect(deleteResume).toHaveBeenCalledExactlyOnceWith('saved');
  view.unmount();
  await act(async () => pending.resolve());
  expect(onComplete).not.toHaveBeenCalled();
});
