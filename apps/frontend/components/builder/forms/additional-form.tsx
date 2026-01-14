'use client';

import React from 'react';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { AdditionalInfo } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';

interface AdditionalFormProps {
  data: AdditionalInfo;
  onChange: (data: AdditionalInfo) => void;
}

export const AdditionalForm: React.FC<AdditionalFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();

  // Helper to handle array conversions (text -> string[])
  const handleArrayChange = (field: keyof AdditionalInfo, value: string) => {
    // Split by newlines only (preserving spaces within items)
    const items = value.split('\n').filter((item) => item.trim() !== '');
    onChange({
      ...data,
      [field]: items,
    });
  };

  const formatArray = (arr?: string[]) => {
    return arr?.join('\n') || '';
  };

  // Explicitly allow Enter key to create newlines (prevent form submission interference)
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') {
      // Allow default behavior (newline insertion)
      e.stopPropagation();
    }
  };

  return (
    <div className="space-y-6">
      <p className="font-mono text-xs text-blue-700 border-l-2 border-blue-700 pl-3">
        {t('builder.additionalForm.instructions')}
      </p>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-2">
          <Label
            htmlFor="technicalSkills"
            className="font-mono text-xs uppercase tracking-wider text-gray-500"
          >
            {t('resume.additional.technicalSkills')}
          </Label>
          <Textarea
            id="technicalSkills"
            value={formatArray(data.technicalSkills)}
            onChange={(e) => handleArrayChange('technicalSkills', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('builder.additionalForm.placeholders.technicalSkills')}
            className="min-h-[120px] text-black rounded-none border-black bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="languages"
            className="font-mono text-xs uppercase tracking-wider text-gray-500"
          >
            {t('resume.sections.languages')}
          </Label>
          <Textarea
            id="languages"
            value={formatArray(data.languages)}
            onChange={(e) => handleArrayChange('languages', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('builder.additionalForm.placeholders.languages')}
            className="min-h-[120px] text-black rounded-none border-black bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="certifications"
            className="font-mono text-xs uppercase tracking-wider text-gray-500"
          >
            {t('resume.sections.certifications')}
          </Label>
          <Textarea
            id="certifications"
            value={formatArray(data.certificationsTraining)}
            onChange={(e) => handleArrayChange('certificationsTraining', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('builder.additionalForm.placeholders.certifications')}
            className="min-h-[120px] text-black rounded-none border-black bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="awards"
            className="font-mono text-xs uppercase tracking-wider text-gray-500"
          >
            {t('resume.sections.awards')}
          </Label>
          <Textarea
            id="awards"
            value={formatArray(data.awards)}
            onChange={(e) => handleArrayChange('awards', e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={t('builder.additionalForm.placeholders.awards')}
            className="min-h-[120px] text-black rounded-none border-black bg-white focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700"
          />
        </div>
      </div>
    </div>
  );
};
