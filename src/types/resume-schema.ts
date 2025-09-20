// Central schema for a Resume JSON. Only id is required; everything else optional and stringly-typed
// to allow maximal flexibility while still offering structured guidance via nested objects & arrays.

export interface ResumeJSON {
  id: string; // required unique id
  name?: string;
  title?: string;
  summary?: string;
  lastModified?: number; // optional timestamp for UI metadata
  // Known structured optional sections (all any to allow dynamic per-user shapes)
  'contact-details'?: ContactDetails;
  'social-links'?: SocialLinks;
  'work-experiences'?: WorkExperienceEntry[];
  education?: EducationEntry[];
  projects?: ProjectEntry[];
  skills?: Record<string, string[] | string | undefined>;
  certifications?: CertificationEntry[];
  languages?: LanguageEntry[];
  awards?: AwardEntry[];
  'volunteer-work'?: VolunteerEntry[];
  publications?: PublicationEntry[];
  [key: string]: unknown; // forward-compatible custom fields (string | object | array)
}

// Explicit optional nested shapes (string properties optional, arrays of strings) ---------
export interface ContactDetails {
  email?: string; phone?: string; city?: string; state?: string; country?: string; 'postal-code'?: string; [k: string]: unknown;
}
export interface SocialLinks {
  linkedin?: string;
  github?: string;
  portfolio?: string;
  twitter?: string;
  [k: string]: string | undefined;
}
export interface WorkExperienceEntry {
  _id?: string;
  company?: string; position?: string; location?: string; duration?: string; 'employment-type'?: string;
  responsibilities?: string[]; achievements?: string[]; [k: string]: unknown;
}
export interface EducationEntry {
  _id?: string;
  institution?: string; degree?: string; field?: string; location?: string; 'graduation-date'?: string; gpa?: string;
  'relevant-coursework'?: string[]; honors?: string[]; [k: string]: unknown;
}
export interface ProjectEntry {
  _id?: string;
  name?: string; description?: string; technologies?: string[]; duration?: string; url?: string; achievements?: string[]; [k: string]: unknown;
}
export interface CertificationEntry {
  _id?: string;
  name?: string; issuer?: string; date?: string; 'expiry-date'?: string; 'credential-id'?: string; [k: string]: unknown;
}
export interface LanguageEntry { _id?: string; language?: string; proficiency?: string; [k: string]: unknown }
export interface AwardEntry { _id?: string; name?: string; issuer?: string; date?: string; description?: string; [k: string]: unknown }
export interface VolunteerEntry { _id?: string; organization?: string; position?: string; duration?: string; description?: string; hours?: string; [k: string]: unknown }
export interface PublicationEntry { _id?: string; title?: string; publisher?: string; date?: string; url?: string; description?: string; [k: string]: unknown }

// Utility type guard (light) --------------------------------------------------------
export function isResumeJSON(val: unknown): val is ResumeJSON {
  return !!val && typeof val === 'object' && typeof (val as { id?: unknown }).id === 'string';
}
