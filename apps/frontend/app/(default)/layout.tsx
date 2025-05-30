import { ResumePreviewProvider } from '@/components/common/resume_previewer_context';

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <ResumePreviewProvider>
      <main className="min-h-screen flex flex-col">{children}</main>
    </ResumePreviewProvider>
  );
}
