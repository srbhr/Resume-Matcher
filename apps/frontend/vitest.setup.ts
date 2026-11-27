import '@testing-library/jest-dom/vitest';
import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});

// Motion can't run in jsdom, and `m` without LazyMotion features would leave
// `initial` styles (opacity 0) applied. Render motion elements as plain DOM
// and presence as a passthrough, so tests see the final state immediately.
vi.mock('motion/react', async () => {
  const React = await import('react');
  const MOTION_PROPS = new Set([
    'initial',
    'animate',
    'exit',
    'transition',
    'variants',
    'whileHover',
    'whileTap',
    'whileFocus',
    'whileInView',
    'layout',
    'layoutId',
    'onAnimationStart',
    'onAnimationComplete',
  ]);
  const cache = new Map<string, React.ElementType>();
  const m = new Proxy({} as Record<string, React.ElementType>, {
    get: (_target, tag: string | symbol) => {
      // Only element names are components; never answer `then` (thenable checks) or symbols.
      if (typeof tag !== 'string' || tag === 'then') return undefined;
      if (!cache.has(tag)) {
        const Component = React.forwardRef<unknown, Record<string, unknown>>((props, ref) => {
          const domProps: Record<string, unknown> = { ref };
          for (const [key, val] of Object.entries(props))
            if (!MOTION_PROPS.has(key)) domProps[key] = val;
          return React.createElement(tag, domProps);
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
    LazyMotion: Passthrough,
    MotionConfig: ({
      children,
      reducedMotion,
    }: {
      children?: React.ReactNode;
      reducedMotion?: string;
    }) =>
      React.createElement(
        'div',
        { 'data-reduced-motion': reducedMotion, style: { display: 'contents' } },
        children
      ),
    useReducedMotion: vi.fn(() => false),
    useIsPresent: vi.fn(() => true),
    domAnimation: {},
  };
});

// jsdom hides every [popover] element but has no showPopover()/hidePopover().
// ui-sdk opens its dialogs, menus and popovers in the top layer through the
// popover API; here showing one only lifts the hide, so Testing Library sees it.
// The top layer itself needs a real browser.
if (typeof HTMLElement !== 'undefined' && !('showPopover' in HTMLElement.prototype)) {
  Object.assign(HTMLElement.prototype, {
    showPopover(this: HTMLElement) {
      this.style.setProperty('display', 'block');
    },
    hidePopover(this: HTMLElement) {
      this.style.removeProperty('display');
    },
    togglePopover(this: HTMLElement, force?: boolean) {
      const show = force ?? this.style.getPropertyValue('display') !== 'block';
      if (show) this.style.setProperty('display', 'block');
      else this.style.removeProperty('display');
      return show;
    },
  });
}

// jsdom has no Web Animations API. ui-sdk waits for a closing part's animations
// before unmounting it; with none running, it unmounts at once.
if (typeof Element !== 'undefined' && !('getAnimations' in Element.prototype)) {
  Object.assign(Element.prototype, { getAnimations: () => [] });
}

// jsdom has HTMLDialogElement but not showModal()/close(). The Dialog primitive opens
// as a native modal; here that only means `open`. Focus, the top layer and inertness
// need a real browser: e2e/dialog.spec.ts checks them.
if (typeof HTMLDialogElement !== 'undefined' && !HTMLDialogElement.prototype.showModal) {
  HTMLDialogElement.prototype.showModal = function showModal(this: HTMLDialogElement) {
    this.open = true;
  };
  HTMLDialogElement.prototype.close = function close(this: HTMLDialogElement) {
    if (!this.open) return;
    this.open = false;
    this.dispatchEvent(new Event('close'));
  };
}
