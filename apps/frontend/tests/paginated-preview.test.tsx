import { render } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PaginatedPreview } from '@/components/preview/paginated-preview';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';
import type { ResumeData } from '@/components/dashboard/resume-component';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@/lib/context/language-context', () => ({
  useLanguage: () => ({ contentLanguage: 'en' }),
}));
// The real hook reads layout via document.fonts, which jsdom lacks.
vi.mock('@/components/preview/use-pagination', () => ({
  usePagination: () => ({
    pages: [{ pageNumber: 1, contentOffset: 0, contentEnd: 0 }],
    totalContentHeight: 0,
    isCalculating: false,
  }),
}));
// A stand-in resume with a link, like the real templates render.
vi.mock('@/components/dashboard/resume-component', () => ({
  default: () => <a href="https://example.com">Portfolio</a>,
}));

describe('PaginatedPreview', () => {
  it('keeps the off-screen measurement copy out of the tab order and the a11y tree', () => {
    const { container } = render(
      <PaginatedPreview resumeData={{} as ResumeData} settings={DEFAULT_TEMPLATE_SETTINGS} />
    );

    // aria-hidden alone would leave its links focusable; `inert` removes them from tab order.
    const measurement = container.querySelector('[aria-hidden="true"][inert]');
    expect(measurement).not.toBeNull();
    expect(measurement).toContainElement(
      container.querySelector('[aria-hidden="true"][inert] a') as HTMLElement
    );
  });
});
