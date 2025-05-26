import React from 'react';

const mockResumeData = {
	personalInfo: {
		name: 'Ada Lovelace',
		title: 'Software Engineer & Visionary',
		email: 'ada.lovelace@example.com',
		phone: '+1-234-567-8900',
		location: 'London, UK',
		website: 'analyticalengine.dev',
		linkedin: 'linkedin.com/in/adalovelace',
		github: 'github.com/adalovelace',
	},
	summary:
		'Pioneering computer programmer with a strong foundation in mathematics and analytical thinking. Known for writing the first algorithm intended to be carried out by a machine. Seeking challenging opportunities to apply analytical skills to modern computing problems.',
	experience: [
		{
			id: 1,
			title: 'Collaborator & Algorithm Designer',
			company: "Charles Babbage's Analytical Engine Project",
			location: 'London, UK',
			years: '1842 - 1843',
			description: [
				"Developed the first published algorithm intended for implementation on a computer, Charles Babbage's Analytical Engine.",
				"Translated Luigi Menabrea's memoir on the Analytical Engine, adding extensive notes (Notes G) which included the algorithm.",
				'Foresaw the potential for computers to go beyond mere calculation, envisioning applications in music and art.',
			],
		},
	],
	education: [
		{
			id: 1,
			institution: 'Self-Taught & Private Tutoring',
			degree: 'Mathematics and Science',
			years: 'Early 19th Century',
			description:
				'Studied mathematics and science extensively under tutors like Augustus De Morgan, a prominent mathematician.',
		},
		// Add more education objects here if needed
	],
	skills: [
		'Algorithm Design',
		'Analytical Thinking',
		'Mathematical Modeling',
		'Computational Theory',
		'Technical Writing',
		'French (Translation)',
		'Symbolic Logic',
	],
};

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

interface ResumeData {
	personalInfo?: PersonalInfo;
	summary?: string;
	experience?: Experience[];
	education?: Education[];
	skills?: string[];
}

interface ResumeProps {
	resumeData: ResumeData;
}

const Resume: React.FC<ResumeProps> = ({ resumeData }) => {
	const { personalInfo, summary, experience, education, skills } = resumeData;

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

export default function App() {
	const resumeData = mockResumeData;

	return (
		<div className="bg-zinc-950 min-h-screen">
			<Resume resumeData={resumeData} />
		</div>
	);
}
