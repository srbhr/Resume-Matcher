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

  it('keeps Copy and Remove visible in the entry header, not hidden until hover', () => {
    render(<EducationForm data={[{ id: 1, institution: 'X' }]} onChange={vi.fn()} />);

    for (const button of [duplicateButtons()[0], removeButtons()[0]]) {
      expect(button.className).not.toContain('opacity-0');
      expect(button).toHaveClass('h-8', 'w-8', 'text-ink-soft');
    }
  });
});

/**
 * Each entry opens with one header row: drag handle, the entry's name, Copy and
 * Remove. The fields sit below it at the full width, so nothing overlaps them.
 */
describe('entry header row', () => {
  const cases: Array<[string, React.ReactElement, string]> = [
    [
      'ExperienceForm',
      <ExperienceForm
        key="e"
        data={[{ id: 1, title: 'Staff Engineer', company: 'Acme', years: '2021', description: [] }]}
        onChange={vi.fn()}
      />,
      'Staff Engineer',
    ],
    [
      'EducationForm',
      <EducationForm
        key="d"
        data={[{ id: 1, institution: 'MIT', degree: 'BSc' }]}
        onChange={vi.fn()}
      />,
      'MIT',
    ],
    [
      'ProjectsForm',
      <ProjectsForm
        key="p"
        data={[{ id: 1, name: 'promptdiff', role: 'Maintainer', description: [] }]}
        onChange={vi.fn()}
      />,
      'promptdiff',
    ],
    [
      'GenericItemForm',
      <GenericItemForm
        key="g"
        sectionKey="pubs"
        items={[{ id: 1, title: 'Paper', subtitle: 'NeurIPS' }]}
        onChange={vi.fn()}
      />,
      'Paper',
    ],
  ];

  it.each(cases)(
    '%s: handle, name, Copy and Remove share one row above the fields',
    (_name, form, title) => {
      render(form);
      const toggle = screen.getByRole('button', { name: `builder.entry.collapse` });
      const row = toggle.parentElement!;

      expect(toggle).toHaveTextContent(title);
      expect(row).toContainElement(screen.getByTitle('Drag to reorder'));
      expect(row).toContainElement(duplicateButtons()[0]);
      expect(row).toContainElement(removeButtons()[0]);
      // The fields are below the row, not beside it.
      expect(row.querySelector('input')).toBeNull();
      expect(document.getElementById(toggle.getAttribute('aria-controls')!)).toContainElement(
        screen.getAllByRole('textbox')[0]
      );
    }
  );

  it.each(cases)('%s: folds to its header row and a one-line summary', (_name, form) => {
    render(form);
    const toggle = screen.getByRole('button', { name: 'builder.entry.collapse' });
    const body = document.getElementById(toggle.getAttribute('aria-controls')!)!;
    expect(toggle).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAccessibleName('builder.entry.expand');
    expect(body).not.toBeVisible();
    expect(toggle.textContent).toMatch(/·|Acme|BSc|Maintainer|NeurIPS/);
  });

  it('names an entry with no name yet "Untitled entry"', () => {
    render(<ProjectsForm data={[{ id: 1, name: '', description: [] }]} onChange={vi.fn()} />);

    expect(screen.getByRole('button', { name: 'builder.entry.collapse' })).toHaveTextContent(
      'builder.entry.untitled'
    );
  });

  it('puts Add at the foot of the list, full width, where the next entry appears', () => {
    const { container } = render(
      <ProjectsForm data={[{ id: 1, name: 'A', description: [] }]} onChange={vi.fn()} />
    );
    const add = screen.getByRole('button', { name: 'builder.forms.projects.addProject' });

    expect(add).toHaveClass('w-full');
    expect((container.firstChild as HTMLElement).lastElementChild).toBe(add);
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
