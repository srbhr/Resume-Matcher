/**
 * Modern Deedy resume template.
 *
 * Layout inspired by "Modern-Deedy" by Abdullah Arif (Apache-2.0), a one-page,
 * single-column fork of Deedy styled like Jake's resume. This is an independent HTML/CSS
 * recreation of that look; none of the original LaTeX source is used.
 */
import React from 'react';
import { Mail, Phone, Globe, Linkedin, Github, MapPin, ExternalLink } from 'lucide-react';
import type {
  ResumeData,
  SectionMeta,
  AdditionalSectionLabels,
} from '@/components/dashboard/resume-component';
import { getSortedSections } from '@/lib/utils/section-helpers';
import { formatDateRange } from '@/lib/utils';
import { DescriptionList } from './description-list';
import baseStyles from './styles/_base.module.css';
import styles from './styles/modern-deedy.module.css';

interface ResumeModernDeedyProps {
  data: ResumeData;
  showContactIcons?: boolean;
  additionalSectionLabels?: Partial<AdditionalSectionLabels>;
}

type PointStyles = ('bullet' | 'plain')[];

const stripScheme = (url: string) =>
  url
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .replace(/\/$/, '');

const toHref = (url: string) => (/^(https?:)?\/\//.test(url) ? url : `https://${url}`);

/** Meta text on the right of an entry header: "City, ST | Mon YYYY - Mon YYYY". */
const joinMeta = (...parts: (string | undefined)[]) => parts.filter(Boolean).join(' | ');

/**
 * Modern Deedy
 *
 * Dense one-page, single-column layout set in Lato: a centred regular-weight name over a
 * single " | " separated contact line, light grey uppercase section headings with no
 * rule, and compact one-line entry headers (bold caps name, small-caps role, right-aligned
 * place and dates). Everything is real DOM text, so the PDF text layer reads in order.
 *
 * Section order: Determined by sectionMeta ordering.
 */
export const ResumeModernDeedy: React.FC<ResumeModernDeedyProps> = ({
  data,
  showContactIcons = false,
  additionalSectionLabels,
}) => {
  const { personalInfo, summary, workExperience, education, personalProjects, additional } = data;

  const sortedSections = getSortedSections(data);

  const contactIcons: Record<string, React.ReactNode> = {
    Email: <Mail size={11} />,
    Phone: <Phone size={11} />,
    Location: <MapPin size={11} />,
    Website: <Globe size={11} />,
    LinkedIn: <Linkedin size={11} />,
    GitHub: <Github size={11} />,
  };

  const renderContactDetail = (label: string, value?: string, hrefPrefix: string = '') => {
    if (!value) return null;

    const isUrl = ['Website', 'LinkedIn', 'GitHub'].includes(label);
    const href = isUrl ? toHref(value) : hrefPrefix + value;
    const isLink = isUrl || hrefPrefix !== '';
    const displayText =
      isUrl && !/^(https?:)?\/\//.test(value) ? value.replace(/^www\./, '') : value;

    return (
      <span className="inline-flex items-center gap-1">
        {showContactIcons && contactIcons[label]}
        {isLink ? (
          <a href={href} target="_blank" rel="noopener noreferrer" className={styles.link}>
            {displayText}
          </a>
        ) : (
          <span>{displayText}</span>
        )}
      </span>
    );
  };

  const contactItems = [
    renderContactDetail('Email', personalInfo?.email, 'mailto:'),
    renderContactDetail('Phone', personalInfo?.phone, 'tel:'),
    renderContactDetail('Location', personalInfo?.location),
    renderContactDetail('Website', personalInfo?.website),
    renderContactDetail('LinkedIn', personalInfo?.linkedin),
    renderContactDetail('GitHub', personalInfo?.github),
  ].filter(Boolean);

  const renderBullets = (items?: string[], pointStyles?: PointStyles) => (
    <DescriptionList
      items={items}
      styles={pointStyles}
      textClassName={styles.bullets}
      markerClassName={styles.marker}
    />
  );

  /** COMPANY | Role on the left; "Place | Dates" on the right. */
  const renderEntryHeader = (
    primary?: string,
    secondary?: string,
    location?: string,
    dates?: string
  ) => {
    const meta = joinMeta(location, dates ? formatDateRange(dates) : undefined);
    return (
      <div className={styles.entryRow}>
        <span className={styles.entryLead}>
          <span className={styles.entryName}>{primary}</span>
          {primary && secondary && <span className={styles.pipe}> | </span>}
          {secondary && <span className={styles.smallCaps}>{secondary}</span>}
        </span>
        {meta && <span className={styles.entryMeta}>{meta}</span>}
      </div>
    );
  };

  const renderProjectLink = (url: string) => (
    <a
      href={toHref(url)}
      target="_blank"
      rel="noopener noreferrer"
      className={styles.linkIcon}
      aria-label={stripScheme(url)}
    >
      <ExternalLink size={11} aria-hidden="true" />
    </a>
  );

  const renderSection = (section: SectionMeta) => {
    switch (section.key) {
      case 'personalInfo':
        return null;

      case 'summary':
        if (!summary) return null;
        return (
          <div key={section.id} className={baseStyles['resume-section']}>
            <h3 className={styles.sectionTitle}>{section.displayName}</h3>
            <p className={styles.bodyText}>{summary}</p>
          </div>
        );

      case 'workExperience':
        if (!workExperience || workExperience.length === 0) return null;
        return (
          <div key={section.id} className={baseStyles['resume-section']}>
            <h3 className={styles.sectionTitle}>{section.displayName}</h3>
            <div className={baseStyles['resume-items']}>
              {workExperience.map((exp) => (
                <div key={exp.id} className={baseStyles['resume-item']}>
                  {renderEntryHeader(exp.company, exp.title, exp.location, exp.years)}
                  {renderBullets(exp.description, exp.descriptionStyles)}
                </div>
              ))}
            </div>
          </div>
        );

      case 'education':
        if (!education || education.length === 0) return null;
        return (
          <div key={section.id} className={baseStyles['resume-section']}>
            <h3 className={styles.sectionTitle}>{section.displayName}</h3>
            <div className={baseStyles['resume-items']}>
              {education.map((edu) => (
                <div key={edu.id} className={baseStyles['resume-item']}>
                  <div className={styles.entryRow}>
                    <span className={styles.entryLead}>
                      <span className={styles.degree}>{edu.degree}</span>
                    </span>
                    {edu.years && (
                      <span className={styles.entryMeta}>{formatDateRange(edu.years)}</span>
                    )}
                  </div>
                  {edu.institution && <div className={styles.smallCaps}>{edu.institution}</div>}
                  {edu.description && <div className={styles.bodyText}>{edu.description}</div>}
                </div>
              ))}
            </div>
          </div>
        );

      case 'personalProjects':
        if (!personalProjects || personalProjects.length === 0) return null;
        return (
          <div key={section.id} className={baseStyles['resume-section']}>
            <h3 className={styles.sectionTitle}>{section.displayName}</h3>
            <div className={baseStyles['resume-items']}>
              {personalProjects.map((project) => (
                <div key={project.id} className={baseStyles['resume-item']}>
                  <div className={styles.entryRow}>
                    <span className={styles.entryLead}>
                      <span className={styles.entryName}>{project.name}</span>
                      {project.website && renderProjectLink(project.website)}
                      {project.github && renderProjectLink(project.github)}
                    </span>
                    {(project.role || project.years) && (
                      <span className={styles.entryMeta}>
                        {project.role && <span className={styles.smallCaps}>{project.role}</span>}
                        {project.role && project.years && <span> | </span>}
                        {project.years && formatDateRange(project.years)}
                      </span>
                    )}
                  </div>
                  {renderBullets(project.description, project.descriptionStyles)}
                </div>
              ))}
            </div>
          </div>
        );

      case 'additional':
        if (!additional) return null;
        return (
          <AdditionalSection
            key={section.id}
            additional={additional}
            displayName={section.displayName}
            labels={additionalSectionLabels}
          />
        );

      default:
        if (!section.isDefault) {
          return (
            <DynamicResumeSectionModernDeedy
              key={section.id}
              sectionMeta={section}
              resumeData={data}
              renderEntryHeader={renderEntryHeader}
              renderBullets={renderBullets}
            />
          );
        }
        return null;
    }
  };

  return (
    <div className={styles.container}>
      {personalInfo && (
        <header className={styles.header}>
          {personalInfo.name && <h1 className={styles.name}>{personalInfo.name}</h1>}
          {personalInfo.title && <div className={styles.tagline}>{personalInfo.title}</div>}
          {contactItems.length > 0 && (
            <div className={styles.contactRow}>
              {contactItems.map((item, index) => (
                <React.Fragment key={index}>
                  {index > 0 && <span className={styles.pipe}> | </span>}
                  {item}
                </React.Fragment>
              ))}
            </div>
          )}
        </header>
      )}

      {sortedSections
        .filter((section) => section.key !== 'personalInfo')
        .map((section) => renderSection(section))}
    </div>
  );
};

/**
 * Additional info section (skills, languages, certifications, awards).
 * One "Label: a, b, c" line per category with a bold label. The comma separators are real
 * text so an ATS reads "Python, Java, Go".
 */
const AdditionalSection: React.FC<{
  additional: ResumeData['additional'];
  displayName?: string;
  labels?: Partial<AdditionalSectionLabels>;
}> = ({ additional, displayName = 'Skills & Awards', labels }) => {
  if (!additional) return null;

  const clean = (items?: string[]) =>
    (items ?? []).filter((item): item is string => typeof item === 'string' && item.trim() !== '');

  const technicalSkills = clean(additional.technicalSkills);
  const languages = clean(additional.languages);
  const certificationsTraining = clean(additional.certificationsTraining);
  const awards = clean(additional.awards);

  const mergedLabels: AdditionalSectionLabels = {
    technicalSkills: labels?.technicalSkills ?? 'Technical Skills:',
    languages: labels?.languages ?? 'Languages:',
    certifications: labels?.certifications ?? 'Certifications:',
    awards: labels?.awards ?? 'Awards:',
  };

  const hasContent =
    technicalSkills.length > 0 ||
    languages.length > 0 ||
    certificationsTraining.length > 0 ||
    awards.length > 0;

  if (!hasContent) return null;

  const line = (label: string, items: string[]) =>
    items.length > 0 ? (
      <div>
        <span className={styles.skillLabel}>{label}</span> {items.join(', ')}
      </div>
    ) : null;

  return (
    <div className={baseStyles['resume-section']}>
      <h3 className={styles.sectionTitle}>{displayName}</h3>
      <div className={styles.skills}>
        {line(mergedLabels.technicalSkills, technicalSkills)}
        {line(mergedLabels.languages, languages)}
        {line(mergedLabels.certifications, certificationsTraining)}
        {line(mergedLabels.awards, awards)}
      </div>
    </div>
  );
};

/**
 * Dynamic (custom) section wrapper for the Modern Deedy template.
 */
const DynamicResumeSectionModernDeedy: React.FC<{
  sectionMeta: SectionMeta;
  resumeData: ResumeData;
  renderEntryHeader: (
    primary?: string,
    secondary?: string,
    location?: string,
    dates?: string
  ) => React.ReactNode;
  renderBullets: (items?: string[], pointStyles?: PointStyles) => React.ReactNode;
}> = ({ sectionMeta, resumeData, renderEntryHeader, renderBullets }) => {
  const customSection = resumeData.customSections?.[sectionMeta.key];
  if (!customSection) return null;

  const hasContent = (() => {
    switch (sectionMeta.sectionType) {
      case 'text':
        return Boolean(customSection.text?.trim());
      case 'itemList':
        return Boolean(customSection.items?.length);
      case 'stringList':
        return Boolean(customSection.strings?.length);
      default:
        return false;
    }
  })();

  if (!hasContent) return null;

  return (
    <div className={baseStyles['resume-section']}>
      <h3 className={styles.sectionTitle}>{sectionMeta.displayName}</h3>
      {sectionMeta.sectionType === 'text' && customSection.text?.trim() && (
        <p className={styles.bodyText}>{customSection.text}</p>
      )}
      {sectionMeta.sectionType === 'itemList' && customSection.items?.length ? (
        <div className={baseStyles['resume-items']}>
          {customSection.items.map((item) => (
            <div key={item.id} className={baseStyles['resume-item']}>
              {renderEntryHeader(item.title, item.subtitle, item.location, item.years)}
              {renderBullets(item.description, item.descriptionStyles)}
            </div>
          ))}
        </div>
      ) : null}
      {sectionMeta.sectionType === 'stringList' && customSection.strings?.length ? (
        <div className={styles.skills}>{customSection.strings.join(', ')}</div>
      ) : null}
    </div>
  );
};

export default ResumeModernDeedy;
