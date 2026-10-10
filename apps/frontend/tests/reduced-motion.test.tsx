import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Dialog, DialogContent, DialogTitle } from '@/components/ui/dialog';
import { Dropdown } from '@/components/ui/dropdown';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

// The global Motion mock strips `initial`/`exit`, so this file swaps in one that
// writes them to data attributes. That lets a test read the scale each surface
// enters and leaves with, without changing any production code.
const motion = vi.hoisted(() => ({ reduced: false }));
vi.mock('motion/react', async () => {
  const React = await import('react');
  const cache = new Map<string, React.ElementType>();
  const m = new Proxy({} as Record<string, React.ElementType>, {
    get: (_target, tag: string | symbol) => {
      if (typeof tag !== 'string' || tag === 'then') return undefined;
      if (!cache.has(tag)) {
        const Component = React.forwardRef<unknown, Record<string, unknown>>((props, ref) => {
          const { initial, exit, animate, transition, ...rest } = props;
          void animate;
          void transition;
          return React.createElement(tag, {
            ...rest,
            ref,
            'data-initial': JSON.stringify(initial),
            'data-exit': JSON.stringify(exit),
          });
        });
        Component.displayName = `m.${tag}`;
        cache.set(tag, Component);
      }
      return cache.get(tag);
    },
  });
  const Passthrough = ({ children }: { children?: React.ReactNode }) =>
    React.createElement(React.Fragment, null, children);
  return {
    m,
    AnimatePresence: Passthrough,
    useReducedMotion: () => motion.reduced,
    useIsPresent: () => true,
  };
});

const scaleOf = (element: HTMLElement, attribute: 'data-initial' | 'data-exit') =>
  JSON.parse(element.getAttribute(attribute) ?? '{}').scale;

function openDialog() {
  render(
    <Dialog open onOpenChange={vi.fn()}>
      <DialogContent>
        <DialogTitle>Title</DialogTitle>
      </DialogContent>
    </Dialog>
  );
  return screen.getByRole('dialog');
}

function openDropdown() {
  render(
    <Dropdown label="Stage" options={[{ id: 'a', label: 'Alpha' }]} value="a" onChange={vi.fn()} />
  );
  fireEvent.click(screen.getByRole('button', { name: 'Stage Alpha' }));
  return screen.getByRole('listbox');
}

describe('reduced motion: surfaces only fade', () => {
  afterEach(() => {
    motion.reduced = false;
  });

  it('scales the dialog from 0.95 normally', () => {
    const dialog = openDialog();
    expect(scaleOf(dialog, 'data-initial')).toBe(0.95);
    expect(scaleOf(dialog, 'data-exit')).toBe(0.95);
  });

  it('keeps the dialog at scale 1 on enter and exit under reduced motion', () => {
    motion.reduced = true;
    const dialog = openDialog();
    expect(scaleOf(dialog, 'data-initial')).toBe(1);
    expect(scaleOf(dialog, 'data-exit')).toBe(1);
    expect(JSON.parse(dialog.getAttribute('data-initial') ?? '{}').opacity).toBe(0);
  });

  it('scales the menu from 0.98 normally', () => {
    const listbox = openDropdown();
    expect(scaleOf(listbox, 'data-initial')).toBe(0.98);
    expect(scaleOf(listbox, 'data-exit')).toBe(0.98);
  });

  it('keeps the menu at scale 1 on enter and exit under reduced motion', () => {
    motion.reduced = true;
    const listbox = openDropdown();
    expect(scaleOf(listbox, 'data-initial')).toBe(1);
    expect(scaleOf(listbox, 'data-exit')).toBe(1);
    expect(JSON.parse(listbox.getAttribute('data-initial') ?? '{}').opacity).toBe(0);
  });
});
