'use client';
import Resume, { type ResumeData } from '@/components/dashboard/resume-component';
import type { ProcessedResume } from '@/lib/api/resume';

export function WizardPreview({ resumeData }: { resumeData: ProcessedResume }) {
  // ProcessedResume allows `null` on optional fields; the renderer's ResumeData
  // uses `undefined`. The Builder bridges this same gap with an `as` cast.
  return (
    <div className="h-full overflow-auto border border-black bg-white p-4 shadow-sw-default">
      <Resume resumeData={resumeData as ResumeData} />
    </div>
  );
}
