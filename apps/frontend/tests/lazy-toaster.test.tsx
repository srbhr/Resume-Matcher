import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

// The App Router aliases next/dynamic to app-dynamic (React.lazy, which throws when
// the import fails); vitest would otherwise load the Pages Router version, which
// swallows the error and hides the crash this test is about.
vi.mock('next/dynamic', async () => await import('next/dist/api/app-dynamic'));

// The toaster chunk fails to load (offline, a deploy replaced the chunk, ...).
vi.mock('@/components/ui/toaster', () => {
  throw new Error('chunk load failed');
});

class Boundary extends React.Component<{ children: React.ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? <p>shell crashed</p> : this.props.children;
  }
}

describe('LazyToaster', () => {
  it('renders nothing when the toaster chunk fails to load, instead of throwing', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(console, 'warn').mockImplementation(() => {});
    const { LazyToaster } = await import('@/components/ui/lazy-toaster');
    render(
      <Boundary>
        <p>page content</p>
        <LazyToaster />
      </Boundary>
    );

    // Let the dynamic import settle, then check the shell is still up.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 50));
    });
    expect(screen.queryByText('shell crashed')).not.toBeInTheDocument();
    expect(screen.getByText('page content')).toBeInTheDocument();
  });
});
