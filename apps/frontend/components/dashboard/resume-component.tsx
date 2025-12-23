import React from 'react';

export interface PersonalInfo {
  name?: string;
  title?: string;
  email?: string;
  phone?: string;
  location?: string;
  website?: string;
  linkedin?: string;
  github?: string;
}

export interface Experience {
  id: number;
  title?: string;
  company?: string;
  location?: string;
  years?: string;
  description?: string[];
}

export interface Education {
  id: number;
  institution?: string;
  degree?: string;
  years?: string;
  description?: string;
}

export interface Project {
  id: number;
  name?: string;
  role?: string;
  years?: string;
  description?: string[];
}

export interface AdditionalInfo {
  technicalSkills?: string[];
  languages?: string[];
  certificationsTraining?: string[];
  awards?: string[];
}

export interface ResumeData {
  personalInfo?: PersonalInfo;
  summary?: string;
  workExperience?: Experience[];
  education?: Education[];
  personalProjects?: Project[];
  additional?: AdditionalInfo;
}

interface ResumeProps {
  resumeData: ResumeData;
}

const Resume: React.FC<ResumeProps> = ({ resumeData }) => {
  const { personalInfo, summary, workExperience, education, personalProjects, additional } =
    resumeData;

  // Helper function to render contact details
  const renderContactDetail = (label: string, value?: string, hrefPrefix: string = '') => {
    if (!value) return null;

    let finalHrefPrefix = hrefPrefix;
    if (
      ['Website', 'LinkedIn', 'GitHub'].includes(label) &&
      !value.startsWith('http') &&
      !value.startsWith('//')
    ) {
      finalHrefPrefix = 'https://';
    }

    const href = finalHrefPrefix + value;
    const isLink =
      finalHrefPrefix.startsWith('http') ||
      finalHrefPrefix.startsWith('mailto:') ||
      finalHrefPrefix.startsWith('tel:');

    // Extract display text for links to keep it clean (e.g. linkedin.com/in/user instead of full https...)
    let displayText = value;
    if (isLink && (label === 'LinkedIn' || label === 'GitHub' || label === 'Website')) {
      displayText = value.replace(/^https?:\/\//, '').replace(/^www\./, '');
    }

    return (
      <span className="inline-flex items-center gap-1">
        {/* Separator if needed, handled by parent flex gap */}
        {isLink ? (
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="hover:underline text-black"
          >
            {displayText}
          </a>
        ) : (
          <span className="text-black">{displayText}</span>
        )}
      </span>
    );
  };

  return (
    // A4 Ratio Container (approx width 210mm)
    // Using min-h-[297mm] to simulate A4 height if needed, but let's stick to auto for web
    <div className="font-serif bg-white text-black p-8 md:p-12 shadow-2xl max-w-[210mm] mx-auto min-h-[297mm] text-sm leading-normal">
      {/* --- Header Section --- */}
      {personalInfo && (
        <div className="mb-6 border-b-2 border-black pb-6">
          {personalInfo.name && (
            <h1 className="text-4xl font-bold tracking-tight uppercase mb-2">
              {personalInfo.name}
            </h1>
          )}

          <div className="flex flex-col md:flex-row md:justify-between md:items-end">
            {personalInfo.title && (
              <h2 className="text-xl font-mono text-gray-700 tracking-wide uppercase">
                {personalInfo.title}
              </h2>
            )}

            {/* Contact Grid */}
            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-mono mt-4 md:mt-0 text-gray-600 justify-end">
              {renderContactDetail('Email', personalInfo.email, 'mailto:')}
              <span>|</span>
              {renderContactDetail('Phone', personalInfo.phone, 'tel:')}
              {personalInfo.location && (
                <>
                  <span>|</span>
                  {renderContactDetail('Location', personalInfo.location)}
                </>
              )}
              {personalInfo.website && (
                <>
                  <span>|</span>
                  {renderContactDetail('Website', personalInfo.website)}
                </>
              )}
              {personalInfo.linkedin && (
                <>
                  <span>|</span>
                  {renderContactDetail('LinkedIn', personalInfo.linkedin)}
                </>
              )}
              {personalInfo.github && (
                <>
                  <span>|</span>
                  {renderContactDetail('GitHub', personalInfo.github)}
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* --- Summary Section --- */}
      {summary && (
        <div className="mb-8">
          <h3 className="text-lg font-bold uppercase border-b-2 border-black mb-3 tracking-wider">
            Summary
          </h3>
          <p className="text-justify leading-relaxed font-sans text-gray-800">{summary}</p>
        </div>
      )}

      {/* --- Work Experience Section --- */}
      {workExperience && workExperience.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold uppercase border-b-2 border-black mb-4 tracking-wider">
            Experience
          </h3>
          <div className="space-y-6">
            {workExperience.map((exp) => (
              <div key={exp.id}>
                <div className="flex justify-between items-baseline mb-1">
                  <h4 className="text-base font-bold">{exp.title}</h4>
                  <span className="font-mono text-xs text-gray-600 shrink-0 ml-4">{exp.years}</span>
                </div>

                <div className="flex justify-between items-center mb-2 font-mono text-sm text-gray-700">
                  <span>{exp.company}</span>
                  {exp.location && <span>{exp.location}</span>}
                </div>

                {exp.description && exp.description.length > 0 && (
                  <ul className="list-disc list-outside ml-4 space-y-1 text-gray-800 font-sans text-sm">
                    {exp.description.map((desc, index) => (
                      <li key={index} className="pl-1">
                        {desc}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Projects Section --- */}
      {personalProjects && personalProjects.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold uppercase border-b-2 border-black mb-4 tracking-wider">
            Projects
          </h3>
          <div className="space-y-5">
            {personalProjects.map((project) => (
              <div key={project.id}>
                <div className="flex justify-between items-baseline mb-1">
                  <h4 className="text-base font-bold">{project.name}</h4>
                  <span className="font-mono text-xs text-gray-600 shrink-0 ml-4">
                    {project.years}
                  </span>
                </div>
                {project.role && (
                  <p className="font-mono text-sm text-gray-700 mb-2">{project.role}</p>
                )}
                {project.description && project.description.length > 0 && (
                  <ul className="list-disc list-outside ml-4 space-y-1 text-gray-800 font-sans text-sm">
                    {project.description.map((desc, index) => (
                      <li key={index} className="pl-1">
                        {desc}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Education Section --- */}
      {education && education.length > 0 && (
        <div className="mb-8">
          <h3 className="text-lg font-bold uppercase border-b-2 border-black mb-4 tracking-wider">
            Education
          </h3>
          <div className="space-y-4">
            {education.map((edu) => (
              <div key={edu.id}>
                <div className="flex justify-between items-baseline">
                  <h4 className="text-base font-bold">{edu.institution}</h4>
                  <span className="font-mono text-xs text-gray-600 shrink-0 ml-4">{edu.years}</span>
                </div>
                <div className="flex justify-between font-mono text-sm text-gray-700">
                  <span>{edu.degree}</span>
                </div>
                {edu.description && (
                  <p className="mt-1 text-sm text-gray-800 font-sans">{edu.description}</p>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* --- Additional Section --- */}
      {additional &&
        (() => {
          if (!additional) return null;
          const {
            technicalSkills = [],
            languages = [],
            certificationsTraining = [],
            awards = [],
          } = additional;
          const hasContent =
            technicalSkills.length > 0 ||
            languages.length > 0 ||
            certificationsTraining.length > 0 ||
            awards.length > 0;
          if (!hasContent) return null;
          return (
            <div>
              <h3 className="text-lg font-bold uppercase border-b-2 border-black mb-4 tracking-wider">
                Skills & Awards
              </h3>

              <div className="space-y-3 font-sans text-sm">
                {technicalSkills.length > 0 && (
                  <div className="flex">
                    <span className="font-bold w-32 shrink-0">Technical Skills:</span>
                    <span className="text-gray-800">{technicalSkills.join(', ')}</span>
                  </div>
                )}
                {languages.length > 0 && (
                  <div className="flex">
                    <span className="font-bold w-32 shrink-0">Languages:</span>
                    <span className="text-gray-800">{languages.join(', ')}</span>
                  </div>
                )}
                {certificationsTraining.length > 0 && (
                  <div className="flex">
                    <span className="font-bold w-32 shrink-0">Certifications:</span>
                    <span className="text-gray-800">{certificationsTraining.join(', ')}</span>
                  </div>
                )}
                {awards.length > 0 && (
                  <div className="flex">
                    <span className="font-bold w-32 shrink-0">Awards:</span>
                    <span className="text-gray-800">{awards.join(', ')}</span>
                  </div>
                )}
              </div>
            </div>
          );
        })()}
    </div>
  );
};

export default Resume;
