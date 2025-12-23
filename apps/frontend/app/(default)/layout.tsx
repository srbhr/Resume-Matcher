import { ResumePreviewProvider } from '@/components/common/resume_previewer_context';
import { ErrorBoundary } from '@/components/common/error-boundary';

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <ResumePreviewProvider>
      <ErrorBoundary>
        <main className="min-h-screen flex flex-col">{children}</main>
      </ErrorBoundary>
    </ResumePreviewProvider>
  );
}
