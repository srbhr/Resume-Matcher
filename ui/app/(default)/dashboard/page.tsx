'use client';

import React from 'react';
import ResumeComponentApp from '@/components/dashboard/resume-component';
import JobListings from '@/components/dashboard/job-listings'; // Import the new component

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
];

export default function DashboardPage() {
	const handleJobUpload = (text: string) => {
		// Handle the job upload logic here
		console.log('Job text uploaded:', text);
	};

	return (
		<div className="min-h-screen bg-zinc-950 text-gray-100 py-8 px-4 sm:px-6 lg:px-8">
			<div className="container mx-auto">
				<div className="mb-10">
					<h1 className="text-4xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 via-blue-500 to-purple-500 pb-2">
						Your Dashboard
					</h1>
					<p className="text-gray-300 text-lg">
						Manage your resume and analyze its match with job descriptions.
					</p>
				</div>

				<div className="flex flex-col md:flex-row gap-8">
					{/* Left Column: Job Listings */}
					<div className="w-1/3">
						{/* Use the new JobListings component and pass the jobs data and characterLimit prop */}
						<JobListings
							jobs={jobs}
							characterLimit={150}
							onUploadJob={handleJobUpload}
						/>
					</div>

					{/* Right Column: Resume Display */}
					<div className="w-full md:w-2/3">
						<div className="bg-gray-800 p-6 rounded-lg shadow-xl h-full flex flex-col">
							<div className="mb-6">
								<h1 className="text-3xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600 mb-1">
									Your Resume
								</h1>
								<p className="text-gray-400 text-sm">
									This is your resume. Update it via the resume upload page.
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
