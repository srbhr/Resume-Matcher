import React from 'react';
import baseStyles from './styles/_base.module.css';

/**
 * Items as pill tags in the text flow, joined by a transparent ", ".
 *
 * The pills mark the item boundaries on the page; the comma keeps them in the
 * text that copy/paste, screen readers and the PDF text layer (what an ATS
 * parses) see, so the list reads "Python, Java, Go", never "PythonJavaGo".
 */
export const TagList: React.FC<{ items: string[] }> = ({ items }) => (
  <span className={baseStyles['resume-tag-list']}>
    {items.map((item, index) => (
      <React.Fragment key={index}>
        {index > 0 && <span className={baseStyles['resume-tag-separator']}>, </span>}
        <span className={baseStyles['resume-skill-pill']}>{item}</span>
      </React.Fragment>
    ))}
  </span>
);
