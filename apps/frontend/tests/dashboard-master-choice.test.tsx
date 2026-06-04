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
});
