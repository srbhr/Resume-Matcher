import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { PanelHeader } from '@/components/ui/panel-header';
import { EmptyState } from '@/components/ui/empty-state';

describe('PanelHeader', () => {
  it('encodes the panel role in the square colour', () => {
    render(<PanelHeader tone="output" title="Preview" />);
    const heading = screen.getByRole('heading', { level: 2, name: 'Preview' });
    expect(heading).toHaveClass('font-mono', 'text-xs', 'uppercase');
    expect(heading.previousElementSibling).toHaveClass('size-3', 'bg-success');
  });

  it('renders actions in the right-hand slot', () => {
    render(
      <PanelHeader title="Editor">
        <button>Save</button>
      </PanelHeader>
    );
    expect(screen.getByRole('button', { name: 'Save' })).toBeInTheDocument();
  });
});

describe('EmptyState', () => {
  it('is left-aligned with no icon tile and at most one action', () => {
    const { container } = render(
      <EmptyState
        title="No entries"
        description="Add your first role."
        action={<button>Add</button>}
      />
    );
    const root = container.firstChild as HTMLElement;
    expect(root).toHaveClass('items-start', 'text-left');
    expect(root.className).not.toMatch(/text-center|justify-center/);
    expect(screen.getByText('No entries')).toHaveClass('font-mono', 'uppercase');
    expect(screen.getByText('Add your first role.')).toHaveClass('max-w-[60ch]');
  });

  it('has a framed variant for empty list slots', () => {
    const { container } = render(<EmptyState variant="framed" title="Empty" />);
    expect(container.firstChild).toHaveClass('border', 'border-dashed', 'border-steel', 'bg-paper');
  });
});
