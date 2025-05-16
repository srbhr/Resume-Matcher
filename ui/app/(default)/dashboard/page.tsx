import React from 'react';
import ResumeComponentApp from '@/components/common/resume-component';

export default function DashboardPage() {
	return (
		<div className="container mx-auto py-8 px-4">
			<div className="mb-8">
				<h1 className="text-3xl font-bold text-gray-100 mb-2">Your Resume</h1>
				<p className="text-gray-400">
					Below is your current resume. You can update it by uploading a new file in the
					resume section.
				</p>
			</div>

			<div className="mb-8">
				{/* Using the App component exported from resume-component.tsx */}
				<ResumeComponentApp />
			</div>

			<div className="mt-12 bg-gray-800 p-6 rounded-lg shadow-md">
				<h2 className="text-2xl font-bold text-gray-100 mb-4">Resume Match Analysis</h2>
				<p className="text-gray-300 mb-6">
					Upload job descriptions to see how well your resume matches with them.
				</p>
				<div className="bg-gray-700 p-4 rounded-lg text-center">
					<p className="text-gray-300 mb-2">No job descriptions analyzed yet</p>
					<a
						href="/onboarding/jobs"
						className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded transition-colors duration-200"
					>
						Upload Job Description
					</a>
				</div>
			</div>
		</div>
	);
}
