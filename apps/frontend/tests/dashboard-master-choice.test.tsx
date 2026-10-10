import { describe, expect, it, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { MasterResumeChoiceDialog } from '@/components/dashboard/master-resume-choice-dialog';

vi.mock('@/lib/i18n', () => ({
  useTranslations: () => ({
    t: (key: string) => key,
  }),
}));

describe('MasterResumeChoiceDialog', () => {
  it('offers upload and AI wizard choices and calls the selected handlers', () => {
    const onChooseUpload = vi.fn();
    const onChooseWizard = vi.fn();

    render(
      <MasterResumeChoiceDialog
        open
        onOpenChange={vi.fn()}
        onChooseUpload={onChooseUpload}
        onChooseWizard={onChooseWizard}
      />
    );

    expect(screen.getByText('resumeWizard.entry.upload.title')).toBeInTheDocument();
    expect(screen.getByText('resumeWizard.entry.wizard.title')).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.entry.wizard.action' }));
    expect(onChooseWizard).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole('button', { name: 'resumeWizard.entry.upload.action' }));
    expect(onChooseUpload).toHaveBeenCalledTimes(1);
  });

  it('frames both choice cards identically: 1px ink border and the nested shadow', () => {
    render(
      <MasterResumeChoiceDialog
        open
        onOpenChange={vi.fn()}
        onChooseUpload={vi.fn()}
        onChooseWizard={vi.fn()}
      />
    );

    const upload = screen.getByText('resumeWizard.entry.upload.title').closest('section')!;
    const wizard = screen.getByText('resumeWizard.entry.wizard.title').closest('section')!;
    for (const card of [upload, wizard]) {
      expect(card).toHaveClass('border', 'border-ink', 'shadow-sw-nested');
      expect(card.className).not.toMatch(/border-2|border-black|shadow-sw-default/);
    }
    expect(upload.className).toBe(wizard.className);
  });
});
