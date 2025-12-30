'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Key, Loader2, CheckCircle2, XCircle, Save, Trash2, Eye, EyeOff } from 'lucide-react';
import {
  fetchApiKeyStatus,
  updateApiKeys,
  deleteApiKey,
  API_KEY_PROVIDER_INFO,
  type ApiKeyProvider,
  type ApiKeyProviderStatus,
} from '@/lib/api/config';

const PROVIDERS: ApiKeyProvider[] = ['openai', 'anthropic', 'google', 'openrouter', 'deepseek'];

interface ApiKeyInputState {
  value: string;
  showPassword: boolean;
  isEditing: boolean;
}

export function ApiKeysSettings() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [providerStatuses, setProviderStatuses] = useState<ApiKeyProviderStatus[]>([]);

  // State for each provider's input
  const [keyInputs, setKeyInputs] = useState<Record<ApiKeyProvider, ApiKeyInputState>>(
    PROVIDERS.reduce(
      (acc, provider) => ({
        ...acc,
        [provider]: { value: '', showPassword: false, isEditing: false },
      }),
      {} as Record<ApiKeyProvider, ApiKeyInputState>
    )
  );

  // Load API key status on mount
  useEffect(() => {
    loadApiKeyStatus();
  }, []);

  const loadApiKeyStatus = async () => {
    setLoading(true);
    setError(null);
    try {
      const status = await fetchApiKeyStatus();
      setProviderStatuses(status.providers);
    } catch (err) {
      setError('Failed to load API key status');
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (provider: ApiKeyProvider, value: string) => {
    setKeyInputs((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], value, isEditing: true },
    }));
  };

  const togglePasswordVisibility = (provider: ApiKeyProvider) => {
    setKeyInputs((prev) => ({
      ...prev,
      [provider]: { ...prev[provider], showPassword: !prev[provider].showPassword },
    }));
  };

  const handleSaveKey = async (provider: ApiKeyProvider) => {
    const value = keyInputs[provider].value.trim();
    if (!value) {
      setError(`Please enter an API key for ${API_KEY_PROVIDER_INFO[provider].name}`);
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await updateApiKeys({ [provider]: value });

      // Clear input and refresh status
      setKeyInputs((prev) => ({
        ...prev,
        [provider]: { value: '', showPassword: false, isEditing: false },
      }));
      await loadApiKeyStatus();
      setSuccess(`${API_KEY_PROVIDER_INFO[provider].name} API key saved successfully`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(`Failed to save ${API_KEY_PROVIDER_INFO[provider].name} API key`);
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteKey = async (provider: ApiKeyProvider) => {
    if (
      !confirm(
        `Are you sure you want to remove the ${API_KEY_PROVIDER_INFO[provider].name} API key?`
      )
    ) {
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      await deleteApiKey(provider);
      await loadApiKeyStatus();
      setSuccess(`${API_KEY_PROVIDER_INFO[provider].name} API key removed`);
      setTimeout(() => setSuccess(null), 3000);
    } catch (err) {
      setError(`Failed to remove ${API_KEY_PROVIDER_INFO[provider].name} API key`);
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const getProviderStatus = (provider: ApiKeyProvider) => {
    return providerStatuses.find((s) => s.provider === provider);
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
      </div>
    );
  }

  return (
    <section className="space-y-6">
      <div className="flex items-center gap-2 border-b border-black/10 pb-2">
        <Key className="w-4 h-4" />
        <h2 className="font-mono text-sm font-bold uppercase tracking-wider">API Keys Storage</h2>
      </div>

      <p className="text-sm text-gray-600">
        Store API keys for multiple providers. These keys are saved locally and persist across
        sessions. You can switch between providers in LLM Configuration without re-entering keys.
      </p>

      {error && (
        <div className="border border-red-300 bg-red-50 p-3">
          <p className="text-xs text-red-600 font-mono">ERROR: {error}</p>
        </div>
      )}

      {success && (
        <div className="border border-green-300 bg-green-50 p-3">
          <p className="text-xs text-green-600 font-mono">{success}</p>
        </div>
      )}

      <div className="space-y-4">
        {PROVIDERS.map((provider) => {
          const status = getProviderStatus(provider);
          const input = keyInputs[provider];
          const info = API_KEY_PROVIDER_INFO[provider];

          return (
            <div
              key={provider}
              className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <Label className="font-mono text-sm font-bold">{info.name}</Label>
                    {status?.configured ? (
                      <span className="flex items-center gap-1 text-xs text-green-600">
                        <CheckCircle2 className="w-3 h-3" />
                        Configured
                      </span>
                    ) : (
                      <span className="flex items-center gap-1 text-xs text-gray-400">
                        <XCircle className="w-3 h-3" />
                        Not configured
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-gray-500 mb-3">{info.description}</p>

                  {status?.configured && status.masked_key && !input.isEditing && (
                    <div className="flex items-center gap-2 mb-3">
                      <span className="font-mono text-xs text-gray-500">
                        Current: {status.masked_key}
                      </span>
                    </div>
                  )}

                  <div className="flex items-center gap-2">
                    <div className="relative flex-1">
                      <Input
                        type={input.showPassword ? 'text' : 'password'}
                        value={input.value}
                        onChange={(e) => handleInputChange(provider, e.target.value)}
                        placeholder={
                          status?.configured ? 'Enter new key to update...' : 'Enter API key...'
                        }
                        className="font-mono pr-10"
                      />
                      <button
                        type="button"
                        onClick={() => togglePasswordVisibility(provider)}
                        className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600"
                      >
                        {input.showPassword ? (
                          <EyeOff className="w-4 h-4" />
                        ) : (
                          <Eye className="w-4 h-4" />
                        )}
                      </button>
                    </div>
                    <Button
                      size="sm"
                      onClick={() => handleSaveKey(provider)}
                      disabled={saving || !input.value.trim()}
                      className="gap-1"
                    >
                      {saving ? (
                        <Loader2 className="w-4 h-4 animate-spin" />
                      ) : (
                        <Save className="w-4 h-4" />
                      )}
                      Save
                    </Button>
                    {status?.configured && (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => handleDeleteKey(provider)}
                        disabled={saving}
                        className="gap-1 text-red-600 hover:text-red-700 hover:bg-red-50"
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      <p className="text-xs text-gray-400 font-mono">
        Note: API keys are stored in config.json on the server. In Docker deployments, this file
        persists in the mounted volume.
      </p>
    </section>
  );
}
