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

interface Project {
	id: number;
	title?: string;
	description?: string[];
	tech?: string[];
	link?: string;
	years?: string;
}

interface Education {
	id: number;
	institution?: string;
	degree?: string;
	years?: string;
	description?: string;
}

interface ResumeData {
	personalInfo?: PersonalInfo;
	summary?: string;
	experience?: Experience[];
	projects?: Project[];
	education?: Education[];
	skills?: string[];
}

interface ResumeProps {
	resumeData: ResumeData;
}

const Resume: React.FC<ResumeProps> = ({ resumeData }) => {
	console.log('Rendering Resume Component with data:', resumeData);
	const { personalInfo, summary, experience, projects, education, skills } = resumeData;

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

			{/* --- Experience Section --- */}
			{experience && experience.length > 0 && (
				<div className="mb-8">
					<h3 className="text-xl font-semibold border-b border-gray-700 pb-2 mb-4 text-gray-100">
						Experience
					</h3>
					{experience.map((exp) => (
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
			
			{/* --- Projects Section --- */}

			{projects && projects.length > 0 && (
				<div className="mb-8">
					<h3 className="text-xl font-semibold border-b border-gray-700 pb-2 mb-4 text-gray-100">
						Projects
					</h3>
					{projects.map((project) => (
						<div key={project.id} className="mb-5 pl-4 border-l-2 border-yellow-500">
							{(() => {
								const techInline = project.tech && project.tech.length > 0 ? project.tech.join(', ') : '';
								return (
									<h4 className="text-lg font-semibold text-gray-100">
										{project.title}
										{techInline ? (
											<span className="font-normal italic text-gray-400 text-sm">{' '}| {techInline}</span>
										) : null}
									</h4>
								);
							})()}
							{project.description && project.description.length > 0 && (
								<ul className="list-disc list-outside ml-5 text-sm space-y-1">
									{project.description.map((desc, index) => (
										<li key={index}>{desc}</li>
									))}
								</ul>
							)}
							{project.link && (
								<p className="text-sm text-gray-500 mb-2">
									{(() => {
										const url = project.link?.trim();
										const safe = url && /^https?:\/\//i.test(url) ? url : null;
										return safe ? (
											<a href={safe} target="_blank" rel="noopener noreferrer" className="text-blue-400 hover:underline break-all">
												{safe}
											</a>
										) : (
											<span className="break-all">{project.link}</span>
										);
									})()}
								</p>
							)}
							{project.years && <p className="text-sm text-gray-500 mb-2">{project.years}</p>}
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

			{/* --- Skills Section --- */}
			{skills && skills.length > 0 && (
				<div>
					<h3 className="text-xl font-semibold border-b border-gray-700 pb-2 mb-3 text-gray-100">
						Skills
					</h3>
					<div className="flex flex-wrap gap-2">
						{skills.map(
							(skill, index) =>
								// Adjusted background and text for skill tags
								skill && (
									<span
										key={index}
										className="bg-gray-700 text-gray-200 text-xs font-medium px-3 py-1 rounded-full"
									>
										{skill}
									</span>
								),
						)}
					</div>
				</div>
			)}
		</div>
	);
};

export default Resume;