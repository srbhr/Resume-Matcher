import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExperienceForm } from '@/components/builder/forms/experience-form';
import { ProjectsForm } from '@/components/builder/forms/projects-form';
import { GenericItemForm } from '@/components/builder/forms/generic-item-form';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextEditor: ({ value }: { value: string }) => <div>{value}</div>,
}));

const forms: Record<string, () => HTMLElement> = {
  experience: () =>
    render(
      <ExperienceForm
        data={[{ id: 1, title: 'Dev', description: ['Did a thing'] }]}
        onChange={vi.fn()}
      />
    ).container,
  projects: () =>
    render(
      <ProjectsForm
        data={[{ id: 1, name: 'Matcher', description: ['Shipped'] }]}
        onChange={vi.fn()}
      />
    ).container,
  'custom item list': () =>
    render(
      <GenericItemForm
        sectionKey="publications"
        items={[{ id: 1, title: 'Paper', description: ['Cited'] }]}
        onChange={vi.fn()}
      />
    ).container,
};

describe.each(Object.entries(forms))('%s form description row', (_name, renderForm) => {
  it('uses the icon-sm button, spaced so neighbouring hit areas do not overlap', () => {
    renderForm();

    for (const name of [
      'builder.genericItemForm.actions.togglePointStyle',
      'a11y.removeDescription',
    ]) {
      const button = screen.getByRole('button', { name });
      // Primitive size, not a call-site `h-[60px] w-8` override.
      expect(button).toHaveClass('h-8', 'w-8', 'self-end');
      expect(button.className).not.toContain('h-[60px]');
      // 6px of hit area per side on a 32px button needs a gap-3 between neighbours.
      expect(button.parentElement).toHaveClass('flex', 'gap-3');
    }
  });

  it('draws its icons at the 16px floor (no size-3 glyphs)', () => {
    const container = renderForm();

    expect(container.querySelectorAll('svg.size-3')).toHaveLength(0);
    // Inside a Button the primitive sizes svgs to 16px; a size-* class would opt out.
    for (const name of [
      'builder.genericItemForm.actions.togglePointStyle',
      'a11y.removeDescription',
      'builder.genericItemForm.actions.addPoint',
    ]) {
      const icon = screen.getByRole('button', { name }).querySelector('svg');
      expect(icon).not.toBeNull();
      // Phosphor draws no class of its own, so a bare icon has no class attribute.
      expect(icon?.getAttribute('class') ?? '').not.toMatch(/\bsize-/);
    }
  });
});

describe('projects form link-label icons', () => {
  it('draws the GitHub and website icons at 16px', () => {
    const { container } = render(
      <ProjectsForm data={[{ id: 1, name: 'Matcher', description: [] }]} onChange={vi.fn()} />
    );

    const labelIcons = container.querySelectorAll('label svg');
    expect(labelIcons).toHaveLength(2);
    for (const icon of labelIcons) expect(icon).toHaveClass('size-4');
  });
});
