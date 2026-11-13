import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PageContainer } from '@/components/preview/page-container';

// Reported on Discord: "PAGE 1 OF 3" stayed English in every interface language.
vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string, params?: Record<string, string | number>) =>
      `${key}:${params?.page}/${params?.total}`,
  }),
}));

describe('PageContainer page indicator', () => {
  it('is translated, with the page number and total as parameters', () => {
    render(
      <PageContainer
        pageSize="A4"
        margins={{ top: 10, right: 10, bottom: 10, left: 10 }}
        pageNumber={1}
        totalPages={3}
        scale={1}
        showMarginGuides={false}
      >
        <p>content</p>
      </PageContainer>
    );

    expect(screen.getByText('preview.pageOfTotal:1/3')).toBeInTheDocument();
    expect(screen.queryByText(/Page 1 of 3/)).not.toBeInTheDocument();
  });
});
