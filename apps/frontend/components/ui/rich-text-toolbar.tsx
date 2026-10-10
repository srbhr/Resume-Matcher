'use client';

import React from 'react';
import { Editor } from '@tiptap/react';
import { Bold, Italic, Underline, Link } from 'lucide-react';
import { Button } from './button';
import { cn } from '@/lib/utils';

interface RichTextToolbarProps {
  editor: Editor;
  onLinkClick: () => void;
}

/**
 * Rich Text Toolbar Component
 *
 * Swiss International Style formatting toolbar with B/I/U/Link buttons.
 * Active states shown with an ink fill (selection = ink; blue is for actions).
 */
export const RichTextToolbar: React.FC<RichTextToolbarProps> = ({ editor, onLinkClick }) => {
  const tools = [
    {
      icon: Bold,
      label: 'Bold',
      action: () => editor.chain().focus().toggleBold().run(),
      isActive: editor.isActive('bold'),
      shortcut: 'Ctrl+B',
    },
    {
      icon: Italic,
      label: 'Italic',
      action: () => editor.chain().focus().toggleItalic().run(),
      isActive: editor.isActive('italic'),
      shortcut: 'Ctrl+I',
    },
    {
      icon: Underline,
      label: 'Underline',
      action: () => editor.chain().focus().toggleUnderline().run(),
      isActive: editor.isActive('underline'),
      shortcut: 'Ctrl+U',
    },
    {
      icon: Link,
      label: 'Link',
      action: onLinkClick,
      isActive: editor.isActive('link'),
      shortcut: 'Ctrl+K',
    },
  ];

  return (
    <div className="flex items-center gap-3 p-1 border border-ink bg-panel">
      {tools.map((tool) => (
        <Button
          key={tool.label}
          type="button"
          variant="ghost"
          size="icon-sm"
          onClick={(e) => {
            e.preventDefault();
            tool.action();
          }}
          aria-label={tool.label}
          aria-pressed={tool.isActive}
          title={`${tool.label} (${tool.shortcut})`}
          className={cn(
            tool.isActive
              ? 'bg-ink text-white hover:bg-ink hover:text-white active:bg-ink active:text-white'
              : 'hover:bg-panel-hover'
          )}
        >
          <tool.icon className="w-4 h-4" />
        </Button>
      ))}
    </div>
  );
};
