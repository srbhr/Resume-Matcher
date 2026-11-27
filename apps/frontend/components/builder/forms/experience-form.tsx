'use client';

import React, { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ToggleSwitch } from '@/components/ui/toggle-switch';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

import { Experience } from '@/components/dashboard/resume-component';
import { Plus } from '@phosphor-icons/react';
import { useTranslations } from '@/lib/i18n';
import { SortableItemList } from '../sortable-item-list';
import { EntryCard, entrySummary } from './entry-card';
import { DescriptionPointsEditor, type DescriptionPatch } from './description-points-editor';
import { duplicateById } from '@/lib/utils/reorder-items';

interface ExperienceFormProps {
  data: Experience[];
  onChange: (data: Experience[]) => void;
}

export const ExperienceForm: React.FC<ExperienceFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();
  const fieldId = useId();

  const handleAdd = () => {
    const newId = Math.max(...data.map((d) => d.id), 0) + 1;
    onChange([
      ...data,
      {
        id: newId,
        title: '',
        company: '',
        location: '',
        years: '',
        description: [''],
        descriptionStyles: ['bullet'],
      },
    ]);
  };

  const handleRemove = (id: number) => {
    onChange(data.filter((item) => item.id !== id));
  };

  const handleChange = (id: number, field: keyof Experience, value: string | string[]) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const handleCondensedChange = (id: number, condensed: boolean) => {
    onChange(data.map((item) => (item.id === id ? { ...item, condensed } : item)));
  };

  const handleDescriptionPatch = (id: number, patch: DescriptionPatch) => {
    onChange(data.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  return (
    <div className="space-y-6">
      {data.length === 0 ? (
        <EmptyState
          variant="framed"
          title={t('builder.genericItemForm.noEntries', { label: t('resume.sections.experience') })}
          action={
            <Button variant="outline" size="sm" onClick={handleAdd}>
              <Plus aria-hidden="true" />
              {t('builder.forms.experience.addFirstJob')}
            </Button>
          }
        />
      ) : (
        <SortableItemList
          id="experience-items"
          items={data}
          onReorder={onChange}
          animateItems
          handleInside
          className="space-y-4"
        >
          {(item, _index, handle) => (
            <EntryCard
              title={item.title || ''}
              summary={entrySummary(item.company, item.years)}
              handle={handle}
              onDuplicate={() => onChange(duplicateById(data, item.id))}
              onRemove={() => handleRemove(item.id)}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`${fieldId}-${item.id}-title`}>
                    {t('builder.forms.experience.fields.jobTitle')}
                  </Label>
                  <Input
                    id={`${fieldId}-${item.id}-title`}
                    value={item.title || ''}
                    onChange={(e) => handleChange(item.id, 'title', e.target.value)}
                    placeholder={t('builder.forms.experience.placeholders.jobTitle')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${fieldId}-${item.id}-company`}>
                    {t('builder.forms.experience.fields.company')}
                  </Label>
                  <Input
                    id={`${fieldId}-${item.id}-company`}
                    value={item.company || ''}
                    onChange={(e) => handleChange(item.id, 'company', e.target.value)}
                    placeholder={t('builder.forms.experience.placeholders.company')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${fieldId}-${item.id}-location`}>
                    {t('builder.genericItemForm.fields.location')}
                  </Label>
                  <Input
                    id={`${fieldId}-${item.id}-location`}
                    value={item.location || ''}
                    onChange={(e) => handleChange(item.id, 'location', e.target.value)}
                    placeholder={t('builder.forms.experience.placeholders.location')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${fieldId}-${item.id}-years`}>
                    {t('builder.genericItemForm.fields.years')}
                  </Label>
                  <Input
                    id={`${fieldId}-${item.id}-years`}
                    value={item.years || ''}
                    onChange={(e) => handleChange(item.id, 'years', e.target.value)}
                    placeholder={t('builder.forms.experience.placeholders.years')}
                  />
                </div>
              </div>

              <ToggleSwitch
                variant="inline"
                checked={Boolean(item.condensed)}
                onCheckedChange={(checked) => handleCondensedChange(item.id, checked)}
                label={t('builder.forms.experience.condense.label')}
                description={t('builder.forms.experience.condense.description')}
              />

              <DescriptionPointsEditor
                id={`experience-${item.id}-points`}
                description={item.description}
                descriptionStyles={item.descriptionStyles}
                placeholder={t('builder.forms.experience.placeholders.description')}
                onChange={(patch) => handleDescriptionPatch(item.id, patch)}
              />
            </EntryCard>
          )}
        </SortableItemList>
      )}

      {data.length > 0 && (
        <Button variant="outline" size="sm" className="w-full" onClick={handleAdd}>
          <Plus aria-hidden="true" />
          {t('builder.forms.experience.addJob')}
        </Button>
      )}
    </div>
  );
};
