import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EducationForm } from '@/components/builder/forms/education-form';
import { ExperienceForm } from '@/components/builder/forms/experience-form';
import { ProjectsForm } from '@/components/builder/forms/projects-form';
import { GenericItemForm } from '@/components/builder/forms/generic-item-form';

/**
 * Every item-list section in the builder must expose a per-item drag handle so
 * entries can be reordered.
 *
 * Regression guard: item-level drag-and-drop used to be copy-pasted per form.
 * Experience and Education each had their own copy; Projects and custom
 * item-list sections were never given one, so a user with many projects and
 * little work history could not order the section that mattered most to them.
 * These cases fail on the pre-fix code and cover all four sections so a fifth
 * one cannot quietly ship without a handle.
 */

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

// The rich-text editor is a lazy TipTap import; it is irrelevant here and its
// ProseMirror internals are noisy under jsdom.
vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextEditor: ({ value }: { value: string }) => <div data-testid="rte">{value}</div>,
}));

const handles = () => screen.getAllByTitle('Drag to reorder');

describe('builder item-level drag handles', () => {
  it('renders one handle per project entry', () => {
    render(
      <ProjectsForm
        data={[
          { id: 1, name: 'YumiGo', description: [] },
          { id: 2, name: 'Hireo AI', description: [] },
          { id: 3, name: 'TavernHub', description: [] },
        ]}
        onChange={vi.fn()}
      />
    );

    expect(handles()).toHaveLength(3);
  });

  it('renders one handle per custom item-list entry', () => {
    render(
      <GenericItemForm
        sectionKey="publications"
        items={[
          { id: 1, title: 'Paper A' },
          { id: 2, title: 'Paper B' },
        ]}
        onChange={vi.fn()}
      />
    );

    expect(handles()).toHaveLength(2);
  });

  it('renders one handle per education entry', () => {
    render(
      <EducationForm
        data={[
          { id: 1, institution: 'University of Malaya' },
          { id: 2, institution: 'Somewhere Else' },
        ]}
        onChange={vi.fn()}
      />
    );

    expect(handles()).toHaveLength(2);
  });

  it('renders one handle per experience entry', () => {
    render(
      <ExperienceForm
        data={[{ id: 1, title: 'Backend Developer', description: [] }]}
        onChange={vi.fn()}
      />
    );

    expect(handles()).toHaveLength(1);
  });

  it('renders no handles for an empty section', () => {
    render(<ProjectsForm data={[]} onChange={vi.fn()} />);

    expect(screen.queryByTitle('Drag to reorder')).toBeNull();
  });
});
