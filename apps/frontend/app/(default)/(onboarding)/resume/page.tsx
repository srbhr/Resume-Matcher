'use client';

import BackgroundContainer from '@/components/common/background-container';
import FileUpload from '@/components/common/file-upload';

export default function UploadResume() {
	return (
		<BackgroundContainer innerClassName="justify-start pt-16">
			<div className="w-full max-w-md mx-auto flex flex-col items-center gap-6">
				<h1 className="text-4xl font-bold text-center text-white mb-6">
					Upload Your Resume
				</h1>
				<p className="text-center text-gray-300 mb-8">
					Drag and drop your resume file below or click to browse. Supported formats: PDF,
					DOC, DOCX (Max 10MB).
				</p>
				<div className="w-full">
					<FileUpload />
				</div>
			</div>
		</BackgroundContainer>
	);
}
