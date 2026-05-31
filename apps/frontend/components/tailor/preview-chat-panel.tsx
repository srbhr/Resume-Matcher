'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { Send, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import {
  refinePreviewChat,
  type RefineChatMessage,
  type RefineChatResponse,
} from '@/lib/api/resume';
import type { ResumeData } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';

interface PreviewChatPanelProps {
  resumeId: string;
  tailorSessionId?: string | null;
  currentPreview: ResumeData;
  onPreviewUpdated: (response: RefineChatResponse) => void;
}

interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
  isError?: boolean;
}

/**
 * Inline chat panel for refining the unsaved tailored preview.
 *
 * Sends messages to POST /resumes/improve/refine-chat. When the response
 * includes an updated_preview + diff, notifies the parent (DiffPreviewModal)
 * so it can replace its working state.
 */
export function PreviewChatPanel({
  resumeId,
  tailorSessionId,
  currentPreview,
  onPreviewUpdated,
}: PreviewChatPanelProps) {
  const { t } = useTranslations();
  const [history, setHistory] = useState<RefineChatMessage[]>([]);
  const [displayEntries, setDisplayEntries] = useState<ChatEntry[]>([]);
  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-scroll to bottom when new messages appear
  useEffect(() => {
    scrollRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [displayEntries]);

  const sendMessage = useCallback(async () => {
    const message = input.trim();
    if (!message || isSending) return;

    const userEntry: ChatEntry = { role: 'user', content: message };
    setDisplayEntries((prev) => [...prev, userEntry]);
    setHistory((prev) => [...prev, { role: 'user', content: message }]);
    setInput('');
    setIsSending(true);

    try {
      const response = await refinePreviewChat({
        resume_id: resumeId,
        tailor_session_id: tailorSessionId ?? null,
        current_preview: currentPreview,
        message,
        history,
      });

      const assistantEntry: ChatEntry = { role: 'assistant', content: response.reply };
      setDisplayEntries((prev) => [...prev, assistantEntry]);
      setHistory((prev) => [...prev, { role: 'assistant', content: response.reply }]);

      if (response.updated_preview) {
        onPreviewUpdated(response);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : t('tailor.previewChat.sendError');
      setDisplayEntries((prev) => [...prev, { role: 'assistant', content: msg, isError: true }]);
    } finally {
      setIsSending(false);
      // Re-focus the textarea after sending
      setTimeout(() => textareaRef.current?.focus(), 50);
    }
  }, [input, isSending, resumeId, tailorSessionId, currentPreview, history, onPreviewUpdated, t]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      e.stopPropagation();
      // Ctrl/Cmd+Enter sends the message
      if (e.ctrlKey || e.metaKey) {
        e.preventDefault();
        sendMessage();
      }
    }
  };

  return (
    <div className="flex flex-col h-full border-t-2 border-black bg-background">
      {/* Header */}
      <div className="px-4 py-3 border-b border-border bg-card">
        <p className="font-mono text-xs font-bold uppercase tracking-wider">
          {t('tailor.previewChat.title')}
        </p>
        <p className="font-mono text-xs text-steel-grey mt-0.5">
          {t('tailor.previewChat.subtitle')}
        </p>
      </div>

      {/* Message thread */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3 min-h-0">
        {displayEntries.length === 0 && (
          <p className="font-mono text-xs text-steel-grey text-center py-4">
            {t('tailor.previewChat.emptyState')}
          </p>
        )}
        {displayEntries.map((entry, i) => (
          <div
            key={i}
            className={`flex ${entry.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            <div
              className={[
                'max-w-[85%] px-3 py-2 font-mono text-xs leading-relaxed',
                entry.role === 'user'
                  ? 'bg-primary text-on-accent border border-black'
                  : entry.isError
                    ? 'bg-red-50 text-red-700 border border-red-200'
                    : 'bg-paper-tint text-ink border border-black',
              ].join(' ')}
            >
              {entry.content}
            </div>
          </div>
        ))}
        {isSending && (
          <div className="flex justify-start">
            <div className="px-3 py-2 bg-paper-tint border border-black font-mono text-xs text-steel-grey flex items-center gap-2">
              <Loader2 className="w-3 h-3 animate-spin" />
              {t('tailor.previewChat.thinking')}
            </div>
          </div>
        )}
        <div ref={scrollRef} />
      </div>

      {/* Input row */}
      <div className="p-3 border-t border-border flex gap-2 items-end">
        <Textarea
          ref={textareaRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={t('tailor.previewChat.inputPlaceholder')}
          disabled={isSending}
          className="flex-1 min-h-[60px] max-h-[120px] font-mono text-xs bg-background border border-border focus:ring-0 focus:border-primary resize-none p-2 rounded-none"
          rows={2}
        />
        <Button
          onClick={sendMessage}
          disabled={isSending || !input.trim()}
          size="sm"
          className="shrink-0 h-[60px] px-3"
          title={t('tailor.previewChat.sendTitle')}
        >
          {isSending ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
        </Button>
      </div>
      <p className="px-3 pb-2 font-mono text-xs text-steel-grey">
        {t('tailor.previewChat.shortcutHint')}
      </p>
    </div>
  );
}
