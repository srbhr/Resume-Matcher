import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useRegenerateWizard } from '@/hooks/use-regenerate-wizard';
import { useEnrichmentWizard } from '@/hooks/use-enrichment-wizard';
import type { RegenerateResponse } from '@/lib/api/enrichment';

const api = vi.hoisted(() => ({
  generate: vi.fn(),
  apply: vi.fn(),
  analyze: vi.fn(),
  enhance: vi.fn(),
  applyEnhanced: vi.fn(),
}));
vi.mock('@/lib/api/enrichment', () => ({
  regenerateItems: api.generate,
  applyRegeneratedItems: api.apply,
  analyzeResume: api.analyze,
  generateEnhancements: api.enhance,
  applyEnhancements: api.applyEnhanced,
}));
const t = (key: string) => key;
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t }) }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

const selected = {
  item_id: 'exp_0',
  item_type: 'experience' as const,
  title: 'Engineer',
  current_content: ['Built tools'],
};
const generated: RegenerateResponse = {
  regenerated_items: [
    {
      ...selected,
      original_content: ['Built tools'],
      new_content: ['Built useful tools'],
      diff_summary: 'Clarity',
    },
  ],
  errors: [],
};
const analysis = {
  items_to_enrich: [
    {
      item_id: 'exp_0',
      item_type: 'experience',
      title: 'Engineer',
      current_description: ['Built tools'],
      weakness_reason: 'Detail',
    },
  ],
  questions: [{ question_id: 'q', item_id: 'exp_0', question: 'What tools?', placeholder: '' }],
};

beforeEach(() => {
  vi.resetAllMocks();
  api.generate.mockResolvedValue(generated);
  api.apply.mockResolvedValue({ message: 'Applied', updated_items: 1 });
  api.analyze.mockResolvedValue(analysis);
  api.enhance.mockResolvedValue({ enhancements: [] });
});

describe('regeneration hook commit and ownership boundaries', () => {
  it('retries only refresh after apply succeeds and refresh fails', async () => {
    const refresh = vi
      .fn()
      .mockRejectedValueOnce(new Error('Refresh offline'))
      .mockResolvedValue(undefined);
    const { result } = renderHook(() => useRegenerateWizard({ resumeId: 'r', onSuccess: refresh }));
    act(() => result.current.setSelectedItems([selected]));
    await act(async () => result.current.generate());
    await act(async () => result.current.acceptChanges());
    expect(result.current.error).not.toBeNull();
    await act(async () => result.current.acceptChanges());
    expect(api.apply).toHaveBeenCalledTimes(1);
    expect(refresh).toHaveBeenCalledTimes(2);
    expect(result.current.step).toBe('idle');
  });

  it('ignores generation after reset', async () => {
    const pending = deferred<RegenerateResponse>();
    api.generate.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useRegenerateWizard({ resumeId: 'r' }));
    act(() => result.current.setSelectedItems([selected]));
    let operation!: Promise<void>;
    act(() => {
      operation = result.current.generate();
    });
    act(() => result.current.reset());
    await act(async () => {
      pending.resolve(generated);
      await operation;
    });
    expect(result.current.step).toBe('idle');
    expect(result.current.regeneratedItems).toEqual([]);
  });

  it('does not refresh a different resume after late apply', async () => {
    const pending = deferred<unknown>();
    api.apply.mockReturnValue(pending.promise);
    const refresh = vi.fn();
    const { result, rerender } = renderHook(
      ({ id }) => useRegenerateWizard({ resumeId: id, onSuccess: refresh }),
      { initialProps: { id: 'a' } }
    );
    act(() => result.current.setSelectedItems([selected]));
    await act(async () => result.current.generate());
    let operation!: Promise<void>;
    act(() => {
      operation = result.current.acceptChanges();
    });
    rerender({ id: 'b' });
    await act(async () => {
      pending.resolve({});
      await operation;
    });
    expect(refresh).not.toHaveBeenCalled();
    expect(result.current.step).toBe('idle');
  });
});

describe('enrichment hook ownership', () => {
  it('ignores analysis after reset', async () => {
    const pending = deferred<typeof analysis>();
    api.analyze.mockReturnValue(pending.promise);
    const { result } = renderHook(() => useEnrichmentWizard('a'));
    let operation!: Promise<void>;
    act(() => {
      operation = result.current.startAnalysis();
    });
    act(() => result.current.reset());
    await act(async () => {
      pending.resolve(analysis);
      await operation;
    });
    expect(result.current.state.step).toBe('idle');
    expect(result.current.state.items).toEqual([]);
  });

  it('does not accept analysis belonging to a previous resume', async () => {
    const pending = deferred<typeof analysis>();
    api.analyze.mockReturnValue(pending.promise);
    const { result, rerender } = renderHook(({ id }) => useEnrichmentWizard(id), {
      initialProps: { id: 'a' },
    });
    let operation!: Promise<void>;
    act(() => {
      operation = result.current.startAnalysis();
    });
    rerender({ id: 'b' });
    await act(async () => {
      pending.resolve(analysis);
      await operation;
    });
    expect(result.current.state.step).toBe('idle');
  });

  it('retries the failed generation stage without another analysis', async () => {
    api.enhance
      .mockRejectedValueOnce(new Error('Transient'))
      .mockResolvedValue({ enhancements: [] });
    const { result } = renderHook(() => useEnrichmentWizard('a'));
    await act(async () => result.current.startAnalysis());
    act(() => result.current.setAnswer('q', 'Python tools'));
    await act(async () => result.current.generateEnhancements());
    act(() => result.current.retry());
    await act(async () => result.current.generateEnhancements());
    expect(api.analyze).toHaveBeenCalledTimes(1);
    expect(api.enhance).toHaveBeenCalledTimes(2);
    expect(result.current.state.step).toBe('preview');
  });
});

describe('enrichment partial-result visibility', () => {
  it('retains item errors through a failed apply and its preview retry', async () => {
    const enhancements = [
      {
        item_id: 'exp_0',
        item_type: 'experience',
        title: 'Engineer',
        original_description: ['Built tools'],
        enhanced_description: ['Built Python tools'],
      },
    ];
    const errors = [
      {
        item_id: 'project_0',
        item_type: 'project',
        title: 'Portfolio',
        message: 'Enhancement unavailable. Please try again.',
      },
    ];
    api.enhance.mockResolvedValue({ enhancements, errors });
    api.applyEnhanced.mockRejectedValue(new Error('Save offline'));
    const { result } = renderHook(() => useEnrichmentWizard('a'));
    await act(async () => result.current.startAnalysis());
    act(() => result.current.setAnswer('q', 'Python tools'));
    await act(async () => result.current.generateEnhancements());
    expect(result.current.state.itemErrors).toEqual(errors);
    expect(result.current.state.preview).toEqual(enhancements);
    await act(async () => result.current.applyChanges());
    act(() => result.current.retry());
    expect(result.current.state.step).toBe('preview');
    expect(result.current.state.itemErrors).toEqual(errors);
    expect(api.applyEnhanced).toHaveBeenCalledWith('a', enhancements);
    act(() => result.current.reset());
    expect(result.current.state.itemErrors).toEqual([]);
  });
});

it('rejects blank enrichment answers before requesting generation and returns to questions on retry', async () => {
  const { result } = renderHook(() => useEnrichmentWizard('a'));
  await act(async () => result.current.startAnalysis());
  act(() => result.current.setAnswer('q', '  '));
  await act(async () => result.current.generateEnhancements());
  expect(api.enhance).not.toHaveBeenCalled();
  expect(result.current.state.error).toBe('enrichment.error.answerRequired');
  act(() => result.current.retry());
  expect(result.current.state.step).toBe('questions');
});
