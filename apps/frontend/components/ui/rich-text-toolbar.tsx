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
 * Active states shown with Hyper Blue background.
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
    <div className="flex items-center gap-1 p-1 border border-black bg-[#E5E5E0]">
      {tools.map((tool) => (
        <Button
          key={tool.label}
          type="button"
          variant="ghost"
          size="icon"
          onClick={(e) => {
            e.preventDefault();
            tool.action();
          }}
          title={`${tool.label} (${tool.shortcut})`}
          className={cn(
            'h-7 w-7 rounded-none',
            tool.isActive && 'bg-blue-700 text-white hover:bg-blue-800 hover:text-white'
          )}
        >
          <tool.icon className="w-4 h-4" />
        </Button>
      ))}
    </div>
  );
};
