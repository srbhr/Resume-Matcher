import React, { useState, useRef } from 'react';
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
 * @property {(text: string) => Promise<AnalyzedJobData | null>} onUploadJob - Async function to analyze job description
 */
interface JobListingsProps {
  onUploadJob: (text: string) => Promise<AnalyzedJobData | null>;
}

/**
 * JobListings Component
 * Displays a job analyzer interface, allowing users to upload and view analyzed job descriptions.
 * Prevents stale analysis results and provides error feedback to the user.
 * @param {JobListingsProps} props - Component props
 * @returns {JSX.Element} The rendered job analyzer component
 */
const JobListings: React.FC<JobListingsProps> = ({ onUploadJob }) => {
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [analyzedJob, setAnalyzedJob] = useState<AnalyzedJobData | null>(null);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const latestAnalysis = useRef<symbol | null>(null);

  /**
   * Opens the modal for pasting job descriptions
   */
  const handleOpenModal = () => {
    setError(null); // Clear previous errors
    setIsModalOpen(true);
  };

  /**
   * Closes the modal
   */
  const handleCloseModal = () => setIsModalOpen(false);

  /**
   * Handles pasting and analyzing job description text
   * Prevents stale results by tracking the latest analysis with a unique token
   * @param {string} text - The job description text to analyze
   */
  const handlePasteAndAnalyzeJob = async (text: string) => {
    setIsAnalyzing(true);
    setAnalyzedJob(null);
    setError(null);
    const token = Symbol('analysis');
    latestAnalysis.current = token;

    try {
      const jobData = await onUploadJob(text);
      if (latestAnalysis.current === token) {
        setAnalyzedJob(jobData);
        if (!jobData) {
          setError('Analysis returned no data.');
        }
      }
    } catch (err) {
      console.error('Error analyzing job description:', err);
      if (latestAnalysis.current === token) {
        setAnalyzedJob(null);
        setError(err instanceof Error ? err.message : 'An unknown error occurred during analysis.');
      }
    } finally {
      if (latestAnalysis.current === token) {
        setIsAnalyzing(false);
        handleCloseModal();
      }
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
            <p className="text-sm fresco text-gray-300">{analyzedJob.company}</p>
            <p className="text-xs text-gray-400 mt-1">{analyzedJob.location}</p>
          </div>
          {error && (
            <p className="text-destructive mt-2 text-xs" role="alert">
              {error}
            </p>
          )}
          <button
            onClick={handleOpenModal}
            className="w-full text-center block bg-green-600 hover:bg-green-700 text-white font-medium py-2.5 px-4 rounded-md transition-colors duration-200 text-sm mt-4"
          >
            Analyze Another Job Description
          </button>
        </div>
      ) : (
        <div className="text-center text-gray-400 py-8 flex flex-col justify-center items-center">
          {error && (
            <p className="text-destructive mt-2 text-xs mb-3" role="alert">
              {error}
            </p>
          )}
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
