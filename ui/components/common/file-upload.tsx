'use client';

import React from 'react'; // Import React
import { AlertCircleIcon, PaperclipIcon, UploadIcon, XIcon } from 'lucide-react';
// Assuming useFileUpload hook and Button component are correctly imported from these paths
import { formatBytes, useFileUpload } from '@/hooks/use-file-upload';
import { Button } from '@/components/ui/button';

// Define the accepted file types
const acceptedFileTypes = [
	'application/pdf', // .pdf
	'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
];

// Define the accepted file types as a comma-separated string for the input element
const acceptString = acceptedFileTypes.join(',');

export default function FileUpload() {
	// Define the maximum file size (e.g., 2MB)
	const maxSize = 2 * 1024 * 1024;

	// Use the file upload hook
	// Removed initialFiles and added the accept option
	const [
		{ files, isDragging, errors },
		{
			handleDragEnter,
			handleDragLeave,
			handleDragOver,
			handleDrop,
			openFileDialog,
			removeFile,
			getInputProps,
		},
	] = useFileUpload({
		maxSize,
		accept: acceptString, // Pass the accepted file types string here
		// initialFiles removed
	});

	// Get the first (and only allowed) file
	const file = files[0];

	return (
		<div className="flex flex-col gap-2 rounded-lg ">
			{/* Drop area - Outer div for styling */}
			<div
				role="button"
				// Only allow opening file dialog if no file is selected
				onClick={!file ? openFileDialog : undefined}
				onDragEnter={handleDragEnter}
				onDragLeave={handleDragLeave}
				onDragOver={handleDragOver}
				onDrop={handleDrop}
				// Apply dragging styles
				data-dragging={isDragging || undefined}
				// Disable pointer events and reduce opacity if a file is already present
				className={`rounded-xl transition-colors ${
					file
						? 'pointer-events-none opacity-50'
						: 'has-[input:focus]:ring-ring/50 has-[input:focus]:ring-[3px]'
				}`}
				// Add aria-disabled attribute for accessibility
				aria-disabled={Boolean(file)}
			>
				{/* Inner div for background and content */}
				<div
					className={`flex min-h-48 w-full flex-col items-center justify-center rounded-[10px] bg-gray-900/50 p-6 transition-colors ${
						!file ? 'hover:bg-gray-800/50' : '' // Only apply hover effect if no file
					} ${
						isDragging ? 'bg-neutral-900/95' : '' // Apply dragging background
					}`}
				>
					{/* Hidden file input */}
					<input
						{...getInputProps()}
						// Pass the accept string to the input element
						accept={acceptString}
						className="sr-only"
						aria-label="Upload file"
						// Disable input if a file is already selected
						disabled={Boolean(file)}
					/>

					{/* Upload UI */}
					<div className="flex flex-col items-center justify-center text-center">
						<div
							className="bg-white mb-3 flex size-12 shrink-0 items-center justify-center rounded-full border"
							aria-hidden="true"
						>
							<UploadIcon className="size-5 opacity-60" />
						</div>
						<p className="mb-2 text-lg font-semibold text-white">Upload file</p>
						<p className="text-muted-foreground text-sm">
							{/* Updated description to reflect accepted types */}
							Drag & drop or click to browse (PDF, DOCX only, max.{' '}
							{formatBytes(maxSize)})
						</p>
					</div>
				</div>
			</div>

			{/* Display errors if any */}
			{errors.length > 0 && (
				<div className="text-destructive flex items-center gap-1 text-xs" role="alert">
					<AlertCircleIcon className="size-3 shrink-0" />
					<span>{errors[0]}</span> {/* Display the first error */}
				</div>
			)}

			{/* Display the selected file if present */}
			{file && (
				<div className="space-y-2">
					<div
						key={file.id}
						className="flex items-center justify-between gap-2 rounded-xl border bg-background/50 px-4 py-3"
					>
						{/* File details */}
						<div className="flex items-center gap-3 overflow-hidden">
							<PaperclipIcon
								className="size-5 shrink-0 opacity-60"
								aria-hidden="true"
							/>
							<div className="min-w-0">
								<p className="truncate text-sm font-medium">{file.file.name}</p>
								{/* Optionally display file size */}
								{/* <p className="text-xs text-muted-foreground">{formatBytes(file.file.size)}</p> */}
							</div>
						</div>

						{/* Remove file button */}
						<Button
							size="icon"
							variant="ghost"
							className="text-muted-foreground/80 hover:text-foreground -me-2 size-9 hover:bg-transparent"
							onClick={() => removeFile(file.id)} // Use file.id
							aria-label="Remove file"
						>
							<XIcon className="size-5" aria-hidden="true" />
						</Button>
					</div>
				</div>
			)}
		</div>
	);
}
