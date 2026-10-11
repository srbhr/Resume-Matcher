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
