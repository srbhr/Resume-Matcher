import React from 'react';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import DefaultLayout from '@/app/(default)/layout';
import { toast } from '@/components/ui/toaster';

// The providers are not under test: render their children as-is.
const { passthrough } = vi.hoisted(() => ({
  passthrough: ({ children }: { children: React.ReactNode }) => children,
}));
vi.mock('@/components/common/resume_previewer_context', () => ({
  ResumePreviewProvider: passthrough,
}));
vi.mock('@/lib/context/status-cache', () => ({ StatusCacheProvider: passthrough }));
vi.mock('@/lib/context/language-context', () => ({ LanguageProvider: passthrough }));
vi.mock('@/components/common/error-boundary', () => ({ LocalizedErrorBoundary: passthrough }));
vi.mock('@/components/common/motion-provider', () => ({ MotionProvider: passthrough }));
vi.mock('@/lib/context/effects-context', () => ({ EffectsProvider: passthrough }));
vi.mock('@/components/effects/block-dissolve-provider', () => ({
  BlockDissolveProvider: passthrough,
}));
vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));
// The App Router's next/dynamic, as in lazy-toaster.test.tsx.
vi.mock('next/dynamic', async () => await import('next/dist/api/app-dynamic'));

afterEach(() => {
  act(() => toast.dismiss());
});

describe('(default) layout', () => {
  it('mounts the toast stack, so pages that call toast() are seen (#1091)', async () => {
    render(
      <DefaultLayout>
        <p>page</p>
      </DefaultLayout>
    );
    act(() => {
      toast.success('Resume downloaded');
    });

    expect(await screen.findByText('Resume downloaded')).toBeInTheDocument();
    expect(screen.getByRole('region', { name: /common\.notifications/ })).toBeInTheDocument();
  });
});
