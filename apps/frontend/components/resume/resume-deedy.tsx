/*
 * Deedy Resume Template
 *
 * An HTML/CSS recreation of the "Deedy Resume" LaTeX template by Debarghya Das
 * (https://github.com/deedy/Deedy-Resume), licensed under the Apache License 2.0.
 */
import React from 'react';
import type {
  ResumeData,
  SectionMeta,
  CustomSectionItem,
  ResumeSectionHeadings,
  ResumeFallbackLabels,
  AdditionalSectionLabels,
} from '@/components/dashboard/resume-component';
import { getSortedSections } from '@/lib/utils/section-helpers';
import { formatDateRange } from '@/lib/utils';
import { DescriptionList } from './description-list';
import { SafeHtml } from './safe-html';
import baseStyles from './styles/_base.module.css';
import styles from './styles/deedy.module.css';

type Column = 'left' | 'right';

/*
 * Column assignment, in one place.
 *
 * Built-in sections map by key. `additional` is split: skills, languages and
 * certifications go left, awards go right. A custom section goes left when its
 * name matches LEFT_CUSTOM_SECTION, otherwise right; a right-hand custom section
 * whose name matches NUMBERED_CUSTOM_SECTION renders as a numbered [1] [2] list.
 * Links (from the contact details) follow Education in the left column.
 * Within each column, sections keep their sectionMeta order.
 */
const BUILTIN_COLUMN: Record<string, Column> = {
  summary: 'right',
  workExperience: 'right',
  personalProjects: 'right',
  education: 'left',
};
const LEFT_CUSTOM_SECTION = /course|link|profile|skill|language|certif|interest|tool/i;
const NUMBERED_CUSTOM_SECTION = /publication|paper|article|proceeding|patent/i;

const columnFor = (section: SectionMeta): Column =>
  section.isDefault
    ? (BUILTIN_COLUMN[section.key] ?? 'right')
    : LEFT_CUSTOM_SECTION.test(section.displayName)
      ? 'left'
      : 'right';

/** Values shown as typed when they carry a scheme; a bare host drops "www.". */
const linkText = (value: string): string =>
  value.startsWith('http') || value.startsWith('//') ? value : value.replace(/^www\./, '');

const linkHref = (value: string): string =>
  value.startsWith('http') || value.startsWith('//') ? value : `https://${value}`;

/** "https://www.github.com/sarahchen/" -> "sarahchen"; a bare host stays whole. */
const linkHandle = (value: string): string => {
  const bare = value
    .replace(/^(?:https?:)?\/\//, '')
    .replace(/^www\./, '')
    .replace(/[?#].*$/, '')
    .replace(/\/+$/, '');
  return bare.slice(bare.lastIndexOf('/') + 1) || bare;
};

const stripScheme = (value: string): string =>
  value
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

interface Award {
  year?: string;
  rank?: string;
  title: string;
}

const YEAR = /^(?:19|20)\d{2}$/;
const HAS_YEAR = /\b(?:19|20)\d{2}\b/;

/**
 * Split an award into year | rank | title when the text allows it:
 * "2014 | top 52/2500 | KPCB Fellow", "2014 KPCB Fellow", "KPCB Fellow, 2014" or
 * "KPCB Fellow (2014)". Text that names more than one year stays whole.
 */
const parseAward = (text: string): Award => {
  const parts = text.split(/\s+\|\s+/);
  if (YEAR.test(parts[0]) && parts.length === 3) {
    return { year: parts[0], rank: parts[1], title: parts[2] };
  }
  if (YEAR.test(parts[0]) && parts.length === 2) return { year: parts[0], title: parts[1] };
  const leading = text.match(/^((?:19|20)\d{2})(?:\s*[,:-]\s*|\s+)(.+)$/);
  const trailing =
    text.match(/^(.+?)\s*\(((?:19|20)\d{2})\)$/) ??
    text.match(/^(.+?)(?:\s*,\s*|\s+-\s+|\s+)((?:19|20)\d{2})$/);
  const [year, title] = leading
    ? [leading[1], leading[2]]
    : trailing
      ? [trailing[2], trailing[1]]
      : [];
  return year && title && !HAS_YEAR.test(title) ? { year, title } : { title: text };
};

/**
 * Small caps drawn from capitals: each lowercase run is set as smaller uppercase.
 * CSS `font-variant: small-caps` can reach the PDF text layer as private-use glyphs
 * (when a fallback font supplies them), which an ATS cannot read; capitals are
 * always plain text.
 */
const SmallCaps: React.FC<{ text: string }> = ({ text }) => (
  <>
    {text.split(/(\p{Ll}+)/u).map((part, index) =>
      index % 2 === 1 ? (
        <span key={index} className={styles.smallCap}>
          {part}
        </span>
      ) : (
        part
      )
    )}
  </>
);

const clean = (items?: string[]) =>
  (items ?? []).filter((item): item is string => typeof item === 'string' && item.trim() !== '');

const joinPresent = (values: (string | undefined)[]) => values.filter(Boolean).join(' | ');

interface ResumeDeedyProps {
  data: ResumeData;
  sectionHeadings?: Partial<ResumeSectionHeadings>;
  additionalSectionLabels?: Partial<AdditionalSectionLabels>;
  fallbackLabels?: Partial<ResumeFallbackLabels>;
}

/**
 * Deedy: centred two-weight name over pipe-separated contact lines and a thin
 * rule, then a narrow left column (education, links, skills) and a wide right
 * column (experience, projects, awards, publications). Light gray uppercase
 * section headings, bold uppercase entry titles with the role in small caps.
 *
 * Fonts are fixed to the original's Lato and Raleway (self-hosted through
 * next/font in app/layout.tsx); the header/body font controls only change the
 * fallback stack used for scripts Lato does not cover, such as CJK. The accent
 * colour control does not apply. The original's "Last Updated" stamp is left
 * out because the template has no last-updated date to show.
 */
export const ResumeDeedy: React.FC<ResumeDeedyProps> = ({
  data,
  sectionHeadings,
  additionalSectionLabels,
  fallbackLabels,
}) => {
  const { personalInfo, summary, workExperience, education, personalProjects, additional } = data;

  const technicalSkills = clean(additional?.technicalSkills);
  const languages = clean(additional?.languages);
  const certificationsTraining = clean(additional?.certificationsTraining);
  const awardTexts = clean(additional?.awards);
  const awards = awardTexts.map(parseAward);

  const headings = {
    skills: sectionHeadings?.skills ?? 'Skills',
    awards: sectionHeadings?.awards ?? 'Awards',
    links: sectionHeadings?.links ?? 'Links',
  };
  const groupLabels = {
    technicalSkills: additionalSectionLabels?.technicalSkills ?? 'Technical Skills:',
    languages: additionalSectionLabels?.languages ?? 'Languages:',
    certifications: additionalSectionLabels?.certifications ?? 'Certifications:',
  };

  // Hairline first name(s), heavier last name. A one-word name gets the heavier weight.
  const fullName = (personalInfo?.name || fallbackLabels?.name || 'Your Name').trim();
  const lastSpace = fullName.lastIndexOf(' ');
  const nameFirst = lastSpace === -1 ? '' : fullName.slice(0, lastSpace);
  const nameLast = lastSpace === -1 ? fullName : fullName.slice(lastSpace + 1);

  const renderLink = (value: string, text: string = linkText(value), className = styles.link) => (
    <a href={linkHref(value)} target="_blank" rel="noopener noreferrer" className={className}>
      {text}
    </a>
  );

  const webLine = [personalInfo?.website, personalInfo?.linkedin, personalInfo?.github].filter(
    (value): value is string => Boolean(value)
  );
  const contactLine = [
    personalInfo?.email && (
      <a key="email" href={`mailto:${personalInfo.email}`} className={styles.link}>
        {personalInfo.email}
      </a>
    ),
    personalInfo?.phone && (
      <a key="phone" href={`tel:${personalInfo.phone}`} className={styles.link}>
        {personalInfo.phone}
      </a>
    ),
    personalInfo?.location && <span key="location">{personalInfo.location}</span>,
  ].filter(Boolean);

  const withPipes = (nodes: React.ReactNode[]) =>
    nodes.map((node, index) => (
      <React.Fragment key={index}>
        {index > 0 && ' | '}
        {node}
      </React.Fragment>
    ));

  const sectionTitle = (title: string) => <h3 className={styles.sectionTitle}>{title}</h3>;

  const bullets = (items?: string[], itemStyles?: ('bullet' | 'plain')[]) => (
    <DescriptionList
      items={items}
      styles={itemStyles}
      textClassName={styles.bullets}
      markerClassName={styles.bulletMarker}
    />
  );

  /** "COMPANY | Role" heading row of an entry. */
  const entryHeading = (title?: string, role?: string) => (
    <div className={styles.entryHeading}>
      {title && <span className={styles.entryTitle}>{title}</span>}
      {title && role && ' '}
      {role && (
        <span className={styles.entryRole}>
          {title && '| '}
          <SmallCaps text={role} />
        </span>
      )}
    </div>
  );

  const entryMeta = (text: React.ReactNode) =>
    text ? <div className={styles.entryMeta}>{text}</div> : null;

  /** Inline "a • b • c"; the bullet sticks to the item before it when lines wrap. */
  const dotList = (items: string[]) => (
    <p className={styles.text}>
      {items.map((item, index) => (
        <React.Fragment key={index}>
          {index > 0 && ' • '}
          {item}
        </React.Fragment>
      ))}
    </p>
  );

  const lineList = (items: string[]) => (
    <div className={styles.lines}>
      {items.map((item, index) => (
        <p key={index} className={styles.text}>
          {item}
        </p>
      ))}
    </div>
  );

  const renderEducation = (section: SectionMeta) =>
    education && education.length > 0 ? (
      <section key={section.id} className={styles.section}>
        {sectionTitle(section.displayName)}
        <div className={styles.entries}>
          {education.map((edu) => (
            <div key={edu.id} className={baseStyles['resume-item']}>
              {edu.institution && (
                <div className={`${styles.entryHeading} ${styles.entryTitle}`}>
                  {edu.institution}
                </div>
              )}
              {edu.degree && (
                <div className={styles.entryRole}>
                  <SmallCaps text={edu.degree} />
                </div>
              )}
              {entryMeta(formatDateRange(edu.years))}
              {edu.description && <p className={styles.text}>{edu.description}</p>}
            </div>
          ))}
        </div>
      </section>
    ) : null;

  const profileLinks = [
    { label: 'LinkedIn', value: personalInfo?.linkedin },
    { label: 'GitHub', value: personalInfo?.github },
  ].filter((link): link is { label: string; value: string } => Boolean(link.value));

  const linksSection =
    profileLinks.length > 0 ? (
      <section key="links" className={styles.section}>
        {sectionTitle(headings.links)}
        <div className={styles.lines}>
          {profileLinks.map(({ label, value }) => (
            <p key={label} className={styles.text}>
              {label}:// {renderLink(value, linkHandle(value), `${styles.link} ${styles.handle}`)}
            </p>
          ))}
        </div>
      </section>
    ) : null;

  const skillGroups = [
    { label: groupLabels.technicalSkills, items: technicalSkills, inline: true },
    { label: groupLabels.languages, items: languages, inline: true },
    { label: groupLabels.certifications, items: certificationsTraining, inline: false },
  ].filter((group) => group.items.length > 0);

  const renderSkills = (section: SectionMeta) =>
    skillGroups.length > 0 ? (
      <section key={`${section.id}-skills`} className={styles.section}>
        {sectionTitle(headings.skills)}
        <div className={styles.entries}>
          {skillGroups.map((group) => (
            <div key={group.label} className={baseStyles['resume-item']}>
              <p className={styles.text}>{group.label}</p>
              {group.inline ? dotList(group.items) : lineList(group.items)}
            </div>
          ))}
        </div>
      </section>
    ) : null;

  const hasAwardYears = awards.every((award) => award.year);
  const hasAwardRanks = awards.some((award) => award.rank);

  const renderAwards = (section: SectionMeta) =>
    awards.length > 0 ? (
      <section key={`${section.id}-awards`} className={styles.section}>
        {sectionTitle(headings.awards)}
        {hasAwardYears ? (
          <div className={`${styles.awards} ${hasAwardRanks ? styles.awardsRanked : ''}`}>
            {awards.map((award, index) => (
              <React.Fragment key={index}>
                <span>{award.year}</span>
                {hasAwardRanks && <span>{award.rank}</span>}
                <span>{award.title}</span>
              </React.Fragment>
            ))}
          </div>
        ) : (
          lineList(awardTexts)
        )}
      </section>
    ) : null;

  const renderSummary = (section: SectionMeta) =>
    summary ? (
      <section key={section.id} className={styles.section}>
        {sectionTitle(section.displayName)}
        <p className={styles.text}>{summary}</p>
      </section>
    ) : null;

  const renderExperience = (section: SectionMeta) =>
    workExperience && workExperience.length > 0 ? (
      <section key={section.id} className={styles.section}>
        {sectionTitle(section.displayName)}
        <div className={styles.entries}>
          {workExperience.map((exp) => (
            <div key={exp.id} className={baseStyles['resume-item']}>
              {entryHeading(exp.company || exp.title, exp.company ? exp.title : undefined)}
              {entryMeta(joinPresent([formatDateRange(exp.years), exp.location]))}
              {bullets(exp.description, exp.descriptionStyles)}
            </div>
          ))}
        </div>
      </section>
    ) : null;

  const renderProjects = (section: SectionMeta) =>
    personalProjects && personalProjects.length > 0 ? (
      <section key={section.id} className={styles.section}>
        {sectionTitle(section.displayName)}
        <div className={styles.entries}>
          {personalProjects.map((project) => {
            const links = [project.github, project.website].filter((value): value is string =>
              Boolean(value)
            );
            return (
              <div key={project.id} className={baseStyles['resume-item']}>
                {entryHeading(project.name, project.role)}
                {entryMeta(
                  (project.years || links.length > 0) &&
                    withPipes(
                      [
                        project.years && formatDateRange(project.years),
                        ...links.map((value) => renderLink(value, stripScheme(value))),
                      ].filter(Boolean)
                    )
                )}
                {bullets(project.description, project.descriptionStyles)}
              </div>
            );
          })}
        </div>
      </section>
    ) : null;

  const renderNumberedItem = (item: CustomSectionItem) => (
    <>
      <p className={styles.text}>
        {item.title}
        {item.subtitle && (
          <>
            {item.title && '. '}
            <em>{item.subtitle}</em>
          </>
        )}
        {(item.location || item.years) && (
          <>
            {(item.title || item.subtitle) && ', '}
            {[item.location, formatDateRange(item.years)].filter(Boolean).join(', ')}
          </>
        )}
      </p>
      {item.description && item.description.length > 0 && (
        <div className={styles.lines}>
          {item.description.map((line, index) => (
            <p key={index} className={styles.text}>
              <SafeHtml html={line} />
            </p>
          ))}
        </div>
      )}
    </>
  );

  const renderCustom = (section: SectionMeta, column: Column) => {
    const custom = data.customSections?.[section.key];
    if (!custom) return null;
    const text = section.sectionType === 'text' ? custom.text?.trim() : undefined;
    const items = section.sectionType === 'itemList' ? (custom.items ?? []) : [];
    const strings = section.sectionType === 'stringList' ? clean(custom.strings) : [];
    if (!text && items.length === 0 && strings.length === 0) return null;

    const numbered = column === 'right' && NUMBERED_CUSTOM_SECTION.test(section.displayName);

    return (
      <section key={section.id} className={styles.section}>
        {sectionTitle(section.displayName)}
        {text && <p className={styles.text}>{custom.text}</p>}
        {numbered && (items.length > 0 || strings.length > 0) ? (
          <ol className={styles.numbered}>
            {(items.length > 0 ? items : strings).map((entry, index) => (
              <li
                key={typeof entry === 'string' ? index : entry.id}
                className={`${styles.numberedItem} ${baseStyles['resume-item']}`}
              >
                <span className={styles.number}>[{index + 1}]</span>
                <div>
                  {typeof entry === 'string' ? (
                    <p className={styles.text}>{entry}</p>
                  ) : (
                    renderNumberedItem(entry)
                  )}
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <>
            {items.length > 0 && (
              <div className={styles.entries}>
                {items.map((item) => (
                  <div key={item.id} className={baseStyles['resume-item']}>
                    {entryHeading(item.title, item.subtitle)}
                    {entryMeta(joinPresent([formatDateRange(item.years), item.location]))}
                    {bullets(item.description, item.descriptionStyles)}
                  </div>
                ))}
              </div>
            )}
            {strings.length > 0 && (column === 'left' ? lineList(strings) : bullets(strings))}
          </>
        )}
      </section>
    );
  };

  const leftColumn: React.ReactNode[] = [];
  const rightColumn: React.ReactNode[] = [];
  let linksPlaced = false;

  for (const section of getSortedSections(data)) {
    if (section.key === 'personalInfo') continue;
    if (section.key === 'additional') {
      leftColumn.push(renderSkills(section));
      rightColumn.push(renderAwards(section));
      continue;
    }
    const column = columnFor(section);
    const target = column === 'left' ? leftColumn : rightColumn;
    if (!section.isDefault) {
      target.push(renderCustom(section, column));
    } else if (section.key === 'education') {
      target.push(renderEducation(section));
      target.push(linksSection);
      linksPlaced = true;
    } else if (section.key === 'summary') {
      target.push(renderSummary(section));
    } else if (section.key === 'workExperience') {
      target.push(renderExperience(section));
    } else if (section.key === 'personalProjects') {
      target.push(renderProjects(section));
    }
  }
  if (!linksPlaced) leftColumn.unshift(linksSection);

  return (
    <div className={styles.deedy}>
      <header className={styles.header}>
        <h1 className={styles.name}>
          {nameFirst && (
            <>
              <span className={styles.nameFirst}>{nameFirst}</span>{' '}
            </>
          )}
          <span className={styles.nameLast}>{nameLast}</span>
        </h1>
        {personalInfo?.title && (
          <div className={styles.title}>
            <SmallCaps text={personalInfo.title} />
          </div>
        )}
        {webLine.length > 0 && (
          <div className={styles.contact}>
            {withPipes(webLine.map((value) => renderLink(value)))}
          </div>
        )}
        {contactLine.length > 0 && <div className={styles.contact}>{withPipes(contactLine)}</div>}
      </header>
      <hr className={styles.rule} />

      <div className={styles.grid}>
        <div className={styles.sidebarColumn}>{leftColumn}</div>
        <div className={styles.mainColumn}>{rightColumn}</div>
      </div>
    </div>
  );
};

export default ResumeDeedy;
