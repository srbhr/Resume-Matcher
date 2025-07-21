import React, { useState } from 'react';
import PasteJobDescription from './paste-job-description';

/**
 * Interface for job data structure
 * @interface Job
 * @property {number} [id] - Optional job ID
 * @property {string} title - Job title
 * @property {string} company - Company name
 * @property {string} location - Job location
 */
interface Job {
  id?: number;
  title: string;
  company: string;
  location: string;
}

/**
 * Type for analyzed job data returned from backend
 * @type AnalyzedJobData
 */
type AnalyzedJobData = Pick<Job, 'title' | 'company' | 'location'>;

/**
 * Props for the JobListings component
 * @interface JobListingsProps
 * @property {(text: string) => Promise<AnalyzedJobData | null>} onUploadJob - Function to analyze job description
 */
interface JobListingsProps {
  onUploadJob: (text: string) => Promise<AnalyzedJobData | null>;
}

/**
 * JobListings Component
 * Displays a job analyzer interface, allowing users to upload and view analyzed job descriptions.
 * Shows loading state during analysis and handles single job display.
 * @param {JobListingsProps} props - Component props
 * @returns {JSX.Element} The rendered job analyzer component
 */
const JobListings: React.FC<JobListingsProps> = ({ onUploadJob }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [analyzedJob, setAnalyzedJob] = useState<AnalyzedJobData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);

  const handleOpenModal = () => {
    setIsModalOpen(true);
  };

  const handleCloseModal = () => setIsModalOpen(false);

  const handlePasteAndAnalyzeJob = async (text: string) => {
    setIsAnalyzing(true);
    setAnalyzedJob(null);
    try {
      const jobData = await onUploadJob(text);
      setAnalyzedJob(jobData);
      if (!jobData) {
        console.warn('Analysis returned no data.');
      }
    } catch (err) {
      console.error('Error analyzing job description:', err);
      setAnalyzedJob(null);
    } finally {
      setIsAnalyzing(false);
      handleCloseModal();
    }
  };

  return (
    <div className="bg-gray-900/80 backdrop-blur-sm p-6 rounded-lg shadow-xl border border-gray-800/50">
      <h2 className="text-2xl font-bold text-white mb-1">Job Analyzer</h2>
      <p className="text-gray-400 mb-6 text-sm">
        {analyzedJob
          ? 'Analyzed job details below.'
          : 'Upload a job description to analyze its key details.'}
      </p>
      {isAnalyzing ? (
        <div className="text-center text-gray-400 py-8">
          <p>Analyzing job description...</p>
        </div>
      ) : analyzedJob ? (
        <div className="space-y-4">
          <div className="p-4 bg-gray-700 rounded-md shadow-md">
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
          <p className="mb-3">No job description analyzed yet.</p>
          <button
            onClick={handleOpenModal}
            className="inline-block bg-blue-600 hover:bg-blue-700 text-white font-medium py-2 px-4 rounded-md transition-colors duration-200 text-sm"
          >
            Upload Job Description
          </button>
        </div>
      )}
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
