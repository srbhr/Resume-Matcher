'use client';

import { useCallback, useEffect, useState } from 'react';
import { ArrowSquareOut, SignOut, SpinnerGap } from '@phosphor-icons/react';
import {
  CHATGPT_USAGE_URL,
  ChatGptRequestError,
  disconnectChatGpt,
  fetchChatGptModels,
  fetchChatGptStatus,
  startChatGptLogin,
  type ChatGptModel,
  type ChatGptReturnOutcome,
  type ChatGptStatus,
} from '@/lib/api/chatgpt';
import { PROVIDER_INFO } from '@/lib/api/config';
import { Alert, type AlertTone } from '@/components/ui/alert';
import { BrandIcon } from '@/components/ui/brand-icon';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { StatusIndicator } from '@/components/ui/status-indicator';
import { useTranslations } from '@/lib/i18n';

const DISCONNECTED: ChatGptStatus = { connected: false, email: null, plan_declined: false };

const RETURN_MESSAGE: Record<ChatGptReturnOutcome, { tone: AlertTone; key: string }> = {
  connected: { tone: 'success', key: 'settings.chatgpt.returnConnected' },
  plan_declined: { tone: 'warning', key: 'settings.chatgpt.planDeclined' },
  cancelled: { tone: 'info', key: 'settings.chatgpt.returnCancelled' },
  error: { tone: 'error', key: 'settings.chatgpt.returnError' },
};

export interface ChatGptConnectionProps {
  model: string;
  onModelChange: (model: string) => void;
  /** The `?chatgpt=` outcome the backend reported when it sent the browser back here. */
  returnOutcome?: ChatGptReturnOutcome | null;
  /** Called after a disconnect so cached LLM status can refresh. */
  onConnectionChange?: () => void;
  /** Reports whether the account is connected; `null` while that is still being checked. */
  onStatusChange?: (connected: boolean | null) => void;
}

/**
 * Sign in with ChatGPT for the "ChatGPT plan" provider: connection state,
 * Continue with ChatGPT / Disconnect, and the signed-in account's models.
 * Sign-in leaves this tab for OpenAI and comes back through the backend's
 * loopback callback; no token ever reaches the browser.
 */
export function ChatGptConnection({
  model,
  onModelChange,
  returnOutcome = null,
  onConnectionChange,
  onStatusChange,
}: ChatGptConnectionProps) {
  const { t } = useTranslations();
  const [status, setStatus] = useState<ChatGptStatus | null>(null);
  const [models, setModels] = useState<ChatGptModel[]>([]);
  const [modelsFailed, setModelsFailed] = useState(false);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  // The return message stays until the user starts another action.
  const [outcomeDismissed, setOutcomeDismissed] = useState(false);
  const outcome = outcomeDismissed ? null : returnOutcome;

  useEffect(() => {
    let cancelled = false;
    fetchChatGptStatus()
      .then((result) => {
        if (!cancelled) setStatus(result);
      })
      .catch(() => {
        if (cancelled) return;
        setStatus(DISCONNECTED);
        setError(t('settings.chatgpt.statusFailed'));
      });
    return () => {
      cancelled = true;
    };
  }, [t]);

  const connected = status?.connected ?? false;
  useEffect(() => {
    onStatusChange?.(status === null ? null : status.connected);
  }, [status, onStatusChange]);
  useEffect(() => {
    if (!connected) return;
    let cancelled = false;
    fetchChatGptModels()
      .then((list) => {
        if (cancelled) return;
        setModels(list);
        setModelsFailed(list.length === 0);
      })
      .catch(() => {
        if (!cancelled) setModelsFailed(true);
      });
    return () => {
      cancelled = true;
    };
  }, [connected]);

  // The account's catalog decides the model: a saved or default slug the
  // account does not offer would fail on the first request.
  useEffect(() => {
    if (models.length && !models.some((option) => option.slug === model)) {
      onModelChange(models[0].slug);
    }
  }, [models, model, onModelChange]);

  const signIn = useCallback(async () => {
    setWorking(true);
    setError(null);
    setNotice(null);
    setOutcomeDismissed(true);
    try {
      const url = await startChatGptLogin();
      // Same tab: OpenAI redirects to the backend's loopback callback, which
      // sends the browser back to Settings.
      window.location.assign(url);
    } catch (err) {
      setError(
        err instanceof ChatGptRequestError && err.status === 403
          ? t('settings.chatgpt.sameMachineOnly')
          : t('settings.chatgpt.signInFailed')
      );
      setWorking(false);
    }
  }, [t]);

  const disconnect = useCallback(async () => {
    setWorking(true);
    setError(null);
    setOutcomeDismissed(true);
    try {
      const { revoked } = await disconnectChatGpt();
      setStatus(DISCONNECTED);
      setModels([]);
      setModelsFailed(false);
      setNotice(
        revoked ? t('settings.chatgpt.disconnected') : t('settings.chatgpt.revocationUnconfirmed')
      );
      onConnectionChange?.();
    } catch {
      setError(t('settings.chatgpt.disconnectFailed'));
    } finally {
      setWorking(false);
    }
  }, [onConnectionChange, t]);

  const returnMessage = outcome ? RETURN_MESSAGE[outcome] : null;
  const showPlanDeclined = status?.plan_declined && outcome !== 'plan_declined';

  return (
    <div className="space-y-4 border border-ink bg-white p-4 shadow-sw-nested">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <span className="flex min-w-0 flex-wrap items-center gap-2">
          {status === null ? (
            <StatusIndicator tone="neutral">{t('settings.chatgpt.checking')}</StatusIndicator>
          ) : connected ? (
            <StatusIndicator tone="ready">{t('settings.chatgpt.connected')}</StatusIndicator>
          ) : (
            <StatusIndicator tone="warning">{t('settings.chatgpt.notConnected')}</StatusIndicator>
          )}
          {connected && status?.email && (
            <span className="break-all font-mono text-xs text-steel">{status.email}</span>
          )}
        </span>
        <a
          href={CHATGPT_USAGE_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-mono text-xs uppercase tracking-wider text-primary underline-offset-4 hover:underline"
        >
          {t('settings.chatgpt.manageUsage')}
          <ArrowSquareOut aria-hidden="true" className="size-3.5" />
        </a>
      </div>

      {returnMessage && <Alert tone={returnMessage.tone}>{t(returnMessage.key)}</Alert>}
      {showPlanDeclined && <Alert tone="warning">{t('settings.chatgpt.planDeclined')}</Alert>}
      {notice && <Alert tone="info">{notice}</Alert>}
      {error && <Alert tone="error">{error}</Alert>}

      {status !== null && (
        <div className="flex flex-wrap gap-3">
          {!connected && (
            <Button type="button" onClick={signIn} disabled={working}>
              {working ? (
                <SpinnerGap aria-hidden="true" className="animate-spin" />
              ) : (
                <BrandIcon name="openai" />
              )}
              {t('settings.chatgpt.continue')}
            </Button>
          )}
          {(connected || status.plan_declined) && (
            <Button type="button" variant="outline" onClick={disconnect} disabled={working}>
              <SignOut aria-hidden="true" />
              {t('settings.chatgpt.disconnect')}
            </Button>
          )}
        </div>
      )}

      {connected && models.length > 0 ? (
        <Dropdown
          label={t('settings.llmConfiguration.modelLabel')}
          value={model}
          onChange={onModelChange}
          options={models.map((option) => ({
            id: option.slug,
            label: option.display_name,
            description: option.display_name === option.slug ? undefined : option.slug,
          }))}
        />
      ) : (
        <div className="space-y-2">
          <Label htmlFor="model">{t('settings.llmConfiguration.modelLabel')}</Label>
          <Input
            id="model"
            value={model}
            onChange={(e) => onModelChange(e.target.value)}
            placeholder={PROVIDER_INFO.chatgpt.defaultModel}
            autoComplete="off"
            spellCheck={false}
            className="font-mono"
          />
          <p className="text-xs text-steel font-mono">
            {connected && modelsFailed
              ? t('settings.chatgpt.modelsFailed')
              : t('settings.chatgpt.modelHint')}
          </p>
        </div>
      )}
    </div>
  );
}
