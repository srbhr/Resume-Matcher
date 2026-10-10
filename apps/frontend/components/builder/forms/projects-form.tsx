'use client';

import React, { useId } from 'react';
import dynamic from 'next/dynamic';
import { Input } from '@/components/ui/input';
import { Label, labelClass } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/ui/empty-state';

// Lazy-load TipTap-based editor — keeps it out of the initial bundle.
const RichTextEditor = dynamic(
  () => import('@/components/ui/rich-text-editor').then((m) => m.RichTextEditor),
  {
    ssr: false,
    loading: () => (
      <div className="min-h-[100px] border border-ink bg-transparent" aria-busy="true" />
    ),
  }
);
import { Project } from '@/components/dashboard/resume-component';
import {
  TextAlignLeft,
  Copy,
  ListBullets,
  Plus,
  Trash,
  GithubLogo,
  Globe,
} from '@phosphor-icons/react';
import { useTranslations } from '@/lib/i18n';
import {
  alignDescriptionStyles,
  fromDescriptionRows,
  toDescriptionRows,
  toggleDescriptionStyle,
  type DescriptionRow,
} from '@/lib/utils/description-styles';
import { SortableItemList } from '../sortable-item-list';
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

  const handleDescriptionChange = (id: number, index: number, value: string) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          const newDesc = [...(item.description || [])];
          newDesc[index] = value;
          return { ...item, description: newDesc };
        }
        return item;
      })
    );
  };

  const handleAddDescription = (id: number) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            description: [...(item.description || []), ''],
            descriptionStyles: [...(item.descriptionStyles || []), 'bullet'],
          };
        }
        return item;
      })
    );
  };

  const handleToggleDescriptionStyle = (id: number, index: number) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          return {
            ...item,
            descriptionStyles: toggleDescriptionStyle(
              item.description,
              item.descriptionStyles,
              index
            ),
          };
        }
        return item;
      })
    );
  };

  const handleReorderDescriptions = (id: number, rows: DescriptionRow[]) => {
    onChange(
      data.map((item) => (item.id === id ? { ...item, ...fromDescriptionRows(rows) } : item))
    );
  };

  const handleRemoveDescription = (id: number, index: number) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          const newDesc = [...(item.description || [])];
          newDesc.splice(index, 1);
          const newStyles = alignDescriptionStyles(item.description, item.descriptionStyles);
          newStyles.splice(index, 1);
          return { ...item, description: newDesc, descriptionStyles: newStyles };
        }
        return item;
      })
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button variant="outline" size="sm" onClick={handleAdd}>
          <Plus aria-hidden="true" />
          {t('builder.forms.projects.addProject')}
        </Button>
      </div>

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
        <SortableItemList id="projects-items" items={data} onReorder={onChange} animateItems>
          {(item) => (
            <div className="p-6 border border-ink bg-paper relative group">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-16 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-steel hover:text-ink-soft"
                onClick={() => onChange(duplicateById(data, item.id))}
                aria-label={t('a11y.duplicateItem')}
                title={t('a11y.duplicateItem')}
              >
                <Copy aria-hidden="true" />
              </Button>

              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive-tint"
                onClick={() => handleRemove(item.id)}
                aria-label={t('a11y.removeItem')}
                title={t('a11y.removeItem')}
              >
                <Trash aria-hidden="true" />
              </Button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pr-24">
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
                    <GithubLogo aria-hidden="true" className="size-4 inline mr-1" />
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

              <div className="space-y-3">
                <div className="flex justify-between items-center">
                  <span className={labelClass}>
                    {t('builder.genericItemForm.fields.descriptionPoints')}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleAddDescription(item.id)}
                    className="h-6 text-xs text-primary hover:text-primary-hover hover:bg-info-tint"
                  >
                    <Plus aria-hidden="true" />
                    {t('builder.genericItemForm.actions.addPoint')}
                  </Button>
                </div>
                {item.description?.length ? (
                  <SortableItemList
                    id={`projects-${item.id}-points`}
                    items={toDescriptionRows(item.description, item.descriptionStyles)}
                    onReorder={(rows) => handleReorderDescriptions(item.id, rows)}
                    className="space-y-3"
                    handleLabel={t('builder.genericItemForm.actions.reorderPoint')}
                  >
                    {({ text: desc, style }, idx) => (
                      <div className="flex gap-3">
                        <div className="flex-1">
                          <RichTextEditor
                            value={desc}
                            onChange={(html) => handleDescriptionChange(item.id, idx, html)}
                            placeholder={t('builder.forms.projects.placeholders.description')}
                            minHeight="60px"
                          />
                        </div>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleToggleDescriptionStyle(item.id, idx)}
                          className="text-steel hover:text-primary self-end"
                          aria-label={t('builder.genericItemForm.actions.togglePointStyle')}
                          title={t('builder.genericItemForm.actions.togglePointStyle')}
                        >
                          {style === 'plain' ? (
                            <TextAlignLeft aria-hidden="true" />
                          ) : (
                            <ListBullets aria-hidden="true" />
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon-sm"
                          onClick={() => handleRemoveDescription(item.id, idx)}
                          className="text-steel hover:text-destructive self-end"
                          aria-label={t('a11y.removeDescription')}
                          title={t('a11y.removeDescription')}
                        >
                          <Trash aria-hidden="true" />
                        </Button>
                      </div>
                    )}
                  </SortableItemList>
                ) : null}
              </div>
            </div>
          )}
        </SortableItemList>
      )}
    </div>
  );
};
