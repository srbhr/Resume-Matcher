'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiFetch } from '@/lib/api/client';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import { useTranslations } from '@/lib/i18n';

interface DeviceLogin {
  user_code: string;
  verification_url: string;
  interval: number;
  expires_at: number;
}

interface Connection {
  connected: boolean;
  pending: boolean;
  expired: boolean;
  email?: string | null;
  plan?: string | null;
  device?: DeviceLogin | null;
}

interface ModelOption {
  id: string;
  name: string;
}

class ConnectionRequestError extends Error {
  constructor(
    public status: number,
    public detail: string | null
  ) {
    super(detail ?? '');
  }
}

async function connectionRequest<T>(
  path: string,
  method = 'GET',
  signal?: AbortSignal
): Promise<T> {
  // The custom header makes mutations require a CORS preflight across origins.
  const response = await apiFetch(`/config/chatgpt/${path}`, {
    method,
    credentials: 'include',
    headers: { 'X-ChatGPT-Request': '1' },
    signal,
  });
  // Proxies can return HTML or an empty error body; never expose parser errors.
  const result = await response.json().catch(() => null);
  if (!response.ok) {
    throw new ConnectionRequestError(
      response.status,
      typeof result?.detail === 'string' ? result.detail : null
    );
  }
  if (result === null) throw new ConnectionRequestError(response.status, null);
  return result as T;
}

export function ChatGPTConnection({
  model,
  onModelChange,
  onConnectionChange,
  onCatalogReadyChange,
}: {
  model: string;
  onModelChange: (value: string) => void;
  onConnectionChange?: () => Promise<void>;
  onCatalogReadyChange?: (ready: boolean) => void;
}) {
  const { t } = useTranslations();
  const [connection, setConnection] = useState<Connection | null>(null);
  const [modelsLoading, setModelsLoading] = useState(false);
  const catalogController = useRef<AbortController | null>(null);
  const [models, setModels] = useState<ModelOption[]>([]);
  const [working, setWorking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  // Translate local fallback errors while preserving safe backend error details.
  const request = useCallback(
    async <T,>(path: string, method = 'GET', signal?: AbortSignal): Promise<T> => {
      try {
        return await connectionRequest<T>(path, method, signal);
      } catch (reason) {
        if (reason instanceof ConnectionRequestError) {
          reason.message =
            reason.status === 404
              ? t('settings.chatgpt.restartBackend')
              : reason.detail || t('settings.chatgpt.connectionFailed');
          throw reason;
        }
        throw reason;
      }
    },
    [t]
  );

  useEffect(() => {
    // Resume an existing login on mount without initiating a new authorization.
    const controller = new AbortController();
    async function load() {
      try {
        const result = await request<Connection>('status', 'GET', controller.signal);
        if (controller.signal.aborted) return;
        setConnection(result);
      } catch (reason) {
        if (!controller.signal.aborted) {
          setError((reason as Error).message);
          setConnection({ connected: false, pending: false, expired: false });
        }
      }
    }
    void load();
    return () => controller.abort();
  }, [request]);

  const connected = Boolean(connection?.connected);
  const pending = Boolean(connection?.pending);
  const accountEmail = connection?.email;
  const hasConnectionStatus = connection !== null;
  const previousConnection = useRef<boolean | null>(null);
  useEffect(() => {
    // Refresh cached LLM health on sign-in/disconnect and when restoring a
    // saved connection. Polling updates must not repeat the health probe.
    if (!hasConnectionStatus || previousConnection.current === connected) return;
    const previous = previousConnection.current;
    previousConnection.current = connected;
    if (connected || previous !== null) void onConnectionChange?.();
  }, [hasConnectionStatus, connected, onConnectionChange]);

  const loadModels = useCallback(async () => {
    if (!connected || pending) return;
    // Automatic and manual refreshes share cancellation, including disconnect.
    catalogController.current?.abort();
    const controller = new AbortController();
    catalogController.current = controller;
    setModelsLoading(true);
    setError(null);
    try {
      const result = await request<{ models: ModelOption[] }>('models', 'GET', controller.signal);
      if (!controller.signal.aborted) setModels(result.models);
    } catch (reason) {
      if (!controller.signal.aborted) setError((reason as Error).message);
    } finally {
      if (!controller.signal.aborted) setModelsLoading(false);
    }
  }, [connected, pending, request]);

  useEffect(() => {
    // Catalog requests have their own scope; completing login only retires polling.
    if (!connected || pending) {
      setModels([]);
      setModelsLoading(false);
    } else {
      void loadModels();
    }
    return () => {
      catalogController.current?.abort();
    };
  }, [connected, pending, accountEmail, loadModels]);

  const catalogReady =
    connected &&
    !pending &&
    !working &&
    !modelsLoading &&
    models.some((option) => option.id === model);
  useEffect(() => {
    // A saved model must be verified against this account before Save is enabled.
    onCatalogReadyChange?.(catalogReady);
  }, [catalogReady, onCatalogReadyChange]);

  const device = connection?.device;
  useEffect(() => {
    // Poll only for an active code and retire its timer on completion/unmount.
    if (!device) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      if (controller.signal.aborted) return;
      if (Date.now() / 1000 >= device!.expires_at) {
        setConnection((current) => (current ? { ...current, pending: false, device: null } : null));
        setError(t('settings.chatgpt.expired'));
        return;
      }
      try {
        const result = await request<Connection>('poll', 'POST', controller.signal);
        if (controller.signal.aborted) return;
        // Keep the device object stable while waiting so this effect retains
        // its timer instead of restarting after every status response.
        if (!result.pending) {
          setConnection(result);
          if (!result.connected) setError(t('settings.chatgpt.expired'));
          return;
        }
      } catch (reason) {
        if (controller.signal.aborted) return;
        setError((reason as Error).message);
        // A terminal authorization failure retires the code while retaining an
        // existing connection. Transient outages keep polling until code expiry.
        if (
          reason instanceof ConnectionRequestError &&
          [400, 401, 403, 404].includes(reason.status)
        ) {
          setConnection((current) =>
            current ? { ...current, pending: false, device: null } : null
          );
          return;
        }
      }
      timer = setTimeout(() => void poll(), Math.max(5, device!.interval) * 1000);
    }
    timer = setTimeout(() => void poll(), Math.max(5, device.interval) * 1000);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [device, t, request]);

  // Use the account's catalog rather than a fixed model default.
  useEffect(() => {
    if (connected && !pending && models.length && !models.some((option) => option.id === model)) {
      onModelChange(models[0].id);
    }
  }, [connected, pending, models, model, onModelChange]);

  async function connect() {
    // Start sign-in from an explicit click; tokens never enter browser storage.
    setWorking(true);
    setError(null);
    setNotice(null);
    try {
      const pending = await request<DeviceLogin>('login', 'POST');
      setConnection((current) => ({
        ...current,
        connected: current?.connected ?? false,
        expired: false,
        pending: true,
        device: pending,
      }));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setWorking(false);
    }
  }

  async function disconnect() {
    // Retire any catalog request before logout so late responses cannot reselect a model.
    catalogController.current?.abort();
    setModelsLoading(false);
    // Clear local UI state even when the server cannot confirm remote revocation.
    setWorking(true);
    setError(null);
    try {
      const result = await request<{ warning?: string | null }>('logout', 'POST');
      setConnection({ connected: false, pending: false, expired: false });
      setModels([]);
      onModelChange('');
      setNotice(result.warning || t('settings.chatgpt.disconnected'));
    } catch (reason) {
      setError((reason as Error).message);
    } finally {
      setWorking(false);
    }
  }

  return (
    <div className="space-y-4 border border-black bg-paper-tint p-4">
      <p className="text-sm text-ink-soft">{t('settings.chatgpt.description')}</p>
      <p className="text-xs text-steel-grey">{t('settings.chatgpt.sharedAccount')}</p>
      {connection?.connected && (
        <p className="text-sm font-medium">
          {t('settings.chatgpt.connected')}
          {connection.email ? `: ${connection.email}` : ''}
          {connection.plan ? ` (${connection.plan})` : ''}
        </p>
      )}
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={connect}
          disabled={!hasConnectionStatus || working || Boolean(device)}
        >
          {t('settings.chatgpt.signIn')}
        </Button>
        {(connection?.connected || device) && (
          <Button type="button" onClick={disconnect} disabled={working}>
            {t('settings.chatgpt.disconnect')}
          </Button>
        )}
        {connection?.connected && (
          <Button
            type="button"
            disabled={working || pending || modelsLoading}
            onClick={() => void loadModels()}
          >
            {t('settings.chatgpt.refreshModels')}
          </Button>
        )}
      </div>
      {device && (
        <div className="space-y-2" role="status">
          <p className="text-sm">{t('settings.chatgpt.enterCode')}</p>
          <p className="font-mono text-xl font-bold tracking-widest">{device.user_code}</p>
          <a
            href={device.verification_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-700 underline"
          >
            {t('settings.chatgpt.openLogin')}
          </a>
          <p className="text-xs text-steel-grey">{t('settings.chatgpt.waiting')}</p>
        </div>
      )}
      {connected && !pending && models.length > 0 && (
        // Present the server's display labels while saving its exact model IDs.
        <Dropdown
          label={t('settings.llmConfiguration.modelLabel')}
          value={model}
          options={models.map((option) => ({ id: option.id, label: option.name }))}
          onChange={onModelChange}
        />
      )}
      {notice && (
        <p className="text-xs text-steel-grey" role="status">
          {notice}
        </p>
      )}
      {error && (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      )}
      <a
        href="https://chatgpt.com/#settings"
        target="_blank"
        rel="noopener noreferrer"
        className="text-xs text-blue-700 underline"
      >
        {t('settings.chatgpt.manageAccount')}
      </a>
    </div>
  );
}
