'use client';
import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useTranslations } from '@/lib/i18n';
import type { ContactFields } from '@/components/create/wizard-script';

const FIELDS: (keyof ContactFields)[] = [
  'location',
  'phone',
  'email',
  'linkedin',
  'github',
  'website',
];

export function ContactFieldsForm({
  initial,
  onSubmit,
}: {
  initial: ContactFields;
  onSubmit: (c: ContactFields) => void;
}) {
  const { t } = useTranslations();
  const [values, setValues] = useState<ContactFields>(initial);
  return (
    <div className="border border-black bg-canvas p-4 shadow-sw-default">
      <p className="mb-3 font-serif text-lg">{t('create.contactTitle')}</p>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {FIELDS.map((f) => (
          <div key={f}>
            <Label htmlFor={`contact-${f}`}>{t(`create.contact.${f}`)}</Label>
            <Input
              id={`contact-${f}`}
              value={values[f] ?? ''}
              onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value }))}
            />
          </div>
        ))}
      </div>
      <div className="mt-4">
        <Button onClick={() => onSubmit(values)}>{t('create.contactContinue')}</Button>
      </div>
    </div>
  );
}
