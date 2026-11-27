import { fireEvent, screen, within } from '@testing-library/react';
import { http, HttpResponse } from 'msw';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { startMsw } from './support/msw';
import { installDomShims, removeDomShims } from './support/dom-shims';
import { installNodeFormData, nodeFile } from './support/node-form-data';
import {
  API,
  SERVER_RESUME,
  advance,
  backgroundHandlers,
  deferred,
  en,
  renderBuilder,
  resumeBody,
  route,
} from './support/builder-page';
// Loaded here first, so the photo field's dynamic import resolves from the cache.
import '@/components/ui/photo-crop-dialog';

/**
 * The photo of a photo CV in the builder: added, changed and removed from the
 * personal information section, and shown in the live preview. Real page and
 * providers; MSW plays the backend; only `next/navigation` is mocked.
 */

vi.mock('next/navigation', async () => (await import('./support/navigation')).navigation);

const STORED = 'data:image/jpeg;base64,/9j/stored';
const UPLOADED = 'data:image/jpeg;base64,/9j/uploaded';
const text = en.resume.personalInfo.photo;

/** Requests the photo endpoints received, as "METHOD". */
let photoCalls: string[] = [];

const server = startMsw();

function serveBackend({ photo = null as string | null, putStatus = 200 } = {}) {
  server.use(
    // Before the harness defaults, which answer the photo route with "no photo".
    http.get(`${API}/resumes/:id/photo`, () => {
      photoCalls.push('GET');
      return HttpResponse.json({ photo });
    }),
    http.put(`${API}/resumes/:id/photo`, async ({ request }) => {
      photoCalls.push('PUT');
      const body = await request.text();
      if (!body.includes('filename="me.jpg"')) return new HttpResponse(null, { status: 400 });
      if (putStatus !== 200) {
        return HttpResponse.json({ detail: 'refused' }, { status: putStatus });
      }
      return HttpResponse.json({ photo: UPLOADED });
    }),
    http.delete(`${API}/resumes/:id/photo`, () => {
      photoCalls.push('DELETE');
      return HttpResponse.json({ photo: null });
    }),
    ...backgroundHandlers(),
    http.get(`${API}/resumes`, () => HttpResponse.json(resumeBody(SERVER_RESUME)))
  );
}

/** The photo in the live preview (the measuring copy is aria-hidden). */
const previewPhotos = () =>
  Array.from(document.querySelectorAll<HTMLImageElement>('img[data-resume-photo]')).map((img) =>
    img.getAttribute('src')
  );

async function choose(file: File) {
  fireEvent.change(screen.getByTestId('resume-photo-input'), { target: { files: [file] } });
  await advance(10);
}

beforeEach(async () => {
  vi.useFakeTimers();
  installDomShims();
  // Per test: removeDomShims unstubs every global, FormData included.
  await installNodeFormData();
  localStorage.clear();
  route.search = 'id=res-1';
  photoCalls = [];
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  removeDomShims();
});

describe('builder: the photo of a photo CV', () => {
  it('offers to add one and shows none while the resume has none', async () => {
    serveBackend();
    renderBuilder();
    await advance(10);

    expect(screen.getByRole('button', { name: text.add })).toBeEnabled();
    expect(screen.queryByRole('button', { name: text.remove })).toBeNull();
    expect(previewPhotos()).toEqual([]);
    expect(screen.getByText(text.hint)).toBeInTheDocument();
  });

  it('shows the stored photo in the field and the preview', async () => {
    serveBackend({ photo: STORED });
    renderBuilder();
    await advance(10);

    expect(screen.getByRole('img', { name: text.previewAlt })).toHaveAttribute('src', STORED);
    expect(previewPhotos().every((src) => src === STORED)).toBe(true);
    expect(previewPhotos().length).toBeGreaterThan(0);
    expect(screen.getByRole('button', { name: text.change })).toBeEnabled();
  });

  it('uploads a chosen photo and previews what the server stored', async () => {
    serveBackend();
    renderBuilder();
    await advance(10);

    await choose(nodeFile('jpeg bytes', 'me.jpg', 'image/jpeg'));

    expect(photoCalls).toContain('PUT');
    expect(screen.getByRole('img', { name: text.previewAlt })).toHaveAttribute('src', UPLOADED);
    expect(previewPhotos().length).toBeGreaterThan(0);
    expect(previewPhotos().every((src) => src === UPLOADED)).toBe(true);
  });

  it('removes the photo from the resume and the preview', async () => {
    serveBackend({ photo: STORED });
    renderBuilder();
    await advance(10);

    fireEvent.click(screen.getByRole('button', { name: text.remove }));
    await advance(10);

    expect(photoCalls).toContain('DELETE');
    expect(previewPhotos()).toEqual([]);
    expect(screen.getByRole('button', { name: text.add })).toBeEnabled();
  });

  it.each([
    ['a GIF', nodeFile('gif', 'me.gif', 'image/gif'), text.errors.unsupported],
    [
      'a file over 5 MB',
      nodeFile('x'.repeat(5 * 1024 * 1024 + 1), 'me.jpg', 'image/jpeg'),
      text.errors.tooLarge,
    ],
  ])('refuses %s before uploading it', async (_label, file, message) => {
    serveBackend();
    renderBuilder();
    await advance(10);

    await choose(file);

    expect(screen.getByRole('alert')).toHaveTextContent(message);
    expect(photoCalls).not.toContain('PUT');
  });

  it.each([
    [422, text.errors.unsupported],
    [413, text.errors.tooLarge],
    [500, text.errors.failed],
  ])(
    'says why when the server refuses it (%i) and keeps the old photo',
    async (status, message) => {
      serveBackend({ photo: STORED, putStatus: status });
      vi.spyOn(console, 'error').mockImplementation(() => undefined);
      renderBuilder();
      await advance(10);

      await choose(nodeFile('jpeg bytes', 'me.jpg', 'image/jpeg'));

      expect(screen.getByRole('alert')).toHaveTextContent(message);
      expect(previewPhotos().every((src) => src === STORED)).toBe(true);
    }
  );

  it("keeps the next resume's photo when an upload to the last one ends after the switch", async () => {
    const OTHER = 'data:image/jpeg;base64,/9j/other';
    const put = deferred();
    serveBackend();
    server.use(
      http.get(`${API}/resumes/:id/photo`, ({ params }) =>
        HttpResponse.json({ photo: params.id === 'res-2' ? OTHER : null })
      ),
      http.put(`${API}/resumes/:id/photo`, async () => {
        await put.promise;
        return HttpResponse.json({ photo: UPLOADED });
      }),
      http.get(`${API}/resumes`, ({ request }) =>
        HttpResponse.json(
          resumeBody(SERVER_RESUME, {
            resume_id: new URL(request.url).searchParams.get('resume_id'),
          })
        )
      )
    );
    const view = renderBuilder();
    await advance(10);
    await choose(nodeFile('jpeg bytes', 'me.jpg', 'image/jpeg'));

    route.search = 'id=res-2';
    view.rerender();
    await advance(10);
    put.resolve();
    await advance(10);

    expect(screen.getByRole('img', { name: text.previewAlt })).toHaveAttribute('src', OTHER);
    expect(previewPhotos().every((src) => src === OTHER)).toBe(true);
    expect(screen.getByRole('button', { name: text.change })).toBeEnabled();
  });

  it('keeps an uploaded photo when the stored one finishes loading after it', async () => {
    const stored = deferred();
    serveBackend();
    server.use(
      http.get(`${API}/resumes/:id/photo`, async () => {
        await stored.promise;
        return HttpResponse.json({ photo: STORED });
      })
    );
    renderBuilder();
    await advance(10);
    await choose(nodeFile('jpeg bytes', 'me.jpg', 'image/jpeg'));
    expect(screen.getByRole('img', { name: text.previewAlt })).toHaveAttribute('src', UPLOADED);

    stored.resolve();
    await advance(10);

    expect(screen.getByRole('img', { name: text.previewAlt })).toHaveAttribute('src', UPLOADED);
    expect(previewPhotos().every((src) => src === UPLOADED)).toBe(true);
  });

  it('asks for a crop first where the browser can crop, and Cancel uploads nothing', async () => {
    // jsdom can't decode images; a browser that can gets the crop dialog.
    vi.stubGlobal('createImageBitmap', vi.fn());
    serveBackend();
    renderBuilder();
    await advance(10);

    await choose(nodeFile('jpeg bytes', 'me.jpg', 'image/jpeg'));

    await advance(10);
    const dialog = screen.getByRole('dialog', { name: text.crop.title });
    expect(within(dialog).getByRole('slider', { name: text.crop.zoom })).toBeInTheDocument();
    // Nothing to crop until the image has loaded, which jsdom never does.
    expect(within(dialog).getByRole('button', { name: text.crop.apply })).toBeDisabled();
    fireEvent.click(within(dialog).getByRole('button', { name: text.crop.cancel }));
    await advance(10);

    expect(screen.queryByRole('dialog', { name: text.crop.title })).toBeNull();
    expect(photoCalls).not.toContain('PUT');
  });

  it('still edits the resume when the photo cannot be loaded', async () => {
    serveBackend();
    server.use(
      http.get(`${API}/resumes/:id/photo`, () =>
        HttpResponse.json({ detail: 'down' }, { status: 500 })
      )
    );
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    renderBuilder();
    await advance(10);

    expect(screen.getByLabelText(en.resume.personalInfo.name)).toHaveValue('Ada Lovelace');
    expect(previewPhotos()).toEqual([]);
    expect(screen.getByRole('button', { name: text.add })).toBeEnabled();
  });
});
