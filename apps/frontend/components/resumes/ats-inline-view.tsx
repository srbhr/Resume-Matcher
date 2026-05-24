'use client';

import { useEffect, useState } from 'react';
import Loader2 from 'lucide-react/dist/esm/icons/loader-2';
import BarChart3 from 'lucide-react/dist/esm/icons/bar-chart-3';
import { fetchJobDescription } from '@/lib/api/resume';
import { ATSScreenPanel } from '@/components/ats/ats-screen-panel';
import { useTranslations } from '@/lib/i18n';

type JdState = 'loading' | 'missing' | 'present';

interface AtsInlineViewProps {
  resumeId: string;
  resumeTitle?: string | null;
}

export function AtsInlineView({ resumeId, resumeTitle }: AtsInlineViewProps) {
  const { t } = useTranslations();
  const [jdState, setJdState] = useState<JdState>('loading');
  const [jobId, setJobId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setJdState('loading');
    setJobId(null);
    fetchJobDescription(resumeId)
      .then((jd) => {
        if (cancelled) return;
        if (jd?.content?.trim()) {
          setJobId(jd.job_id);
          setJdState('present');
        } else {
          setJdState('missing');
        }
      })
      .catch(() => {
        if (!cancelled) setJdState('missing');
      });
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  return (
    <div className="flex justify-center pb-4">
      <div className="w-full max-w-[210mm] border border-black bg-white shadow-sw-default">
        <div className="p-[28px_32px]">
          <div className="flex items-center gap-2 mb-1">
            <BarChart3 className="w-4 h-4 text-blue-700" />
            <h2 className="font-sans text-[22px] font-semibold tracking-[-0.01em] m-0">
              {t('resumeViewer.panel.atsTitle')}
              {resumeTitle ? ` · ${resumeTitle}` : ''}
            </h2>
          </div>
          <div className="font-mono text-[10px] uppercase tracking-[0.18em] text-ink-soft mt-1 mb-6">
            {'// '}
            {t('resumeViewer.atsInline.subtitle')}
          </div>

          {jdState === 'loading' && (
            <div className="flex flex-col items-center justify-center gap-3 py-12 text-ink-soft">
              <Loader2 className="w-6 h-6 animate-spin" />
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] m-0">
                {t('resumeViewer.panel.loading')}
              </p>
            </div>
          )}

          {jdState === 'missing' && (
            <div className="border border-dashed border-orange-500 bg-white p-5">
              <div className="font-mono text-[12px] uppercase tracking-[0.18em] text-black mb-3">
                {t('resumeViewer.atsInline.noJdHeadline')}
              </div>
              <p className="font-sans text-sm text-ink-soft max-w-md m-0">
                {t('resumeViewer.panel.atsEmpty')}
              </p>
            </div>
          )}

          {jdState === 'present' && jobId && <ATSScreenPanel resumeId={resumeId} jobId={jobId} />}
        </div>
      </div>
    </div>
  );
}
