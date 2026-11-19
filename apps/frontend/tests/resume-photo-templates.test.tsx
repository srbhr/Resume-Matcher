import { render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Resume, { type ResumeData } from '@/components/dashboard/resume-component';
import PrintResumePage from '@/app/print/resumes/[id]/page';
import { TEMPLATE_OPTIONS } from '@/lib/types/template-settings';

/** Every template shows a photo CV's photo in its header, and nothing without one. */

const PHOTO = 'data:image/jpeg;base64,/9j/photo';
const DATA: ResumeData = {
  personalInfo: { name: 'Ada Lovelace', email: 'ada@example.com', title: 'Engineer' },
  summary: 'Analytical engines.',
  workExperience: [],
  education: [],
  personalProjects: [],
  additional: {},
};

const photosIn = (container: HTMLElement) =>
  Array.from(container.querySelectorAll<HTMLImageElement>('img[data-resume-photo]'));

describe.each(TEMPLATE_OPTIONS.map((option) => option.id))('the %s template', (template) => {
  it('shows the photo once, in the header beside the name', () => {
    const { container, getAllByText } = render(
      <Resume resumeData={DATA} template={template} photo={PHOTO} />
    );

    const photos = photosIn(container);
    expect(photos).toHaveLength(1);
    expect(photos[0].getAttribute('src')).toBe(PHOTO);
    const header = photos[0].parentElement;
    expect(header).not.toBeNull();
    // The name renders in the same header block as the photo.
    const names = getAllByText(/Ada/);
    expect(names.some((name) => header?.contains(name))).toBe(true);
  });

  it('shows no photo when the resume has none', () => {
    const { container } = render(<Resume resumeData={DATA} template={template} photo={null} />);

    expect(photosIn(container)).toHaveLength(0);
  });
});

describe('the print page', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  function respond(photo: { status: number; body?: unknown } | Error) {
    return vi.fn(async (url: string) => {
      if (url.endsWith('/photo')) {
        if (photo instanceof Error) throw photo;
        return { ok: photo.status === 200, status: photo.status, json: async () => photo.body };
      }
      return { ok: true, status: 200, json: async () => ({ data: { processed_resume: DATA } }) };
    });
  }

  async function renderPrint() {
    const element = await PrintResumePage({
      params: Promise.resolve({ id: 'res-1' }),
      searchParams: Promise.resolve({}),
    });
    return render(element);
  }

  it("puts the resume's photo into the PDF page", async () => {
    vi.stubGlobal('fetch', respond({ status: 200, body: { photo: PHOTO } }));

    const { container } = await renderPrint();

    expect(photosIn(container).map((img) => img.getAttribute('src'))).toEqual([PHOTO]);
  });

  it.each([
    ['answers 500', { status: 500 }],
    ['is unreachable', new TypeError('fetch failed')],
  ] as const)('still prints the resume when the photo request %s', async (_label, photo) => {
    vi.stubGlobal('fetch', respond(photo));
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const { container, getAllByText } = await renderPrint();

    expect(photosIn(container)).toHaveLength(0);
    expect(getAllByText(/Ada/).length).toBeGreaterThan(0);
    expect(container.querySelector('[data-print-error]')).toBeNull();
  });
});
