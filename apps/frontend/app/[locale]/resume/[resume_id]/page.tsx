"use client";
import { useEffect, useState, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import { useTranslations } from 'next-intl';
import { parseKeywords, diffKeywords, computeAtsScore } from '@/lib/keywords';
import { sanitizeHtml } from '@/lib/sanitize';
import { getResume, improveResume as apiImproveResume, uploadJobJson } from '@/lib/api/client';
import type { ResumeDataResp as ResumeData, ImprovementResult, JobDataResp } from '@/lib/types/domain';

interface PageParams { params?: Promise<{ locale?: string; resume_id?: string }> }

// safeParseKeywords replaced by shared parseKeywords utility
function safeParseKeywords(raw: unknown): string[] { return parseKeywords(raw); }
// Create stable unique keys to avoid duplicate [object Object] warnings
function makeKey(prefix: string, val: unknown, idx: number): string {
  if (typeof val === 'string' || typeof val === 'number') return `${prefix}${val}`;
  if (Array.isArray(val)) return `${prefix}arr_${idx}_${val.length}`;
  if (val && typeof val === 'object') return `${prefix}obj_${idx}_${Object.keys(val as Record<string, unknown>).slice(0,4).join('_')}`;
  return `${prefix}${idx}`;
}

export default function ResumeDetailPage({ params }: PageParams) {
  const [locale, setLocale] = useState<string>('en');
  const [resume_id, setResumeId] = useState<string>('');
  useEffect(() => { (async () => { const p = await params; if (p?.locale) setLocale(p.locale); if (p?.resume_id) setResumeId(p.resume_id); })(); }, [params]);
  const t = useTranslations('ResumeDetail');
  const [data, setData] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const pollRef = useRef<NodeJS.Timeout | null>(null);
  const [jobDescription, setJobDescription] = useState('');
  const [improving, setImproving] = useState(false);
  const [improveError, setImproveError] = useState<string | null>(null);
  const [improveResult, setImproveResult] = useState<ImprovementResult | null>(null);
  const [resumeKeywords, setResumeKeywords] = useState<string[]>([]);
  const [jobKeywords, setJobKeywords] = useState<string[]>([]);
  // Proxy-aware API wrappers handle base/proxy

  useEffect(() => { if (!resume_id) return; setLoading(true); getResume(resume_id).then(json => { if (json?.data) setData(json.data as ResumeData); else throw new Error('Invalid server response'); }).catch(e => setError((e as Error).message)).finally(() => setLoading(false)); }, [resume_id]);
  useEffect(() => { if (!resume_id || loading || error) return; if (data?.processed_resume) { if (pollRef.current) clearTimeout(pollRef.current); return; } pollRef.current = setTimeout(() => { getResume(resume_id).then(json => { if (json?.data) setData(json.data as ResumeData); }).catch(() => {}); }, 2000); return () => { if (pollRef.current) clearTimeout(pollRef.current); }; }, [resume_id, data, loading, error]);
  useEffect(() => { if (!data?.processed_resume) return; const ek = data.processed_resume.extracted_keywords; setResumeKeywords(safeParseKeywords(ek)); }, [data?.processed_resume]);

  const startMatchAndImprove = useCallback(async () => {
    if (!resume_id) return;
    setImproveError(null);
    setImproveResult(null);
    setJobKeywords([]);
    if (!jobDescription.trim()) { setImproveError(t('jobDescLabel') + ' ?'); return; }
    setImproving(true);
    try {
      const uploadJson = await uploadJobJson(jobDescription, resume_id);
  const jobIdPayload = uploadJson?.data?.job_id;
  const newJobId = Array.isArray(jobIdPayload) ? jobIdPayload[0] : jobIdPayload;
  if (!newJobId) throw new Error('No job_id returned');
      try {
        const jr = await fetch(`/api_be/api/v1/jobs?job_id=${newJobId}`);
        if (jr.ok) {
          const jjson = await jr.json() as { data?: JobDataResp };
          const proc = jjson?.data?.processed_job;
          if (proc?.extracted_keywords) setJobKeywords(safeParseKeywords(proc.extracted_keywords));
        }
      } catch { /* ignore job keyword errors */ }
  const improveJson = await apiImproveResume({ resume_id, job_id: newJobId, require_llm: true }) as unknown as { data?: ImprovementResult };
      if (improveJson?.data) setImproveResult(improveJson.data);
    } catch (e) {
      setImproveError(e instanceof Error ? e.message : String(e));
    } finally {
      setImproving(false);
    }
  }, [jobDescription, resume_id, t]);

  const keywordDiff = useMemo(() => diffKeywords(resumeKeywords, jobKeywords), [resumeKeywords, jobKeywords]);
  const atsScore = useMemo(() => { if (!improveResult) return null; return computeAtsScore(keywordDiff, jobKeywords, data?.processed_resume ? 100 : 50); }, [improveResult, jobKeywords, keywordDiff, data?.processed_resume]);

  return (<div className="min-h-screen px-6 py-10 max-w-5xl mx-auto text-sm text-gray-200"><div className="flex items-center justify-between mb-6"><h1 className="text-2xl font-semibold">{t('title')}</h1><div className="flex gap-4 text-xs"><Link href={`/${locale}`} className="underline hover:text-white">{t('meta')}</Link><Link href={`/${locale}/resume`} className="underline hover:text-white">{t('uploadNew')}</Link></div></div>{loading && <p className="text-gray-400">Loading...</p>}{error && <p className="text-red-400">Error: {error}</p>}{!loading && !error && data && !data.processed_resume && (<p className="text-amber-400">{t('parsingWait')}</p>)}{data && (<div className="space-y-8"><section><h2 className="text-lg font-medium mb-2">{t('meta')}</h2><pre className="bg-gray-900/60 border border-gray-800 rounded p-3 overflow-auto">{JSON.stringify({ resume_id: data.resume_id }, null, 2)}</pre></section><section><h2 className="text-lg font-medium mb-2">{t('personalData')}</h2><pre className="bg-gray-900/60 border border-gray-800 rounded p-3 overflow-auto">{JSON.stringify(data.processed_resume?.personal_data, null, 2)}</pre></section><section><h2 className="text-lg font-medium mb-2">{t('skills')}</h2><div className="flex flex-wrap gap-2">{safeParseKeywords(data.processed_resume?.skills).map((k, i) => (<span key={makeKey('skill_', k, i)} className="px-2 py-1 bg-gray-800 rounded border border-gray-700 text-xs">{k}</span>))}</div></section><section><h2 className="text-lg font-medium mb-2">{t('experiences')}</h2><pre className="bg-gray-900/60 border border-gray-800 rounded p-3 overflow-auto">{JSON.stringify(data.processed_resume?.experiences, null, 2)}</pre></section><section><h2 className="text-lg font-medium mb-2">{t('projects')}</h2><pre className="bg-gray-900/60 border border-gray-800 rounded p-3 overflow-auto">{JSON.stringify(data.processed_resume?.projects, null, 2)}</pre></section><section><h2 className="text-lg font-medium mb-2">{t('education')}</h2><pre className="bg-gray-900/60 border border-gray-800 rounded p-3 overflow-auto">{JSON.stringify(data.processed_resume?.education, null, 2)}</pre></section><section><h2 className="text-lg font-medium mb-2">{t('extractedKeywords')}</h2><div className="flex flex-wrap gap-2">{safeParseKeywords(data.processed_resume?.extracted_keywords).map((k, i) => (<span key={makeKey('ek_', k, i)} className="px-2 py-1 bg-gray-800 rounded border border-gray-700 text-xs">{k}</span>))}</div></section><section><h2 className="text-lg font-medium mb-2">{t('rawExcerpt')}</h2><pre className="bg-gray-900/60 border border-gray-800 rounded p-3 overflow-auto max-h-72">{data.raw_resume?.content?.slice(0, 4000)}</pre></section><section><h2 className="text-lg font-semibold mb-3">{t('jobMatchTitle')}</h2><div className="space-y-3 bg-gray-900/60 border border-gray-800 rounded p-4"><label className="block text-xs font-medium text-gray-400">{t('jobDescLabel')}</label><textarea value={jobDescription} onChange={e => setJobDescription(e.target.value)} rows={8} placeholder={t('jobDescLabel')} className="w-full bg-gray-950/60 border border-gray-700 rounded px-3 py-2 text-xs resize-vertical focus:outline-none focus:ring focus:ring-sky-600" /><div className="flex flex-wrap gap-3 items-center"><button onClick={startMatchAndImprove} disabled={improving || !data?.processed_resume} className="px-4 py-2 text-xs font-medium rounded bg-gradient-to-r from-sky-600 to-violet-600 hover:from-sky-500 hover:to-violet-500 disabled:opacity-50 disabled:cursor-not-allowed">{improving ? t('analyzing') : t('startButton')}</button>{!data?.processed_resume && <span className="text-amber-400 text-xs">{t('parsingWait')}</span>}</div>{improveError && <p className="text-red-400 text-xs">{improveError}</p>}</div></section>{improving && (<section><div className="animate-pulse text-xs text-amber-400">{t('analyzing')}</div></section>)}{improveResult && (<section className="space-y-6"><div className="grid grid-cols-3 gap-3 text-center text-xs"><div className="bg-gray-900/60 border border-gray-800 rounded p-3"><div className="text-gray-400">{t('originalScore')}</div><div className="text-sky-400 font-semibold">{improveResult.original_score.toFixed(3)}</div></div><div className="bg-gray-900/60 border border-gray-800 rounded p-3"><div className="text-gray-400">{t('newScore')}</div><div className="text-violet-400 font-semibold">{improveResult.new_score.toFixed(3)}</div></div><div className="bg-gray-900/60 border border-gray-800 rounded p-3"><div className="text-gray-400">{t('delta')}</div><div className="text-emerald-400 font-semibold">{(improveResult.new_score - improveResult.original_score).toFixed(3)}</div></div></div>{atsScore && (<div className="bg-gray-900/60 border border-gray-800 rounded p-4 text-xs space-y-2"><h3 className="font-semibold text-sm">{t('atsHeuristic')}</h3><div className="flex flex-wrap gap-6"><div><div className="text-gray-400">{t('keywordCoverage')}</div><div className="text-sky-400 font-medium">{atsScore.keywordCoverage.toFixed(1)}%</div></div><div><div className="text-gray-400">{t('sections')}</div><div className="text-violet-400 font-medium">{atsScore.sectionCompleteness}%</div></div><div><div className="text-gray-400">{t('atsScore')}</div><div className="text-emerald-400 font-semibold text-lg">{atsScore.finalScore}</div></div></div><p className="text-[10px] text-gray-500">70% {t('keywordCoverage')} / 30% {t('sections')}.</p></div>)}<div className="bg-gray-900/60 border border-gray-800 rounded p-4 text-xs space-y-3"><h3 className="font-semibold">{t('keywordDiff')}</h3><div className="space-y-1"><div className="text-gray-400">{t('present')} ({keywordDiff.present.length})</div><div className="flex flex-wrap gap-1">{keywordDiff.present.map((k, i) => <span key={makeKey('p_', k, i)} className="px-2 py-0.5 bg-gray-800 rounded border border-gray-700">{k}</span>)}</div></div><div className="space-y-1"><div className="text-gray-400">{t('missing')} ({keywordDiff.missing.length})</div><div className="flex flex-wrap gap-1">{keywordDiff.missing.map((k, i) => <span key={makeKey('m_', k, i)} className="px-2 py-0.5 bg-amber-900/40 text-amber-300 rounded border border-amber-700/40">{k}</span>)}</div></div><div className="space-y-1"><div className="text-gray-400">{t('extra')} ({keywordDiff.extra.length})</div><div className="flex flex-wrap gap-1">{keywordDiff.extra.map((k, i) => <span key={makeKey('e_', k, i)} className="px-2 py-0.5 bg-violet-900/40 text-violet-300 rounded border border-violet-700/40">{k}</span>)}</div></div></div><div className="bg-gray-900/60 border border-gray-800 rounded p-4 text-xs space-y-2"><h3 className="font-semibold">{t('improvedResumeSnippet')}</h3><div className="prose prose-invert max-w-none text-xs" dangerouslySetInnerHTML={{ __html: sanitizeHtml(improveResult.updated_resume) }} /></div></section>)} </div>)} </div>);
}
