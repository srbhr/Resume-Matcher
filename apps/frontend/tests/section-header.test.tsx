import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { SectionHeader } from '@/components/builder/section-header';
import type { SectionMeta } from '@/components/dashboard/resume-component';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

const section = (overrides: Partial<SectionMeta>): SectionMeta =>
  ({
    id: 'summary',
    key: 'summary',
    displayName: 'Summary',
    sectionType: 'text',
    isDefault: true,
    isVisible: true,
    order: 1,
    ...overrides,
  }) as SectionMeta;

const renderHeader = (meta: SectionMeta) => {
  const handlers = {
    onRename: vi.fn(),
    onDelete: vi.fn(),
    onMoveUp: vi.fn(),
    onMoveDown: vi.fn(),
    onToggleVisibility: vi.fn(),
  };
  render(<SectionHeader section={meta} {...handlers} isFirst={false} isLast={false} canDelete />);
  return handlers;
};

describe('SectionHeader visibility controls', () => {
  it.each([true, false])(
    'gives a default section one visibility toggle with a static name (visible: %s)',
    (isVisible) => {
      const { onToggleVisibility } = renderHeader(section({ isVisible }));

      const toggles = screen.getAllByRole('button', { name: 'builder.sectionHeader.hideSection' });
      expect(toggles).toHaveLength(1);
      expect(toggles[0]).toHaveAttribute('aria-pressed', String(!isVisible));
      expect(
        screen.queryByRole('button', { name: 'builder.sectionHeader.showSection' })
      ).not.toBeInTheDocument();
      expect(
        screen.queryByRole('button', { name: 'builder.sectionHeader.deleteSection' })
      ).not.toBeInTheDocument();

      fireEvent.click(toggles[0]);
      expect(onToggleVisibility).toHaveBeenCalledTimes(1);
    }
  );

  it('keeps the confirmed delete for custom sections', () => {
    const { onToggleVisibility, onDelete } = renderHeader(
      section({ id: 'custom_1', key: 'custom_1', displayName: 'Talks', isDefault: false })
    );

    fireEvent.click(screen.getByRole('button', { name: 'builder.sectionHeader.deleteSection' }));
    expect(onToggleVisibility).not.toHaveBeenCalled();
    expect(onDelete).not.toHaveBeenCalled();
    expect(screen.getByText('builder.sectionHeader.deleteTitle')).toBeInTheDocument();
  });
});
