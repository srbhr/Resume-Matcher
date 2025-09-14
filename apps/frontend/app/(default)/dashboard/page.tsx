// File: apps/frontend/app/dashboard/page.tsx


'use client';

import React from 'react';
import BackgroundContainer from '@/components/common/background-container';
import JobListings from '@/components/dashboard/job-listings';
import ResumeAnalysis from '@/components/dashboard/resume-analysis';
import Resume from '@/components/dashboard/resume-component'; // rename import to match default export
import { useResumePreview } from '@/components/common/resume_previewer_context';
// import { analyzeJobDescription } from '@/lib/api/jobs';

interface AnalyzedJobData {
	title: string;
	company: string;
	location: string;
}

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
	projects: [
		{
			id: 1,
			title: 'Analytical Engine',
			description: ['Developed the first published algorithm intended for implementation on a computer, Charles Babbage\'s Analytical Engine.'],
			tech: ['Mathematics', 'Computational Theory'],
			link: 'https://en.wikipedia.org/wiki/Analytical_Engine',
			years: '1842 - 1843',
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

export default function DashboardPage() {
	const { improvedData } = useResumePreview();
	console.log('Improved Data:', improvedData);
	if (!improvedData) {
		return (
			<BackgroundContainer className="min-h-screen" innerClassName="bg-zinc-950">
				<div className="flex items-center justify-center h-full p-6 text-gray-400">
					No improved resume found. Please click “Improve” on the Job Upload page first.
				</div>
			</BackgroundContainer>
		);
	}

	const { data } = improvedData;
	const { resume_preview, new_score } = data;
	const preview = resume_preview ?? mockResumeData;
	const newPct = Math.round(new_score * 100);

	const handleJobUpload = async (text: string): Promise<AnalyzedJobData | null> => {
		void text; // Prevent unused variable warning
		alert('Job analysis not implemented yet.');
		return null;
	};


	return (
		<BackgroundContainer className="min-h-screen" innerClassName="bg-zinc-950 backdrop-blur-sm overflow-auto">
			<div className="w-full h-full overflow-auto py-8 px-4 sm:px-6 lg:px-8">
				{/* Header */}
				<div className="container mx-auto">
					<div className="mb-10">
						<h1 className="text-3xl font-semibold pb-2 text-white">
							Your{' '}
							<span className="bg-gradient-to-r from-pink-400 to-purple-400 text-transparent bg-clip-text">
								Resume Matcher
							</span>{' '}
							Dashboard
						</h1>
						<p className="text-gray-300 text-lg">
							Manage your resume and analyze its match with job descriptions.
						</p>
					</div>

					{/* Grid: left = analyzer + analysis, right = resume */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
						{/* Left column */}
						<div className="space-y-8">
							<section>
								<JobListings onUploadJob={handleJobUpload} />
							</section>
							<section>
								<ResumeAnalysis
									score={newPct}
									details={improvedData.data.details ?? ''}
									commentary={improvedData.data.commentary ?? ''}
									improvements={improvedData.data.improvements ?? []}
								/>
							</section>
						</div>

						{/* Right column */}
						<div className="md:col-span-2">
							<div className="bg-gray-900/70 backdrop-blur-sm p-6 rounded-lg shadow-xl h-full flex flex-col border border-gray-800/50">
								<div className="mb-6">
									<h2 className="text-2xl font-bold text-white mb-1">Your Resume</h2>
									<p className="text-gray-400 text-sm">
										This is your resume. Update it via the resume upload page.
									</p>
								</div>
								<div className="flex-grow overflow-auto">
									<Resume resumeData={preview} />
								</div>
							</div>
						</div>
					</div>
				</div>
			</div>
		</BackgroundContainer>
	);
}