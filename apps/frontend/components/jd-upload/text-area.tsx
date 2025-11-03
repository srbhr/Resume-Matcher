'use client';

import React, { useState, useCallback, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useResumePreview } from '@/components/common/resume_previewer_context';
import { uploadJobDescriptions, improveResume, fetchResume } from '@/lib/api/resume';

type SubmissionStatus = 'idle' | 'submitting' | 'success' | 'error';
type ImprovementStatus = 'idle' | 'improving' | 'error';

export default function JobDescriptionUploadTextArea() {
	const [text, setText] = useState('');
	const [flash, setFlash] = useState<{ type: 'error' | 'success'; message: string } | null>(null);
	const [submissionStatus, setSubmissionStatus] = useState<SubmissionStatus>('idle');
	const [improvementStatus, setImprovementStatus] = useState<ImprovementStatus>('idle');
	const [jobId, setJobId] = useState<string | null>(null);
	const [resumeName, setResumeName] = useState<string | null>(null);
	const [isViewingResume, setIsViewingResume] = useState(false);

	const { setImprovedData } = useResumePreview();
	const searchParams = useSearchParams();
	const resumeIdFromQuery = searchParams.get('resume_id');
	const [resumeId, setResumeId] = useState<string | null>(null);
	const [resumeReady, setResumeReady] = useState(false);
	const router = useRouter();

	useEffect(() => {
		if (typeof window === 'undefined') return;
		let resolvedId: string | null = null;
		let resolvedName: string | null = null;

		if (resumeIdFromQuery) {
			resolvedId = resumeIdFromQuery;
			try {
				localStorage.setItem('resumeMatcher:lastResumeId', resumeIdFromQuery);
				resolvedName = localStorage.getItem('resumeMatcher:lastResumeName');
			} catch (error) {
				console.warn('Unable to persist resume ID in job upload view', error);
			}
		} else {
			try {
				resolvedId = localStorage.getItem('resumeMatcher:lastResumeId');
				resolvedName = localStorage.getItem('resumeMatcher:lastResumeName');
			} catch (error) {
				console.warn('Unable to load resume ID from localStorage', error);
			}
		}
		setResumeId(resolvedId);
		setResumeName(resolvedName);
		setResumeReady(true);
	}, [resumeIdFromQuery]);

	const handleChange = useCallback(
		(e: React.ChangeEvent<HTMLTextAreaElement>) => {
			setText(e.target.value);
			setFlash(null);
			if (submissionStatus !== 'idle') setSubmissionStatus('idle');
		},
		[submissionStatus]
	);

	const handleUpload = useCallback(
		async (e: React.FormEvent) => {
			e.preventDefault();
			const trimmed = text.trim();
			if (!trimmed) {
				setFlash({ type: 'error', message: 'Job description cannot be empty.' });
				return;
			}
			if (!resumeId) {
				setFlash({ type: 'error', message: 'Missing resume ID.' });
				return;
			}

			setSubmissionStatus('submitting');
			try {
				const id = await uploadJobDescriptions([trimmed], resumeId);
				setJobId(id);
				setSubmissionStatus('success');
				setFlash({ type: 'success', message: 'Job description submitted successfully!' });
			} catch (err) {
				console.error(err);
				setSubmissionStatus('error');
				setFlash({ type: 'error', message: (err as Error).message });
			}
		},
		[text, resumeId]
	);

	const handleImprove = useCallback(async () => {
		if (!jobId || !resumeId) return;

		setImprovementStatus('improving');
		try {
			const preview = await improveResume(resumeId, jobId);
			setImprovedData(preview);
			router.push('/dashboard');
		} catch (err) {
			console.error(err);
			setImprovementStatus('error');
			setFlash({ type: 'error', message: (err as Error).message });
		}
	}, [resumeId, jobId, setImprovedData, router]);

	const handleViewResume = useCallback(async () => {
		if (!resumeId) return;
		setIsViewingResume(true);
		try {
			const { raw_resume } = await fetchResume(resumeId);
			const resumeContent = raw_resume?.content ?? '';
			if (!resumeContent) {
				throw new Error('Resume content is unavailable.');
			}
			const contentType = raw_resume?.content_type?.toLowerCase() ?? 'md';
			const blobType = contentType === 'html' ? 'text/html' : 'text/plain';
			const blob = new Blob([resumeContent], {
				type: `${blobType};charset=utf-8`,
			});
			const url = URL.createObjectURL(blob);
			const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
			if (!newWindow) {
				const anchor = document.createElement('a');
				anchor.href = url;
				anchor.target = '_blank';
				anchor.rel = 'noopener noreferrer';
				anchor.click();
			}
			window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
		} catch (err) {
			console.error('Unable to open resume', err);
			setFlash({
				type: 'error',
				message: (err as Error)?.message || 'Unable to open resume.',
			});
		} finally {
			setIsViewingResume(false);
		}
	}, [resumeId, setFlash]);

	const handleSwitchResume = useCallback(() => {
		try {
			if (typeof window !== 'undefined') {
				localStorage.removeItem('resumeMatcher:lastResumeId');
				localStorage.removeItem('resumeMatcher:lastResumeName');
			}
		} catch (error) {
			console.warn('Unable to clear stored resume ID', error);
		}
		router.push('/resume?replace=1');
	}, [router]);

	const isNextDisabled =
		text.trim() === '' || submissionStatus === 'submitting' || !resumeId || !resumeReady;

	return (
		<form onSubmit={handleUpload} className="p-4 mx-auto w-full max-w-xl">
			{resumeReady && !resumeId && (
				<div className="p-3 mb-4 text-sm rounded-md bg-red-900/20 border border-red-800/40 text-red-300">
					<p>No resume is currently stored. Please upload a resume first.</p>
					<button
						type="button"
						onClick={handleSwitchResume}
						className="mt-2 inline-flex items-center gap-1 text-red-200 underline hover:text-red-100"
					>
						Upload resume
					</button>
				</div>
			)}
			{flash && (
				<div
					className={`p-3 mb-4 text-sm rounded-md ${flash.type === 'error'
						? 'bg-red-50 border border-red-200 text-red-800 dark:bg-red-900/20 dark:border-red-800/30 dark:text-red-300'
						: 'bg-green-50 border border-green-200 text-green-800 dark:bg-green-900/20 dark:border-green-800/30 dark:text-green-300'
						}`}
					role="alert"
				>
					<p>{flash.message}</p>
				</div>
			)}

			<div className="mb-2 flex justify-between text-xs text-gray-400">
				{resumeId ? (
					<div className="text-left leading-tight">
						<p className="text-gray-200 font-semibold">
							Current resume:{' '}
							<button
								type="button"
								onClick={handleViewResume}
								disabled={isViewingResume}
								className={`underline ${isViewingResume
									? 'text-gray-400 cursor-wait'
									: 'text-blue-300 hover:text-blue-200'
									}`}
							>
								{isViewingResume ? 'Opening…' : resumeName || 'Unnamed file'}
							</button>
						</p>
						<p className="text-[11px] text-gray-500">ID: {resumeId}</p>
					</div>
				) : (
					<p>Resume information not available.</p>
				)}
				<button
					type="button"
					onClick={handleSwitchResume}
					className="text-blue-300 hover:text-blue-200 underline"
				>
					Use a different resume
				</button>
			</div>

			<div className="mb-6 relative">
				<label
					htmlFor="jobDescription"
					className="bg-zinc-950/80 text-white absolute start-1 top-0 z-10 block -translate-y-1/2 px-2 text-xs font-medium group-has-disabled:opacity-50"
				>
					Job Description <span className="text-red-500">*</span>
				</label>
				<Textarea
					id="jobDescription"
					rows={15}
					value={text}
					onChange={handleChange}
					required
					aria-required="true"
					placeholder="Paste the job description here..."
					className="w-full bg-gray-800/30 focus:ring-1 border rounded-md dark:border-gray-600 focus:border-blue-500 focus:ring-blue-500/50 border-gray-300 min-h-[300px]"
				/>
			</div>

			<div className="flex justify-end pt-4">
				<Button
					type="submit"
					disabled={isNextDisabled}
					aria-disabled={isNextDisabled}
					className={`font-semibold py-2 px-6 rounded flex items-center justify-center min-w-[90px] transition-all duration-200 ease-in-out ${isNextDisabled
						? 'bg-gray-400 dark:bg-gray-600 text-gray-600 dark:text-gray-400 cursor-not-allowed'
						: 'bg-blue-600 hover:bg-blue-700 text-white dark:bg-blue-500 dark:hover:bg-blue-600'
						}`}
				>
					{submissionStatus === 'submitting' ? (
						<>
							<svg
								className="animate-spin -ml-1 mr-2 h-4 w-4 text-white"
								xmlns="http://www.w3.org/2000/svg"
								fill="none"
								viewBox="0 0 24 24"
								aria-hidden="true"
							>
								<circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
								<path
									className="opacity-75"
									fill="currentColor"
									d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
								/>
							</svg>
							<span>Submitting...</span>
						</>
					) : submissionStatus === 'success' ? (
						<span>Submitted!</span>
					) : (
						<span>Next</span>
					)}
				</Button>
			</div>

			{submissionStatus === 'success' && jobId && (
				<div className="flex justify-end mt-2">
					<Button
						onClick={handleImprove}
						disabled={improvementStatus === 'improving'}
						className="font-semibold py-2 px-6 rounded min-w-[90px] bg-green-600 hover:bg-green-700 text-white"
					>
						{improvementStatus === 'improving' ? 'Improving...' : 'Improve'}
					</Button>
				</div>
			)}
		</form>
	);
}
