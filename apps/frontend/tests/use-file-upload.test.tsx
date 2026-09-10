import React from 'react';
import { act, renderHook, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { DEFAULT_TIMEOUT_MS } from '@/lib/api/client';
import { useFileUpload } from '@/hooks/use-file-upload';

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

function uploadResponse(resumeId: string): Response {
  return new Response(JSON.stringify({ resume_id: resumeId, processing_status: 'ready' }), {
    status: 200,
    headers: { 'content-type': 'application/json' },
  });
}

function resumeFile(name = 'resume.pdf'): File {
  return new File(['synthetic resume'], name, { type: 'application/pdf' });
}

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('useFileUpload request lifecycle', () => {
  describe.each(['normal', 'StrictMode'] as const)('completed results (%s)', (mode) => {
    it('emits one success and one file-list event for one request', async () => {
      const onUploadSuccess = vi.fn();
      const onFilesChange = vi.fn();
      const onFilesAdded = vi.fn();
      const fetchMock = vi.fn().mockResolvedValue(uploadResponse('resume-1'));
      vi.stubGlobal('fetch', fetchMock);
      const { result } = renderHook(
        () =>
          useFileUpload({
            uploadUrl: '/api/v1/resumes/upload',
            onUploadSuccess,
            onFilesChange,
            onFilesAdded,
          }),
        {
          wrapper: ({ children }) =>
            mode === 'StrictMode' ? (
              <React.StrictMode>{children}</React.StrictMode>
            ) : (
              <>{children}</>
            ),
        }
      );

      act(() => result.current[1].addFiles([resumeFile()]));

      await waitFor(() => expect(onUploadSuccess).toHaveBeenCalledTimes(1));
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(onFilesChange).toHaveBeenCalledTimes(1);
      expect(onFilesAdded).toHaveBeenCalledTimes(1);
    });

    it('emits one error for one failed request', async () => {
      const onUploadError = vi.fn();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response('synthetic failure', {
            status: 500,
            statusText: 'Internal Server Error',
          })
        )
      );
      const { result } = renderHook(
        () =>
          useFileUpload({
            uploadUrl: '/api/v1/resumes/upload',
            onUploadError,
          }),
        {
          wrapper: ({ children }) =>
            mode === 'StrictMode' ? (
              <React.StrictMode>{children}</React.StrictMode>
            ) : (
              <>{children}</>
            ),
        }
      );

      act(() => result.current[1].addFiles([resumeFile()]));

      await waitFor(() => expect(onUploadError).toHaveBeenCalledTimes(1));
    });
  });

  it('ends a hung upload at the shared request deadline with recoverable feedback', async () => {
    vi.useFakeTimers();
    const onUploadError = vi.fn();
    vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(() => undefined)));
    const { result } = renderHook(() =>
      useFileUpload({
        uploadUrl: '/api/v1/resumes/upload',
        onUploadError,
      })
    );

    act(() => result.current[1].addFiles([resumeFile()]));
    expect(result.current[0].isUploadingGlobal).toBe(true);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(DEFAULT_TIMEOUT_MS);
    });

    expect(result.current[0].isUploadingGlobal).toBe(false);
    expect(onUploadError).toHaveBeenCalledTimes(1);
    expect(onUploadError.mock.calls[0][1]).toMatch(/timed out/i);
    expect(result.current[0].files[0]?.file).toMatchObject({
      uploaded: false,
      uploadError: expect.stringMatching(/timed out/i),
    });
  });

  it('clear aborts the owned request and discards its late success', async () => {
    const pending = deferred<Response>();
    let requestSignal: AbortSignal | undefined;
    const onUploadSuccess = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        requestSignal = init.signal ?? undefined;
        return pending.promise;
      })
    );
    const { result } = renderHook(() =>
      useFileUpload({ uploadUrl: '/api/v1/resumes/upload', onUploadSuccess })
    );

    act(() => result.current[1].addFiles([resumeFile('old.pdf')]));
    act(() => result.current[1].clearFiles());

    expect(requestSignal?.aborted).toBe(true);
    await act(async () => pending.resolve(uploadResponse('old-resume')));
    expect(onUploadSuccess).not.toHaveBeenCalled();
    expect(result.current[0].files).toHaveLength(0);
  });

  it('a cleared upload cannot alter the newer upload when it settles late', async () => {
    const oldRequest = deferred<Response>();
    const newRequest = deferred<Response>();
    const onUploadSuccess = vi.fn();
    const onUploadError = vi.fn();
    const fetchMock = vi
      .fn()
      .mockImplementationOnce(() => oldRequest.promise)
      .mockImplementationOnce(() => newRequest.promise);
    vi.stubGlobal('fetch', fetchMock);
    const { result } = renderHook(() =>
      useFileUpload({
        uploadUrl: '/api/v1/resumes/upload',
        onUploadSuccess,
        onUploadError,
      })
    );

    act(() => result.current[1].addFiles([resumeFile('old.pdf')]));
    act(() => result.current[1].clearFiles());
    act(() => result.current[1].addFiles([resumeFile('new.pdf')]));
    await act(async () => newRequest.resolve(uploadResponse('new-resume')));
    await waitFor(() => expect(onUploadSuccess).toHaveBeenCalledTimes(1));

    await act(async () => oldRequest.reject(new Error('late old failure')));

    expect(onUploadSuccess.mock.calls[0][1]).toMatchObject({ resume_id: 'new-resume' });
    expect(onUploadError).not.toHaveBeenCalled();
    expect(result.current[0].files[0]?.file.name).toBe('new.pdf');
    expect(result.current[0].isUploadingGlobal).toBe(false);
  });

  it('remove aborts the matching upload and discards its completion', async () => {
    const pending = deferred<Response>();
    let requestSignal: AbortSignal | undefined;
    const onUploadSuccess = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        requestSignal = init.signal ?? undefined;
        return pending.promise;
      })
    );
    const { result } = renderHook(() =>
      useFileUpload({ uploadUrl: '/api/v1/resumes/upload', onUploadSuccess })
    );

    act(() => result.current[1].addFiles([resumeFile()]));
    const fileId = result.current[0].files[0]?.id;
    expect(fileId).toBeDefined();
    act(() => result.current[1].removeFile(fileId!));

    expect(requestSignal?.aborted).toBe(true);
    await act(async () => pending.resolve(uploadResponse('removed-resume')));
    expect(onUploadSuccess).not.toHaveBeenCalled();
  });

  it('unmount aborts its request without emitting a result', async () => {
    const pending = deferred<Response>();
    let requestSignal: AbortSignal | undefined;
    const onUploadSuccess = vi.fn();
    const onUploadError = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockImplementation((_url: string, init: RequestInit) => {
        requestSignal = init.signal ?? undefined;
        return pending.promise;
      })
    );
    const { result, unmount } = renderHook(() =>
      useFileUpload({
        uploadUrl: '/api/v1/resumes/upload',
        onUploadSuccess,
        onUploadError,
      })
    );

    act(() => result.current[1].addFiles([resumeFile()]));
    unmount();

    expect(requestSignal?.aborted).toBe(true);
    pending.resolve(uploadResponse('unmounted-resume'));
    await Promise.resolve();
    expect(onUploadSuccess).not.toHaveBeenCalled();
    expect(onUploadError).not.toHaveBeenCalled();
  });
});

it('serializes batched add/remove callbacks and enforces capacity before rerender', () => {
  vi.stubGlobal('fetch', vi.fn().mockReturnValue(new Promise<Response>(() => undefined)));
  const changes = vi.fn();
  const { result } = renderHook(() =>
    useFileUpload({ multiple: true, maxFiles: 2, uploadUrl: '/upload', onFilesChange: changes })
  );
  act(() => {
    result.current[1].addFiles([resumeFile('a.pdf')]);
    result.current[1].addFiles([resumeFile('b.pdf')]);
    result.current[1].addFiles([resumeFile('c.pdf')]);
  });
  expect(result.current[0].files.map((f) => f.file.name)).toEqual(['a.pdf', 'b.pdf']);
  expect(changes.mock.calls[1][0].map((f: { file: File }) => f.file.name)).toEqual([
    'a.pdf',
    'b.pdf',
  ]);
  const [a, b] = result.current[0].files;
  act(() => {
    result.current[1].removeFile(a.id);
    result.current[1].removeFile(b.id);
  });
  expect(changes.mock.lastCall?.[0]).toEqual([]);
});

describe('saved upload error metadata', () => {
  it.each([422, 503, 504])(
    'retains validated recovery identity from an HTTP %s failure',
    async (status) => {
      const onUploadError = vi.fn();
      const onUploadSuccess = vi.fn();
      vi.stubGlobal(
        'fetch',
        vi.fn().mockResolvedValue(
          new Response(
            JSON.stringify({
              detail: 'Processing unavailable. Please try again.',
              resume_id: 'saved-resume',
              is_master: true,
            }),
            { status, headers: { 'content-type': 'application/json' } }
          )
        )
      );
      const { result } = renderHook(() =>
        useFileUpload({ uploadUrl: '/api/v1/resumes/upload', onUploadError, onUploadSuccess })
      );
      act(() => result.current[1].addFiles([resumeFile()]));
      await waitFor(() => expect(onUploadError).toHaveBeenCalledTimes(1));
      expect(onUploadError.mock.calls[0][2]).toEqual({
        resume_id: 'saved-resume',
        is_master: true,
      });
      expect(result.current[0].files[0].file).toMatchObject({
        uploaded: false,
        uploadErrorMetadata: { resume_id: 'saved-resume', is_master: true },
      });
      expect(onUploadSuccess).not.toHaveBeenCalled();
    }
  );

  it.each([
    null,
    [],
    {},
    { resume_id: '   ', is_master: true },
    { resume_id: 1, is_master: true },
    { resume_id: 'saved' },
    { resume_id: 'saved', is_master: 'true' },
  ])('ignores malformed recovery metadata %j', async (metadata) => {
    const onUploadError = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify(metadata), {
          status: 422,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    const { result } = renderHook(() =>
      useFileUpload({ uploadUrl: '/api/v1/resumes/upload', onUploadError })
    );
    act(() => result.current[1].addFiles([resumeFile()]));
    await waitFor(() => expect(onUploadError).toHaveBeenCalledTimes(1));
    expect(onUploadError.mock.calls[0][2]).toBeUndefined();
    expect(result.current[0].files[0].file).not.toHaveProperty('uploadErrorMetadata');
  });

  it('does not propagate metadata from an abandoned upload into its replacement', async () => {
    const pending = deferred<Response>();
    const onUploadError = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn().mockReturnValueOnce(pending.promise).mockResolvedValueOnce(uploadResponse('new'))
    );
    const { result } = renderHook(() =>
      useFileUpload({ uploadUrl: '/api/v1/resumes/upload', onUploadError })
    );
    act(() => result.current[1].addFiles([resumeFile('old.pdf')]));
    act(() => result.current[1].clearFiles());
    act(() => result.current[1].addFiles([resumeFile('new.pdf')]));
    await act(async () =>
      pending.resolve(
        new Response(JSON.stringify({ resume_id: 'old', is_master: true }), {
          status: 504,
          headers: { 'content-type': 'application/json' },
        })
      )
    );
    await waitFor(() => expect(result.current[0].isUploadingGlobal).toBe(false));
    expect(onUploadError).not.toHaveBeenCalled();
    expect(result.current[0].files[0].file).toMatchObject({ name: 'new.pdf', uploaded: true });
  });
});
