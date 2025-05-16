import React from 'react';
import ResumeComponentApp from '@/components/common/resume-component';

// It's recommended to create this JobListings component in a new file,
// for example: '@/components/dashboard/job-listings.tsx'
// For now, it's defined here for completeness of the example.
const JobListings = () => {
	// Dummy data for demonstration - replace with your actual data fetching
	const jobs = [
		{ id: 1, title: 'Software Engineer', company: 'Tech Solutions Inc.', location: 'Remote' },
		{
			id: 2,
			title: 'Senior Product Manager',
			company: 'Innovate Hub',
			location: 'New York, NY',
		},
		{
			id: 3,
			title: 'UX/UI Designer',
			company: 'Creative Designs Co.',
			location: 'San Francisco, CA',
		},
		// Add more jobs or fetch them from an API
	];

	return (
		<div className="bg-gray-800 p-6 rounded-lg shadow-xl h-full flex flex-col">
			<h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600 mb-1">
				Job Postings
			</h2>
			<p className="text-gray-400 mb-6 text-sm">
				Select a job to analyze against your resume.
			</p>
			{jobs.length > 0 ? (
				<div className="flex-grow overflow-y-auto space-y-4 pr-2">
					{' '}
					{/* Added scroll for long lists */}
					{jobs.map((job) => (
						<div
							key={job.id}
							className="p-4 bg-gray-700 rounded-md hover:bg-gray-600/70 cursor-pointer transition-all duration-200 ease-in-out shadow-md"
						>
							<h3 className="text-lg font-semibold text-gray-100">{job.title}</h3>
							<p className="text-sm text-gray-300">{job.company}</p>
							<p className="text-xs text-gray-400 mt-1">{job.location}</p>
						</div>
					))}
				</div>
			) : (
				<div className="text-center text-gray-400 py-8 flex-grow flex flex-col justify-center items-center">
					<p className="mb-3">No job descriptions found.</p>
					<a
						href="/onboarding/jobs" // Update this link if necessary
						className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 text-sm"
					>
						Upload Job Description
					</a>
				</div>
			)}
			<div className="mt-auto pt-4">
				{' '}
				{/* Ensures button is at the bottom */}
				<a
					href="/onboarding/jobs" // Update this link if necessary
					className="w-full text-center block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-md transition-colors duration-200 text-sm"
				>
					Upload New Job Description
				</a>
			</div>
		</div>
	);
};

export default function DashboardPage() {
	return (
		<div className="min-h-screen bg-gray-900 text-gray-100 py-8 px-4 sm:px-6 lg:px-8">
			<div className="container mx-auto">
				<div className="mb-10 text-center">
					<h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-500 to-purple-500 pb-2">
						Your Dashboard
					</h1>
					<p className="text-gray-400 text-lg">
						Manage your resume and analyze its match with job descriptions.
					</p>
				</div>

				{/* Two-column layout for desktop (md and up) */}
				<div className="flex flex-col md:flex-row gap-8">
					{/* Left Column: Job Listings */}
					<div className="w-full md:w-1/3">
						<JobListings />
					</div>

					{/* Right Column: Resume Display */}
					<div className="w-full md:w-2/3">
						<div className="bg-gray-800 p-6 rounded-lg shadow-xl h-full flex flex-col">
							<div className="mb-6">
								<h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600 mb-1">
									Your Resume
								</h1>
								<p className="text-gray-400 text-sm">
									This is your active resume. Update it via the resume upload
									page.
								</p>
							</div>
							{/* Ensure ResumeComponentApp can fit well or handle its own scrolling */}
							<div className="flex-grow rounded-md overflow-hidden">
								<ResumeComponentApp />
							</div>
						</div>
					</div>
				</div>

				{/* Resume Match Analysis Section - Below the two-column layout */}
				<div className="mt-12 bg-gray-800 p-6 rounded-lg shadow-xl">
					<h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600 mb-4">
						Resume Match Analysis
					</h2>
					<p className="text-gray-300 mb-6">
						After selecting a job posting from the list, the match analysis against your
						resume will appear here.
					</p>
					<div className="bg-gray-700 p-6 rounded-lg text-center">
						<p className="text-gray-400">
							Select a job description to view the analysis.
						</p>
					</div>
				</div>
			</div>
		</div>
	);
}
