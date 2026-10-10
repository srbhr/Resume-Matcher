import { fireEvent, render, screen } from '@testing-library/react';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

function Harness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Una solicitud con un título bastante largo</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <input type="file" style={{ display: 'none' }} aria-label="hidden" />
            <input aria-label="first" />
          </DialogBody>
          <DialogFooter>
            <button>save</button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function openDialog() {
  render(<Harness />);
  const opener = screen.getByText('open');
  opener.focus();
  fireEvent.click(opener);
  return opener;
}

// Mirrors RichTextEditor: the close handler focuses the editor, not the toolbar button.
function ClaimingHarness() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button onClick={() => setOpen(true)}>open</button>
      <div tabIndex={0} data-testid="editor" />
      <Dialog
        open={open}
        onOpenChange={(next) => {
          if (!next) screen.getByTestId('editor').focus();
          setOpen(next);
        }}
      >
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit link</DialogTitle>
          </DialogHeader>
          <DialogBody>
            <input aria-label="first" />
          </DialogBody>
        </DialogContent>
      </Dialog>
    </>
  );
}

describe('Dialog', () => {
  it('moves focus into the dialog on open', () => {
    openDialog();
    expect(screen.getByLabelText('first')).toHaveFocus();
  });

  it('returns focus to the opener when closed with Escape', () => {
    const opener = openDialog();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(opener).toHaveFocus();
  });

  it('does not steal focus back when the close handler moved it elsewhere', () => {
    render(<ClaimingHarness />);
    const opener = screen.getByText('open');
    opener.focus();
    fireEvent.click(opener);
    expect(screen.getByLabelText('first')).toHaveFocus();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    expect(screen.getByTestId('editor')).toHaveFocus();
    expect(opener).not.toHaveFocus();
  });

  it('traps Tab inside the dialog', () => {
    openDialog();
    const dialog = screen.getByRole('dialog');
    const close = screen.getByRole('button', { name: 'common.close' });
    close.focus();
    fireEvent.keyDown(dialog, { key: 'Tab' });
    expect(screen.getByLabelText('first')).toHaveFocus();
    fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true });
    expect(close).toHaveFocus();
  });

  it('applies the size and the Swiss chrome', () => {
    openDialog();
    expect(screen.getByRole('dialog')).toHaveClass(
      'max-w-md',
      'bg-white',
      'border',
      'border-ink',
      'shadow-sw-lg',
      'rounded-none'
    );
  });

  it('keeps the title clear of the close button and left-aligned', () => {
    openDialog();
    const title = screen.getByRole('heading', { name: /título/ });
    expect(title).toHaveClass('uppercase', 'text-balance', 'font-serif', 'text-2xl', 'font-bold');
    expect(title.parentElement).toHaveClass('pr-14', 'text-left');
    expect(title.parentElement?.className).not.toContain('text-center');
  });

  it('bands the footer on panel with an ink rule', () => {
    openDialog();
    expect(screen.getByText('save').parentElement).toHaveClass(
      'bg-panel',
      'border-t',
      'border-ink'
    );
  });
});
