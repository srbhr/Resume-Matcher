// File: apps/frontend/app/dashboard/page.tsx


'use client';

import React, { useMemo, useState } from 'react';
import BackgroundContainer from '@/components/common/background-container';
import InsightsPanel from '@/components/dashboard/job-listings';
import ResumeAnalysis from '@/components/dashboard/resume-analysis';
import Resume from '@/components/dashboard/resume-component'; // rename import to match default export
import { useResumePreview } from '@/components/common/resume_previewer_context';
import { ChevronLeft, ChevronRight, CheckCircle, XCircle, AlertTriangle, Info } from 'lucide-react';

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
	workExperience: [
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
	personalProjects: [
		{
			id: 1,
			name: 'Analytical Engine Simulation',
			role: 'Project Lead',
			years: '1843',
			description: [
				'Produced a conceptual simulation of the Analytical Engine instructions.',
				'Documented assumptions and debugging notes for future collaborators.',
			],
		},
	],
	additional: {
		technicalSkills: ['Algorithm Design', 'Mathematical Modeling', 'Computational Theory'],
		languages: ['English (Native)', 'French (Fluent)'],
		certificationsTraining: ['Private Tutoring in Advanced Mathematics'],
		awards: ['Recognised as the first computer programmer'],
	},
};

export default function DashboardPage() {
	const { improvedData } = useResumePreview();
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
    const { resume_preview, new_score, original_score } = data;
    const preview = resume_preview ?? mockResumeData;
    const newPct = Math.round(new_score * 100);
    const originalPct = Math.round((original_score ?? 0) * 100);
    const [viewMode, setViewMode] = useState<'ats' | 'resume'>('ats');

	const skillComparison = useMemo(() => {
		const stats = (data.skill_comparison ?? []).filter((item) => (item.job_mentions ?? 0) > 0);
		return [...stats].sort((a, b) => {
			if (b.job_mentions !== a.job_mentions) return b.job_mentions - a.job_mentions;
			return b.resume_mentions - a.resume_mentions;
		});
	}, [data.skill_comparison]);

	const personalInfo = preview.personalInfo;
	const contactChecks = useMemo(
		() => [
			{ label: 'Address', ok: Boolean(personalInfo?.location) },
			{ label: 'Email', ok: Boolean(personalInfo?.email) },
			{ label: 'Phone number', ok: Boolean(personalInfo?.phone) },
		],
		[personalInfo?.location, personalInfo?.email, personalInfo?.phone]
	);

	const hasSummary = Boolean(preview.summary && preview.summary.trim().length > 0);
	const sectionChecks = useMemo(
		() => [
			{ label: 'Education section', ok: Boolean(preview.education && preview.education.length > 0) },
			{ label: 'Work experience section', ok: Boolean(preview.workExperience && preview.workExperience.length > 0) },
			{ label: 'Personal projects section', ok: Boolean(preview.personalProjects && preview.personalProjects.length > 0) },
		],
		[preview.education, preview.workExperience, preview.personalProjects]
	);

	const jobDescriptionText = data.job_description ?? '';
	const jobTitleGuess = useMemo(() => {
		if (!jobDescriptionText) return '';
		const firstLine = jobDescriptionText
			.split('\n')
			.map((line) => line.trim())
			.filter(Boolean)[0] || '';
		return firstLine.slice(0, 80).toLowerCase();
	}, [jobDescriptionText]);

	const jobTitleMatch = useMemo(() => {
		if (!jobTitleGuess) {
			return {
				status: 'info' as const,
				message: 'Could not detect a job title in the job description. Include it in your summary to improve searchability.',
			};
		}
		const updatedResume = (data.updated_resume_markdown ?? '').toLowerCase();
		const hasTitle = updatedResume.includes(jobTitleGuess);
		return hasTitle
			? {
				status: 'pass' as const,
				message: 'Job title (or close equivalent) appears in your resume summary or experience.',
			}
			: {
				status: 'fail' as const,
				message: `Add the job title or a close match ("${jobTitleGuess.slice(0, 60)}...") to your summary or most relevant role so recruiters can find you by title.`,
			};
	}, [data.updated_resume_markdown, jobTitleGuess]);

	const getStatusIcon = (status: 'pass' | 'fail' | 'warning' | 'info') => {
		const base = 'h-4 w-4';
		switch (status) {
			case 'pass':
				return <CheckCircle className={`${base} text-green-400`} />;
			case 'fail':
				return <XCircle className={`${base} text-red-400`} />;
			case 'warning':
				return <AlertTriangle className={`${base} text-yellow-400`} />;
			default:
				return <Info className={`${base} text-blue-300`} />;
		}
	};

	return (
		<BackgroundContainer className="min-h-screen" innerClassName="bg-zinc-950 backdrop-blur-sm overflow-auto">
			<div className="w-full h-full overflow-auto py-8 px-4 sm:px-6 lg:px-8">
				{/* Header */}
				<div className="container mx-auto">
					<header className="mb-10 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
						<div>
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
						<div>
							<button
								onClick={() => {
									window.location.href = '/jobs';
								}}
								className="inline-flex items-center justify-center rounded-md border border-purple-500/60 bg-purple-600/20 px-4 py-2 text-sm font-medium text-purple-100 hover:bg-purple-600/40 hover:text-white transition-colors"
							>
								Redo analysis
							</button>
						</div>
					</header>

					{/* Grid: left = analyzer + analysis, right = resume */}
					<div className="grid grid-cols-1 md:grid-cols-3 gap-8">
						{/* Left column */}
						<div className="space-y-8">
							<section>
								<ResumeAnalysis
									originalScore={originalPct}
									score={newPct}
									details={improvedData.data.details ?? ''}
									commentary={improvedData.data.commentary ?? ''}
									improvements={improvedData.data.improvements ?? []}
								/>
							</section>
							<section>
								<InsightsPanel
									details={improvedData.data.details}
									commentary={improvedData.data.commentary}
								/>
							</section>
						</div>

						{/* Right column */}
						<div className="md:col-span-2">
							<div className="bg-gray-900/70 backdrop-blur-sm p-6 rounded-lg shadow-xl h-full flex flex-col border border-gray-800/50">
								<div className="mb-6 flex items-start justify-between gap-3">
									<div>
										<h2 className="text-2xl font-bold text-white mb-1">
											{viewMode === 'ats' ? 'ATS Recommendations' : 'Your Resume'}
										</h2>
										<p className="text-gray-400 text-sm">
											{viewMode === 'ats'
												? 'See how the ATS scans your résumé and where keywords align.'
												: 'This is your updated résumé preview. Update it via the resume upload page.'}
										</p>
									</div>
									<div className="flex items-center gap-2">
										<button
											type="button"
											onClick={() => setViewMode('ats')}
											disabled={viewMode === 'ats'}
											className={`rounded-md border border-gray-700 bg-gray-800/70 p-2 transition-colors ${
												viewMode === 'ats'
													? 'cursor-not-allowed opacity-40'
													: 'text-gray-200 hover:text-white hover:bg-gray-700'
											}`}
											aria-label="Show ATS recommendations"
										>
											<ChevronLeft className="h-4 w-4" />
										</button>
										<button
											type="button"
											onClick={() => setViewMode('resume')}
											disabled={viewMode === 'resume'}
											className={`rounded-md border border-gray-700 bg-gray-800/70 p-2 transition-colors ${
												viewMode === 'resume'
													? 'cursor-not-allowed opacity-40'
													: 'text-gray-200 hover:text-white hover:bg-gray-700'
											}`}
											aria-label="Show resume preview"
										>
											<ChevronRight className="h-4 w-4" />
										</button>
									</div>
								</div>
								<div className="flex-grow overflow-auto">
									{viewMode === 'resume' ? (
										<Resume resumeData={preview} />
									) : (
										<div className="space-y-6">
											<div className="rounded-md border border-gray-800 bg-gray-900/70 p-3">
												<div className="flex items-start gap-3">
													{getStatusIcon('warning')}
													<div>
														<p className="text-sm font-semibold text-gray-100">ATS Tip</p>
														<p className="text-sm text-gray-300">
															Mention the company name and (if relevant) its website in your summary or cover letter so ATS tools can tailor job-specific guidance.
														</p>
													</div>
												</div>
											</div>

											<div className="rounded-md border border-gray-800 bg-gray-900/70 p-3 space-y-2">
												<div className="flex items-start gap-3">
													{getStatusIcon(
														contactChecks.every((item) => item.ok)
															? 'pass'
															: contactChecks.some((item) => item.ok)
															? 'warning'
															: 'fail'
														)}
													<div className="flex-1">
														<p className="text-sm font-semibold text-gray-100">Contact Information</p>
														<ul className="text-sm text-gray-300 space-y-1 mt-1">
															{contactChecks.map((item) => (
																<li key={item.label} className="flex items-center gap-2">
																	{getStatusIcon(item.ok ? 'pass' : 'fail')}
																	<span>{item.ok ? `${item.label} found.` : `${item.label} missing.`}</span>
																</li>
															))}
														</ul>
													</div>
												</div>
											</div>

											<div className="rounded-md border border-gray-800 bg-gray-900/70 p-3">
												<div className="flex items-start gap-3">
													{getStatusIcon(hasSummary ? 'pass' : 'fail')}
													<div>
														<p className="text-sm font-semibold text-gray-100">Summary</p>
														<p className="text-sm text-gray-300">
															{hasSummary
																	? 'Résumé summary detected. Keep it concise and keyword-rich to help hiring managers scan quickly.'
																	: 'No summary section found. Add a short, keyword-focused synopsis at the top to strengthen ATS matching.'}
														</p>
													</div>
												</div>
											</div>
											<div className="rounded-md border border-gray-800 bg-gray-900/70 p-3 space-y-2">
												<div className="flex items-start gap-3">
													{getStatusIcon(sectionChecks.every((item) => item.ok) ? 'pass' : 'warning')}
													<div className="flex-1">
														<p className="text-sm font-semibold text-gray-100">Section Headings</p>
														<ul className="text-sm text-gray-300 space-y-1 mt-1">
															{sectionChecks.map((item) => (
																<li key={item.label} className="flex items-center gap-2">
																	{getStatusIcon(item.ok ? 'pass' : 'fail')}
																	<span>{item.ok ? `${item.label} detected.` : `${item.label} missing or empty.`}</span>
																</li>
															))}
														</ul>
														<p className="text-xs text-gray-500 mt-2">
															Use standard headings so ATS parsers map your information correctly.
														</p>
													</div>
												</div>
											</div>

											<div className="rounded-md border border-gray-800 bg-gray-900/70 p-3">
												<div className="flex items-start gap-3">
													{getStatusIcon(jobTitleMatch.status)}
													<div>
														<p className="text-sm font-semibold text-gray-100">Job Title Match</p>
														<p className="text-sm text-gray-300">{jobTitleMatch.message}</p>
													</div>
												</div>
											</div>
										<section>
											<h4 className="text-lg font-semibold text-purple-300 mb-3">Skill Comparison</h4>
											{skillComparison.length > 0 ? (
												<div className="overflow-auto border border-gray-800 rounded-md">
													<table className="min-w-full text-sm text-gray-200">
														<thead className="bg-gray-900/80 text-gray-300 uppercase text-xs">
															<tr>
																<th className="px-4 py-2 text-left">Skill</th>
																<th className="px-4 py-2 text-right">New Résumé</th>
																<th className="px-4 py-2 text-right">Job Description</th>
															</tr>
														</thead>
														<tbody>
															{skillComparison.map((entry) => (
																<tr key={entry.skill} className="border-t border-gray-800">
																	<td className="px-4 py-2 text-gray-100">{entry.skill}</td>
																	<td className="px-4 py-2 text-right text-gray-300">
																		{entry.resume_mentions > 0 ? (
																			<span>{entry.resume_mentions}</span>
																		) : (
																			<span className="inline-flex items-center justify-end gap-1 text-red-400">
																			<XCircle className="h-4 w-4" />
																			0
																		</span>
																		)}
																	</td>
																	<td className="px-4 py-2 text-right text-gray-300">
																		{entry.job_mentions > 0 ? (
																			<span>{entry.job_mentions}</span>
																		) : (
																			<span className="inline-flex items-center justify-end gap-1 text-red-400">
																			<XCircle className="h-4 w-4" />
																			0
																		</span>
																		)}
																	</td>
																</tr>
															))}
														</tbody>
													</table>
												</div>
											) : (
												<p className="text-sm text-gray-400">
													No job keywords were detected for comparison.
												</p>
											)}
										</section>
									</div>
							)}
							</div>
						</div>
					</div>
				</div>
			</div>
		</div>
	</BackgroundContainer>
	);
}
