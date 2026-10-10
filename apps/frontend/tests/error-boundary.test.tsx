import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ErrorBoundary } from '@/components/common/error-boundary';

let shouldThrow = true;

function Boom() {
  if (shouldThrow) throw new Error('boom detail');
  return <p>Recovered</p>;
}

beforeEach(() => {
  shouldThrow = true;
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.restoreAllMocks();
});

describe('ErrorBoundary fallback', () => {
  it('uses the Button primitives in a left-aligned card', () => {
    const { container } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    const wrapper = container.firstChild as HTMLElement;
    expect(wrapper).not.toHaveClass('items-center');
    expect(wrapper).not.toHaveClass('justify-center');
    expect(screen.getByRole('heading', { level: 2, name: 'Something Went Wrong' })).toBeVisible();
    expect(screen.getByText(/An unexpected error occurred/)).toHaveClass('font-sans');

    const tryAgain = screen.getByRole('button', { name: 'Try Again' });
    expect(tryAgain).toHaveAttribute('type', 'button');
    expect(tryAgain).toHaveClass('bg-canvas', 'border-ink');
    expect(tryAgain).not.toHaveClass('transition-all');

    const reload = screen.getByRole('button', { name: 'Reload Page' });
    expect(reload).toHaveAttribute('type', 'button');
    expect(reload).toHaveClass('bg-primary');
    expect(reload.querySelector('svg')).not.toHaveClass('mr-2');
  });

  it('is the only surface on the page, so it takes the frame shadow, not the menu one', () => {
    const { container } = render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    const card = (container.firstChild as HTMLElement).firstElementChild as HTMLElement;
    expect(card).toHaveClass('border', 'border-ink', 'shadow-sw-lg');
    expect(card).not.toHaveClass('shadow-sw-default');
  });

  it('shows the development error detail in an error Alert', () => {
    vi.stubEnv('NODE_ENV', 'development');
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );

    const alert = screen.getByRole('alert');
    expect(alert).toHaveClass('border-destructive', 'bg-destructive-tint');
    expect(alert).toHaveTextContent('boom detail');
  });

  it('renders the children again after Try Again', () => {
    render(
      <ErrorBoundary>
        <Boom />
      </ErrorBoundary>
    );
    shouldThrow = false;
    fireEvent.click(screen.getByRole('button', { name: 'Try Again' }));
    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });
});
