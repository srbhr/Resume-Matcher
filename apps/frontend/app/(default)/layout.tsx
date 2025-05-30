import './css/globals.css';
import type { Metadata } from 'next';
import { Geist, Space_Grotesk } from 'next/font/google';
import { ResumePreviewProvider } from '@/components/common/resume_previewer_context';

// Load Google fonts with optimal settings
const spaceGrotesk = Space_Grotesk({
  variable: '--font-space-grotesk',
  subsets: ['latin'],
  display: 'swap',
});
const geist = Geist({
  variable: '--font-geist',
  subsets: ['latin'],
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Resume Matcher',
  description: 'Build your resume with Resume Matcher',
  applicationName: 'Resume Matcher',
  keywords: ['resume', 'matcher', 'job', 'application'],
};

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <ResumePreviewProvider>
      <main className="min-h-screen flex flex-col">{children}</main>
    </ResumePreviewProvider>
  );
}
