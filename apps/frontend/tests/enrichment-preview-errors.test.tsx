import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { PreviewStep } from '@/components/enrichment/preview-step';

vi.mock('@/lib/i18n', () => ({ useTranslations: () => ({ t: (key: string) => key }) }));

describe('partial enrichment preview', () => {
  it('identifies failed items while keeping the successful preview actionable', () => {
    render(
      <PreviewStep
        enhancements={[
          {
            item_id: 'exp_0',
            item_type: 'experience',
            title: 'Engineer',
            original_description: ['Built tools'],
            enhanced_description: ['Built Python tools'],
          },
        ]}
        errors={[
          {
            item_id: 'project_0',
            item_type: 'project',
            title: 'Portfolio',
            message: 'Enhancement unavailable. Please try again.',
          },
        ]}
        onApply={vi.fn()}
        onCancel={vi.fn()}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('enrichment.preview.partialFailure');
    expect(screen.getByRole('alert')).toHaveTextContent('Portfolio');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Enhancement unavailable. Please try again.'
    );
    expect(screen.getByText('Built Python tools')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'enrichment.preview.applyButton' })).toBeEnabled();
  });
});
