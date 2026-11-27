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
const pagination = vi.hoisted(() => ({
  pages: [{ pageNumber: 1, contentOffset: 0, contentEnd: 0 }],
}));
// The real hook reads layout via document.fonts, which jsdom lacks.
vi.mock('@/components/preview/use-pagination', () => ({
  usePagination: () => ({
    pages: pagination.pages,
    totalContentHeight: 0,
    isCalculating: false,
  }),
}));

const ONE_PAGE = [{ pageNumber: 1, contentOffset: 0, contentEnd: 0 }];
const TWO_PAGES = [...ONE_PAGE, { pageNumber: 2, contentOffset: 900, contentEnd: 1200 }];
// A stand-in resume with a link, like the real templates render.
vi.mock('@/components/dashboard/resume-component', () => ({
  default: () => <a href="https://example.com">Portfolio</a>,
}));

// The scroll area is padded by 24px a side, so fit-to-width reserves 48px.
const PANEL_PADDING = 48;

describe('PaginatedPreview', () => {
  afterEach(() => {
    vi.restoreAllMocks();
    pagination.pages = ONE_PAGE;
  });

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

  describe('the page variant (resume viewer)', () => {
    const renderPage = (clientWidth: number) => {
      vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(clientWidth);
      return render(
        <PaginatedPreview
          resumeData={{} as ResumeData}
          settings={DEFAULT_TEMPLATE_SETTINGS}
          variant="page"
          overflowAction={<button type="button">Edit</button>}
        />
      );
    };
    const sheetScale = (container: HTMLElement) =>
      (container.querySelector('.shadow-sw-card') as HTMLElement).style.transform;

    it('shows the pages at 105%, with no zoom or margin controls and no grey panel', () => {
      const { container } = renderPage(1400);

      expect(sheetScale(container)).toBe('scale(1.05)');
      expect(screen.queryByRole('button', { name: 'preview.zoomIn' })).toBeNull();
      expect(screen.queryByRole('button', { name: 'preview.zoomOut' })).toBeNull();
      expect(screen.queryByRole('button', { name: /preview.margins/ })).toBeNull();
      expect(container.querySelector('.bg-panel-hover, .bg-panel')).toBeNull();
    });

    it('shrinks below 105% only when the page would not fit', () => {
      const { container } = renderPage(600);

      const scale = Number(sheetScale(container).match(/scale\(([\d.]+)\)/)?.[1]);
      expect(scale).toBeLessThan(1.05);
      expect(scale).toBeGreaterThan(0.4);
    });

    it('shows the page count, and no edit option for one page', () => {
      renderPage(1400);

      expect(screen.getByText('preview.pageCountSingular')).toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
    });

    it('offers the edit option once the resume runs past one page', () => {
      pagination.pages = TWO_PAGES;
      renderPage(1400);

      expect(screen.getByText('preview.pageCountPlural')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Edit' })).toBeInTheDocument();
    });
  });

  it('keeps the builder panel unchanged: controls and 85% by default', () => {
    vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1400);
    pagination.pages = TWO_PAGES;
    render(
      <PaginatedPreview
        resumeData={{} as ResumeData}
        settings={DEFAULT_TEMPLATE_SETTINGS}
        overflowAction={<button type="button">Edit</button>}
      />
    );

    expect(screen.getByText('85%')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'preview.zoomIn' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Edit' })).toBeNull();
  });
});
