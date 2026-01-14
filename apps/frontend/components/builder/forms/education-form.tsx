'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Education } from '@/components/dashboard/resume-component';
import { Plus, Trash2 } from 'lucide-react';
import { useTranslations } from '@/lib/i18n';

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

      <div className="space-y-8">
        {data.map((item) => (
          <div key={item.id} className="p-6 border border-black bg-gray-50 relative group">
            <Button
              variant="ghost"
              size="icon"
              className="absolute top-2 right-2 opacity-0 group-hover:opacity-100 transition-opacity text-destructive hover:text-destructive hover:bg-destructive/10"
              onClick={() => handleRemove(item.id)}
            >
              <Trash2 className="w-4 h-4" />
            </Button>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4 pr-8">
              <div className="space-y-2">
                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
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
                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
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
                <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
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
              <Label className="font-mono text-xs uppercase tracking-wider text-gray-500">
                {t('builder.forms.education.fields.description')}{' '}
                <span className="text-gray-400">({t('common.optional')})</span>
              </Label>
              <Textarea
                value={item.description || ''}
                onChange={(e) => handleChange(item.id, 'description', e.target.value)}
                className="min-h-[60px] text-black text-sm rounded-none border-black bg-white"
                placeholder={t('builder.forms.education.placeholders.description')}
              />
            </div>
          </div>
        ))}

        {data.length === 0 && (
          <div className="text-center py-12 bg-gray-50 border border-dashed border-black">
            <p className="font-mono text-sm text-gray-500 mb-4">
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
        )}
      </div>
    </div>
  );
};
