import { render } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { Hatch } from '@/components/ui/hatch';

/** The drafting hatch: decorative, drawn in currentColor, at a chosen line pitch. */
describe('Hatch', () => {
  const pattern = (container: HTMLElement) => container.querySelector('pattern') as SVGElement;

  it('is hidden from assistive technology and draws in currentColor at an 8px pitch', () => {
    const { container } = render(<Hatch />);

    expect(container.querySelector('svg')).toHaveAttribute('aria-hidden', 'true');
    expect(pattern(container)).toHaveAttribute('width', '8');
    expect(pattern(container)).toHaveAttribute('height', '8');
    expect(container.querySelector('line')).toHaveAttribute('stroke', 'currentColor');
    expect(container.querySelector('line')).toHaveAttribute('y2', '8');
  });

  it('takes a wider pitch and a colour class', () => {
    const { container } = render(<Hatch pitch={12} className="text-panel-hover" />);

    expect(pattern(container)).toHaveAttribute('width', '12');
    expect(container.querySelector('line')).toHaveAttribute('y2', '12');
    expect(container.querySelector('svg')).toHaveClass('text-panel-hover');
  });

  it('gives each hatch its own pattern id, so two on a page do not share one', () => {
    const { container } = render(
      <>
        <Hatch />
        <Hatch />
      </>
    );
    const ids = [...container.querySelectorAll('pattern')].map((p) => p.id);

    expect(new Set(ids).size).toBe(2);
    expect(container.querySelectorAll('rect')[1]).toHaveAttribute('fill', `url(#${ids[1]})`);
  });
});
