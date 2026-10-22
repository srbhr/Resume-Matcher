import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ExperienceForm } from '@/components/builder/forms/experience-form';
import type { Experience } from '@/components/dashboard/resume-component';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
vi.mock('@/components/ui/rich-text-editor', () => ({
  RichTextEditor: ({ value, onChange }: { value: string; onChange: (html: string) => void }) => (
    <input aria-label={`point ${value}`} value={value} onChange={(e) => onChange(e.target.value)} />
  ),
}));

const job = (): Experience => ({
  id: 1,
  title: 'Dev',
  description: ['First', 'Second'],
  descriptionStyles: ['bullet', 'plain'],
});

function renderJob(): ReturnType<typeof vi.fn> {
  const onChange = vi.fn();
  render(<ExperienceForm data={[job(), { id: 2, title: 'Other' }]} onChange={onChange} />);
  return onChange;
}

describe('description points editor', () => {
  it('adds a bullet point and leaves other entries alone', () => {
    const onChange = renderJob();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'builder.genericItemForm.actions.addPoint' })[0]
    );
    const [first, other] = onChange.mock.calls[0][0] as Experience[];
    expect(first.description).toEqual(['First', 'Second', '']);
    expect(first.descriptionStyles).toEqual(['bullet', 'plain', 'bullet']);
    expect(other).toEqual({ id: 2, title: 'Other' });
  });

  it('edits one point in place', () => {
    const onChange = renderJob();
    fireEvent.change(screen.getByLabelText('point Second'), { target: { value: 'Changed' } });
    const [first] = onChange.mock.calls[0][0] as Experience[];
    expect(first.description).toEqual(['First', 'Changed']);
    expect(first.descriptionStyles).toEqual(['bullet', 'plain']);
  });

  it('toggles the style of one point', () => {
    const onChange = renderJob();
    fireEvent.click(
      screen.getAllByRole('button', { name: 'builder.genericItemForm.actions.togglePointStyle' })[0]
    );
    const [first] = onChange.mock.calls[0][0] as Experience[];
    expect(first.description).toEqual(['First', 'Second']);
    expect(first.descriptionStyles).toEqual(['plain', 'plain']);
  });

  it('removes a point together with its style', () => {
    const onChange = renderJob();
    fireEvent.click(screen.getAllByRole('button', { name: 'a11y.removeDescription' })[0]);
    const [first] = onChange.mock.calls[0][0] as Experience[];
    expect(first.description).toEqual(['Second']);
    expect(first.descriptionStyles).toEqual(['plain']);
  });
});
