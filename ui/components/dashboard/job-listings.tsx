import React, { useState } from 'react';
import PasteJobDescription from './paste-job-description'; // Import the new component

interface Job {
	id: number;
	title: string;
	company: string;
	location: string;
	// description?: string; // Add this if you have a longer description field to truncate
}

interface JobListingsProps {
	jobs: Job[];
	characterLimit?: number;
	onUploadJob: (text: string) => void; // Callback for when a job is pasted
}

const JobListings: React.FC<JobListingsProps> = ({ jobs, characterLimit, onUploadJob }) => {
	const [isModalOpen, setIsModalOpen] = useState(false);

	const handleOpenModal = () => setIsModalOpen(true);
	const handleCloseModal = () => setIsModalOpen(false);

	const handlePasteJob = (text: string) => {
		// Here you would typically call an API to save the job description
		// For now, we'll just call the onUploadJob prop
		console.log('Pasted job description:', text);
		onUploadJob(text);
		// You might want to refresh the job list or give feedback to the user
	};

	const truncateText = (text: string, limit: number) => {
		if (text.length <= limit) {
			return text;
		}
		return text.substring(0, limit) + '...';
	};

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
					{jobs.map((job) => (
						<div
							key={job.id}
							className="p-4 bg-gray-700 rounded-md hover:bg-gray-600/70 cursor-pointer transition-all duration-200 ease-in-out shadow-md"
						>
							<h3 className="text-lg font-semibold text-gray-100">
								{characterLimit
									? truncateText(job.title, characterLimit)
									: job.title}
							</h3>
							<p className="text-sm text-gray-300">{job.company}</p>
							<p className="text-xs text-gray-400 mt-1">{job.location}</p>
						</div>
					))}
				</div>
			) : (
				<div className="text-center text-gray-400 py-8 flex-grow flex flex-col justify-center items-center">
					<p className="mb-3">No job descriptions found.</p>
					<button
						onClick={handleOpenModal} // Changed from href to onClick
						className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 text-sm"
					>
						Upload Job Description
					</button>
				</div>
			)}
			<div className="mt-auto pt-4">
				<button
					onClick={handleOpenModal} // Changed from href to onClick
					className="w-full text-center block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2.5 px-4 rounded-md transition-colors duration-200 text-sm"
				>
					Upload New Job Description
				</button>
			</div>
			{isModalOpen && (
				<PasteJobDescription onClose={handleCloseModal} onPaste={handlePasteJob} />
			)}
		</div>
	);
};

export default JobListings;
