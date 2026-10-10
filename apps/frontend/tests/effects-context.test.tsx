import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  EffectsProvider,
  useEffectsEnabled,
  useSetEffectsEnabled,
} from '@/lib/context/effects-context';

const KEY = 'resume_matcher_effects';

function Probe() {
  const enabled = useEffectsEnabled();
  const setEnabled = useSetEffectsEnabled();
  return (
    <>
      <p data-testid="value">{String(enabled)}</p>
      <button onClick={() => setEnabled(!enabled)}>flip</button>
    </>
  );
}

const value = () => screen.getByTestId('value').textContent;
const flip = () => act(() => screen.getByRole('button', { name: 'flip' }).click());

beforeEach(() => localStorage.clear());
afterEach(() => vi.restoreAllMocks());

describe('EffectsProvider', () => {
  it('defaults to on', () => {
    render(
      <EffectsProvider>
        <Probe />
      </EffectsProvider>
    );
    expect(value()).toBe('true');
  });

  it('renders "on" for the first (server-matching) render, then reads the stored choice', () => {
    localStorage.setItem(KEY, 'false');
    const seen: boolean[] = [];
    function Spy() {
      seen.push(useEffectsEnabled());
      return null;
    }
    render(
      <EffectsProvider>
        <Spy />
      </EffectsProvider>
    );
    expect(seen[0]).toBe(true);
    expect(seen.at(-1)).toBe(false);
  });

  it('persists the choice to localStorage and restores it on the next mount', () => {
    const first = render(
      <EffectsProvider>
        <Probe />
      </EffectsProvider>
    );
    flip();
    expect(value()).toBe('false');
    expect(localStorage.getItem(KEY)).toBe('false');
    first.unmount();

    render(
      <EffectsProvider>
        <Probe />
      </EffectsProvider>
    );
    expect(value()).toBe('false');

    flip();
    expect(value()).toBe('true');
    expect(localStorage.getItem(KEY)).toBe('true');
  });

  it('treats an unrecognised stored value as the default (on)', () => {
    localStorage.setItem(KEY, 'banana');
    render(
      <EffectsProvider>
        <Probe />
      </EffectsProvider>
    );
    expect(value()).toBe('true');
  });

  it('survives a localStorage that throws on read and write', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new DOMException('denied', 'SecurityError');
    });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new DOMException('full', 'QuotaExceededError');
    });
    render(
      <EffectsProvider>
        <Probe />
      </EffectsProvider>
    );
    expect(value()).toBe('true');
    flip();
    expect(value()).toBe('false'); // the choice still holds for this session
  });
});

describe('outside a provider', () => {
  it('stays off and ignores the setter, so effects never appear in routes without one', () => {
    render(<Probe />);
    expect(value()).toBe('false');
    flip();
    expect(value()).toBe('false');
    expect(localStorage.getItem(KEY)).toBeNull();
  });
});
