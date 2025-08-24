import ResumeUploadPageClient from '@/components/pages/resume-upload.client';

// Ensure this route always reflects current auth/session and avoids ISR for JSON data route.
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export default function ResumeUploadPage() {
  return <ResumeUploadPageClient />;
}
