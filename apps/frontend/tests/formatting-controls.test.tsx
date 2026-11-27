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
    // The tiles fill the panel's width; each name area is two lines tall, so they match.
    expect(group).toHaveClass('grid');
    for (const radio of screen.getAllByRole('radio').filter((r) => group.contains(r))) {
      expect(radio.firstElementChild?.lastElementChild).toHaveClass('min-h-10');
    }
    // Selection is the ink name band, not a double outline.
    expect(selected.firstElementChild?.lastElementChild).toHaveClass('bg-ink', 'text-white');
    expect(selected).not.toHaveClass('outline-2');

    fireEvent.click(
      screen.getByRole('radio', { name: 'builder.formatting.templates.modernTwoColumn.name' })
    );
    expect(onChange).toHaveBeenCalledWith(
      expect.objectContaining({ template: 'modern-two-column' })
    );
  });

  it('offers the accent colours for both Vivid layouts but not for the plain ones', () => {
    for (const template of ['vivid', 'vivid-single'] as const) {
      const { unmount } = render(
        <FormattingControls
          settings={{ ...DEFAULT_TEMPLATE_SETTINGS, template }}
          onChange={vi.fn()}
        />
      );
      expect(
        screen.getByRole('radiogroup', { name: 'builder.formatting.accentColor' })
      ).toBeInTheDocument();
      unmount();
    }
    renderControls();
    expect(
      screen.queryByRole('radiogroup', { name: 'builder.formatting.accentColor' })
    ).not.toBeInTheDocument();
  });

  it('picks the Vivid single-column template from the tiles', () => {
    const onChange = renderControls();
    fireEvent.click(
      screen.getByRole('radio', { name: 'builder.formatting.templates.vividSingle.name' })
    );
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ template: 'vivid-single' }));
  });

  it('offers the Deedy template without the accent colour control', () => {
    const onChange = renderControls();
    fireEvent.click(screen.getByRole('radio', { name: 'builder.formatting.templates.deedy.name' }));
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ template: 'deedy' }));

    render(
      <FormattingControls
        settings={{ ...DEFAULT_TEMPLATE_SETTINGS, template: 'deedy' }}
        onChange={vi.fn()}
      />
    );
    expect(screen.queryByText('builder.formatting.accentColor')).not.toBeInTheDocument();
  });

  it('sets spacing levels and page size through radio groups', () => {
    const onChange = renderControls();
    const sectionSpacing = screen.getByRole('radiogroup', {
      name: 'builder.formatting.spacingSection',
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
    // Phosphor draws no class of its own, so a bare icon has no class attribute.
    expect(icon?.getAttribute('class') ?? '').not.toMatch(/\bsize-/);
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

  it('edits margins with a slider and an mm field that hold the same value', () => {
    const onChange = vi.fn();
    render(
      <FormattingControls
        settings={{
          ...DEFAULT_TEMPLATE_SETTINGS,
          margins: { top: 10, bottom: 12, left: 10, right: 10 },
        }}
        onChange={onChange}
      />
    );
    const field = screen.getByRole('spinbutton', { name: 'builder.formatting.margin.bottom (mm)' });
    expect(field).toHaveValue(12);
    expect(screen.getByRole('slider', { name: 'builder.formatting.margin.bottom' })).toHaveValue(
      '12'
    );

    fireEvent.change(field, { target: { value: '40' } });
    // Held to the 25mm maximum.
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ margins: expect.objectContaining({ bottom: 25 }) })
    );
  });

  it('links the four margins: one slider then sets every side', () => {
    const onChange = renderControls();
    // The default margins match, so "same on all sides" starts on.
    const linked = screen.getByRole('switch', { name: 'builder.formatting.marginsLinked' });
    expect(linked).toHaveAttribute('aria-checked', 'true');

    fireEvent.change(screen.getByRole('slider', { name: 'builder.formatting.margin.all' }), {
      target: { value: '15' },
    });
    expect(onChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ margins: { top: 15, bottom: 15, left: 15, right: 15 } })
    );
  });

  it('says which way the spacing scales run', () => {
    renderControls();
    expect(screen.getAllByText('builder.formatting.tight')).toHaveLength(3);
    expect(screen.getAllByText('builder.formatting.loose')).toHaveLength(3);
  });
});
