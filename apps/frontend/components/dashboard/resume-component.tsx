import React from 'react';

interface PersonalInfo {
	name?: string;
	title?: string;
	email?: string;
	phone?: string;
	location?: string;
	website?: string;
	linkedin?: string;
	github?: string;
}

interface Experience {
    id: number;
    title?: string;
    company?: string;
    location?: string;
    years?: string;
    description?: string[];
}

interface Education {
    id: number;
    institution?: string;
    degree?: string;
    years?: string;
    description?: string;
}

interface Project {
    id: number;
    name?: string;
    role?: string;
    years?: string;
    description?: string[];
}

interface AdditionalInfo {
    technicalSkills?: string[];
    languages?: string[];
    certificationsTraining?: string[];
    awards?: string[];
}

interface ResumeData {
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
    console.log('Rendering Resume Component with data:', resumeData);
    const { personalInfo, summary, workExperience, education, personalProjects, additional } = resumeData;

	// Helper function to render contact details only if they exist
	const renderContactDetail = (label: string, value?: string, hrefPrefix: string = '') => {
		if (!value) return null;
		// Ensure website, linkedin, github links start with https:// if not already present
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

		return (
			<div className="text-sm">
				<span className="font-semibold text-gray-200">{label}:</span>{' '}
				{isLink ? (
					<a
						href={href}
						target="_blank"
						rel="noopener noreferrer"
						className="text-blue-400 hover:underline break-all"
					>
						{value}
					</a>
				) : (
					<span className="break-all text-gray-300">{value}</span>
				)}
			</div>
		);
	};

	return (
		// Main container with dark background and base text color
		<div className="font-mono bg-gray-950 text-gray-300 p-4 shadow-lg rounded-lg max-w-4xl mx-auto border border-gray-600">
			{/* --- Personal Info Section --- */}
			{personalInfo && (
				<div className="text-center mb-4 text-md pb-6 border-gray-700">
					{/* Lighter text for main headings */}
					{personalInfo.name && (
						<h1 className="text-3xl font-bold mb-2 text-white">{personalInfo.name}</h1>
					)}
					{/* Slightly lighter text for subtitle */}
					{personalInfo.title && (
						<h2 className="text-xl text-gray-400 mb-4">{personalInfo.title}</h2>
					)}
					<div className="grid grid-cols-3 gap-1 text-left px-2">
						{renderContactDetail('Email', personalInfo.email, 'mailto:')}
						{renderContactDetail('Phone', personalInfo.phone, 'tel:')}
						{renderContactDetail('Location', personalInfo.location)}
						{renderContactDetail('Website', personalInfo.website)}
						{renderContactDetail('LinkedIn', personalInfo.linkedin)}
						{renderContactDetail('GitHub', personalInfo.github)}
					</div>
				</div>
			)}

			{/* --- Summary Section --- */}
			{summary && (
				<div className="mb-8">
					{/* Lighter text for section titles */}
					<h3 className="text-xl font-semibold border-b border-gray-700 pb-2 mb-3 text-gray-100">
						Summary
					</h3>
					{/* Base text color for paragraph */}
					<p className="text-sm leading-relaxed">{summary}</p>
				</div>
			)}

			{/* --- Work Experience Section --- */}
			{workExperience && workExperience.length > 0 && (
				<div className="mb-8">
					<h3 className="text-xl font-semibold border-b border-gray-700 pb-2 mb-4 text-gray-100">
						Work Experience
					</h3>
					{workExperience.map((exp) => (
						<div key={exp.id} className="mb-5 pl-4 border-l-2 border-blue-500">
							{/* Lighter text for job titles */}
							{exp.title && (
								<h4 className="text-lg font-semibold text-gray-100">{exp.title}</h4>
							)}
							{/* Adjusted gray for company/location */}
							{exp.company && (
								<p className="text-md font-medium text-gray-400">
									{exp.company} {exp.location && `| ${exp.location}`}
								</p>
							)}
							{/* Adjusted gray for dates */}
							{exp.years && <p className="text-sm text-gray-500 mb-2">{exp.years}</p>}
							{exp.description && exp.description.length > 0 && (
								// Base text color for list items
								<ul className="list-disc list-outside ml-5 text-sm space-y-1">
									{exp.description.map((desc, index) => (
										<li key={index}>{desc}</li>
									))}
								</ul>
							)}
						</div>
					))}
				</div>
			)}

			{/* --- Education Section --- */}
			{education && education.length > 0 && (
				<div className="mb-8">
					<h3 className="text-xl font-semibold border-b border-gray-700 pb-2 mb-4 text-gray-100">
						Education
					</h3>
					{education.map((edu) => (
						<div key={edu.id} className="mb-5 pl-4 border-l-2 border-green-500">
							{/* Lighter text for institution */}
							{edu.institution && (
								<h4 className="text-lg font-semibold text-gray-100">
									{edu.institution}
								</h4>
							)}
							{/* Adjusted gray for degree */}
							{edu.degree && (
								<p className="text-md font-medium text-gray-400">{edu.degree}</p>
							)}
							{/* Adjusted gray for dates */}
							{edu.years && <p className="text-sm text-gray-500 mb-2">{edu.years}</p>}
							{/* Base text color for description */}
							{edu.description && <p className="text-sm">{edu.description}</p>}
						</div>
					))}
				</div>
			)}

			{/* --- Personal Projects Section --- */}
			{personalProjects && personalProjects.length > 0 && (
				<div className="mb-8">
					<h3 className="text-xl font-semibold border-b border-gray-700 pb-2 mb-4 text-gray-100">
						Personal Projects
					</h3>
					{personalProjects.map((project) => (
						<div key={project.id} className="mb-5 pl-4 border-l-2 border-purple-500">
							{project.name && (
								<h4 className="text-lg font-semibold text-gray-100">{project.name}</h4>
							)}
							{project.role && (
								<p className="text-md font-medium text-gray-400">{project.role}</p>
							)}
							{project.years && <p className="text-sm text-gray-500 mb-2">{project.years}</p>}
							{project.description && project.description.length > 0 && (
								<ul className="list-disc list-outside ml-5 text-sm space-y-1">
									{project.description.map((desc, index) => (
										<li key={index}>{desc}</li>
									))}
								</ul>
							)}
						</div>
					))}
				</div>
			)}

			{/* --- Additional Section --- */}
			{additional && (
				(() => {
					if (!additional) return null;
					const { technicalSkills = [], languages = [], certificationsTraining = [], awards = [] } = additional;
					const hasContent =
						technicalSkills.length > 0 ||
						languages.length > 0 ||
						certificationsTraining.length > 0 ||
						awards.length > 0;
					if (!hasContent) return null;
					return (
						<div>
							<h3 className="text-xl font-semibold border-b border-gray-700 pb-2 mb-3 text-gray-100">
								Additional
							</h3>
							<div className="grid gap-4 md:grid-cols-2">
								{technicalSkills.length > 0 && (
									<div>
										<h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-1">
											Technical Skills
										</h4>
										<ul className="text-sm text-gray-300 list-disc ml-5 space-y-1">
											{technicalSkills.map((skill, index) => (
												<li key={index}>{skill}</li>
											))}
										</ul>
									</div>
								)}
								{languages.length > 0 && (
									<div>
										<h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-1">
											Languages
										</h4>
										<ul className="text-sm text-gray-300 list-disc ml-5 space-y-1">
											{languages.map((language, index) => (
												<li key={index}>{language}</li>
											))}
										</ul>
									</div>
								)}
								{certificationsTraining.length > 0 && (
									<div>
										<h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-1">
											Certifications & Training
										</h4>
										<ul className="text-sm text-gray-300 list-disc ml-5 space-y-1">
											{certificationsTraining.map((item, index) => (
												<li key={index}>{item}</li>
											))}
										</ul>
									</div>
								)}
								{awards.length > 0 && (
									<div>
										<h4 className="text-sm font-semibold text-gray-300 uppercase tracking-wide mb-1">
											Awards
										</h4>
										<ul className="text-sm text-gray-300 list-disc ml-5 space-y-1">
											{awards.map((award, index) => (
												<li key={index}>{award}</li>
											))}
										</ul>
									</div>
								)}
							</div>
						</div>
					);
				})()
			)}
		</div>
	);
};

export default Resume;
