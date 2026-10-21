'use client';

import { useRef, useState } from 'react';
import { Check, Copy } from '@phosphor-icons/react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useTranslations } from '@/lib/i18n';

/** Work the app hands to the user's coding agent when agent mode is on. */
export type AgentTask =
  | 'createMaster'
  | 'tailor'
  | 'enhance'
  | 'regenerate'
  | 'coverLetter'
  | 'outreach'
  | 'interviewPrep'
  | 'improveWriting';

/** Tasks with an extra line under the prompt (agentPrompt.<task>.note). */
const HAS_NOTE: ReadonlySet<AgentTask> = new Set(['tailor', 'interviewPrep']);
/** The agent answers interview prep in its chat; nothing appears here to refresh. */
const SAVES_HERE = (task: AgentTask) => task !== 'interviewPrep';

export interface AgentPromptDialogProps {
  /** The task to show a prompt for; `null` keeps the dialog closed. */
  task: AgentTask | null;
  /** The resume the prompt is about, for tasks on an existing resume. */
  resumeId?: string;
  /** A job description already pasted in the app; puts it in the tailor prompt. */
  jobDescription?: string;
  onClose: () => void;
}

/**
 * In agent mode the app makes no AI calls. Each AI action opens this dialog with
 * a prompt for the user to paste into Claude Code, Codex, Cursor or Copilot,
 * which does the work through the resume-matcher command and saves it here.
 */
export function AgentPromptDialog({
  task,
  resumeId = '',
  jobDescription = '',
  onClose,
}: AgentPromptDialogProps) {
  const { t } = useTranslations();
  const copyRef = useRef<HTMLButtonElement>(null);
  const [copied, setCopied] = useState(false);
  // Keep the last task's copy while the dialog animates out.
  const [shown, setShown] = useState<AgentTask>(task ?? 'tailor');
  if (task && task !== shown) {
    setShown(task);
    setCopied(false);
  }
  const current = task ?? shown;
  const key = `agentPrompt.${current}`;
  const job = jobDescription.trim();
  const prompt =
    current === 'tailor' && job
      ? t('agentPrompt.tailor.promptWithJob', { resumeId, job })
      : t(`${key}.prompt`, { resumeId });

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(prompt);
      setCopied(true);
    } catch (err) {
      console.error('Failed to copy:', err);
    }
  };

  return (
    <Dialog open={task !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent size="md" initialFocusRef={copyRef}>
        <DialogHeader>
          <DialogTitle>{t(`${key}.title`)}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <DialogDescription>{t('agentPrompt.instructions')}</DialogDescription>
          <pre className="whitespace-pre-wrap break-words rounded-none border border-ink bg-white p-3 font-mono text-xs text-ink-soft shadow-sw-nested">
            {prompt}
          </pre>
          {HAS_NOTE.has(current) && <DialogDescription>{t(`${key}.note`)}</DialogDescription>}
          {SAVES_HERE(current) && <DialogDescription>{t('agentPrompt.refresh')}</DialogDescription>}
        </DialogBody>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            {t('common.close')}
          </Button>
          <Button ref={copyRef} onClick={() => void handleCopy()}>
            {copied ? <Check aria-hidden="true" /> : <Copy aria-hidden="true" />}
            {copied ? t('agentPrompt.copied') : t('agentPrompt.copy')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
