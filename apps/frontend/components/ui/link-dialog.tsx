'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Editor } from '@tiptap/react';
import { Button } from './button';
import { Input } from './input';
import { Label } from './label';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from './dialog';

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
            marks: [
              {
                type: 'link',
                attrs: { href: finalUrl, target: '_blank', rel: 'noopener noreferrer' },
              },
            ],
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

  const hasExistingLink = editor.isActive('link');

  return (
    <Dialog open onOpenChange={(next) => !next && onClose()}>
      <DialogContent size="sm">
        <DialogHeader>
          <DialogTitle>{hasExistingLink ? 'Edit link' : 'Add link'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="contents">
          <DialogBody className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="link-text">Display text</Label>
              <Input
                id="link-text"
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder="Link text"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="link-url">URL</Label>
              <Input
                id="link-url"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
                placeholder="https://example.com"
              />
            </div>
          </DialogBody>
          <DialogFooter>
            {hasExistingLink && (
              <Button
                type="button"
                variant="outline-destructive"
                size="sm"
                onClick={handleRemoveLink}
              >
                Remove link
              </Button>
            )}
            <Button type="button" variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            <Button type="submit" size="sm">
              {hasExistingLink ? 'Update link' : 'Add link'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
};
