import { apiFetch } from './client';

// Supported LLM providers
export type LLMProvider = 'openai' | 'anthropic' | 'openrouter' | 'gemini' | 'deepseek' | 'ollama';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  api_key: string;
  api_base: string | null;
}

export interface LLMConfigUpdate {
  provider?: LLMProvider;
  model?: string;
  api_key?: string;
  api_base?: string | null;
}

export interface DatabaseStats {
  total_resumes: number;
  total_jobs: number;
  total_improvements: number;
  has_master_resume: boolean;
}

export interface SystemStatus {
  status: 'ready' | 'setup_required';
  llm_configured: boolean;
  llm_healthy: boolean;
  has_master_resume: boolean;
  database_stats: DatabaseStats;
}

export interface LLMHealthCheck {
  healthy: boolean;
  provider: string;
  model: string;
  error?: string;
  response_model?: string;
}

// Fetch full LLM configuration
export async function fetchLlmConfig(): Promise<LLMConfig> {
  const res = await apiFetch('/config/llm-api-key', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Failed to load LLM config (status ${res.status}).`);
  }

  return res.json();
}

// Legacy function for backwards compatibility
export async function fetchLlmApiKey(): Promise<string> {
  const config = await fetchLlmConfig();
  return config.api_key ?? '';
}

// Update LLM configuration
export async function updateLlmConfig(config: LLMConfigUpdate): Promise<LLMConfig> {
  const res = await apiFetch('/config/llm-api-key', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to update LLM config (status ${res.status}).`);
  }

  return res.json();
}

// Legacy function for backwards compatibility
export async function updateLlmApiKey(value: string): Promise<string> {
  const config = await updateLlmConfig({ api_key: value });
  return config.api_key ?? '';
}

// Test LLM connection
export async function testLlmConnection(): Promise<LLMHealthCheck> {
  const res = await apiFetch('/config/llm-test', {
    method: 'POST',
    credentials: 'include',
  });

  if (!res.ok) {
    throw new Error(`Failed to test LLM connection (status ${res.status}).`);
  }

  return res.json();
}

// Fetch system status
export async function fetchSystemStatus(): Promise<SystemStatus> {
  const res = await apiFetch('/status', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Failed to fetch system status (status ${res.status}).`);
  }

  return res.json();
}

// Provider display names and default models
export const PROVIDER_INFO: Record<
  LLMProvider,
  { name: string; defaultModel: string; requiresKey: boolean }
> = {
  openai: { name: 'OpenAI', defaultModel: 'gpt-4o-mini', requiresKey: true },
  anthropic: { name: 'Anthropic', defaultModel: 'claude-3-5-sonnet-20241022', requiresKey: true },
  openrouter: {
    name: 'OpenRouter',
    defaultModel: 'anthropic/claude-3.5-sonnet',
    requiresKey: true,
  },
  gemini: { name: 'Google Gemini', defaultModel: 'gemini-1.5-flash', requiresKey: true },
  deepseek: { name: 'DeepSeek', defaultModel: 'deepseek-chat', requiresKey: true },
  ollama: { name: 'Ollama (Local)', defaultModel: 'llama3.2', requiresKey: false },
};

// Feature configuration types
export interface FeatureConfig {
  enable_cover_letter: boolean;
  enable_outreach_message: boolean;
}

export interface FeatureConfigUpdate {
  enable_cover_letter?: boolean;
  enable_outreach_message?: boolean;
}

// Fetch feature configuration
export async function fetchFeatureConfig(): Promise<FeatureConfig> {
  const res = await apiFetch('/config/features', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Failed to load feature config (status ${res.status}).`);
  }

  return res.json();
}

// Update feature configuration
export async function updateFeatureConfig(config: FeatureConfigUpdate): Promise<FeatureConfig> {
  const res = await apiFetch('/config/features', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(config),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to update feature config (status ${res.status}).`);
  }

  return res.json();
}

// Language configuration types
export type SupportedLanguage = 'en' | 'es' | 'zh' | 'ja';

export interface LanguageConfig {
  ui_language: SupportedLanguage;
  content_language: SupportedLanguage;
  supported_languages: SupportedLanguage[];
}

export interface LanguageConfigUpdate {
  ui_language?: SupportedLanguage;
  content_language?: SupportedLanguage;
}

// Fetch language configuration
export async function fetchLanguageConfig(): Promise<LanguageConfig> {
  const res = await apiFetch('/config/language', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Failed to load language config (status ${res.status}).`);
  }

  return res.json();
}

// Update language configuration
export async function updateLanguageConfig(update: LanguageConfigUpdate): Promise<LanguageConfig> {
  const res = await apiFetch('/config/language', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(update),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to update language config (status ${res.status}).`);
  }

  return res.json();
}
