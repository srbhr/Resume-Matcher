import { render, screen } from '@testing-library/react';
import type { Editor } from '@tiptap/react';
import { describe, expect, it, vi } from 'vitest';
import { RichTextToolbar } from '@/components/ui/rich-text-toolbar';

function editorWithActive(active: string): Editor {
  return { isActive: (name: string) => name === active, chain: vi.fn() } as unknown as Editor;
}

describe('RichTextToolbar', () => {
  it('shows the active tool as an ink fill that stays ink on hover and press', () => {
    render(<RichTextToolbar editor={editorWithActive('bold')} onLinkClick={vi.fn()} />);
    const bold = screen.getByRole('button', { name: 'Bold' });
    expect(bold).toHaveAttribute('aria-pressed', 'true');
    expect(bold).toHaveClass('bg-ink', 'text-white', 'hover:bg-ink', 'active:bg-ink');
    expect(bold).toHaveClass('active:text-white');
  });

  it('gives inactive tools a visible hover on the panel toolbar', () => {
    render(<RichTextToolbar editor={editorWithActive('bold')} onLinkClick={vi.fn()} />);
    const italic = screen.getByRole('button', { name: 'Italic' });
    expect(italic).toHaveAttribute('aria-pressed', 'false');
    expect(italic).toHaveClass('hover:bg-panel-hover');
    expect(italic).not.toHaveClass('bg-ink');
  });

  it('uses the compact icon-sm button size', () => {
    render(<RichTextToolbar editor={editorWithActive('')} onLinkClick={vi.fn()} />);
    const link = screen.getByRole('button', { name: 'Link' });
    expect(link).toHaveClass('h-8', 'w-8');
    expect(link).not.toHaveClass('h-11');
  });
});
