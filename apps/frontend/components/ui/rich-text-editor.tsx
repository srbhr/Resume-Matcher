'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import Link from '@tiptap/extension-link';
import Underline from '@tiptap/extension-underline';
import { RichTextToolbar } from './rich-text-toolbar';
import { LinkDialog } from './link-dialog';
import { cn } from '@/lib/utils';

interface RichTextEditorProps {
  /** HTML content string */
  value: string;
  /** Called when content changes with new HTML string */
  onChange: (html: string) => void;
  /** Placeholder text shown when editor is empty */
  placeholder?: string;
  /** Additional CSS classes for the container */
  className?: string;
  /** Minimum height of the editor */
  minHeight?: string;
}

/**
 * Rich Text Editor Component
 *
 * Swiss International Style WYSIWYG editor with formatting toolbar.
 * Supports bold, italic, underline, and links.
 *
 * Uses Tiptap (ProseMirror) under the hood for reliable editing.
 */
export const RichTextEditor: React.FC<RichTextEditorProps> = ({
  value,
  onChange,
  placeholder = 'Enter text...',
  className,
  minHeight = '60px',
}) => {
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [isMounted, setIsMounted] = useState(false);

  // Track if we're doing an internal update to prevent loops (useRef to avoid re-renders)
  const isInternalUpdateRef = useRef(false);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({
        // Disable features we don't need for bullet points
        heading: false,
        bulletList: false,
        orderedList: false,
        blockquote: false,
        codeBlock: false,
        horizontalRule: false,
        hardBreak: false,
      }),
      Underline,
      Link.configure({
        openOnClick: false,
        HTMLAttributes: {
          target: '_blank',
          rel: 'noopener noreferrer',
        },
      }),
    ],
    content: value || '',
    onUpdate: ({ editor }) => {
      isInternalUpdateRef.current = true;
      const html = editor.getHTML();
      // Convert <p> tags to plain content since we're in bullet mode
      const cleanHtml = html.replace(/<p>/g, '').replace(/<\/p>/g, '').trim();
      onChange(cleanHtml);
      // Reset flag after a tick to ensure it stays true through the render cycle
      setTimeout(() => {
        isInternalUpdateRef.current = false;
      }, 0);
    },
    editorProps: {
      attributes: {
        class: cn(
          'outline-none prose prose-sm max-w-none',
          'prose-strong:font-bold prose-em:italic prose-a:text-blue-700 prose-a:underline'
        ),
        style: `min-height: calc(${minHeight} - 24px)`,
      },
      handleKeyDown: (view, event) => {
        // Allow Enter key to work (stopPropagation per coding standards)
        if (event.key === 'Enter') {
          event.stopPropagation();
        }
        return false;
      },
    },
    // Immediately render without waiting for idle
    immediatelyRender: false,
  });

  // Handle mounting for SSR
  useEffect(() => {
    setIsMounted(true);
  }, []);

  // Sync external value changes (e.g., from parent reset)
  useEffect(() => {
    if (editor && !isInternalUpdateRef.current) {
      const currentContent = editor.getHTML().replace(/<p>/g, '').replace(/<\/p>/g, '').trim();

      if (value !== currentContent) {
        editor.commands.setContent(value || '');
      }
    }
  }, [value, editor]);

  // Handle link keyboard shortcut (Ctrl+K)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'k' && editor?.isFocused) {
        e.preventDefault();
        setShowLinkDialog(true);
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [editor]);

  const handleLinkClick = useCallback(() => {
    setShowLinkDialog(true);
  }, []);

  const handleLinkDialogClose = useCallback(() => {
    setShowLinkDialog(false);
    editor?.chain().focus().run();
  }, [editor]);

  // Show loading state during SSR
  if (!isMounted) {
    return (
      <div className={cn('space-y-1', className)}>
        <div className="flex items-center gap-1 p-1 border border-black bg-[#E5E5E0] h-9" />
        <div
          className={cn(
            'w-full border border-black bg-white',
            'px-3 py-2 text-sm text-gray-400 rounded-none'
          )}
          style={{ minHeight }}
        >
          {placeholder}
        </div>
      </div>
    );
  }

  if (!editor) {
    return null;
  }

  return (
    <div className={cn('space-y-1', className)}>
      <RichTextToolbar editor={editor} onLinkClick={handleLinkClick} />
      <div
        className={cn(
          'w-full border border-black bg-white',
          'px-3 py-2 text-sm text-black rounded-none',
          'focus-within:ring-1 focus-within:ring-blue-700',
          '[&_.ProseMirror]:outline-none [&_.ProseMirror]:min-h-[36px]',
          '[&_.ProseMirror_p]:m-0',
          '[&_.ProseMirror_a]:text-blue-700 [&_.ProseMirror_a]:underline'
        )}
        style={{ minHeight }}
      >
        <EditorContent editor={editor} />
      </div>
      {showLinkDialog && <LinkDialog editor={editor} onClose={handleLinkDialogClose} />}
    </div>
  );
};

export default RichTextEditor;
