'use client';

import { ResumeBuilder } from '@/components/builder/resume-builder';
import { useStatusCache } from '@/lib/context/status-cache';

export default function BuilderPage() {
  const { status } = useStatusCache();
  return <ResumeBuilder agentMode={Boolean(status?.agent_mode)} />;
}
