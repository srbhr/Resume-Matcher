import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PaginatedPreview } from '@/components/preview/paginated-preview';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';
import type { ResumeData } from '@/components/dashboard/resume-component';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key }),
}));

vi.mock('@/components/preview/use-pagination', () => ({
  usePagination: () => ({
    pages: [{ pageNumber: 1, contentOffset: 0, contentEnd: 100 }],
    totalContentHeight: 100,
    isCalculating: false,
  }),
}));

const resumeData: ResumeData = {
  personalInfo: {
    name: 'Ada Lovelace',
    photo: {
      cropX: 0,
      cropY: 0,
      cropWidth: 100,
      cropHeight: 100,
      size: 88,
      version: 7,
      aspectRatio: 1,
    },
  },
  workExperience: [],
  education: [],
  personalProjects: [],
  additional: {},
};

describe('PaginatedPreview profile photo identity', () => {
  it('renders the versioned photo in measurement and visible previews, but only one edit action', () => {
    render(
      <PaginatedPreview
        resumeId="resume 9"
        editable
        onEditPhoto={vi.fn()}
        resumeData={resumeData}
        settings={DEFAULT_TEMPLATE_SETTINGS}
      />
    );

    const images = screen.getAllByRole('img', { hidden: true });
    const photoImages = images.filter(
      (image) => image.getAttribute('src') === '/api/v1/resumes/resume%209/photo?v=7'
    );

    expect(photoImages).toHaveLength(2);
    expect(
      screen.getAllByRole('button', { name: 'resume.photo.editAction', hidden: true })
    ).toHaveLength(1);
  });
});
