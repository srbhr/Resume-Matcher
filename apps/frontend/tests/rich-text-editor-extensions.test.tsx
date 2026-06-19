import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';

import { RichTextEditor } from '@/components/ui/rich-text-editor';

// Regression: StarterKit (v3) already bundles the `link` and `underline`
// extensions, so adding them again as standalone extensions makes Tiptap warn
// "Duplicate extension names found: ['link', 'underline']". Rendering the editor
// must not produce that warning.
it('registers no duplicate tiptap extensions', () => {
  const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
  try {
    render(<RichTextEditor value="" onChange={() => {}} />);
    const duplicateWarnings = warn.mock.calls
      .flat()
      .filter((arg) => typeof arg === 'string' && arg.includes('Duplicate extension names'));
    expect(duplicateWarnings).toEqual([]);
  } finally {
    warn.mockRestore();
  }
});
