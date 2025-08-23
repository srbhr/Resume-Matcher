import { redirect } from 'next/navigation';

// We will mock next/navigation redirect to capture calls
jest.mock('next/navigation', () => ({
  redirect: jest.fn(),
}));

describe('legacy redirect pages', () => {
  beforeEach(() => {
    (redirect as jest.Mock).mockClear();
    process.env.NEXT_PUBLIC_DEFAULT_LOCALE = 'en';
  });

  it('/match legacy redirects to /en/match', async () => {
    const mod = await import('../app/(default)/match/page');
    // invoking default export should perform redirect synchronously
    // @ts-expect-error no args
    mod.default();
    expect(redirect).toHaveBeenCalledWith('/en/match');
  });

  it('/resume legacy redirects to /en/resume', async () => {
    const mod = await import('../app/(default)/resume/page');
    // @ts-expect-error no args
    mod.default();
    expect(redirect).toHaveBeenCalledWith('/en/resume');
  });

  it('/resume/[resume_id] legacy redirects preserving id', async () => {
    const mod = await import('../app/(default)/resume/[resume_id]/page');
    await mod.default({ params: Promise.resolve({ resume_id: 'abc-123' }) } as any);
    expect(redirect).toHaveBeenCalledWith('/en/resume/abc-123');
  });

  it('/resume/[resume_id] falls back to base if id missing', async () => {
    const mod = await import('../app/(default)/resume/[resume_id]/page');
    await mod.default({ params: Promise.resolve({}) } as any);
    expect(redirect).toHaveBeenCalledWith('/en/resume');
  });
});
