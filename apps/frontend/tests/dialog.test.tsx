import { fireEvent, render, screen } from '@testing-library/react';
import { useIsPresent } from 'motion/react';
import { useState } from 'react';
import { flushSync } from 'react-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
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

// The real flow: a confirm dialog opens over an already-open dialog. The inner one is
// opened by a click, so it registers after the outer (opening both at once would register
// the inner first, because child effects run before parent effects). It owns its own state,
// so closing it re-renders only itself, not the outer dialog's owner.
function InnerDialog({
  onInnerChange,
  flushClose,
}: {
  onInnerChange: (open: boolean) => void;
  flushClose: boolean;
}) {
  const [inner, setInner] = useState(false);
  return (
    <>
      <button onClick={() => setInner(true)}>open inner</button>
      <Dialog
        open={inner}
        onOpenChange={(next) => {
          onInnerChange(next);
          // A real browser flushes React between two keydown listeners (microtask
          // checkpoint); flushSync reproduces that, so the stack changes mid-event.
          if (flushClose) flushSync(() => setInner(next));
          else setInner(next);
        }}
      >
        <DialogContent size="sm">
          <DialogHeader>
            <DialogTitle>Inner</DialogTitle>
          </DialogHeader>
        </DialogContent>
      </Dialog>
    </>
  );
}

function StackedHarness({
  onOuterChange,
  onInnerChange,
  flushInnerClose = false,
}: {
  onOuterChange: (open: boolean) => void;
  onInnerChange: (open: boolean) => void;
  flushInnerClose?: boolean;
}) {
  const [outer, setOuter] = useState(true);
  const [, setTick] = useState(0);
  return (
    <Dialog
      open={outer}
      onOpenChange={(next) => {
        onOuterChange(next);
        setOuter(next);
      }}
    >
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Outer</DialogTitle>
        </DialogHeader>
        <DialogBody>
          <button onClick={() => setTick((n) => n + 1)}>rerender outer</button>
          <InnerDialog onInnerChange={onInnerChange} flushClose={flushInnerClose} />
        </DialogBody>
      </DialogContent>
    </Dialog>
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

  it('leaves overscroll containment to the body, not the panel', () => {
    openDialog();
    expect(screen.getByRole('dialog')).not.toHaveClass('overscroll-contain');
  });

  describe('while AnimatePresence keeps it mounted to exit', () => {
    afterEach(() => {
      vi.mocked(useIsPresent).mockReturnValue(true);
    });

    // The exiting subtree keeps live handlers (a second click on Delete would fire
    // onConfirm again), so the whole layer must be inert and click-through.
    it('makes the overlay and the panel inert and click-through', () => {
      vi.mocked(useIsPresent).mockReturnValue(false);
      openDialog();
      const layer = screen.getByRole('dialog').closest('[inert]');
      expect(layer).not.toBeNull();
      expect(layer).toHaveClass('pointer-events-none');
    });

    it('stays interactive while present', () => {
      openDialog();
      expect(screen.getByRole('dialog').closest('[inert]')).toBeNull();
    });
  });

  describe('stacked dialogs', () => {
    const openStack = (flushInnerClose = false) => {
      const onOuterChange = vi.fn();
      const onInnerChange = vi.fn();
      render(
        <StackedHarness
          onOuterChange={onOuterChange}
          onInnerChange={onInnerChange}
          flushInnerClose={flushInnerClose}
        />
      );
      fireEvent.click(screen.getByText('open inner'));
      expect(screen.getAllByRole('dialog')).toHaveLength(2);
      return { onOuterChange, onInnerChange };
    };

    it('closes only the top dialog on Escape', () => {
      const { onOuterChange, onInnerChange } = openStack();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onInnerChange).toHaveBeenCalledWith(false);
      expect(onOuterChange).not.toHaveBeenCalled();
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(screen.getByText('Outer')).toBeInTheDocument();
    });

    it('closes the next dialog on the following Escape', () => {
      const { onOuterChange } = openStack();
      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onOuterChange).toHaveBeenCalledWith(false);
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('closes one dialog per keypress even when React flushes between the listeners', () => {
      const { onOuterChange, onInnerChange } = openStack(true);
      // Re-rendering the outer owner re-registers its Escape listener after the inner's, so
      // the inner listener runs first and its close commits before the outer one runs.
      fireEvent.click(screen.getByText('rerender outer'));
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      expect(onInnerChange).toHaveBeenCalledTimes(1);
      expect(onOuterChange).not.toHaveBeenCalled();
    });

    it('keeps the scroll lock until the last dialog closes', () => {
      openStack();
      expect(document.body.style.overflow).toBe('hidden');
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.getAllByRole('dialog')).toHaveLength(1);
      expect(document.body.style.overflow).toBe('hidden');
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
      expect(document.body.style.overflow).toBe('');
    });
  });

  describe('dismissible={false}', () => {
    const openForcedChoice = () => {
      const onOpenChange = vi.fn();
      render(
        <Dialog open dismissible={false} onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Forced choice</DialogTitle>
            </DialogHeader>
            <DialogBody>
              <input aria-label="first" />
            </DialogBody>
          </DialogContent>
        </Dialog>
      );
      return onOpenChange;
    };

    it('renders no Close button', () => {
      openForcedChoice();
      expect(screen.queryByRole('button', { name: 'common.close' })).not.toBeInTheDocument();
    });

    it('ignores Escape', () => {
      const onOpenChange = openForcedChoice();
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('ignores a backdrop click', () => {
      const onOpenChange = openForcedChoice();
      const overlay = document.querySelector('.bg-overlay') as HTMLElement;
      fireEvent.click(overlay);
      expect(onOpenChange).not.toHaveBeenCalled();
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('still closes on Escape, the backdrop and the Close button by default', () => {
      const onOpenChange = vi.fn();
      render(
        <Dialog open onOpenChange={onOpenChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Dismissible</DialogTitle>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      fireEvent.click(document.querySelector('.bg-overlay') as HTMLElement);
      fireEvent.click(screen.getByRole('button', { name: 'common.close' }));
      expect(onOpenChange).toHaveBeenCalledTimes(3);
    });

    it('does not let Escape fall through to the dialog underneath', () => {
      const onOuterChange = vi.fn();
      render(
        <Dialog open onOpenChange={onOuterChange}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Outer</DialogTitle>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );
      // Mount the forced-choice dialog after the outer one so it is on top of the stack.
      render(
        <Dialog open dismissible={false} onOpenChange={vi.fn()}>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Forced</DialogTitle>
            </DialogHeader>
          </DialogContent>
        </Dialog>
      );
      fireEvent.keyDown(document, { key: 'Escape' });
      expect(onOuterChange).not.toHaveBeenCalled();
    });
  });
});
