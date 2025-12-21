'use client';

import { SwissGrid } from '@/components/home/swiss-grid';
import { ResumeCard } from '@/components/dashboard/resume-card';

// Mock Data
const RESUMES = [
	{ id: 1, title: 'Senior Frontend Dev', date: '2 days ago' },
	{ id: 2, title: 'Product Manager', date: '5 days ago' },
];

export default function DashboardPage() {
	// The physics class from your Hero, adapted for cards
	const cardWrapperClass = "bg-[#F0F0E8] p-8 md:p-12 h-full transition-all duration-200 ease-in-out hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_0px_#000000] cursor-pointer group relative flex flex-col";

	return (
		<SwissGrid>

			{/* 1. The "Create New" Wrapper - Special Blue Hover */}
			<div
				onClick={() => console.log('Create new')}
				className={`${cardWrapperClass} hover:bg-blue-700 hover:text-[#F0F0E8]`}
			>
				{/* We pass a prop to force styles if needed, or just let CSS handle it */}
				<div className="flex-1 flex flex-col justify-between">
					<div className="w-12 h-12 border-2 border-current rounded-full flex items-center justify-center mb-4">
						<span className="text-2xl leading-none relative top-[-2px]">+</span>
					</div>
					<div>
						<h3 className="font-mono text-xl font-bold uppercase">New Resume</h3>
						<p className="font-mono text-xs mt-2 opacity-60 group-hover:opacity-100">// Initialize Sequence</p>
					</div>
				</div>
			</div>

			{/* 2. Existing Resume Wrappers */}
			{RESUMES.map((resume) => (
				<div key={resume.id} className={cardWrapperClass}>
					<div className="flex-1 flex flex-col h-full">
						{/* Thumbnail Placeholder */}
						<div className="w-full aspect-[4/3] border border-black bg-white mb-6 relative overflow-hidden group-hover:border-[#F0F0E8]">
							<div className="absolute inset-0 bg-blue-700/5"></div>
							{/* Lines simulating text */}
							<div className="p-4 space-y-2 opacity-20">
								<div className="w-1/2 h-2 bg-black"></div>
								<div className="w-full h-2 bg-black"></div>
								<div className="w-full h-2 bg-black"></div>
								<div className="w-3/4 h-2 bg-black"></div>
							</div>
						</div>

						<h3 className="font-bold text-lg font-serif leading-tight group-hover:text-blue-700">{resume.title}</h3>
						<p className="text-xs font-mono text-gray-500 mt-auto pt-4 group-hover:text-black">
							LAST EDITED: {resume.date}
						</p>
					</div>
				</div>
			))}

			{/* 3. Fillers (Static, no hover effect, just structure) */}
			{[1, 2, 3].map((i) => (
				<div key={i} className="hidden md:block bg-[#F0F0E8] h-full min-h-[300px] opacity-50 pointer-events-none"></div>
			))}
		</SwissGrid>
	);
}