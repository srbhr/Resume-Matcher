"use client";

import { useEffect } from 'react';
import { ResumePreviewProvider } from '@/components/common/resume_previewer_context';

export default function DefaultLayout({ children }: { children: React.ReactNode }) {
  useEffect(() => {
    if (typeof window !== 'undefined' && 'serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js').catch(() => {});
    }
  }, []);
  return (
    <ResumePreviewProvider>
      <main className="min-h-screen flex flex-col">{children}</main>
    </ResumePreviewProvider>
  );
}
