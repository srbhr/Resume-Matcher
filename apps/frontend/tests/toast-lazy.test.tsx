import { readFileSync } from 'node:fs';
import path from 'node:path';
import { act, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { toast } from '@/components/ui/toast';
import { Toaster, toast as sonnerToast } from '@/components/ui/toaster';

/**
 * Pages call `toast` from components/ui/toast, which loads sonner on first use.
 * Importing it from components/ui/toaster put sonner (about 11 KB gzip) in the
 * first-load JS of /builder and /resumes/[id].
 */

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

afterEach(() => {
  act(() => sonnerToast.dismiss());
});

describe('lazy toast', () => {
  it('lands in the mounted toast stack', async () => {
    render(<Toaster />);

    await act(async () => {
      await toast.success('Resume downloaded');
    });

    expect(await screen.findByText('Resume downloaded')).toBeInTheDocument();
  });

  it('is what pages import, so sonner stays out of their bundles', () => {
    for (const file of [
      'components/builder/resume-builder.tsx',
      'app/(default)/resumes/[id]/page.tsx',
    ]) {
      const source = readFileSync(path.join(__dirname, '..', file), 'utf8');
      expect(source).toMatch(/import \{ toast \} from '@\/components\/ui\/toast';/);
      expect(source).not.toMatch(/from '(sonner|@\/components\/ui\/toaster)'/);
    }
  });
});
