import { render } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { OpenCardFromUrl } from '@/components/tracker/open-card-from-url';

/** The command palette links to /tracker?open=<id>; the board opens that card. */
const replace = vi.fn();
let search = '';
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace }),
  usePathname: () => '/tracker',
  useSearchParams: () => new URLSearchParams(search),
}));

beforeEach(() => replace.mockReset());

describe('OpenCardFromUrl', () => {
  it('opens the named card, then drops the parameter so the link works again', () => {
    search = 'open=a1';
    const onOpen = vi.fn();

    render(<OpenCardFromUrl onOpen={onOpen} />);

    expect(onOpen).toHaveBeenCalledWith('a1');
    expect(replace).toHaveBeenCalledWith('/tracker', { scroll: false });
  });

  it('does nothing without the parameter', () => {
    search = '';
    const onOpen = vi.fn();

    render(<OpenCardFromUrl onOpen={onOpen} />);

    expect(onOpen).not.toHaveBeenCalled();
    expect(replace).not.toHaveBeenCalled();
  });
});
