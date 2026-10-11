import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

describe('ConfirmDialog', () => {
  it('contains long descriptions within a scrollable flex column', () => {
    const description = `Download failed: ${'unbroken-error-token-'.repeat(30)}`;

    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Download failed"
        description={description}
        onConfirm={vi.fn()}
      />
    );

    const descriptionElement = screen.getByText(description);
    expect(descriptionElement).toHaveClass(
      'max-h-60',
      'overflow-y-auto',
      'whitespace-pre-wrap',
      '[overflow-wrap:anywhere]'
    );
    expect(descriptionElement.parentElement).toHaveClass('min-w-0', 'flex-1');
  });

  describe('dismissal', () => {
    const renderDialog = (props: Partial<React.ComponentProps<typeof ConfirmDialog>> = {}) =>
      render(
        <ConfirmDialog
          open
          onOpenChange={vi.fn()}
          title="Confirm"
          description="Sure?"
          onConfirm={vi.fn()}
          {...props}
        />
      );

    it('shows the Close button by default', () => {
      renderDialog();
      expect(screen.getByRole('button', { name: 'common.close' })).toBeInTheDocument();
    });

    it('hides the Close button while cancel is disabled', () => {
      renderDialog({ cancelDisabled: true });
      expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument();
    });

    it('hides the Close button when dismissible is false', () => {
      renderDialog({ dismissible: false });
      expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument();
    });

    it('ignores Escape and a backdrop click when dismissible is false', () => {
      const onOpenChange = vi.fn();
      renderDialog({ dismissible: false, onOpenChange });
      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.click(document.querySelector('.bg-overlay') as HTMLElement);
      expect(onOpenChange).not.toHaveBeenCalled();
    });
  });
});
