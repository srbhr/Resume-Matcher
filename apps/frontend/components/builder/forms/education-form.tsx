'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Education } from '@/components/dashboard/resume-component';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';
import { SortableItemList } from '../sortable-item-list';

interface EducationFormProps {
  data: Education[];
  onChange: (data: Education[]) => void;
}

export const EducationForm: React.FC<EducationFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();

  const handleAdd = () => {
    const newId = Math.max(...data.map((d) => d.id), 0) + 1;
    onChange([
      ...data,
      {
        id: newId,
        institution: '',
        degree: '',
        years: '',
        description: '',
      },
    ]);
  };

  const handleRemove = (id: number) => {
    onChange(data.filter((item) => item.id !== id));
  };

  const handleChange = (id: number, field: keyof Education, value: string) => {
    onChange(
      data.map((item) => {
        if (item.id === id) {
          return { ...item, [field]: value };
        }
        return item;
      })
    );
  };

  return (
    <div className="space-y-6">
      <div className="flex justify-end">
        <Button
          variant="outline"
          size="sm"
          onClick={handleAdd}
          className="rounded-none border-black hover:bg-black hover:text-white transition-colors"
        >
          <Plus className="w-4 h-4 mr-2" /> {t('builder.forms.education.addSchool')}
        </Button>
      </div>

      {data.length === 0 ? (
        <div className="text-center py-12 bg-paper-tint border border-dashed border-black">
          <p className="font-mono text-sm text-steel-grey mb-4">
            {t('builder.genericItemForm.noEntries', { label: t('resume.sections.education') })}
          </p>
          <Button
            variant="outline"
            size="sm"
            onClick={handleAdd}
            className="rounded-none border-black"
          >
            <Plus className="w-4 h-4 mr-2" /> {t('builder.forms.education.addFirstSchool')}
          </Button>
        </div>
      ) : (
        <SortableItemList id="education-items" items={data} onReorder={onChange}>
          {(item) => (
            <div className="p-6 border border-black bg-paper-tint relative group">
              <Button
                variant="ghost"
                size="icon"
                className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
                onClick={() => handleRemove(item.id)}
                aria-label={t('a11y.removeItem')}
                title={t('a11y.removeItem')}
              >
                <Trash2 className="w-4 h-4" />
              </Button>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pr-8">
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase tracking-wider text-steel-grey">
                    {t('builder.forms.education.fields.institution')}
                  </Label>
                  <Input
                    value={item.institution || ''}
                    onChange={(e) => handleChange(item.id, 'institution', e.target.value)}
                    placeholder={t('builder.forms.education.placeholders.institution')}
                    className="rounded-none border-black bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase tracking-wider text-steel-grey">
                    {t('builder.forms.education.fields.degree')}
                  </Label>
                  <Input
                    value={item.degree || ''}
                    onChange={(e) => handleChange(item.id, 'degree', e.target.value)}
                    placeholder={t('builder.forms.education.placeholders.degree')}
                    className="rounded-none border-black bg-white"
                  />
                </div>
                <div className="space-y-2">
                  <Label className="font-mono text-xs uppercase tracking-wider text-steel-grey">
                    {t('builder.genericItemForm.fields.years')}
                  </Label>
                  <Input
                    value={item.years || ''}
                    onChange={(e) => handleChange(item.id, 'years', e.target.value)}
                    placeholder={t('builder.forms.education.placeholders.years')}
                    className="rounded-none border-black bg-white"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-steel-grey">
                  {t('builder.forms.education.fields.descriptionOptional')}
                </Label>
                <Textarea
                  value={item.description || ''}
                  onChange={(e) => handleChange(item.id, 'description', e.target.value)}
                  className="min-h-[60px] text-black text-sm rounded-none border-black bg-white"
                  placeholder={t('builder.forms.education.placeholders.description')}
                />
              </div>
            </div>
          )}
        </SortableItemList>
      )}
    </div>
  );
};
