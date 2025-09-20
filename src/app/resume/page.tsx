export const metadata = { title: 'Resume | Experimental UI' };

import ResumePreview from '@/components/resume/resume-preview';
import ResumeForm from '@/components/resume/resume-form';

export default function ResumePage() {
	return (
		<div className="h-screen w-screen overflow-hidden fixed inset-0 bg-background">
			{/* Desktop Layout */}
			<div className="hidden md:flex h-full w-full gap-6 p-6">
				<div className="flex-[2] min-w-0 overflow-hidden">
					<ResumePreview />
				</div>
				<div className="flex-1 min-w-0 overflow-hidden">
					<ResumeForm />
				</div>
			</div>

			{/* Mobile Layout */}
			<div className="md:hidden h-full w-full flex flex-col gap-6 p-6">
				<div className="flex-[2] min-h-0 overflow-hidden">
					<ResumePreview />
				</div>
				<div className="flex-1 min-h-0 overflow-hidden">
					<ResumeForm />
				</div>
			</div>
		</div>
	);
}
