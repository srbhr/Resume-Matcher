import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

describe('ConfirmDialog', () => {
  it('drops the glyph tiles and uses the danger button for destructive confirms', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Delete"
        description="Gone for good."
        variant="danger"
        confirmLabel="Delete"
        onConfirm={vi.fn()}
      />
    );
    expect(screen.queryByText('!')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Delete' })).toHaveClass('bg-destructive');
  });

  it('shows errors as an error Alert', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="Retry"
        description="d"
        errorMessage="Network failed"
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Network failed');
  });

  it('sets the description in sans, not mono', () => {
    render(
      <ConfirmDialog
        open
        onOpenChange={vi.fn()}
        title="t"
        description="Plain words"
        onConfirm={vi.fn()}
      />
    );
    expect(screen.getByText('Plain words').className).not.toContain('font-mono');
  });
});
