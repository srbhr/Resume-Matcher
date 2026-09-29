import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EducationForm } from '@/components/builder/forms/education-form';
import { ExperienceForm } from '@/components/builder/forms/experience-form';
import { ProjectsForm } from '@/components/builder/forms/projects-form';
import { GenericItemForm } from '@/components/builder/forms/generic-item-form';
import { ResumeForm } from '@/components/builder/resume-form';
import type { ResumeData } from '@/components/dashboard/resume-component';

/**
 * Duplicating in the builder:
 * - every entry of an item-list section has a Copy button that inserts a clone
 *   directly below it (built-in sections and custom item-list sections);
 * - custom sections can be duplicated whole; built-in sections cannot.
 */

const COPY_SUFFIX = '(Copy)';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => (key === 'builder.copySuffix' ? COPY_SUFFIX : key),
  }),
}));

// The rich-text editor is a lazy TipTap import; it is irrelevant here and its
// ProseMirror internals are noisy under jsdom.
vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextEditor: ({ value }: { value: string }) => <div data-testid="rte">{value}</div>,
}));

const duplicateButtons = () => screen.getAllByLabelText('a11y.duplicateItem');
const removeButtons = () => screen.getAllByLabelText('a11y.removeItem');

/** The ids `onChange` was last called with, in list order. */
const lastIds = (onChange: ReturnType<typeof vi.fn>) =>
  (onChange.mock.calls.at(-1)?.[0] as Array<{ id: number }>).map((item) => item.id);

describe('entry duplicate button', () => {
  it('ExperienceForm: duplicates the first entry directly below it', () => {
    const onChange = vi.fn();
    render(
      <ExperienceForm
        data={[
          { id: 1, title: 'Backend Developer', description: ['Built APIs'] },
          { id: 2, title: 'Intern', description: [] },
        ]}
        onChange={onChange}
      />
    );

    fireEvent.click(duplicateButtons()[0]);

    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith([
      { id: 1, title: 'Backend Developer', description: ['Built APIs'] },
      { id: 3, title: 'Backend Developer', description: ['Built APIs'] },
      { id: 2, title: 'Intern', description: [] },
    ]);
  });

  it('EducationForm: duplicates the clicked entry', () => {
    const onChange = vi.fn();
    render(
      <EducationForm
        data={[
          { id: 1, institution: 'University of Malaya' },
          { id: 2, institution: 'Somewhere Else' },
        ]}
        onChange={onChange}
      />
    );

    fireEvent.click(duplicateButtons()[1]);

    expect(lastIds(onChange)).toEqual([1, 2, 3]);
    expect(onChange.mock.calls[0][0][2]).toEqual({ id: 3, institution: 'Somewhere Else' });
  });

  it('ProjectsForm: duplicates the first entry directly below it', () => {
    const onChange = vi.fn();
    render(
      <ProjectsForm
        data={[
          { id: 1, name: 'YumiGo', description: ['Shipped'] },
          { id: 2, name: 'Hireo AI', description: [] },
        ]}
        onChange={onChange}
      />
    );

    fireEvent.click(duplicateButtons()[0]);

    expect(lastIds(onChange)).toEqual([1, 3, 2]);
    expect(onChange.mock.calls[0][0][1]).toEqual({
      id: 3,
      name: 'YumiGo',
      description: ['Shipped'],
    });
  });

  it('GenericItemForm: duplicates a custom-section entry', () => {
    const onChange = vi.fn();
    render(
      <GenericItemForm
        sectionKey="publications"
        items={[
          { id: 1, title: 'Paper A' },
          { id: 2, title: 'Paper B' },
        ]}
        onChange={onChange}
      />
    );

    fireEvent.click(duplicateButtons()[0]);

    expect(lastIds(onChange)).toEqual([1, 3, 2]);
    expect(onChange.mock.calls[0][0][1]).toEqual({ id: 3, title: 'Paper A' });
  });

  it('renders one duplicate button per entry and none for an empty section', () => {
    const { unmount } = render(
      <ProjectsForm
        data={[
          { id: 1, name: 'A', description: [] },
          { id: 2, name: 'B', description: [] },
          { id: 3, name: 'C', description: [] },
        ]}
        onChange={vi.fn()}
      />
    );
    expect(duplicateButtons()).toHaveLength(3);
    unmount();

    render(<ProjectsForm data={[]} onChange={vi.fn()} />);
    expect(screen.queryByLabelText('a11y.duplicateItem')).toBeNull();
  });

  it('reveals the copy button on hover like the remove button', () => {
    render(<EducationForm data={[{ id: 1, institution: 'X' }]} onChange={vi.fn()} />);

    expect(duplicateButtons()[0].className).toContain('opacity-0');
    expect(duplicateButtons()[0].className).toContain('group-hover:opacity-100');
  });
});

/**
 * jsdom has no layout, so the geometry is checked from the Tailwind classes
 * instead, with every size read off the rendered buttons rather than hard-coded
 * (`Button size="icon"` is 44px, not the 36px its doc comment still claims).
 * Distances are measured from the card's right edge.
 */
describe('entry action buttons clear each other and the form fields', () => {
  const SPACING_PX = 4; // Tailwind's default spacing unit

  /** Pixels for a spacing utility (e.g. `right-16`, `pr-24`) found in `el`'s classes. */
  const utilityPx = (el: Element, prefix: string): number => {
    for (const cls of el.className.split(/\s+/)) {
      const match = cls.match(new RegExp(`^${prefix}-(\\d+(?:\\.\\d+)?)$`));
      if (match) return Number(match[1]) * SPACING_PX;
    }
    throw new Error(`no ${prefix}-N class in "${el.className}"`);
  };

  const cases: Array<[string, React.ReactElement]> = [
    [
      'ExperienceForm',
      <ExperienceForm key="e" data={[{ id: 1, title: 'T', description: [] }]} onChange={vi.fn()} />,
    ],
    [
      'EducationForm',
      <EducationForm key="d" data={[{ id: 1, institution: 'X' }]} onChange={vi.fn()} />,
    ],
    [
      'ProjectsForm',
      <ProjectsForm key="p" data={[{ id: 1, name: 'P', description: [] }]} onChange={vi.fn()} />,
    ],
    [
      'GenericItemForm',
      <GenericItemForm
        key="g"
        sectionKey="pubs"
        items={[{ id: 1, title: 'Paper' }]}
        onChange={vi.fn()}
      />,
    ],
  ];

  it.each(cases)('%s', (_name, form) => {
    render(form);
    const remove = removeButtons()[0];
    const copy = duplicateButtons()[0];
    const card = remove.closest('.group')!;
    const fields = card.querySelector('.grid-cols-1')!;

    const size = utilityPx(remove, 'h'); // the box, before its hit area
    const hit = utilityPx(remove, 'before:-inset'); // touch area added on each side
    expect(utilityPx(copy, 'h')).toBe(size);

    // Copy sits left of Remove, and their touch areas do not overlap.
    const removeRight = utilityPx(remove, 'right');
    const copyRight = utilityPx(copy, 'right');
    expect(copyRight - hit).toBeGreaterThanOrEqual(removeRight + size + hit);

    // The first-row inputs end before Copy's touch area begins, so a click on
    // an input can never land on a button.
    const fieldsRight = utilityPx(card, 'p') + utilityPx(fields, 'pr');
    expect(fieldsRight).toBeGreaterThanOrEqual(copyRight + size + hit);
  });

  // Both buttons are transparent until hover, and `opacity: 0` also hides the
  // button's focus ring, so keyboard focus must reveal them. jsdom computes no
  // Tailwind styles, so this pins the class token.
  it.each(cases)('%s: copy and remove become visible on keyboard focus', (_name, form) => {
    render(form);
    for (const button of [duplicateButtons()[0], removeButtons()[0]]) {
      expect(button.className.split(/\s+/)).toContain('focus-visible:opacity-100');
    }
  });
});

describe('section duplicate button (ResumeForm)', () => {
  const resumeData = {
    summary: 'A summary',
    workExperience: [],
    customSections: {
      custom_1: {
        sectionType: 'itemList',
        items: [{ id: 1, title: 'Paper A', description: ['cited'] }],
      },
    },
    sectionMeta: [
      {
        id: 'summary',
        key: 'summary',
        displayName: 'Summary',
        sectionType: 'text',
        isDefault: true,
        isVisible: true,
        order: 1,
      },
      {
        id: 'workExperience',
        key: 'workExperience',
        displayName: 'Experience',
        sectionType: 'itemList',
        isDefault: true,
        isVisible: true,
        order: 2,
      },
      {
        id: 'custom_1',
        key: 'custom_1',
        displayName: 'Publications',
        sectionType: 'itemList',
        isDefault: false,
        isVisible: true,
        order: 3,
      },
    ],
  } as unknown as ResumeData;

  it('duplicates a custom section, naming the copy with the suffix', () => {
    const onUpdate = vi.fn();
    render(<ResumeForm resumeData={resumeData} onUpdate={onUpdate} />);

    fireEvent.click(screen.getByLabelText('builder.sectionHeader.duplicateSection'));

    expect(onUpdate).toHaveBeenCalledTimes(1);
    const updated = onUpdate.mock.calls[0][0] as ResumeData;

    const customMeta = updated.sectionMeta!.filter((s) => !s.isDefault);
    expect(customMeta.map((s) => s.displayName)).toEqual([
      'Publications',
      `Publications ${COPY_SUFFIX}`,
    ]);
    expect(Object.keys(updated.customSections!)).toEqual(['custom_1', 'custom_2']);
    expect(updated.customSections!.custom_2).toEqual(updated.customSections!.custom_1);
    expect(updated.customSections!.custom_2).not.toBe(updated.customSections!.custom_1);
  });

  it('offers section duplication for custom sections only', () => {
    render(<ResumeForm resumeData={resumeData} onUpdate={vi.fn()} />);

    // Three sections render, but only the custom one may be duplicated whole.
    expect(screen.getAllByLabelText('builder.sectionHeader.moveUp')).toHaveLength(3);
    expect(screen.getAllByLabelText('builder.sectionHeader.duplicateSection')).toHaveLength(1);
  });
});
