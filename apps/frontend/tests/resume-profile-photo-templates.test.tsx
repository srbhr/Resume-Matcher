import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import Resume, { type ResumeData } from '@/components/dashboard/resume-component';
import { getPhotoDisplayDimensions } from '@/components/resume/resume-profile-photo';
import { DEFAULT_TEMPLATE_SETTINGS, type TemplateType } from '@/lib/types/template-settings';

const templates: TemplateType[] = [
  'swiss-single',
  'swiss-two-column',
  'modern',
  'modern-two-column',
  'latex',
  'clean',
  'vivid',
];

const resumeWithPhoto: ResumeData = {
  personalInfo: {
    name: 'Ada Lovelace',
    title: 'Engineer',
    email: 'ada@example.com',
    photo: {
      cropX: 0,
      cropY: 0,
      cropWidth: 100,
      cropHeight: 100,
      size: 88,
      version: 3,
      aspectRatio: 1,
    },
  },
  summary: 'Builds reliable systems.',
  workExperience: [],
  education: [],
  personalProjects: [],
  additional: {},
};

describe.each(templates)('resume profile photo in %s', (template) => {
  it('renders one versioned upper-right photo with the expected header layout', () => {
    render(
      <Resume
        resumeId="resume 1"
        resumeData={resumeWithPhoto}
        template={template}
        settings={{ ...DEFAULT_TEMPLATE_SETTINGS, template }}
        fallbackLabels={{
          name: 'Your Name',
          profilePhoto: 'profile photo',
          editPhoto: 'Edit photo',
        }}
      />
    );

    const image = screen.getByRole('img', { name: 'Ada Lovelace profile photo' });
    expect(image).toHaveAttribute('src', '/api/v1/resumes/resume%201/photo?v=3');
    expect(image.closest('.resume-profile-photo')).toHaveStyle({
      width: '88px',
      height: '88px',
    });
    expect(image.closest('[data-photo-overlay]')).toHaveAttribute('data-photo-overlay', 'true');
  });
});

it.each([
  [2, { width: 88, height: 44 }],
  [1, { width: 88, height: 88 }],
  [0.5, { width: 44, height: 88 }],
])('derives adaptive display dimensions for aspect ratio %s', (aspectRatio, expected) => {
  expect(getPhotoDisplayDimensions(88, aspectRatio)).toEqual(expected);
});

it('keeps profile photos as a pure overlay without changing template content dimensions', () => {
  const css = readFileSync(
    resolve(process.cwd(), 'components/resume/styles/resume-profile-photo.module.css'),
    'utf8'
  );
  const wrapperRule = css.match(/\.wrapper\s*{([^}]*)}/)?.[1] ?? '';
  const photoRule = css.match(/\.photo\s*{([^}]*)}/)?.[1] ?? '';

  expect(css).toMatch(/\.photo\s*{[^}]*position:\s*absolute/);
  expect(photoRule).toMatch(/top:\s*-8px/);
  expect(css).not.toMatch(/\.wrapper\s*>/);
  expect(wrapperRule).not.toMatch(/padding|margin|(?:min-|max-)?width/);
});

it('keeps the exact no-photo path free of photo layout wrappers', () => {
  const data: ResumeData = {
    ...resumeWithPhoto,
    personalInfo: { ...resumeWithPhoto.personalInfo, photo: undefined },
  };
  const { container } = render(<Resume resumeId="resume-1" resumeData={data} />);

  expect(container.querySelector('[data-photo-overlay]')).toBeNull();
  expect(container.querySelector('.resume-profile-photo')).toBeNull();
});

it('shows an editor-only action and falls back to no-photo layout on image error', () => {
  const onEditPhoto = vi.fn();
  const { container } = render(
    <Resume
      resumeId="resume-1"
      resumeData={resumeWithPhoto}
      editable
      onEditPhoto={onEditPhoto}
      fallbackLabels={{
        name: 'Your Name',
        profilePhoto: 'profile photo',
        editPhoto: 'Edit photo',
      }}
    />
  );

  expect(screen.queryByText('Edit photo')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Edit photo' }));
  expect(onEditPhoto).toHaveBeenCalledOnce();

  fireEvent.error(screen.getByRole('img', { name: 'Ada Lovelace profile photo' }));
  expect(container.querySelector('[data-photo-overlay]')).toBeNull();
});

it('retries rendering after a failed photo is replaced with a new version', () => {
  const { rerender } = render(
    <Resume
      resumeId="resume-1"
      resumeData={resumeWithPhoto}
      fallbackLabels={{
        name: 'Your Name',
        profilePhoto: 'profile photo',
        editPhoto: 'Edit photo',
      }}
    />
  );

  fireEvent.error(screen.getByRole('img', { name: 'Ada Lovelace profile photo' }));
  expect(screen.queryByRole('img', { name: 'Ada Lovelace profile photo' })).toBeNull();

  rerender(
    <Resume
      resumeId="resume-1"
      resumeData={{
        ...resumeWithPhoto,
        personalInfo: {
          ...resumeWithPhoto.personalInfo,
          photo: {
            ...resumeWithPhoto.personalInfo!.photo!,
            version: 4,
          },
        },
      }}
      fallbackLabels={{
        name: 'Your Name',
        profilePhoto: 'profile photo',
        editPhoto: 'Edit photo',
      }}
    />
  );

  expect(screen.getByRole('img', { name: 'Ada Lovelace profile photo' })).toHaveAttribute(
    'src',
    '/api/v1/resumes/resume-1/photo?v=4'
  );
});
