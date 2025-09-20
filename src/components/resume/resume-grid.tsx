'use client';

import React from 'react';
import { ResumeCard, AddResumeCard } from './resume-card';
import { EnhancedResumeCard } from '@/components/resume/enhanced-resume-card';

export function ResumeGrid() {
	// const resumes = useResumeStore((s) => s.resumes);
	// const addResume = useResumeStore((s) => s.addResume);
	// const openResume = useResumeStore((s) => s.openResume);

	const resumes: any[] = []; // Temporary empty array

	const handleAdd = () => {
		// const doc = addResume();
		// openResume(doc.id);
	};

	const handleOpen = (id: string) => {
		// openResume(id);
	};

	return (
		<div className="space-y-4">
			<h2 className="text-lg font-medium">Manage Variants</h2>
			<div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-8">
				{/* Main resume (static) */}
				<div className="flex flex-col items-center gap-2">
					<ResumeCard disabled title="Main Resume">
						<span className="text-xs text-gray-400">Main</span>
					</ResumeCard>
					<span className="text-sm font-light tracking-wide text-gray-500 dark:text-gray-400">
						Main-resume
					</span>
				</div>
				{resumes.map((r) => (
					<div key={r.id} className="flex flex-col items-center gap-2">
						<EnhancedResumeCard resume={r} onClick={() => handleOpen(r.id)} />
						<span className="text-sm font-light tracking-wide text-gray-500 dark:text-gray-400">
							{r.name || r.id}
						</span>
					</div>
				))}
				{/* Add card: always at end (if we ever want a max, we could hide based on length) */}
				<div className="flex flex-col items-center gap-2">
					<AddResumeCard onClick={handleAdd} />
					<span className="text-sm font-light tracking-wide text-gray-400">Add</span>
				</div>
			</div>
		</div>
	);
}
