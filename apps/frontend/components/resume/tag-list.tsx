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
export const TagList: React.FC<{ items: string[]; row?: ListRow }> = ({ items, row }) => (
  <span className={baseStyles['resume-tag-list']} data-list-row={row}>
    {items.map((item, index) => (
      <React.Fragment key={index}>
        {index > 0 && <span className={baseStyles['resume-tag-separator']}>, </span>}
        <span className={baseStyles['resume-skill-pill']}>{item}</span>
      </React.Fragment>
    ))}
  </span>
);
