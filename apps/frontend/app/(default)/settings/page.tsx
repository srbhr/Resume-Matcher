'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import {
  fetchLlmConfig,
  updateLlmConfig,
  testLlmConnection,
  fetchFeatureConfig,
  updateFeatureConfig,
  PROVIDER_INFO,
  type LLMConfig,
  type LLMProvider,
  type LLMHealthCheck,
} from '@/lib/api/config';
import { API_URL } from '@/lib/api/client';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { useStatusCache } from '@/lib/context/status-cache';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Save,
  Key,
  Database,
  Activity,
  Loader2,
  ArrowLeft,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Server,
  FileText,
  Briefcase,
  Sparkles,
  Clock,
  Settings2,
  Globe,
} from 'lucide-react';
import { useLanguage } from '@/lib/context/language-context';
import { useTranslations } from '@/lib/i18n';
import type { SupportedLanguage } from '@/lib/api/config';
import type { Locale } from '@/i18n/config';

type Status = 'idle' | 'loading' | 'saving' | 'saved' | 'error' | 'testing';

const PROVIDERS: LLMProvider[] = [
  'openai',
  'anthropic',
  'openrouter',
  'gemini',
  'deepseek',
  'ollama',
];

export default function SettingsPage() {
  const [status, setStatus] = useState<Status>('loading');
  const [error, setError] = useState<string | null>(null);

  // LLM Config state
  const [provider, setProvider] = useState<LLMProvider>('openai');
  const [model, setModel] = useState('');
  const [apiKey, setApiKey] = useState('');
  const [apiBase, setApiBase] = useState('');
  const [hasStoredApiKey, setHasStoredApiKey] = useState(false);

  // Use cached system status (loaded on app start, refreshes every 30 min)
  const {
    status: systemStatus,
    isLoading: statusLoading,
    lastFetched,
    refreshStatus,
  } = useStatusCache();

  // Health check result from manual test
  const [healthCheck, setHealthCheck] = useState<LLMHealthCheck | null>(null);

  // Feature config state
  const [enableCoverLetter, setEnableCoverLetter] = useState(false);
  const [enableOutreach, setEnableOutreach] = useState(false);
  const [featureConfigLoading, setFeatureConfigLoading] = useState(false);

  // Language settings
  const {
    contentLanguage,
    uiLanguage,
    setContentLanguage,
    setUiLanguage,
    languageNames,
    supportedLanguages,
    isLoading: languageLoading,
  } = useLanguage();

  // Translations
  const { t } = useTranslations();

  // Load LLM config and feature config on mount
  useEffect(() => {
    let cancelled = false;

    async function loadConfig() {
      try {
        const [llmConfig, featureConfig] = await Promise.all([
          fetchLlmConfig().catch(() => null),
          fetchFeatureConfig().catch(() => null),
        ]);

        if (cancelled) return;

        if (llmConfig) {
          setProvider(llmConfig.provider || 'openai');
          setModel(llmConfig.model || PROVIDER_INFO['openai'].defaultModel);
          const isMaskedKey = Boolean(llmConfig.api_key) && llmConfig.api_key.includes('*');
          setHasStoredApiKey(Boolean(llmConfig.api_key));
          setApiKey(isMaskedKey ? '' : llmConfig.api_key || '');
          setApiBase(llmConfig.api_base || '');
        }

        if (featureConfig) {
          setEnableCoverLetter(featureConfig.enable_cover_letter);
          setEnableOutreach(featureConfig.enable_outreach_message);
        }

        setStatus('idle');
      } catch (err) {
        console.error('Failed to load settings', err);
        if (!cancelled) {
          setError('Unable to connect to backend. Is the server running?');
          setStatus('error');
        }
      }
    }

    loadConfig();
    return () => {
      cancelled = true;
    };
  }, []);

  // Handle provider change
  const handleProviderChange = (newProvider: LLMProvider) => {
    setProvider(newProvider);
    setModel(PROVIDER_INFO[newProvider].defaultModel);
    if (newProvider === 'ollama') {
      setApiBase('http://localhost:11434');
      setApiKey('');
      setHasStoredApiKey(false);
    } else {
      setApiBase('');
      setApiKey('');
      setHasStoredApiKey(false);
    }
  };

  // Save configuration
  const handleSave = async () => {
    setStatus('saving');
    setError(null);

    try {
      if (requiresApiKey && !apiKey.trim() && !hasStoredApiKey) {
        setError('API key is required for the selected provider.');
        setStatus('error');
        return;
      }

      const trimmedKey = apiKey.trim();
      const config: Partial<LLMConfig> = {
        provider,
        model: model.trim(),
        api_base: apiBase.trim() || null,
      };
      if (requiresApiKey) {
        if (trimmedKey) {
          config.api_key = trimmedKey;
        } else if (!hasStoredApiKey) {
          config.api_key = '';
        }
      } else {
        config.api_key = '';
      }

      await updateLlmConfig(config);

      // Refresh cached system status after save
      await refreshStatus();

      setStatus('saved');
      setTimeout(() => setStatus('idle'), 2000);
    } catch (err) {
      console.error('Failed to save config', err);
      setError((err as Error).message || 'Unable to save configuration');
      setStatus('error');
    }
  };

  // Test connection
  const handleTestConnection = async () => {
    setStatus('testing');
    setError(null);
    setHealthCheck(null);

    try {
      const result = await testLlmConnection();
      setHealthCheck(result);
      setStatus('idle');
    } catch (err) {
      console.error('Failed to test connection', err);
      setHealthCheck({ healthy: false, provider, model, error: (err as Error).message });
      setStatus('idle');
    }
  };

  // Update feature config
  const handleFeatureConfigChange = async (
    key: 'enable_cover_letter' | 'enable_outreach_message',
    value: boolean
  ) => {
    setFeatureConfigLoading(true);
    try {
      const updated = await updateFeatureConfig({ [key]: value });
      setEnableCoverLetter(updated.enable_cover_letter);
      setEnableOutreach(updated.enable_outreach_message);
    } catch (err) {
      console.error('Failed to update feature config', err);
      // Revert on error
      if (key === 'enable_cover_letter') {
        setEnableCoverLetter(!value);
      } else {
        setEnableOutreach(!value);
      }
    } finally {
      setFeatureConfigLoading(false);
    }
  };

  // Format last fetched time for display
  const formatLastFetched = () => {
    if (!lastFetched) return 'Never';
    const now = new Date();
    const diff = Math.floor((now.getTime() - lastFetched.getTime()) / 1000);
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    return `${Math.floor(diff / 3600)}h ago`;
  };

  const requiresApiKey = PROVIDER_INFO[provider]?.requiresKey ?? true;

  return (
    <div
      className="flex flex-col items-center justify-start p-6 md:p-12 min-h-screen overflow-y-auto"
      style={{
        backgroundImage:
          'linear-gradient(rgba(29, 78, 216, 0.05) 1px, transparent 1px), linear-gradient(90deg, rgba(29, 78, 216, 0.05) 1px, transparent 1px)',
        backgroundSize: '40px 40px',
      }}
    >
      <div className="w-full max-w-4xl border border-black bg-[#F0F0E8] shadow-[8px_8px_0px_0px_rgba(0,0,0,0.1)]">
        {/* Header */}
        <div className="border-b border-black p-8 bg-white flex justify-between items-start">
          <div>
            <h1 className="font-serif text-3xl font-bold tracking-tight uppercase">
              {t('settings.title')}
            </h1>
            <p className="font-mono text-xs text-gray-500 mt-2 uppercase tracking-wider">
              {'// '}
              {t('settings.subtitle')}
            </p>
          </div>
          <Link href="/dashboard">
            <Button variant="outline" size="sm">
              <ArrowLeft className="w-4 h-4" />
              {t('common.back')}
            </Button>
          </Link>
        </div>

        <div className="p-8 space-y-10">
          {/* System Status Panel */}
          <section className="space-y-4">
            <div className="flex items-center justify-between border-b border-black/10 pb-2">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-2">
                  <Activity className="w-4 h-4" />
                  <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                    System Status
                  </h2>
                </div>
                {lastFetched && (
                  <span className="font-mono text-xs text-gray-400 flex items-center gap-1">
                    <Clock className="w-3 h-3" />
                    {formatLastFetched()}
                  </span>
                )}
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={refreshStatus}
                disabled={statusLoading}
                className="gap-1 text-xs"
              >
                <RefreshCw className={`w-3 h-3 ${statusLoading ? 'animate-spin' : ''}`} />
                REFRESH
              </Button>
            </div>

            {statusLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : !systemStatus ? (
              <div className="flex flex-col items-center justify-center p-8 gap-3 border border-dashed border-red-300 bg-red-50">
                <p className="font-mono text-xs text-red-600 uppercase">
                  Unable to connect to backend
                </p>
                <p className="font-mono text-xs text-gray-600">
                  Expected at: <span className="font-bold">{API_URL}</span>
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={refreshStatus}
                  className="gap-1 text-xs"
                >
                  <RefreshCw className="w-3 h-3" />
                  Retry
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                {/* LLM Status */}
                <div className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Server className="w-4 h-4 text-gray-500" />
                    <span className="font-mono text-xs uppercase text-gray-500">LLM</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {systemStatus.llm_healthy ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className="font-mono text-sm font-bold">
                      {systemStatus.llm_healthy ? 'HEALTHY' : 'OFFLINE'}
                    </span>
                  </div>
                </div>

                {/* Database Status */}
                <div className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Database className="w-4 h-4 text-gray-500" />
                    <span className="font-mono text-xs uppercase text-gray-500">Database</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-5 h-5 text-green-600" />
                    <span className="font-mono text-sm font-bold">CONNECTED</span>
                  </div>
                </div>

                {/* Resumes Count */}
                <div className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span className="font-mono text-xs uppercase text-gray-500">Resumes</span>
                  </div>
                  <span className="font-mono text-2xl font-bold">
                    {systemStatus.database_stats.total_resumes}
                  </span>
                </div>

                {/* Jobs Count */}
                <div className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Briefcase className="w-4 h-4 text-gray-500" />
                    <span className="font-mono text-xs uppercase text-gray-500">Jobs</span>
                  </div>
                  <span className="font-mono text-2xl font-bold">
                    {systemStatus.database_stats.total_jobs}
                  </span>
                </div>
              </div>
            )}

            {/* Additional Stats Row */}
            {systemStatus && (
              <div className="grid grid-cols-2 gap-4">
                <div className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
                  <div className="flex items-center gap-2 mb-2">
                    <Sparkles className="w-4 h-4 text-gray-500" />
                    <span className="font-mono text-xs uppercase text-gray-500">Improvements</span>
                  </div>
                  <span className="font-mono text-2xl font-bold">
                    {systemStatus.database_stats.total_improvements}
                  </span>
                </div>
                <div className="border border-black bg-white p-4 shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]">
                  <div className="flex items-center gap-2 mb-2">
                    <FileText className="w-4 h-4 text-gray-500" />
                    <span className="font-mono text-xs uppercase text-gray-500">Master Resume</span>
                  </div>
                  <div className="flex items-center gap-2">
                    {systemStatus.has_master_resume ? (
                      <>
                        <CheckCircle2 className="w-5 h-5 text-green-600" />
                        <span className="font-mono text-sm font-bold">CONFIGURED</span>
                      </>
                    ) : (
                      <>
                        <XCircle className="w-5 h-5 text-amber-500" />
                        <span className="font-mono text-sm font-bold">NOT SET</span>
                      </>
                    )}
                  </div>
                </div>
              </div>
            )}
          </section>

          {/* LLM Configuration */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 border-b border-black/10 pb-2">
              <Key className="w-4 h-4" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                LLM Configuration
              </h2>
            </div>

            <div className="grid gap-6">
              {/* Provider Selection */}
              <div className="space-y-2">
                <Label>Provider</Label>
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p}
                      onClick={() => handleProviderChange(p)}
                      className={`px-3 py-2 border text-xs font-mono uppercase transition-all ${
                        provider === p
                          ? 'bg-blue-700 text-white border-blue-700 shadow-[2px_2px_0px_0px_#000]'
                          : 'bg-white text-black border-black hover:bg-gray-100'
                      }`}
                    >
                      {PROVIDER_INFO[p].name.split(' ')[0]}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-gray-500 font-mono">
                  SELECTED: {PROVIDER_INFO[provider].name}
                </p>
              </div>

              {/* Model Input */}
              <div className="space-y-2">
                <Label htmlFor="model">Model</Label>
                <Input
                  id="model"
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder={PROVIDER_INFO[provider].defaultModel}
                  className="font-mono"
                />
                <p className="text-xs text-gray-500 font-mono">
                  DEFAULT: {PROVIDER_INFO[provider].defaultModel}
                </p>
              </div>

              {/* API Key Input */}
              <div className="space-y-2">
                <Label htmlFor="apiKey">
                  API Key{' '}
                  {!requiresApiKey && <span className="text-gray-400">(Optional for Ollama)</span>}
                </Label>
                <Input
                  id="apiKey"
                  type="password"
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder={requiresApiKey ? 'sk-...' : 'Not required for local models'}
                  className="font-mono"
                  disabled={!requiresApiKey}
                />
                {requiresApiKey && hasStoredApiKey && !apiKey && (
                  <p className="text-xs text-gray-500 font-mono">
                    LEAVE BLANK TO KEEP EXISTING KEY
                  </p>
                )}
              </div>

              {/* API Base URL (for Ollama) */}
              {provider === 'ollama' && (
                <div className="space-y-2">
                  <Label htmlFor="apiBase">Ollama Server URL</Label>
                  <Input
                    id="apiBase"
                    value={apiBase}
                    onChange={(e) => setApiBase(e.target.value)}
                    placeholder="http://localhost:11434"
                    className="font-mono"
                  />
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex gap-4">
                <Button
                  onClick={handleSave}
                  disabled={status === 'saving' || status === 'loading'}
                  className="flex-1"
                >
                  {status === 'saving' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : status === 'saved' ? (
                    <>
                      <CheckCircle2 className="w-4 h-4" />
                      {t('common.success')}
                    </>
                  ) : (
                    <>
                      <Save className="w-4 h-4" />
                      {t('common.save')}
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  onClick={handleTestConnection}
                  disabled={status === 'testing' || status === 'saving'}
                >
                  {status === 'testing' ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <>
                      <Activity className="w-4 h-4" />
                      Test Connection
                    </>
                  )}
                </Button>
              </div>

              {/* Error Message */}
              {error && (
                <div className="border border-red-300 bg-red-50 p-3">
                  <p className="text-xs text-red-600 font-mono">ERROR: {error}</p>
                </div>
              )}

              {/* Health Check Result */}
              {healthCheck && (
                <div
                  className={`border p-4 ${
                    healthCheck.healthy
                      ? 'border-green-300 bg-green-50'
                      : 'border-red-300 bg-red-50'
                  }`}
                >
                  <div className="flex items-center gap-2 mb-2">
                    {healthCheck.healthy ? (
                      <CheckCircle2 className="w-5 h-5 text-green-600" />
                    ) : (
                      <XCircle className="w-5 h-5 text-red-500" />
                    )}
                    <span className="font-mono text-sm font-bold">
                      {healthCheck.healthy ? 'CONNECTION SUCCESSFUL' : 'CONNECTION FAILED'}
                    </span>
                  </div>
                  <p className="font-mono text-xs text-gray-600">
                    Provider: {healthCheck.provider} | Model: {healthCheck.model}
                  </p>
                  {healthCheck.error && (
                    <p className="font-mono text-xs text-red-600 mt-1">{healthCheck.error}</p>
                  )}
                </div>
              )}
            </div>
          </section>

          {/* Content Generation Section */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 border-b border-black/10 pb-2">
              <Settings2 className="w-4 h-4" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                Content Generation
              </h2>
            </div>

            <div className="space-y-2">
              <p className="text-sm text-gray-600 mb-4">
                Enable additional content generation during resume tailoring. When enabled, these
                documents will be automatically generated alongside your tailored resume.
              </p>

              <div className="space-y-3">
                <ToggleSwitch
                  checked={enableCoverLetter}
                  onCheckedChange={(checked) => {
                    setEnableCoverLetter(checked);
                    handleFeatureConfigChange('enable_cover_letter', checked);
                  }}
                  label="Cover Letter"
                  description="Generate a tailored cover letter alongside your resume"
                  disabled={featureConfigLoading}
                />
                <ToggleSwitch
                  checked={enableOutreach}
                  onCheckedChange={(checked) => {
                    setEnableOutreach(checked);
                    handleFeatureConfigChange('enable_outreach_message', checked);
                  }}
                  label="Cold Outreach Message"
                  description="Generate a networking message for LinkedIn or email"
                  disabled={featureConfigLoading}
                />
              </div>
            </div>
          </section>

          {/* Language Settings Section */}
          <section className="space-y-6">
            <div className="flex items-center gap-2 border-b border-black/10 pb-2">
              <Globe className="w-4 h-4" />
              <h2 className="font-mono text-sm font-bold uppercase tracking-wider">
                {t('settings.uiLanguage')} & {t('settings.contentLanguage')}
              </h2>
            </div>

            {/* UI Language */}
            <div className="space-y-4">
              <div>
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                  {t('settings.uiLanguage')}
                </h3>
                <p className="text-sm text-gray-600 mb-3">{t('settings.uiLanguageDescription')}</p>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {supportedLanguages.map((lang) => (
                    <button
                      key={`ui-${lang}`}
                      onClick={() => setUiLanguage(lang as Locale)}
                      disabled={languageLoading}
                      className={`px-4 py-3 border text-sm font-mono transition-all ${
                        uiLanguage === lang
                          ? 'bg-blue-700 text-white border-blue-700 shadow-[2px_2px_0px_0px_#000]'
                          : 'bg-white text-black border-black hover:bg-gray-100'
                      } ${languageLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {languageNames[lang]}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Content Language */}
            <div className="space-y-4 pt-4 border-t border-gray-200">
              <div>
                <h3 className="font-mono text-xs font-bold uppercase tracking-wider text-gray-700 mb-2">
                  {t('settings.contentLanguage')}
                </h3>
                <p className="text-sm text-gray-600 mb-3">
                  {t('settings.contentLanguageDescription')}
                </p>
              </div>

              <div className="space-y-2">
                <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                  {supportedLanguages.map((lang) => (
                    <button
                      key={`content-${lang}`}
                      onClick={() => setContentLanguage(lang as SupportedLanguage)}
                      disabled={languageLoading}
                      className={`px-4 py-3 border text-sm font-mono transition-all ${
                        contentLanguage === lang
                          ? 'bg-blue-700 text-white border-blue-700 shadow-[2px_2px_0px_0px_#000]'
                          : 'bg-white text-black border-black hover:bg-gray-100'
                      } ${languageLoading ? 'opacity-50 cursor-not-allowed' : ''}`}
                    >
                      {languageNames[lang]}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          </section>
        </div>

        {/* Footer */}
        <div className="bg-[#E5E5E0] p-4 border-t border-black flex justify-between items-center">
          <div className="flex items-center gap-2">
            <img src="/logo.svg" alt="Resume Matcher" className="w-5 h-5" />
            <span className="font-mono text-xs text-gray-500">RESUME MATCHER v1.0 (Aerodynamic)</span>
          </div>
          <div className="flex items-center gap-2">
            {statusLoading ? (
              <>
                <Loader2 className="w-3 h-3 animate-spin text-gray-500" />
                <span className="font-mono text-xs text-gray-500">CHECKING...</span>
              </>
            ) : systemStatus ? (
              <>
                <div
                  className={`w-3 h-3 ${systemStatus.status === 'ready' ? 'bg-green-700' : 'bg-amber-500'}`}
                ></div>
                <span
                  className={`font-mono text-xs font-bold ${systemStatus.status === 'ready' ? 'text-green-700' : 'text-amber-600'}`}
                >
                  {systemStatus.status === 'ready' ? 'STATUS: READY' : 'STATUS: SETUP REQUIRED'}
                </span>
              </>
            ) : (
              <span className="font-mono text-xs text-gray-500">STATUS: OFFLINE</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
