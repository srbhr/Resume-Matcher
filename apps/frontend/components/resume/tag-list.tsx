import React from 'react';
import baseStyles from './styles/_base.module.css';

interface TagListProps {
  items: string[];
  lineBreakMarker?: string;
}

/**
 * Items as pill tags in the text flow, joined by a transparent ", ".
 * An optional marker can insert a line break between items.
 * The pills mark the item boundaries on the page; the comma keeps them in the
 * text that copy/paste, screen readers and the PDF text layer (what an ATS
 * parses) see, so the list reads "Python, Java, Go", never "PythonJavaGo".
 */
export const TagList: React.FC<TagListProps> = ({
  items,
  lineBreakMarker,
}) => (
  <span className={baseStyles['resume-tag-list']}>
    {items.map((item, index) => {
      if (lineBreakMarker && item.trim() === lineBreakMarker) {
        return <br key={index} />;
      }

      const previousItem = items[index - 1];
      const needsSeparator =
        index > 0 && previousItem?.trim() !== lineBreakMarker;

      return (
        <React.Fragment key={index}>
          {needsSeparator && (
            <span className={baseStyles['resume-tag-separator']}>, </span>
          )}
          <span className={baseStyles['resume-skill-pill']}>{item}</span>
        </React.Fragment>
      );
    })}
  </span>
);