import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast } from '@/components/ui/toaster';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

function toastElement(text: string): HTMLElement {
  const element = screen.getByText(text).closest('[data-sonner-toast]');
  if (!(element instanceof HTMLElement)) throw new Error(`no toast holds "${text}"`);
  return element;
}

afterEach(() => {
  act(() => toast.dismiss());
});

describe('Toaster', () => {
  it('renders a toast unstyled by sonner, in the Swiss toast look', async () => {
    render(<Toaster />);
    act(() => {
      toast.success('Resume downloaded');
    });

    await screen.findByText('Resume downloaded');
    const element = toastElement('Resume downloaded');
    // data-styled="false" switches off every sonner rule that sets colour or shape.
    expect(element).toHaveAttribute('data-styled', 'false');
    expect(element).toHaveClass(
      'rounded-none',
      'border',
      'border-ink',
      'bg-white',
      'shadow-sw-default',
      'font-sans'
    );
    expect(element.className).not.toMatch(/rounded-(?!none)|shadow-(?!sw-)/);
    expect(screen.getByText('Resume downloaded')).toHaveClass('text-ink');
  });

  it.each([
    ['success', 'text-success'],
    ['error', 'text-destructive'],
    ['warning', 'text-warning-text'],
    ['info', 'text-primary'],
  ] as const)('colours the %s icon %s', async (type, colour) => {
    render(<Toaster />);
    act(() => {
      toast[type](`A ${type} toast`);
    });

    await screen.findByText(`A ${type} toast`);
    const element = toastElement(`A ${type} toast`);
    expect(element).toHaveAttribute('data-type', type);
    expect(element.className).toContain(`[&_[data-icon]]:${colour}`);
    expect(element.querySelector('[data-icon] svg')).toHaveAttribute('aria-hidden', 'true');
  });

  it('labels the region and the close button in the UI language, and closes on click', async () => {
    render(<Toaster />);
    act(() => {
      toast.success('Resume downloaded');
    });
    await screen.findByText('Resume downloaded');

    expect(screen.getByRole('region', { name: /common\.notifications/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'common.dismissNotification' }));
    await waitFor(() => expect(screen.queryByText('Resume downloaded')).not.toBeInTheDocument());
  });
});
