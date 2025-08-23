import { redirect } from 'next/navigation';

// Legacy non-i18n resume detail page: redirect to localized route preserving the resume_id.
// Using a server component keeps it lightweight; no client JS is sent for this segment.
export const dynamic = 'force-dynamic'; // allow param-based redirect at request time

// Align with Next.js generated types (params may be Promise<any> or omitted in type check harness)
interface LegacyParams { resume_id?: string }
interface PageProps { params?: Promise<LegacyParams> }

export default async function LegacyResumeDetailRedirect({ params }: PageProps) {
  let resume_id: string | undefined;
  try {
    const resolved = params ? await params : undefined;
    if (resolved && typeof resolved === 'object') resume_id = resolved.resume_id;
  } catch { /* ignore */ }
  const defaultLocale = process.env.NEXT_PUBLIC_DEFAULT_LOCALE || 'en';
  if (resume_id) {
    redirect(`/${defaultLocale}/resume/${resume_id}`);
  }
  redirect(`/${defaultLocale}/resume`);
}
