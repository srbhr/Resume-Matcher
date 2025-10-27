'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import BackgroundContainer from '@/components/common/background-container';
import FileUpload from '@/components/common/file-upload';
import ApiKeyMenu from '@/components/settings/api-key-menu';

export default function UploadResume() {
	const router = useRouter();
	const searchParams = useSearchParams();
	const [checking, setChecking] = useState(true);
	const allowReplace = searchParams.get('replace') === '1';

	useEffect(() => {
		if (typeof window === 'undefined') return;
		try {
			const stored = localStorage.getItem('resumeMatcher:lastResumeId');
			if (stored && !allowReplace) {
				router.replace('/jobs');
				return;
			}
		} catch (error) {
			console.warn('Unable to read resume ID from localStorage', error);
		}
		setChecking(false);
	}, [router, allowReplace]);

	if (checking) {
		return (
			<BackgroundContainer innerClassName="justify-center">
				<div className="text-gray-300">Checking resume status…</div>
			</BackgroundContainer>
		);
	}

	return (
		<BackgroundContainer innerClassName="justify-start pt-16">
			<div className="w-full max-w-2xl mx-auto flex flex-col gap-6">
				<div className="self-end">
					<ApiKeyMenu />
				</div>
				<div className="flex flex-col items-center gap-6">
					<h1 className="text-4xl font-bold text-center text-white mb-6">
						Upload Your Resume
					</h1>
					<p className="text-center text-gray-300 mb-8 max-w-xl">
						Drag and drop your resume file below or click to browse. Supported formats: PDF,
						DOC, DOCX (up to 2 MB).
					</p>
					<div className="w-full max-w-md">
						<FileUpload />
					</div>
				</div>
			</div>
		</BackgroundContainer>
	);
}
