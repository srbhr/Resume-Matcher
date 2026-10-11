import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { PaginatedPreview } from '@/components/preview/paginated-preview';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';
import { PAGE_DIMENSIONS, mmToPx } from '@/lib/constants/page-dimensions';
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

// The scroll area is padded by 24px a side, so fit-to-width reserves 48px.
const PANEL_PADDING = 48;

describe('PaginatedPreview', () => {
  afterEach(() => vi.restoreAllMocks());

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

  describe('default zoom', () => {
    const renderAt = (clientWidth: number) => {
      // jsdom has no layout, so give the scroll area a width to fit against.
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth);
      render(
        <PaginatedPreview resumeData={{} as ResumeData} settings={DEFAULT_TEMPLATE_SETTINGS} />
      );
    };

    it('opens at 85% when the panel is wide enough for the page', () => {
      renderAt(1400);

      expect(screen.getByText('85%')).toBeInTheDocument();
    });

    it('still fits to width, below 85%, when the panel is narrower than the page', () => {
      const clientWidth = 500;
      renderAt(clientWidth);

      const fit =
        (clientWidth - PANEL_PADDING) /
        mmToPx(PAGE_DIMENSIONS[DEFAULT_TEMPLATE_SETTINGS.pageSize].width);
      expect(fit).toBeLessThan(0.85);
      expect(screen.getByText(`${Math.round(fit * 100)}%`)).toBeInTheDocument();
      expect(screen.queryByText('85%')).not.toBeInTheDocument();
    });
  });
});
