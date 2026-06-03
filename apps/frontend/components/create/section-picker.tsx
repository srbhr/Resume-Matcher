'use client';
import { Button } from '@/components/ui/button';
import { useTranslations } from '@/lib/i18n';
import type { SectionKind } from '@/lib/api/create';

type Pickable = Exclude<SectionKind, 'summary'>;
const PICKABLE: Pickable[] = ['work', 'education', 'project', 'skills'];

export function SectionPicker({
  onPick,
  onFinish,
  canFinish,
}: {
  onPick: (s: Pickable) => void;
  onFinish: () => void;
  canFinish: boolean;
}) {
  const { t } = useTranslations();
  return (
    <div className="flex flex-wrap gap-2">
      {PICKABLE.map((s) => (
        <Button key={s} variant="outline" onClick={() => onPick(s)}>
          {t(`create.sections.${s}`)}
        </Button>
      ))}
      <Button variant="success" disabled={!canFinish} onClick={onFinish}>
        {t('create.done')}
      </Button>
    </div>
  );
}
