import { ResumePreviewProvider } from '@/components/common/resume_previewer_context';
import { StatusCacheProvider } from '@/lib/context/status-cache';
import { ErrorBoundary } from '@/components/common/error-boundary';

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  return (
    <StatusCacheProvider>
      <ResumePreviewProvider>
        <ErrorBoundary>
          <main className="min-h-screen flex flex-col">{children}</main>
        </ErrorBoundary>
      </ResumePreviewProvider>
    </StatusCacheProvider>
  );
}
