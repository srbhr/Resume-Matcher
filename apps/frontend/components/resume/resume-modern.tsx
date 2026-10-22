import React from 'react';
import { ResumeSingleColumn } from './resume-single-column';

type ResumeModernProps = Omit<React.ComponentProps<typeof ResumeSingleColumn>, 'accent'>;

/**
 * Modern Resume Template
 *
 * Single-column layout with user-selectable accent colors.
 * Features colored section headers with underline and decorative name underline.
 * ATS-compatible: all visual elements are real DOM text nodes.
 *
 * Shares its layout with the Swiss single-column template.
 */
export const ResumeModern: React.FC<ResumeModernProps> = (props) => (
  <ResumeSingleColumn {...props} accent />
);

export default ResumeModern;
