import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { FormattingControls } from '@/components/builder/formatting-controls';
import { DEFAULT_TEMPLATE_SETTINGS } from '@/lib/types/template-settings';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

const renderControls = () => {
  const onChange = vi.fn();
  render(<FormattingControls settings={DEFAULT_TEMPLATE_SETTINGS} onChange={onChange} />);
  return onChange;
};

describe('FormattingControls', () => {
  it('announces whether the panel is expanded', () => {
    renderControls();
    const toggle = screen.getByRole('button', { name: 'builder.formatting.panelTitle' });
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('radiogroup')).not.toBeInTheDocument();
  });

  it('picks templates from a labelled radio group of equal-width tiles', () => {
    const onChange = renderControls();
    const group = screen.getByRole('radiogroup', { name: 'builder.formatting.template' });
    const selected = screen.getByRole('radio', {
      name: 'builder.formatting.templates.swissSingle.name',
    });
    expect(group).toContainElement(selected);
    expect(selected).toHaveAttribute('aria-checked', 'true');
    // Every tile wraps its name inside the same fixed-width column (owner F3).
    for (const radio of screen.getAllByRole('radio').filter((r) => group.contains(r))) {
      expect(radio.firstElementChild).toHaveClass('w-24');
    }

    fireEvent.click(
      screen.getByRole('radio', { name: 'builder.formatting.templates.modernTwoColumn.name' })
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'modern-two-column' })
    );
  });

  it('sets spacing levels and page size through radio groups', () => {
    const onChange = renderControls();
    const sectionSpacing = screen.getByRole('radiogroup', {
      name: 'builder.formatting.spacingSection:',
    });
    const level = Array.from(sectionSpacing.querySelectorAll('[role="radio"]')).find(
      (radio) => radio.textContent === '5'
    );
    fireEvent.click(level as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({
        spacing: expect.objectContaining({ section: 5 }),
      })
    );

    const pageSize = screen.getByRole('radiogroup', { name: 'builder.formatting.pageSize' });
    const letter = Array.from(pageSize.querySelectorAll('[role="radio"]')).find((radio) =>
      radio.textContent?.includes('builder.pageSize.usLetter')
    );
    fireEvent.click(letter as HTMLElement);
    expect(onChange).toHaveBeenLastCalledWith(expect.objectContaining({ pageSize: 'LETTER' }));
  });

  it('draws the reset icon at the Button primitive’s 16px, not a sub-16px override', () => {
    renderControls();
    const icon = screen
      .getByRole('button', { name: 'builder.formatting.resetDefaults' })
      .querySelector('svg');
    expect(icon).not.toBeNull();
    expect(icon?.getAttribute('class')).not.toMatch(/\bsize-/);
  });

  it('toggles compact mode with a switch', () => {
    const onChange = renderControls();
    const compact = screen.getByRole('switch', { name: 'builder.formatting.compactMode' });
    expect(compact).toHaveAttribute('aria-checked', String(DEFAULT_TEMPLATE_SETTINGS.compactMode));
    fireEvent.click(compact);
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ compactMode: !DEFAULT_TEMPLATE_SETTINGS.compactMode })
    );
  });
});
