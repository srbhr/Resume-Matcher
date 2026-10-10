'use client';

import {
  Dialog,
  DialogBody,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';
import Upload from 'lucide-react/dist/esm/icons/upload';
import Bot from 'lucide-react/dist/esm/icons/bot';

interface MasterResumeChoiceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onChooseUpload: () => void;
  onChooseWizard: () => void;
}

export function MasterResumeChoiceDialog({
  open,
  onOpenChange,
  onChooseUpload,
  onChooseWizard,
}: MasterResumeChoiceDialogProps) {
  const { t } = useTranslations();

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent size="lg">
        <DialogHeader>
          <p className="font-mono text-xs font-bold uppercase tracking-wider text-blue-700">
            {t('resumeWizard.entry.kicker')}
          </p>
          <DialogTitle>{t('resumeWizard.entry.title')}</DialogTitle>
          <DialogDescription className="font-sans text-sm text-steel-grey">
            {t('resumeWizard.entry.description')}
          </DialogDescription>
        </DialogHeader>

        <DialogBody className="grid gap-4 md:grid-cols-2">
          <section className="flex min-h-64 flex-col border-2 border-black bg-white p-5">
            <div className="mb-6 flex h-12 w-12 items-center justify-center border-2 border-black bg-background">
              <Upload className="h-6 w-6 text-black" aria-hidden="true" />
            </div>
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-steel-grey">
              {t('resumeWizard.entry.upload.kicker')}
            </p>
            <h3 className="mt-2 font-serif text-2xl font-bold leading-tight">
              {t('resumeWizard.entry.upload.title')}
            </h3>
            <p className="mt-3 font-sans text-sm text-steel-grey">
              {t('resumeWizard.entry.upload.description')}
            </p>
            <Button variant="outline" className="mt-auto w-full" onClick={onChooseUpload}>
              {t('resumeWizard.entry.upload.action')}
            </Button>
          </section>

          <section className="flex min-h-64 flex-col border-2 border-black bg-white p-5 shadow-[4px_4px_0px_0px_#000000]">
            <div className="mb-6 flex h-12 w-12 items-center justify-center border-2 border-black bg-blue-700 text-white">
              <Bot className="h-6 w-6" aria-hidden="true" />
            </div>
            <p className="font-mono text-xs font-bold uppercase tracking-wider text-blue-700">
              {t('resumeWizard.entry.wizard.kicker')}
            </p>
            <h3 className="mt-2 font-serif text-2xl font-bold leading-tight">
              {t('resumeWizard.entry.wizard.title')}
            </h3>
            <p className="mt-3 font-sans text-sm text-steel-grey">
              {t('resumeWizard.entry.wizard.description')}
            </p>
            <Button className="mt-auto w-full" onClick={onChooseWizard}>
              {t('resumeWizard.entry.wizard.action')}
            </Button>
          </section>
        </DialogBody>
      </DialogContent>
    </Dialog>
  );
}
