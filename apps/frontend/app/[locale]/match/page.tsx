"use client";
import React, { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { parseKeywords, diffKeywords, computeAtsScore } from '@/lib/keywords';
import { getResume, improveResume as apiImproveResume, matchResumeJob } from '@/lib/api/client';
import { sanitizeHtml } from '@/lib/sanitize';
import type { ResumeDataResp, JobDataResp, ImprovementResult } from '@/lib/types/domain';

// Next.js 15 typing quirk: in generated types params is Promise<SegmentParams>
interface PageParams { params?: Promise<{ locale?: string }> }

// safeParseKeywords replaced by shared parseKeywords utility

export default function MatchAndImprovePage({ params }: PageParams) {
  const [locale, setLocale] = useState<string>('en');
  useEffect(() => { (async () => { const p = await params; if (p?.locale) setLocale(p.locale); })(); }, [params]);
  const t = useTranslations('MatchPage');
  const api = process.env.NEXT_PUBLIC_API_BASE || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'; // still used for direct job fetch after upload (processed data)
  const [resumeIdInput, setResumeIdInput] = useState('');
  const [jobDescription, setJobDescription] = useState('');
  const [improving, setImproving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<ImprovementResult | null>(null);
  const [resumeKeywords, setResumeKeywords] = useState<string[]>([]);
  const [jobKeywords, setJobKeywords] = useState<string[]>([]);
  const [heuristicScore, setHeuristicScore] = useState<number | null>(null);
  const [heuristicBreakdown, setHeuristicBreakdown] = useState<Record<string, number> | null>(null);

  useEffect(() => { try { const last = localStorage.getItem('last_resume_id'); if (last) setResumeIdInput(last); } catch {} }, []);

  // ...existing code...
  const start = useCallback(async () => {
    setError(null); setResult(null); setResumeKeywords([]); setJobKeywords([]); setHeuristicScore(null); setHeuristicBreakdown(null);
    if (!resumeIdInput) { setError(t('resumeIdLabel') + ' ?'); return; }
    if (!jobDescription.trim()) { setError(t('jobDescLabel') + ' ?'); return; }
    setImproving(true);
    try {
      // Upload job description
      const jobUploadRes = await fetch(`${api}/api/v1/jobs/upload`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ job_descriptions: [jobDescription], resume_id: resumeIdInput }) });
      if (!jobUploadRes.ok) throw new Error(`Job upload failed (${jobUploadRes.status})`);
  const uploadJson = await jobUploadRes.json() as { data?: { job_id: string | string[] } };
  const jid = uploadJson?.data?.job_id;
  const jobId: string = Array.isArray(jid) ? jid[0] : (jid as string);
  if (!jobId) throw new Error('No job_id returned');
      if (!jobId) throw new Error('No job_id returned');

      // Resume, Job, Match parallel holen
      const [resumeRes, jobRes, matchRes] = await Promise.all([
        getResume(resumeIdInput) as Promise<{ data?: ResumeDataResp }>,
        fetch(`${api}/api/v1/jobs?job_id=${jobId}`).then(r => r.ok ? r.json() as Promise<{ data?: JobDataResp }> : null),
        matchResumeJob({ resume_id: resumeIdInput, job_id: jobId })
      ]);

      // Resume Keywords
      try {
        const proc = resumeRes?.data?.processed_resume;
        if (proc?.extracted_keywords) setResumeKeywords(parseKeywords(proc.extracted_keywords));
      } catch {}

      // Job Keywords
      try {
        const proc = jobRes?.data?.processed_job;
        if (proc?.extracted_keywords) setJobKeywords(parseKeywords(proc.extracted_keywords));
      } catch {}

      // Heuristic Match
      try {
        if (matchRes?.data) {
          setHeuristicScore(matchRes.data.score);
          const { breakdown } = matchRes.data;
          const filtered: Record<string, number> = {};
          Object.entries(breakdown).forEach(([k,v]) => { if (typeof v === 'number') filtered[k] = v; });
          setHeuristicBreakdown(filtered);
        }
      } catch {}

      // LLM Improvement
  const improveJson = await apiImproveResume({ resume_id: resumeIdInput, job_id: jobId, require_llm: true }) as unknown as { data?: ImprovementResult };
      if (improveJson?.data) setResult(improveJson.data);
    } catch (e) { setError(e instanceof Error ? e.message : String(e)); } finally { setImproving(false); }
  }, [api, resumeIdInput, jobDescription, t]);

  const keywordDiff = useMemo(() => diffKeywords(resumeKeywords, jobKeywords), [resumeKeywords, jobKeywords]);
  const atsScore = useMemo(() => { if (!result) return null; return computeAtsScore(keywordDiff, jobKeywords, result.resume_preview ? 100 : 50); }, [result, jobKeywords, keywordDiff]);

  return (
    <div className="min-h-screen px-6 py-10 max-w-5xl mx-auto text-sm text-gray-200">
      <div className="flex items-center justify-between mb-8 flex-wrap gap-4">
        <h1 className="text-2xl font-semibold bg-gradient-to-r from-sky-400 to-violet-500 bg-clip-text text-transparent">{t('title')}</h1>
        <div className="flex gap-4 text-xs">
          <Link href={`/${locale}`} className="underline hover:text-white">Home</Link>
          <Link href={`/${locale}/resume`} className="underline hover:text-white">Resume Upload</Link>
        </div>
      </div>
      <div className="grid md:grid-cols-2 gap-8">
        <section className="space-y-4">
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">{t('resumeIdLabel')}</label>
            <input value={resumeIdInput} onChange={e => setResumeIdInput(e.target.value.trim())} placeholder={t('resumeIdLabel')} className="w-full bg-gray-900/60 border border-gray-700 rounded px-3 py-2 text-xs focus:outline-none focus:ring focus:ring-sky-600" />
            <p className="mt-1 text-[10px] text-gray-500">{t('resumeIdHelp')}</p>
          </div>
          <div>
            <label className="block text-xs uppercase tracking-wide text-gray-400 mb-1">{t('jobDescLabel')}</label>
            <textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)} rows={14} placeholder={t('jobDescPlaceholder')} className="w-full bg-gray-900/60 border border-gray-700 rounded px-3 py-2 text-xs resize-vertical focus:outline-none focus:ring focus:ring-violet-600" />
          </div>
          <button onClick={start} disabled={improving} className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-sky-600 to-violet-600 hover:from-sky-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-medium text-xs px-5 py-2 rounded shadow">{improving ? t('analyzing') : t('analyzeButton')}</button>
          {error && <p className="text-red-400 text-xs">{error}</p>}
          {!error && improving && <p className="text-amber-400 text-xs">{t('analyzing')}</p>}
          {heuristicScore !== null && (
            <div className="bg-gray-900/60 border border-gray-800 rounded p-4 text-xs space-y-3">
              <h3 className="font-semibold">Heuristic Match</h3>
              <div className="flex flex-wrap gap-4 items-end">
                <div>
                  <div className="text-gray-400">Score</div>
                  <div className="text-emerald-400 font-semibold text-lg">{heuristicScore}</div>
                </div>
                {heuristicBreakdown && (
                  <div className="flex flex-col gap-1 max-w-full">
                    {Object.entries(heuristicBreakdown).filter(([k]) => !k.endsWith('_score')).slice(0,8).map(([k,v]) => (
                      <div key={k} className="flex justify-between gap-4">
                        <span className="text-gray-400 truncate">{k}</span>
                        <span className="text-sky-400">{typeof v === 'number' ? v.toFixed(3) : String(v)}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}
          {result && (
            <div className="space-y-4">
              <h2 className="text-lg font-medium">{t('title')}</h2>
              <div className="grid grid-cols-3 gap-3 text-center text-xs">
                <div className="bg-gray-900/60 border border-gray-800 rounded p-3"><div className="text-gray-400">{t('originalScore')}</div><div className="text-sky-400 font-semibold">{result.original_score.toFixed(3)}</div></div>
                <div className="bg-gray-900/60 border border-gray-800 rounded p-3"><div className="text-gray-400">{t('newScore')}</div><div className="text-violet-400 font-semibold">{result.new_score.toFixed(3)}</div></div>
                <div className="bg-gray-900/60 border border-gray-800 rounded p-3"><div className="text-gray-400">{t('delta')}</div><div className="text-emerald-400 font-semibold">{(result.new_score - result.original_score).toFixed(3)}</div></div>
              </div>
              {result.baseline && (
                <div className="bg-gray-900/60 border border-gray-800 rounded p-4 text-xs space-y-2">
                  <h3 className="font-semibold text-sm">Baseline</h3>
                  <div className="flex flex-wrap gap-4">
                    <div><div className="text-gray-400">Added Section</div><div className="text-sky-400 font-medium">{String(result.baseline.added_section)}</div></div>
                    <div><div className="text-gray-400">Missing Keywords</div><div className="text-violet-400 font-medium">{result.baseline.missing_keywords_count}</div></div>
                    <div><div className="text-gray-400">Baseline Score</div><div className="text-emerald-400 font-medium">{result.baseline.baseline_score.toFixed(3)}</div></div>
                  </div>
                </div>
              )}
              {atsScore && (
                <div className="bg-gray-900/60 border border-gray-800 rounded p-4 text-xs space-y-2">
                  <h3 className="font-semibold text-sm">{t('atsHeuristic')}</h3>
                  <div className="flex flex-wrap gap-4">
                    <div><div className="text-gray-400">{t('keywordCoverage')}</div><div className="text-sky-400 font-medium">{atsScore.keywordCoverage.toFixed(1)}%</div></div>
                    <div><div className="text-gray-400">{t('sections')}</div><div className="text-violet-400 font-medium">{atsScore.sectionCompleteness}%</div></div>
                    <div><div className="text-gray-400">{t('atsScore')}</div><div className="text-emerald-400 font-semibold text-lg">{atsScore.finalScore}</div></div>
                  </div>
                  <p className="text-[10px] text-gray-500">70% {t('keywordCoverage')} / 30% {t('sections')}.</p>
                </div>
              )}
              <div className="bg-gray-900/60 border border-gray-800 rounded p-4 text-xs space-y-3">
                <h3 className="font-semibold">{t('keywordDiff')}</h3>
                <div className="space-y-1">
                  <div className="text-gray-400">{t('present')} ({keywordDiff.present.length})</div>
                  <div className="flex flex-wrap gap-1">{keywordDiff.present.map(k => <span key={'p'+k} className="px-2 py-0.5 bg-gray-800 rounded border border-gray-700">{k}</span>)}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-gray-400">{t('missing')} ({keywordDiff.missing.length})</div>
                  <div className="flex flex-wrap gap-1">{keywordDiff.missing.map(k => <span key={'m'+k} className="px-2 py-0.5 bg-amber-900/40 text-amber-300 rounded border border-amber-700/40">{k}</span>)}</div>
                </div>
                <div className="space-y-1">
                  <div className="text-gray-400">{t('extra')} ({keywordDiff.extra.length})</div>
                  <div className="flex flex-wrap gap-1">{keywordDiff.extra.map(k => <span key={'e'+k} className="px-2 py-0.5 bg-violet-900/40 text-violet-300 rounded border border-violet-700/40">{k}</span>)}</div>
                </div>
              </div>
              <div className="bg-gray-900/60 border border-gray-800 rounded p-4 text-xs space-y-2">
                <h3 className="font-semibold">{t('improvedResumeSnippet')}</h3>
                <div className="max-h-72 overflow-auto leading-relaxed" dangerouslySetInnerHTML={{ __html: sanitizeHtml(result.updated_resume) }} />
              </div>
            </div>
          )}
          {!result && !improving && <p className="text-gray-500 text-xs">{t('noResult')}</p>}
        </section>
        <section className="space-y-6">
          {improving && (
            <div className="bg-gray-900/60 border border-gray-800 rounded p-4 text-xs animate-pulse">
              <div className="h-6 bg-gray-800 rounded w-1/3 mb-4" />
              <div className="h-4 bg-gray-800 rounded w-1/2 mb-2" />
              <div className="h-4 bg-gray-800 rounded w-2/3 mb-2" />
              <div className="h-4 bg-gray-800 rounded w-1/4 mb-2" />
              <div className="h-4 bg-gray-800 rounded w-1/2 mb-2" />
              <div className="h-4 bg-gray-800 rounded w-1/3 mb-2" />
            </div>
          )}
        </section>
      </div>
    </div>
  );
}
