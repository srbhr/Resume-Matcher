import type { ProcessedResume } from '@/lib/api/resume';
import type { SectionKind } from '@/lib/api/create';

export interface ContactFields {
  location?: string;
  phone?: string;
  email?: string;
  linkedin?: string;
  github?: string;
  website?: string;
}

export interface WizardData {
  name: string;
  role: string;
  contact: ContactFields;
  workExperience: NonNullable<ProcessedResume['workExperience']>;
  education: NonNullable<ProcessedResume['education']>;
  personalProjects: NonNullable<ProcessedResume['personalProjects']>;
  technicalSkills: string[];
  summary: string;
}

export function emptyWizardData(): WizardData {
  return {
    name: '',
    role: '',
    contact: {},
    workExperience: [],
    education: [],
    personalProjects: [],
    technicalSkills: [],
    summary: '',
  };
}

/** The user can finish once they have a name and at least one content section. */
export function canFinish(d: WizardData): boolean {
  return (
    d.name.trim().length > 0 &&
    (d.workExperience.length > 0 ||
      d.education.length > 0 ||
      d.personalProjects.length > 0 ||
      d.technicalSkills.length > 0)
  );
}

/** Append a freshly-drafted fragment, assigning sequential ids where needed. Pure. */
export function appendDraft(
  d: WizardData,
  section: SectionKind,
  fragment: Record<string, unknown>,
): WizardData {
  switch (section) {
    case 'work': {
      const id = d.workExperience.length + 1;
      const entry = { ...fragment, id } as WizardData['workExperience'][number];
      return { ...d, workExperience: [...d.workExperience, entry] };
    }
    case 'education': {
      const id = d.education.length + 1;
      const entry = { ...fragment, id } as WizardData['education'][number];
      return { ...d, education: [...d.education, entry] };
    }
    case 'project': {
      const id = d.personalProjects.length + 1;
      const entry = { ...fragment, id } as WizardData['personalProjects'][number];
      return { ...d, personalProjects: [...d.personalProjects, entry] };
    }
    case 'skills':
      return { ...d, technicalSkills: (fragment.technicalSkills as string[]) ?? [] };
    case 'summary':
      return { ...d, summary: (fragment.summary as string) ?? '' };
    default:
      return d;
  }
}

/** Build a ProcessedResume from the collected wizard data. Pure. */
export function assembleResume(d: WizardData): ProcessedResume {
  return {
    personalInfo: {
      name: d.name,
      title: d.role,
      email: d.contact.email ?? '',
      phone: d.contact.phone ?? '',
      location: d.contact.location ?? '',
      website: d.contact.website ?? null,
      linkedin: d.contact.linkedin ?? null,
      github: d.contact.github ?? null,
    },
    summary: d.summary,
    workExperience: d.workExperience,
    education: d.education,
    personalProjects: d.personalProjects,
    additional: {
      technicalSkills: d.technicalSkills,
      languages: [],
      certificationsTraining: [],
      awards: [],
    },
  };
}
