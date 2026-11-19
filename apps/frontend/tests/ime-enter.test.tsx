import type { KeyboardEvent } from 'react';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { AddSectionDialog } from '@/components/builder/add-section-dialog';
import { SectionHeader } from '@/components/builder/section-header';
import type { SectionMeta } from '@/components/dashboard/resume-component';
import { isImeComposing } from '@/lib/utils/keyboard';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

// An IME (Chinese, Japanese, Korean input) confirms a candidate with Enter. Chrome and
// Firefox mark that keydown isComposing; Safari clears it but reports keyCode 229.
const COMPOSING_ENTERS = [
  { name: 'isComposing (Chrome, Firefox)', init: { key: 'Enter', isComposing: true } },
  { name: 'keyCode 229 (Safari)', init: { key: 'Enter', keyCode: 229 } },
];

describe('isImeComposing', () => {
  const event = (isComposing: boolean, keyCode: number) =>
    ({ nativeEvent: { isComposing }, keyCode }) as unknown as KeyboardEvent;

  it.each([
    [false, 13, false],
    [true, 13, true],
    [false, 229, true],
    [true, 229, true],
  ])('isComposing=%s keyCode=%s → %s', (isComposing, keyCode, expected) => {
    expect(isImeComposing(event(isComposing, keyCode))).toBe(expected);
  });
});

describe('section rename', () => {
  const renderEditing = () => {
    const onRename = vi.fn();
    render(
      <SectionHeader
        section={
          {
            id: 'custom_1',
            key: 'custom_1',
            displayName: 'Talks',
            sectionType: 'text',
            isDefault: false,
            isVisible: true,
            order: 1,
          } as SectionMeta
        }
        onRename={onRename}
        onDelete={vi.fn()}
        onMoveUp={vi.fn()}
        onMoveDown={vi.fn()}
        onToggleVisibility={vi.fn()}
        isFirst={false}
        isLast={false}
        canDelete
      />
    );
    fireEvent.click(screen.getByRole('button', { name: 'builder.sectionHeader.renameSection' }));
    const input = screen.getByRole('textbox', { name: 'builder.sectionHeader.renameSection' });
    fireEvent.change(input, { target: { value: '講演' } });
    return { onRename, input };
  };

  it.each(COMPOSING_ENTERS)('keeps editing on a composing Enter: $name', ({ init }) => {
    const { onRename, input } = renderEditing();
    fireEvent.keyDown(input, init);
    expect(onRename).not.toHaveBeenCalled();
    expect(input).toBeInTheDocument();
  });

  it('keeps editing on a composing Escape, which only cancels the candidate', () => {
    const { input } = renderEditing();
    fireEvent.keyDown(input, { key: 'Escape', isComposing: true });
    expect(input).toBeInTheDocument();
  });

  it('saves on a plain Enter', () => {
    const { onRename, input } = renderEditing();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onRename).toHaveBeenCalledWith('講演');
  });
});

describe('add section dialog', () => {
  const renderDialog = () => {
    const onAdd = vi.fn();
    render(<AddSectionDialog open onOpenChange={vi.fn()} onAdd={onAdd} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: '受賞' } });
    return { onAdd, input };
  };

  it.each(COMPOSING_ENTERS)('does not add on a composing Enter: $name', ({ init }) => {
    const { onAdd, input } = renderDialog();
    fireEvent.keyDown(input, init);
    expect(onAdd).not.toHaveBeenCalled();
  });

  it('adds on a plain Enter', () => {
    const { onAdd, input } = renderDialog();
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(onAdd).toHaveBeenCalledWith('受賞', expect.any(String));
  });
});
