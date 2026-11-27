import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { CoverLetterPreview } from '@/components/builder/cover-letter-preview';
import { FormattingControls } from '@/components/builder/formatting-controls';
import { PersonalInfoForm } from '@/components/builder/forms/personal-info-form';
import { OutreachPreview } from '@/components/builder/outreach-preview';
import { SectionHeader } from '@/components/builder/section-header';
import type { SectionMeta } from '@/components/dashboard/resume-component';
import { PreviewStep } from '@/components/enrichment/preview-step';
import { PageContainer } from '@/components/preview/page-container';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({ t: (key: string) => key, locale: 'en' }),
}));

// The shadow rule: every box inside the page, paper sheets included, gets the translucent
// nested shadow, and nothing nested keeps a solid ink shadow. (The resume sheet's edge is
// carried by its trim marks, not by a heavy shadow competing with the page frame's.)
const SOLID_INK = ['shadow-sw-sm', 'shadow-sw-default', 'shadow-sw-lg', 'shadow-sw-xl'];

const expectNested = (el: HTMLElement) => {
  expect(el).toHaveClass('shadow-sw-nested');
  for (const solid of SOLID_INK) expect(el).not.toHaveClass(solid);
};

const expectSheet = (el: HTMLElement) => {
  expect(el).toHaveClass('bg-white', 'border-ink');
  expectNested(el);
};

describe('paper sheets', () => {
  it('draws the cover letter as a white sheet with the nested shadow', () => {
    const { container } = render(<CoverLetterPreview content="Dear team" personalInfo={{}} />);
    expectSheet(container.firstChild as HTMLElement);
  });

  it('treats the outreach preview as an in-page card, not a paper sheet', () => {
    const { container } = render(<OutreachPreview content="Hello" />);
    expectNested(container.firstChild as HTMLElement);
  });

  it('draws the resume sheet as a white sheet with the nested shadow', () => {
    const { container } = render(
      <PageContainer
        pageSize="A4"
        margins={DEFAULT_TEMPLATE_SETTINGS.margins}
        pageNumber={1}
        totalPages={1}
        scale={1}
        showMarginGuides={false}
      >
        <p>Resume</p>
      </PageContainer>
    );
    expectSheet(container.querySelector('.border-ink') as HTMLElement);
  });
});

describe('boxes inside the builder page', () => {
  it('nests the formatting panel', () => {
    const { container } = render(
      <FormattingControls settings={DEFAULT_TEMPLATE_SETTINGS} onChange={vi.fn()} />
    );
    expectNested(container.firstChild as HTMLElement);
  });

  it('nests the personal info section', () => {
    const { container } = render(<PersonalInfoForm data={{}} onChange={vi.fn()} />);
    expectNested(container.firstChild as HTMLElement);
  });

  it.each([true, false])('nests a section box (visible: %s)', (isVisible) => {
    const section = {
      id: 'summary',
      key: 'summary',
      displayName: 'Summary',
      sectionType: 'text',
      isDefault: true,
      isVisible,
      order: 1,
    } as SectionMeta;
    const { container } = render(
      <SectionHeader
        section={section}
        onRename={vi.fn()}
        onDelete={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onToggleVisibility={vi.fn()}
        isFirst={false}
        isLast={false}
        canDelete
      />
    );
    expectNested(container.firstChild as HTMLElement);
  });
});

describe('boxes inside the enrichment dialog', () => {
  it('nests each enhancement card', () => {
    render(
      <PreviewStep
        enhancements={[
          {
            item_id: 'exp_0',
            item_type: 'experience',
            title: 'Engineer',
            original_description: ['Built tools'],
            enhanced_description: ['Built Python tools'],
          },
        ]}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expectNested(screen.getByText('Engineer').closest('.bg-white') as HTMLElement);
  });
});
