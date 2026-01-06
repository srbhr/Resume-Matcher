'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import { X } from 'lucide-react';

interface LinkDialogProps {
  editor: Editor;
  onClose: () => void;
}

/**
 * Link Dialog Component
 *
 * Swiss International Style modal for adding/editing links.
 * - Hard shadow (no blur)
 * - Square corners
 * - Monospace labels
 */
export const LinkDialog: React.FC<LinkDialogProps> = ({ editor, onClose }) => {
  const [url, setUrl] = useState('');
  const [text, setText] = useState('');

  // Get currently selected text or existing link
  useEffect(() => {
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, '');

    // Check if there's an existing link
    const existingLink = editor.getAttributes('link');
    if (existingLink.href) {
      setUrl(existingLink.href);
    }

    setText(selectedText);
  }, [editor]);

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault();

      if (!url) {
        onClose();
        return;
      }

      // Ensure URL has protocol
      let finalUrl = url;
      if (!url.startsWith('http://') && !url.startsWith('https://') && !url.startsWith('mailto:')) {
        finalUrl = `https://${url}`;
      }

      // If there's selected text, update it with the link
      if (text && editor.state.selection.from !== editor.state.selection.to) {
        editor
          .chain()
          .focus()
          .extendMarkRange('link')
          .setLink({ href: finalUrl, target: '_blank', rel: 'noopener noreferrer' })
          .run();
      } else if (text) {
        // Insert new text with link using JSON structure (safe from XSS)
        editor
          .chain()
          .focus()
          .insertContent({
            type: 'text',
            text: text,
            marks: [{ type: 'link', attrs: { href: finalUrl, target: '_blank', rel: 'noopener noreferrer' } }]
          })
          .run();
      } else {
        // Just set link on current selection
        editor
          .chain()
          .focus()
          .setLink({ href: finalUrl, target: '_blank', rel: 'noopener noreferrer' })
          .run();
      }

      onClose();
    },
    [url, text, editor, onClose]
  );

  const handleRemoveLink = useCallback(() => {
    editor.chain().focus().unsetLink().run();
    onClose();
  }, [editor, onClose]);

  // Handle escape key
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  const hasExistingLink = editor.isActive('link');

  return (
    <div className="fixed inset-0 z-50">
      {/* Overlay */}
      <div className="fixed inset-0 bg-black/50" onClick={onClose} />

      {/* Dialog */}
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <div
          className="relative w-full max-w-md border-2 border-black bg-white shadow-[4px_4px_0px_0px_#000000] p-6"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute right-4 top-4 opacity-70 transition-opacity hover:opacity-100"
          >
            <X className="h-5 w-5" />
          </button>

          {/* Title */}
          <h3 className="font-mono text-xs uppercase tracking-wider mb-4 text-gray-600">
            [ {hasExistingLink ? 'EDIT LINK' : 'ADD LINK'} ]
          </h3>

          <form onSubmit={handleSubmit} className="space-y-4">
            {/* Display Text */}
            <div className="space-y-2">
              <Label htmlFor="link-text" className="font-mono text-xs uppercase tracking-wider">
                Display Text
              </Label>
              <Input
                id="link-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Link text"
                className="rounded-none border-black bg-white"
                autoFocus
              />
            </div>

            {/* URL */}
            <div className="space-y-2">
              <Label htmlFor="link-url" className="font-mono text-xs uppercase tracking-wider">
                URL
              </Label>
              <Input
                id="link-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
                className="rounded-none border-black bg-white"
              />
            </div>

            {/* Actions */}
            <div className="flex gap-2 justify-end pt-2">
              {hasExistingLink && (
                <Button type="button" variant="destructive" size="sm" onClick={handleRemoveLink}>
                  Remove Link
                </Button>
              )}
              <Button type="button" variant="outline" size="sm" onClick={onClose}>
                Cancel
              </Button>
              <Button type="submit" variant="default" size="sm">
                {hasExistingLink ? 'Update' : 'Add'} Link
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
};
