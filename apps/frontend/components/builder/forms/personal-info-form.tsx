'use client';

import React from 'react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { type PersonalInfo, type PhotoMutation } from '@/components/dashboard/resume-component';
import { useTranslations } from '@/lib/i18n';
import { ProfilePhotoField } from '@/components/builder/profile-photo-field';

interface PersonalInfoFormProps {
  data: PersonalInfo;
  onChange: (data: PersonalInfo) => void;
  resumeId?: string | null;
  onPhotoUpload?: (file: File, mutation: PhotoMutation) => Promise<void>;
  onPhotoEdit?: (mutation: PhotoMutation) => Promise<void>;
  onPhotoRemove?: () => Promise<void>;
  onPhotoEditorOpenChange?: (open: boolean) => void;
  photoEditRequestToken?: number;
  photoActionsDisabled?: boolean;
}

export const PersonalInfoForm: React.FC<PersonalInfoFormProps> = ({
  data,
  onChange,
  resumeId,
  onPhotoUpload,
  onPhotoEdit,
  onPhotoRemove,
  onPhotoEditorOpenChange,
  photoEditRequestToken,
  photoActionsDisabled,
}) => {
  const { t } = useTranslations();

  const handleChange = (field: keyof PersonalInfo, value: string) => {
    onChange({
      ...data,
      [field]: value,
    });
  };

  return (
    <div className="space-y-4 border border-black p-6 bg-white shadow-sw-default">
      <h3 className="font-serif text-xl font-bold border-b border-black pb-2 mb-4">
        {t('builder.personalInfo')}
      </h3>
      {onPhotoUpload && onPhotoEdit && onPhotoRemove && (
        <ProfilePhotoField
          resumeId={resumeId}
          name={data.name}
          photo={data.photo}
          onUpload={onPhotoUpload}
          onEdit={onPhotoEdit}
          onRemove={onPhotoRemove}
          onEditorOpenChange={onPhotoEditorOpenChange}
          editRequestToken={photoEditRequestToken}
          disabled={photoActionsDisabled}
        />
      )}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label
            htmlFor="name"
            className="font-mono text-xs uppercase tracking-wider text-steel-grey"
          >
            {t('resume.personalInfo.name')}
          </Label>
          <Input
            id="name"
            value={data.name || ''}
            onChange={(e) => handleChange('name', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.name')}
            className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="title"
            className="font-mono text-xs uppercase tracking-wider text-steel-grey"
          >
            {t('resume.personalInfo.title')}
          </Label>
          <Input
            id="title"
            value={data.title || ''}
            onChange={(e) => handleChange('title', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.title')}
            className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="email"
            className="font-mono text-xs uppercase tracking-wider text-steel-grey"
          >
            {t('resume.personalInfo.email')}
          </Label>
          <Input
            id="email"
            type="email"
            value={data.email || ''}
            onChange={(e) => handleChange('email', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.email')}
            className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="phone"
            className="font-mono text-xs uppercase tracking-wider text-steel-grey"
          >
            {t('resume.personalInfo.phone')}
          </Label>
          <Input
            id="phone"
            type="tel"
            value={data.phone || ''}
            onChange={(e) => handleChange('phone', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.phone')}
            className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="location"
            className="font-mono text-xs uppercase tracking-wider text-steel-grey"
          >
            {t('resume.personalInfo.location')}
          </Label>
          <Input
            id="location"
            value={data.location || ''}
            onChange={(e) => handleChange('location', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.location')}
            className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="website"
            className="font-mono text-xs uppercase tracking-wider text-steel-grey"
          >
            {t('resume.personalInfo.website')}
          </Label>
          <Input
            id="website"
            value={data.website || ''}
            onChange={(e) => handleChange('website', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.website')}
            className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="linkedin"
            className="font-mono text-xs uppercase tracking-wider text-steel-grey"
          >
            {t('resume.personalInfo.linkedin')}
          </Label>
          <Input
            id="linkedin"
            value={data.linkedin || ''}
            onChange={(e) => handleChange('linkedin', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.linkedin')}
            className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
          />
        </div>
        <div className="space-y-2">
          <Label
            htmlFor="github"
            className="font-mono text-xs uppercase tracking-wider text-steel-grey"
          >
            {t('resume.personalInfo.github')}
          </Label>
          <Input
            id="github"
            value={data.github || ''}
            onChange={(e) => handleChange('github', e.target.value)}
            placeholder={t('builder.personalInfoForm.placeholders.github')}
            className="rounded-none border-black focus-visible:ring-0 focus-visible:ring-offset-0 focus-visible:border-blue-700 bg-transparent"
          />
        </div>
      </div>
    </div>
  );
};
