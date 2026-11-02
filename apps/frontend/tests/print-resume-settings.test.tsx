import { afterEach, describe, expect, it, vi } from 'vitest';
import { render } from '@testing-library/react';
import type { TemplateSettings } from '@/lib/types/template-settings';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

const received: { settings?: TemplateSettings } = {};

vi.mock('@/components/dashboard/resume-component', () => ({
  default: (props: { settings: TemplateSettings }) => {
    received.settings = props.settings;
    return <div data-testid="resume" />;
  },
}));

import PrintResumePage from '@/app/print/resumes/[id]/page';

async function renderWith(searchParams: Record<string, string>) {
  const element = await PrintResumePage({
    params: Promise.resolve({ id: 'resume-1' }),
    searchParams: Promise.resolve(searchParams),
  });
  return render(element);
}

describe('print route template settings from the query string', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
    received.settings = undefined;
  });

  it('keeps valid spacing levels and falls back for invalid ones', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: { processed_resume: { personalInfo: { name: 'Jane' } } } }),
      })
    );

    await renderWith({ sectionSpacing: '4', itemSpacing: 'abc', lineHeight: '9', fontSize: '1' });

    expect(received.settings?.spacing.section).toBe(4);
    expect(received.settings?.spacing.item).toBe(DEFAULT_TEMPLATE_SETTINGS.spacing.item);
    expect(received.settings?.spacing.lineHeight).toBe(
      DEFAULT_TEMPLATE_SETTINGS.spacing.lineHeight
    );
    expect(received.settings?.fontSize.base).toBe(1);
    // Margins go to Playwright, so the rendered sheet always gets zero.
    expect(received.settings?.margins).toEqual({ top: 0, bottom: 0, left: 0, right: 0 });
  });
});
