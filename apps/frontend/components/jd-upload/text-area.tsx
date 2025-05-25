'use client';

import { useState, useCallback } from 'react'; // Use useCallback for optimization
import { Textarea } from '@/components/ui/textarea'; // Assuming these are ShadCN/UI components
import { Button } from '@/components/ui/button';

// Define possible states for the submission process
type SubmissionStatus = 'idle' | 'submitting' | 'success' | 'error';

/**
 * Renders a form with a single textarea for job description input.
 * The "Next" button is enabled when the textarea is not empty.
 * Submits the entered job description.
 */
export function JobDescriptionUploadTextArea() {
	// State for the job description text
	const [jobDescription1, setJobDescription1] = useState<string>('');
	// State to track the submission process
	const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('idle');

	/**
	 * Handles changes to the textarea input.
	 * useCallback ensures the function identity is stable across re-renders
	 * unless its dependencies change (which they don't here).
	 */
	const handleInputChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setJobDescription1(e.target.value);
			// Reset status if user types after a submission attempt
			if (submissionStatus === 'success' || submissionStatus === 'error') {
				setSubmissionStatus('idle');
			}
		},
		[submissionStatus],
	); // Depend on submissionStatus to reset correctly

	/**
	 * Handles the form submission.
	 * Validates input, sets status, simulates API call, and handles response.
	 * useCallback optimizes by memoizing the function.
	 */
	const handleSubmit = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault(); // Prevent default form submission behavior

			const trimmedJd1 = jobDescription1.trim();

			// --- Validation ---
			// Double-check if the input is empty, although the button should be disabled.
			if (trimmedJd1 === '') {
				console.warn('Submit blocked: Job Description cannot be empty.');
				return; // Exit if empty
			}

			setSubmissionStatus('submitting'); // Indicate loading state

			// --- API Call ---
			try {
				const dataToSubmit = {
					job_descriptions: [trimmedJd1], // Send the trimmed description as an array
					resume_id: '3fa85f64-5717-4562-b3fc-2c963f66afa6', // Placeholder resume_id
				};

				console.log('Submitting data:', dataToSubmit);

				const response = await fetch(`${process.env.NEXT_PUBLIC_API_URL}/api/v1/jobs/upload`, {
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
					},
					body: JSON.stringify(dataToSubmit),
				});

				if (!response.ok) {
					// Handle HTTP errors
					const errorData = await response.json().catch(() => ({
						message:
							'Failed to submit job description and could not parse error response.',
					}));
					console.error('API error:', response.status, errorData);
					throw new Error(errorData.message || `HTTP error! status: ${response.status}`);
				}

				setSubmissionStatus('success');
				console.log('Submission successful!');

			} catch (error) {
				console.error('Error submitting job description:', error);
				setSubmissionStatus('error');
			}
		},
		[jobDescription1],
	);

	const isNextDisabled = jobDescription1.trim() === '' || submissionStatus === 'submitting';

	return (
		<form onSubmit={handleSubmit} className="p-4 mx-auto w-full max-w-xl">
			{' '}
			{submissionStatus === 'error' && (
				<div
					className="p-3 mb-4 text-sm rounded-md bg-red-50 border border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800/30 dark:text-red-300"
					role="alert"
				>
					<p>Submission failed. Please try again.</p>
				</div>
			)}
			{submissionStatus === 'success' && (
				<div
					className="p-3 mb-4 text-sm rounded-md bg-green-50 border border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800/30 dark:text-green-300"
					role="alert"
				>
					<p>Job Description submitted successfully!</p>
				</div>
			)}
			<div className="mb-6">
				<div className="group relative flex flex-col space-y-1">
					{/* Label for the textarea */}
					<label
						htmlFor="jd1"
						className="bg-zinc-950/80 text-white absolute start-1 top-0 z-10 block -translate-y-1/2 px-2 text-xs font-medium group-has-disabled:opacity-50"
					>
						Job Description <span className="text-red-500">*</span>{' '}
						{/* Indicate required */}
					</label>
					{/* Textarea Input */}
					<Textarea
						id="jd1"
						rows={15} // Adjusted rows for potentially better default view
						value={jobDescription1}
						onChange={handleInputChange}
						required // HTML5 validation attribute
						aria-required="true" // Accessibility: Indicate required field
						placeholder="Paste or type the job description here..." // Clearer placeholder
						className={`w-full bg-gray-800/30 focus:ring-1 border rounded-md dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500/50 ${
							// Optional: Add visual feedback for empty state if desired, though button disabling is primary
							// jobDescription1.trim() === '' ? 'border-gray-300' : 'border-green-500'
							'border-gray-300' // Default border
							}`}
					/>
				</div>
			</div>
			{/* --- Submission Button --- */}
			<div className="flex justify-end pt-4">
				<Button
					type="submit"
					disabled={isNextDisabled} // Control button state
					aria-disabled={isNextDisabled} // Accessibility: Sync disabled state
					className={`font-semibold py-2 px-6 rounded flex items-center justify-center min-w-[90px] transition-all duration-200 ease-in-out ${
						// Use min-w for consistent size
						isNextDisabled
							? 'bg-gray-400 dark:bg-gray-600 text-gray-600 dark:text-gray-400 cursor-not-allowed'
							: 'bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600'
						}`}
				>
					{/* --- Button Content based on Status --- */}
					{submissionStatus === 'submitting' ? (
						<>
							{/* Loading Spinner SVG */}
							<svg
								className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								aria-hidden="true" // Hide decorative SVG from screen readers
							>
								<circle
									className="opacity-25"
									cx="12"
									cy="12"
									r="10"
									stroke="currentColor"
									strokeWidth="4"
								></circle>
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								></path>
							</svg>
							<span>Submitting...</span> {/* Add span for clarity */}
						</>
					) : submissionStatus === 'success' ? (
						<span>Submitted!</span>
					) : (
						<span>Next</span> // Default button text
					)}
				</Button>
			</div>
		</form>
	);
}

// Export the component for use
export default JobDescriptionUploadTextArea;
