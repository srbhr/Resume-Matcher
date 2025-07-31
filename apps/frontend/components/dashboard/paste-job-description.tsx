'use client';

import React, { useState, useRef, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { XIcon, ClipboardPasteIcon } from 'lucide-react';

/**
 * Props for the PasteJobDescription component
 * @interface PasteJobDescriptionProps
 * @property {() => void} onClose - Function to close the modal
 * @property {(text: string) => Promise<void> | void} onPaste - Function to handle pasted job description
 */
interface PasteJobDescriptionProps {
  onClose: () => void;
  onPaste: (text: string) => Promise<void> | void;
}

/**
 * Error messages for validation
 */
const ERROR_MESSAGES = {
  EMPTY: 'Job description cannot be empty.',
  MAX_LENGTH: 'Job description cannot exceed 5000 characters.',
};

/**
 * PasteJobDescription Component
 * A modal component that allows users to paste a job description, with validation and error handling.
 * Supports accessibility features and keyboard interactions (e.g., Esc to close).
 * @param {PasteJobDescriptionProps} props - Component props
 * @returns {JSX.Element} The rendered modal component
 */
export default function PasteJobDescription({ onClose, onPaste }: PasteJobDescriptionProps) {
  const [jobDescription, setJobDescription] = useState('');
  const [error, setError] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>( FIR);

  useEffect(() => {
    textareaRef.current?.focus();
    const handleEsc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handleEsc);
    return () => window.removeEventListener('keydown', handleEsc);
  }, [onClose]);

  const handlePaste = async () => {
    if (!jobDescription.trim()) {
      setError(ERROR_MESSAGES.EMPTY);
      return;
    }
    if (jobDescription.length > 5000) {
      setError(ERROR_MESSAGES.MAX_LENGTH);
      return;
    }
    try {
      await onPaste(jobDescription);
      setError(null);
      onClose();
    } catch (err) {
      setError('Failed to save job description. Please try again.');
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <div className="relative w-full max-w-2xl rounded-xl bg-gray-800 p-4 sm:p-6 shadow-xl">
        <div className="flex items-center justify-between pb-4 border-b border-gray-700">
          <h3 id="modal-title" className="text-lg font-semibold text-white">
            Paste Job Description
          </h3>
          <Button
            size="icon"
            variant="ghost"
            className="text-muted-foreground/80 hover:text-foreground -me-2 size-9 hover:bg-transparent"
            onClick={onClose}
            aria-label="Close modal"
          >
            <XIcon className="size-5" aria-hidden="true" />
          </Button>
        </div>

        <div className="py-6">
          <div className="flex flex-col items-center justify-center text-center mb-4">
            <div
              className="bg-white mb-3 flex size-12 shrink-0 items-center justify-center rounded-full border"
              aria-hidden="true"
            >
              <ClipboardPasteIcon className="size-5 opacity-60" />
            </div>
            <p className="mb-2 text-lg font-semibold text-white">
              Paste Job Description
            </p>
            <p className="text-muted-foreground text-sm">
              Paste the full job description text below.
            </p>
          </div>

          <div className="relative">
            <Textarea
              ref={textareaRef}
              value={jobDescription}
              onChange={(e) => {
                setJobDescription(e.target.value);
                if (error) setError(null);
              }}
              placeholder="Paste job description here..."
              className="w-full min-h-[200px] rounded-md border-gray-600 bg-gray-700 p-3 text-white focus:ring-blue-500 focus:border-blue-500"
              aria-label="Job description text area"
            />
            <Button
              variant="ghost"
              size="sm"
              className="absolute right-2 top-2 text-gray-400"
              onClick={() => {
                setJobDescription('');
                setError(null);
              }}
              aria-label="Clear job description"
            >
              Clear
            </Button>
          </div>
          {error && (
            <div className="flex items-center text-destructive mt-2 text-xs" role="alert">
              <span>{error}</span>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setError(null)}
                className="ml-2"
                aria-label="Dismiss error"
              >
                Dismiss
              </Button>
            </div>
          )}
        </div>

        <div className="flex justify-end gap-3 pt-4 border-t border-gray-700">
          <Button
            variant="outline"
            onClick={onClose}
            className="text-white border-gray-600 hover:bg-gray-700"
          >
            Cancel
          </Button>
          <Button
            onClick={handlePaste}
            className="bg-blue-600 hover:bg-blue-700 text-white"
          >
            Save Job Description
          </Button>
        </div>
      </div>
    </div>
  );
}
