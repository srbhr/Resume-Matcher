/**
 * Cover Letter Settings
 *
 * Controls the visual appearance of the cover letter heading (letterhead).
 */

export type CoverLetterHeadingStyle = 'professional' | 'centered' | 'minimal';

export type CoverLetterHeadingField =
  | 'email'
  | 'phone'
  | 'location'
  | 'linkedin'
  | 'github'
  | 'website';

export interface CoverLetterSettings {
  /** Visual layout of the letterhead */
  headingStyle: CoverLetterHeadingStyle;
  /** Which contact info fields to display in the heading */
  headingFields: CoverLetterHeadingField[];
  /** Whether to show the candidate's job title below their name */
  showTitle: boolean;
}

export const DEFAULT_COVER_LETTER_SETTINGS: CoverLetterSettings = {
  headingStyle: 'professional',
  headingFields: ['email', 'phone', 'location', 'linkedin'],
  showTitle: true,
};

export const ALL_HEADING_FIELDS: CoverLetterHeadingField[] = [
  'email',
  'phone',
  'location',
  'linkedin',
  'github',
  'website',
];
