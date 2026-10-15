'use client';

import { useRef, useState } from 'react';
import { ArrowSquareOut } from '@phosphor-icons/react';
import { Alert } from '@/components/ui/alert';
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

/** Providers that run on the user's own subscription instead of an API key. */
export type SubscriptionProvider = 'claude_cli' | 'chatgpt';

export const MCP_SETUP_URL =
  'https://github.com/srbhr/Resume-Matcher/blob/main/SETUP.md#use-resume-matcher-from-claude-code-or-claude-desktop-mcp';

const COPY: Record<SubscriptionProvider, string> = {
  claude_cli: 'settings.subscriptionRisk.claudeCli',
  chatgpt: 'settings.subscriptionRisk.chatgpt',
};

export interface SubscriptionRiskDialogProps {
  /** The provider being switched to; `null` keeps the dialog closed. */
  provider: SubscriptionProvider | null;
  onAccept: () => void;
  /** Escape, the backdrop and Close all mean "take me back". */
  onCancel: () => void;
}

/**
 * Asked before switching to a subscription provider: the user accepts the risk
 * or goes back to an API key or local model. Also points to the MCP server,
 * which lets their own Claude Code or Codex do the work instead.
 */
export function SubscriptionRiskDialog({
  provider,
  onAccept,
  onCancel,
}: SubscriptionRiskDialogProps) {
  const { t } = useTranslations();
  const backRef = useRef<HTMLButtonElement>(null);
  // Keep the last provider's copy while the dialog animates out.
  const [shown, setShown] = useState<SubscriptionProvider>(provider ?? 'claude_cli');
  if (provider && provider !== shown) setShown(provider);
  const copy = COPY[provider ?? shown];

  return (
    <Dialog open={provider !== null} onOpenChange={(open) => !open && onCancel()}>
      <DialogContent size="md" initialFocusRef={backRef}>
        <DialogHeader>
          <DialogTitle>{t(`${copy}.title`)}</DialogTitle>
        </DialogHeader>
        <DialogBody className="space-y-4">
          <DialogDescription>{t(`${copy}.risk`)}</DialogDescription>
          <DialogDescription>{t(`${copy}.usage`)}</DialogDescription>
          <Alert tone="info" title={t('settings.subscriptionRisk.mcpTitle')}>
            <p>{t('settings.subscriptionRisk.mcpBody')}</p>
            <a
              href={MCP_SETUP_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="mt-2 inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wider text-primary underline-offset-4 hover:underline"
            >
              {t('settings.subscriptionRisk.mcpLink')}
              <ArrowSquareOut aria-hidden="true" className="size-3" />
            </a>
          </Alert>
          <DialogDescription>{t('settings.subscriptionRisk.alternative')}</DialogDescription>
        </DialogBody>
        {/* Stacked on phones: the two long labels do not fit side by side. */}
        <DialogFooter className="flex-col items-stretch sm:flex-row sm:items-center">
          <Button ref={backRef} variant="outline" onClick={onCancel}>
            {t('settings.subscriptionRisk.back')}
          </Button>
          <Button variant="warning" onClick={onAccept}>
            {t('settings.subscriptionRisk.accept')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
