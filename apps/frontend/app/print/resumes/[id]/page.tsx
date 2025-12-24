import Resume, { ResumeData } from '@/components/dashboard/resume-component';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ template?: string }>;
};

async function fetchResumeData(id: string): Promise<ResumeData> {
  const res = await fetch(`${API_URL}/api/v1/resumes?resume_id=${encodeURIComponent(id)}`, {
    cache: 'no-store',
  });
  if (!res.ok) {
    throw new Error(`Failed to load resume (status ${res.status}).`);
  }
  const payload = (await res.json()) as {
    data: { processed_resume?: ResumeData; raw_resume?: { content?: string } };
  };
  if (payload.data.processed_resume) {
    return payload.data.processed_resume;
  }
  if (payload.data.raw_resume?.content) {
    try {
      return JSON.parse(payload.data.raw_resume.content) as ResumeData;
    } catch {
      return {} as ResumeData;
    }
  }
  return {} as ResumeData;
}

export default async function PrintResumePage({ params, searchParams }: PageProps) {
  const resolvedParams = await params;
  const resolvedSearchParams = searchParams ? await searchParams : undefined;
  const resumeData = await fetchResumeData(resolvedParams.id);
  const template = resolvedSearchParams?.template || 'default';

  return (
    <div className="resume-print w-full max-w-[250mm] bg-white border-2 border-black">
      <Resume resumeData={resumeData} template={template} />
    </div>
  );
}
