'use client';

import React, { useId } from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

import { Project } from '@/components/dashboard/resume-component';
import { Plus, Globe } from '@phosphor-icons/react';
import { BrandIcon } from '@/components/ui/brand-icon';
import { useTranslations } from '@/lib/i18n';
import { SortableItemList } from '../sortable-item-list';
import { EntryCard, entrySummary } from './entry-card';
import { DescriptionPointsEditor, type DescriptionPatch } from './description-points-editor';
import { duplicateById } from '@/lib/utils/reorder-items';

interface ProjectsFormProps {
  data: Project[];
  onChange: (data: Project[]) => void;
}

export const ProjectsForm: React.FC<ProjectsFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();
  const fieldId = useId();

  const handleAdd = () => {
    const newId = Math.max(...data.map((d) => d.id), 0) + 1;
    onChange([
      ...data,
      {
        id: newId,
        name: '',
        role: '',
        years: '',
        github: '',
        website: '',
        description: [''],
        descriptionStyles: ['bullet'],
      },
    ]);
  };

  const handleRemove = (id: number) => {
    onChange(data.filter((item) => item.id !== id));
  };

  const handleChange = (id: number, field: keyof Project, value: string | string[]) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  const handleDescriptionPatch = (id: number, patch: DescriptionPatch) => {
    onChange(data.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  return (
    <div className="space-y-6">
      {data.length === 0 ? (
        <EmptyState
          variant="framed"
          title={t('builder.genericItemForm.noEntries', { label: t('resume.sections.projects') })}
          action={
            <Button variant="outline" size="sm" onClick={handleAdd}>
              <Plus aria-hidden="true" />
              {t('builder.forms.projects.addFirstProject')}
            </Button>
          }
        />
      ) : (
        <SortableItemList
          id="projects-items"
          items={data}
          onReorder={onChange}
          animateItems
          handleInside
          className="space-y-4"
        >
          {(item, _index, handle) => (
            <EntryCard
              title={item.name || ''}
              summary={entrySummary(item.role, item.years)}
              handle={handle}
              onDuplicate={() => onChange(duplicateById(data, item.id))}
              onRemove={() => handleRemove(item.id)}
            >
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor={`${fieldId}-${item.id}-name`}>
                    {t('builder.forms.projects.fields.projectName')}
                  </Label>
                  <Input
                    id={`${fieldId}-${item.id}-name`}
                    value={item.name || ''}
                    onChange={(e) => handleChange(item.id, 'name', e.target.value)}
                    placeholder={t('builder.forms.projects.placeholders.projectName')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${fieldId}-${item.id}-role`}>
                    {t('builder.forms.projects.fields.role')}
                  </Label>
                  <Input
                    id={`${fieldId}-${item.id}-role`}
                    value={item.role || ''}
                    onChange={(e) => handleChange(item.id, 'role', e.target.value)}
                    placeholder={t('builder.forms.projects.placeholders.role')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${fieldId}-${item.id}-years`}>
                    {t('builder.genericItemForm.fields.years')}{' '}
                    <span className="text-steel">({t('common.optional')})</span>
                  </Label>
                  <Input
                    id={`${fieldId}-${item.id}-years`}
                    value={item.years || ''}
                    onChange={(e) => handleChange(item.id, 'years', e.target.value)}
                    placeholder={t('builder.forms.projects.placeholders.years')}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor={`${fieldId}-${item.id}-github`}>
                    <BrandIcon name="github" className="size-4 inline mr-1" />
                    GitHub <span className="text-steel">({t('common.optional')})</span>
                  </Label>
                  <Input
                    id={`${fieldId}-${item.id}-github`}
                    value={item.github || ''}
                    onChange={(e) => handleChange(item.id, 'github', e.target.value)}
                    placeholder={t('builder.forms.projects.placeholders.github')}
                  />
                </div>
                <div className="space-y-2 md:col-span-2">
                  <Label htmlFor={`${fieldId}-${item.id}-website`}>
                    <Globe aria-hidden="true" className="size-4 inline mr-1" />
                    {t('builder.forms.projects.fields.website')}{' '}
                    <span className="text-steel">({t('common.optional')})</span>
                  </Label>
                  <Input
                    id={`${fieldId}-${item.id}-website`}
                    value={item.website || ''}
                    onChange={(e) => handleChange(item.id, 'website', e.target.value)}
                    placeholder={t('builder.forms.projects.placeholders.website')}
                  />
                </div>
              </div>

              <DescriptionPointsEditor
                id={`projects-${item.id}-points`}
                description={item.description}
                descriptionStyles={item.descriptionStyles}
                placeholder={t('builder.forms.projects.placeholders.description')}
                onChange={(patch) => handleDescriptionPatch(item.id, patch)}
              />
            </EntryCard>
          )}
        </SortableItemList>
      )}

      {data.length > 0 && (
        <Button variant="outline" size="sm" className="w-full" onClick={handleAdd}>
          <Plus aria-hidden="true" />
          {t('builder.forms.projects.addProject')}
        </Button>
      )}
    </div>
  );
};
