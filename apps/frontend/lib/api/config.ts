import { apiFetch } from './client';

// Supported LLM providers
export type LLMProvider =
  | 'openai'
  | 'openai_compatible'
  | 'anthropic'
  | 'openrouter'
  | 'gemini'
  | 'deepseek'
  | 'ollama';

// Reasoning-effort levels supported by LiteLLM. `null` (or absent) means
// "do not send the parameter" — the default for max compatibility.
export type ReasoningEffort = 'minimal' | 'low' | 'medium' | 'high';

export interface LLMConfig {
  provider: LLMProvider;
  model: string;
  api_key: string;
  api_base: string | null;
  reasoning_effort: ReasoningEffort | null;
}

export interface LLMConfigUpdate {
  provider?: LLMProvider;
  model?: string;
  api_key?: string;
  api_base?: string | null;
  // Pass '' (empty string) to clear; null is ignored by the server.
  reasoning_effort?: ReasoningEffort | '' | null;
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
  error_code?: string;
  response_model?: string;
  warning?: string;
  warning_code?: string;
  test_prompt?: string;
  model_output?: string;
  reasoning_content?: string | null;
  error_detail?: string;
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

// Test LLM connection with optional config (for pre-save testing)
export async function testLlmConnection(config?: LLMConfigUpdate): Promise<LLMHealthCheck> {
  const options: RequestInit = {
    method: 'POST',
    credentials: 'include',
  };

  // If config provided, send it in the request body
  if (config) {
    options.headers = { 'Content-Type': 'application/json' };
    options.body = JSON.stringify(config);
  }

  const res = await apiFetch('/config/llm-test', options);

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
  openai: { name: 'OpenAI', defaultModel: 'gpt-5-nano-2025-08-07', requiresKey: true },
  // OpenAI-compatible: llama.cpp, vLLM, LM Studio, and other servers that expose
  // the OpenAI Chat Completions API. Key is optional (most local servers don't
  // require auth); backend passes a sentinel when blank.
  openai_compatible: {
    name: 'OpenAI-Compatible (Local)',
    defaultModel: 'custom-model',
    requiresKey: false,
  },
  anthropic: { name: 'Anthropic', defaultModel: 'claude-haiku-4-5-20251001', requiresKey: true },
  openrouter: {
    name: 'OpenRouter',
    defaultModel: 'deepseek/deepseek-chat',
    requiresKey: true,
  },
  gemini: { name: 'Google Gemini', defaultModel: 'gemini-3-flash-preview', requiresKey: true },
  deepseek: { name: 'DeepSeek', defaultModel: 'deepseek-chat', requiresKey: true },
  ollama: { name: 'Ollama (Local)', defaultModel: 'gemma3:4b', requiresKey: false },
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
export type SupportedLanguage = 'en' | 'es' | 'zh' | 'ja' | 'pt';

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

export interface PromptOption {
  id: string;
  label: string;
  description: string;
}

export interface PromptConfig {
  default_prompt_id: string;
  prompt_options: PromptOption[];
}

export interface PromptConfigUpdate {
  default_prompt_id?: string;
}

// Fetch prompt configuration
export async function fetchPromptConfig(): Promise<PromptConfig> {
  const res = await apiFetch('/config/prompts', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Failed to load prompt config (status ${res.status}).`);
  }

  return res.json();
}

// Update prompt configuration
export async function updatePromptConfig(update: PromptConfigUpdate): Promise<PromptConfig> {
  const res = await apiFetch('/config/prompts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(update),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to update prompt config (status ${res.status}).`);
  }

  return res.json();
}

// Custom feature prompts (cover letter, cold outreach)
export interface FeaturePrompts {
  cover_letter_prompt: string;
  outreach_message_prompt: string;
  cover_letter_default: string;
  outreach_message_default: string;
}

export interface FeaturePromptsUpdate {
  cover_letter_prompt?: string;
  outreach_message_prompt?: string;
}

// 422 response shape when the user submits a prompt missing required
// placeholders. The backend lists each missing token so the UI can point
// users at exactly what's absent.
export interface FeaturePromptsValidationError {
  code: 'missing_placeholders';
  field: 'cover_letter_prompt' | 'outreach_message_prompt';
  missing: string[];
}

export class FeaturePromptsError extends Error {
  detail: FeaturePromptsValidationError;

  constructor(detail: FeaturePromptsValidationError) {
    super(`Invalid ${detail.field}: missing ${detail.missing.join(', ')}`);
    this.name = 'FeaturePromptsError';
    this.detail = detail;
  }
}

export async function fetchFeaturePrompts(): Promise<FeaturePrompts> {
  const res = await apiFetch('/config/feature-prompts', { credentials: 'include' });
  if (!res.ok) {
    throw new Error(`Failed to load feature prompts (status ${res.status}).`);
  }
  return res.json();
}

export async function updateFeaturePrompts(update: FeaturePromptsUpdate): Promise<FeaturePrompts> {
  const res = await apiFetch('/config/feature-prompts', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(update),
  });

  if (!res.ok) {
    // Error path: body may be absent or malformed, so we tolerate parse
    // failure. A fetch body is a one-shot stream — read it once and reuse
    // for both the 422-special-case and the generic fallback.
    const errBody = (await res.json().catch(() => ({}))) as {
      detail?: FeaturePromptsValidationError | string;
    };
    if (
      res.status === 422 &&
      typeof errBody.detail === 'object' &&
      errBody.detail?.code === 'missing_placeholders'
    ) {
      throw new FeaturePromptsError(errBody.detail);
    }
    // FastAPI can return ``detail`` as a string or a structured object.
    // Stringifying an object via the ``||`` shortcut yields "[object Object]";
    // serialize explicitly.
    let message: string;
    if (typeof errBody.detail === 'string') {
      message = errBody.detail;
    } else if (errBody.detail) {
      message = JSON.stringify(errBody.detail);
    } else {
      message = `Failed to update feature prompts (status ${res.status}).`;
    }
    throw new Error(message);
  }

  // Success path: require a valid JSON body. Swallowing parse errors here
  // would let an invalid success response be returned as FeaturePrompts
  // with undefined fields — caller code would then read .cover_letter_prompt
  // and get surprising behavior. Let the parse error propagate.
  return (await res.json()) as FeaturePrompts;
}

// API Key Management types
export type ApiKeyProvider = 'openai' | 'anthropic' | 'google' | 'openrouter' | 'deepseek';

export interface ApiKeyProviderStatus {
  provider: ApiKeyProvider;
  configured: boolean;
  masked_key: string | null;
}

export interface ApiKeyStatusResponse {
  providers: ApiKeyProviderStatus[];
}

export interface ApiKeysUpdateRequest {
  openai?: string;
  anthropic?: string;
  google?: string;
  openrouter?: string;
  deepseek?: string;
}

export interface ApiKeysUpdateResponse {
  message: string;
  updated_providers: string[];
}

// Provider display names for API keys
export const API_KEY_PROVIDER_INFO: Record<ApiKeyProvider, { name: string; description: string }> =
  {
    openai: { name: 'OpenAI', description: 'GPT-4, GPT-4o, etc.' },
    anthropic: { name: 'Anthropic', description: 'Claude 3.5, Claude 4, etc.' },
    google: { name: 'Google', description: 'Gemini 1.5, Gemini 2, etc.' },
    openrouter: { name: 'OpenRouter', description: 'Access multiple providers' },
    deepseek: { name: 'DeepSeek', description: 'DeepSeek chat models' },
  };

// Fetch API key status for all providers
export async function fetchApiKeyStatus(): Promise<ApiKeyStatusResponse> {
  const res = await apiFetch('/config/api-keys', { credentials: 'include' });

  if (!res.ok) {
    throw new Error(`Failed to load API key status (status ${res.status}).`);
  }

  return res.json();
}

// Update API keys for one or more providers
export async function updateApiKeys(keys: ApiKeysUpdateRequest): Promise<ApiKeysUpdateResponse> {
  const res = await apiFetch('/config/api-keys', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(keys),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to update API keys (status ${res.status}).`);
  }

  return res.json();
}

// Delete API key for a specific provider
export async function deleteApiKey(provider: ApiKeyProvider): Promise<void> {
  const res = await apiFetch(`/config/api-keys/${provider}`, {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to delete API key (status ${res.status}).`);
  }
}

// Clear all API keys
export async function clearAllApiKeys(): Promise<void> {
  const res = await apiFetch('/config/api-keys?confirm=CLEAR_ALL_KEYS', {
    method: 'DELETE',
    credentials: 'include',
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to clear API keys (status ${res.status}).`);
  }
}

// Reset database
export async function resetDatabase(): Promise<void> {
  const res = await apiFetch('/config/reset', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ confirm: 'RESET_ALL_DATA' }),
  });

  if (!res.ok) {
    const data = await res.json().catch(() => ({}));
    throw new Error(data.detail || `Failed to reset database (status ${res.status}).`);
  }
}
