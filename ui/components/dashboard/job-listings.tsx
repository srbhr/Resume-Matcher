import React, { useState } from 'react';
import PasteJobDescription from './paste-job-description';

interface Job {
	// Assuming id might be optional or not returned by analysis for a single display
	id?: number;
	title: string;
	company: string;
	location: string;
	// description?: string; // Raw description is input, not necessarily stored on this Job type after analysis
}

// Type for the data expected from the analysis backend
type AnalyzedJobData = Pick<Job, 'title' | 'company' | 'location'>;

interface JobListingsProps {
	// jobs prop removed
	// characterLimit prop removed
	onUploadJob: (text: string) => Promise<AnalyzedJobData | null>; // Updated prop
}

const JobListings: React.FC<JobListingsProps> = ({ onUploadJob }) => {
	const [isModalOpen, setIsModalOpen] = useState(false);
	const [analyzedJob, setAnalyzedJob] = useState<AnalyzedJobData | null>(null);
	const [isAnalyzing, setIsAnalyzing] = useState(false);
	// Optional: add error state for analysis failures
	// const [error, setError] = useState<string | null>(null);

	const handleOpenModal = () => {
		// setError(null); // Clear previous errors when opening modal
		setIsModalOpen(true);
	};
	const handleCloseModal = () => setIsModalOpen(false);

	const handlePasteAndAnalyzeJob = async (text: string) => {
		setIsAnalyzing(true);
		setAnalyzedJob(null); // Clear previous job
		// setError(null); // Clear previous errors
		try {
			const jobData = await onUploadJob(text);
			setAnalyzedJob(jobData);
			if (!jobData) {
				// Handle case where analysis returns null (e.g., failed to parse)
				// setError("Failed to analyze job description.");
				console.warn('Analysis returned no data.');
			}
		} catch (err) {
			console.error('Error analyzing job description:', err);
			// setError(err instanceof Error ? err.message : "An unknown error occurred during analysis.");
			setAnalyzedJob(null);
		} finally {
			setIsAnalyzing(false);
			handleCloseModal();
		}
	};

	// truncateText function removed as it's no longer used

	return (
		<div className="bg-gray-800 p-6 rounded-lg shadow-xl">
			{' '}
			{/* Removed h-full, flex flex-col */}
			<h2 className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-blue-600 mb-1">
				Job Analyzer {/* Changed title */}
			</h2>
			<p className="text-gray-400 mb-6 text-sm">
				{analyzedJob
					? 'Analyzed job details below.'
					: 'Upload a job description to analyze its key details.'}
			</p>
			{isAnalyzing ? (
				<div className="text-center text-gray-400 py-8">
					<p>Analyzing job description...</p>
					{/* Optional: Add a spinner here */}
				</div>
			) : analyzedJob ? (
				<div className="space-y-4">
					<div
						// key is not needed for a single item display
						className="p-4 bg-gray-700 rounded-md shadow-md"
					>
						<h3 className="text-lg font-semibold text-gray-100">{analyzedJob.title}</h3>
						<p className="text-sm text-gray-300">{analyzedJob.company}</p>
						<p className="text-xs text-gray-400 mt-1">{analyzedJob.location}</p>
					</div>
					<button
						onClick={handleOpenModal}
						className="w-full text-center block bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-4 rounded-md transition-colors duration-200 text-sm mt-4"
					>
						Analyze Another Job Description
					</button>
				</div>
			) : (
				<div className="text-center text-gray-400 py-8 flex flex-col justify-center items-center">
					{/* Optional: Display error message here if setError is implemented */}
					{/* {error && <p className="text-red-400 mb-3">{error}</p>} */}
					<p className="mb-3">No job description analyzed yet.</p>
					<button
						onClick={handleOpenModal}
						className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 text-sm"
					>
						Upload Job Description
					</button>
				</div>
			)}
			{/* Removed the always-visible bottom button as its functionality is covered */}
			{isModalOpen && (
				<PasteJobDescription
					onClose={handleCloseModal}
					onPaste={handlePasteAndAnalyzeJob}
				/>
			)}
		</div>
	);
};

export default JobListings;
