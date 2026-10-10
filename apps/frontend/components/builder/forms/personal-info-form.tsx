'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { PersonalInfo } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';

interface PersonalInfoFormProps {
  data: PersonalInfo;
  onChange: (data: PersonalInfo) => void;
}

export const PersonalInfoForm: React.FC<PersonalInfoFormProps> = ({ data, onChange }) => {
  const { t } = useTranslations();

  const handleChange = (field: keyof PersonalInfo, value: string) => {
    onChange({
      ...data,
      [field]: value,
    });
  };

  return (
    <div className="ml-4 space-y-4 border border-ink p-6 bg-white shadow-sw-default">
      <h3 className="font-serif text-xl font-bold border-b border-ink pb-2 mb-4">
        {t('builder.personalInfo')}
      </h3>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="name">{t('resume.personalInfo.name')}</Label>
          <Input
            id="name"
            autoComplete="name"
            value={data.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.name')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="title">{t('resume.personalInfo.title')}</Label>
          <Input
            id="title"
            autoComplete="organization-title"
            value={data.title || ''}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.title')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="email">{t('resume.personalInfo.email')}</Label>
          <Input
            id="email"
            autoComplete="email"
            type="email"
            value={data.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.email')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="phone">{t('resume.personalInfo.phone')}</Label>
          <Input
            id="phone"
            autoComplete="tel"
            type="tel"
            value={data.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.phone')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="location">{t('resume.personalInfo.location')}</Label>
          <Input
            id="location"
            value={data.location || ''}
            onChange={(e) => handleChange('location', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.location')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="website">{t('resume.personalInfo.website')}</Label>
          <Input
            id="website"
            autoComplete="url"
            inputMode="url"
            value={data.website || ''}
            onChange={(e) => handleChange('website', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.website')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="linkedin">{t('resume.personalInfo.linkedin')}</Label>
          <Input
            id="linkedin"
            value={data.linkedin || ''}
            onChange={(e) => handleChange('linkedin', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.linkedin')}
          />
        </div>
        <div className="space-y-2">
          <Label htmlFor="github">{t('resume.personalInfo.github')}</Label>
          <Input
            id="github"
            value={data.github || ''}
            onChange={(e) => handleChange('github', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.github')}
          />
        </div>
      </div>
    </div>
  );
};
