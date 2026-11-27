import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { EntryCard, entrySummary } from '@/components/builder/forms/entry-card';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (k: string) => k }) }));

describe('EntryCard', () => {
  it('sets Duplicate and Remove 12px apart, so their 6px hit areas do not overlap', () => {
    render(
      <EntryCard title="Acme" summary="" handle={null} onDuplicate={vi.fn()} onRemove={vi.fn()}>
        <p>Body</p>
      </EntryCard>
    );
    const duplicate = screen.getByRole('button', { name: 'a11y.duplicateItem' });
    const remove = screen.getByRole('button', { name: 'a11y.removeItem' });
    expect(duplicate.parentElement).toBe(remove.parentElement);
    expect(duplicate.parentElement).toHaveClass('gap-3');
  });
});

describe('entrySummary', () => {
  it('joins the parts that have text', () => {
    expect(entrySummary(' Acme ', '', null, '2020 - 2023')).toBe('Acme · 2020 - 2023');
  });

  it('skips a stored value that is not text instead of failing on it', () => {
    expect(entrySummary(2020, { year: 1 }, 'Remote')).toBe('Remote');
  });
});
