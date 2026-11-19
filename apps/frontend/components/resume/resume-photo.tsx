import React from 'react';
import baseStyles from './styles/_base.module.css';

/**
 * The photo of a photo CV, in the header's top-right corner at 35:45 (the
 * passport format). The header adds `photoHeaderClass` so it makes room for it.
 * Decorative for screen readers: the name beside it already says whose it is.
 */
export const ResumePhoto: React.FC<{ src?: string | null }> = ({ src }) => {
  if (!src) return null;
  return (
    // oxlint-disable-next-line nextjs/no-img-element -- a data URL inlined into the print page; next/image adds nothing here
    <img src={src} alt="" className={baseStyles['resume-photo']} data-resume-photo />
  );
};

/** Classes for a header that shows a photo (none without one). */
export function photoHeaderClass(src: string | null | undefined, centered: boolean): string {
  if (!src) return '';
  const room = baseStyles['resume-photo-header'];
  return centered ? ` ${room} ${baseStyles['resume-photo-header-centered']}` : ` ${room}`;
}
