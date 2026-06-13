import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  FeaturePromptsError,
  PROVIDER_INFO,
  updateFeaturePrompts,
  type LLMProvider,
} from '@/lib/api/config';

/**
 * Config-layer contracts: the provider table must stay in sync with the
 * LLMProvider union, and the feature-prompts 422 path must surface the
 * backend's structured `missing_placeholders` error as a typed exception.
 */

const ALL_PROVIDERS: LLMProvider[] = [
  'openai',
  'openai_compatible',
  'anthropic',
  'openrouter',
  'gemini',
  'deepseek',
  'groq',
  'ollama',
];

describe('PROVIDER_INFO', () => {
  it('has a complete entry for every supported provider', () => {
    for (const provider of ALL_PROVIDERS) {
      const info = PROVIDER_INFO[provider];
      expect(info, `missing PROVIDER_INFO for ${provider}`).toBeDefined();
      expect(info.name.length).toBeGreaterThan(0);
      expect(info.defaultModel.length).toBeGreaterThan(0);
      expect(typeof info.requiresKey).toBe('boolean');
    }
  });

  it('marks only local providers as not requiring a key', () => {
    expect(PROVIDER_INFO.ollama.requiresKey).toBe(false);
    expect(PROVIDER_INFO.openai_compatible.requiresKey).toBe(false);
    expect(PROVIDER_INFO.openai.requiresKey).toBe(true);
    expect(PROVIDER_INFO.anthropic.requiresKey).toBe(true);
  });
});

describe('FeaturePromptsError', () => {
  it('is an Error carrying the structured validation detail', () => {
    const detail = {
      code: 'missing_placeholders' as const,
      field: 'cover_letter_prompt' as const,
      missing: ['{resume_data}', '{output_language}'],
    };
    const err = new FeaturePromptsError(detail);
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('FeaturePromptsError');
    expect(err.detail).toEqual(detail);
    expect(err.message).toContain('cover_letter_prompt');
    expect(err.message).toContain('{resume_data}');
  });
});

describe('updateFeaturePrompts error mapping', () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('throws FeaturePromptsError on a 422 missing_placeholders response', async () => {
    const detail = {
      code: 'missing_placeholders',
      field: 'cover_letter_prompt',
      missing: ['{resume_data}'],
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail }), { status: 422 }));
    await expect(updateFeaturePrompts({ cover_letter_prompt: 'bad' })).rejects.toBeInstanceOf(
      FeaturePromptsError
    );
  });

  it('throws a generic Error with the string detail on other failures', async () => {
    fetchMock.mockResolvedValue(new Response(JSON.stringify({ detail: 'server boom' }), { status: 500 }));
    await expect(updateFeaturePrompts({ cover_letter_prompt: 'x' })).rejects.toThrow('server boom');
  });

  it('returns the parsed prompts on success', async () => {
    const prompts = {
      cover_letter_prompt: 'a',
      outreach_message_prompt: 'b',
      cover_letter_default: '',
      outreach_message_default: '',
    };
    fetchMock.mockResolvedValue(new Response(JSON.stringify(prompts), { status: 200 }));
    await expect(updateFeaturePrompts({ cover_letter_prompt: 'a' })).resolves.toEqual(prompts);
  });
});
