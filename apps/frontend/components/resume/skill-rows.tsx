import React from 'react';
import baseStyles from './styles/_base.module.css';
import { TagList } from './tag-list';
import { groupSkills, isPlainSkillList } from '@/lib/utils/skill-groups';

/**
 * Technical skills laid out in rows, one per group: a "Label: a, b" line or a
 * run of skills ended by "---" (see groupSkills). Each template family shows
 * the rows in its own style; a list without groups keeps the plain layout.
 */

/** Inline pills (Single Column, Modern): the label in bold, then its pills. */
export const SkillTagList: React.FC<{ items: string[] }> = ({ items }) => {
  const rows = groupSkills(items);
  if (isPlainSkillList(rows)) return <TagList items={rows[0]?.items ?? []} />;
  return (
    <div className="flex flex-col gap-1.5 min-w-0">
      {rows.map((row, index) => (
        <div key={index}>
          {row.label && <span className="font-bold">{row.label}: </span>}
          <TagList items={row.items} />
        </div>
      ))}
    </div>
  );
};

const PillWrap: React.FC<{ items: string[] }> = ({ items }) => (
  <div className="flex flex-wrap gap-1">
    {items.map((skill, index) => (
      <span key={index} className={baseStyles['resume-skill-pill']}>
        {skill}
      </span>
    ))}
  </div>
);

/** Wrapping pills (two-column sidebars): the label on its own line above them. */
export const SkillPillRows: React.FC<{ items: string[] }> = ({ items }) => {
  const rows = groupSkills(items);
  if (isPlainSkillList(rows)) return <PillWrap items={rows[0]?.items ?? []} />;
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, index) => (
        <div key={index}>
          {row.label && (
            <p className={`${baseStyles['resume-text-xs']} font-bold mb-0.5`}>{row.label}:</p>
          )}
          <PillWrap items={row.items} />
        </div>
      ))}
    </div>
  );
};

/** Text joined by " • " (Vivid): one paragraph per row, the label in bold. */
export const SkillTextRows: React.FC<{ items: string[]; className?: string }> = ({
  items,
  className,
}) => {
  const rows = groupSkills(items);
  if (isPlainSkillList(rows)) return <p className={className}>{rows[0]?.items.join(' • ')}</p>;
  return (
    <div className="flex flex-col gap-1.5">
      {rows.map((row, index) => (
        <p key={index} className={className}>
          {row.label && <span className="font-bold">{row.label}: </span>}
          {row.items.join(' • ')}
        </p>
      ))}
    </div>
  );
};
