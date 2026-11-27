import React from 'react';
import type { ListRow } from '@/lib/types/template-settings';
import baseStyles from './styles/_base.module.css';

/**
 * Items as pill tags in the text flow, joined by a transparent ", ".
 *
 * The pills mark the item boundaries on the page; the comma keeps them in the
 * text that copy/paste, screen readers and the PDF text layer (what an ATS
 * parses) see, so the list reads "Python, Java, Go", never "PythonJavaGo".
 *
 * `row` names the list (skills, languages, ...): when the resume's settings ask
 * for commas on that row (`data-list-<row>="comma"` on the resume root), the
 * pills lose their boxes and the commas show, in _base.module.css.
 */
export const TagList: React.FC<{
  items: string[];
  row?: ListRow;
  /**
   * Pills 0.25rem apart, as the two-column sidebars set them before list styles
   * existed, instead of a space's width. Each pill holds on to the separator after
   * it, so a row never starts with one.
   */
  tight?: boolean;
}> = ({ items, row, tight = false }) => (
  <span
    className={baseStyles['resume-tag-list']}
    data-list-row={row}
    data-tight={tight ? '' : undefined}
  >
    {tight
      ? items.map((item, index) => (
          <span key={index} className={baseStyles['resume-tag-item']}>
            <span className={baseStyles['resume-skill-pill']}>{item}</span>
            {index < items.length - 1 && (
              <span className={baseStyles['resume-tag-separator']}>, </span>
            )}
          </span>
        ))
      : items.map((item, index) => (
          <React.Fragment key={index}>
            {index > 0 && <span className={baseStyles['resume-tag-separator']}>, </span>}
            <span className={baseStyles['resume-skill-pill']}>{item}</span>
          </React.Fragment>
        ))}
  </span>
);
