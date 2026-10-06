'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  fetchResumeList,
  fetchJobQueue,
  addJobToQueue,
  deleteQueueItem,
  clearQueueItems,
  type QueueItem,
  type ResumeListItem,
} from '@/lib/api/resume';
import { fetchPromptConfig, type PromptOption } from '@/lib/api/config';
import { useStatusCache } from '@/lib/context/status-cache';
import { Button } from '@/components/ui/button';
import { Dropdown } from '@/components/ui/dropdown';
import {
  ArrowLeft,
  Clock,
  Sparkles,
  Briefcase,
  Building2,
  Hash,
  Loader2,
  Plus,
  Trash2,
  RefreshCw,
  ExternalLink,
  Layers,
  AlertCircle,
  CheckCircle2,
  Settings,
} from 'lucide-react';

export default function QueuePage() {
  const router = useRouter();
  const { status: systemStatus, isLoading: statusLoading, incrementJobs } = useStatusCache();
  const isLlmConfigured = !statusLoading && systemStatus?.llm_configured;

  // Master Resumes
  const [masters, setMasters] = useState<ResumeListItem[]>([]);
  const [selectedResumeId, setSelectedResumeId] = useState<string>('');
  const [resumesLoading, setResumesLoading] = useState(true);

  // Prompt options
  const [promptOptions, setPromptOptions] = useState<PromptOption[]>([]);
  const [selectedPromptId, setSelectedPromptId] = useState<string>('keywords');
  const [promptLoading, setPromptLoading] = useState(true);
  const hasUserSelectedPrompt = useRef(false);

  // Queue state
  const [queueItems, setQueueItems] = useState<QueueItem[]>([]);
  const [isRefreshingQueue, setIsRefreshingQueue] = useState(false);
  const [isAddingToQueue, setIsAddingToQueue] = useState(false);
  const [queueError, setQueueError] = useState<string | null>(null);
  const [queueSuccessMessage, setQueueSuccessMessage] = useState<string | null>(null);

  // Form inputs
  const [jobDescriptionInput, setJobDescriptionInput] = useState('');
  const [roleInput, setRoleInput] = useState('');
  const [companyInput, setCompanyInput] = useState('');
  const [jobReqIdInput, setJobReqIdInput] = useState('');
  const [rateLimitSeconds, setRateLimitSeconds] = useState<number>(5);

  // Load master resumes
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setResumesLoading(true);
      try {
        const list = await fetchResumeList(true);
        if (cancelled) return;
        const ready = list.filter((r) => r.is_master && r.processing_status === 'ready');
        setMasters(ready);
        const storedId = localStorage.getItem('master_resume_id');
        const initial = (storedId && ready.find((r) => r.resume_id === storedId)) || ready[0];
        if (initial) {
          setSelectedResumeId(initial.resume_id);
        }
      } catch (err) {
        console.error('Failed to load resumes', err);
        const storedId = localStorage.getItem('master_resume_id');
        if (storedId) setSelectedResumeId(storedId);
      } finally {
        if (!cancelled) setResumesLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Load prompt config
  useEffect(() => {
    let cancelled = false;
    (async () => {
      setPromptLoading(true);
      try {
        const config = await fetchPromptConfig();
        if (!cancelled) {
          setPromptOptions(config.prompt_options || []);
          if (!hasUserSelectedPrompt.current) {
            setSelectedPromptId(config.default_prompt_id || 'keywords');
          }
        }
      } catch (err) {
        console.error('Failed to load prompt config', err);
      } finally {
        if (!cancelled) setPromptLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // Heuristic metadata parser (Zero LLM calls)
  const parseMetadataLocal = (text: string) => {
    let role = '';
    let company = '';
    let jobReqId = '';
    if (!text || !text.trim()) return { role, company, jobReqId };

    const lines = text
      .trim()
      .split('\n')
      .map((l) => l.trim())
      .filter(Boolean);

    for (const line of lines.slice(0, 25)) {
      if (!role) {
        const mRole = line.match(/^(?:job\s+title|role|position|title)\s*[:\-]\s*(.+)$/i);
        if (mRole) role = mRole[1].trim();
      }
      if (!company) {
        const mComp = line.match(/^(?:company|organization|employer|client)\s*[:\-]\s*(.+)$/i);
        if (mComp) company = mComp[1].trim();
      }
      if (!jobReqId) {
        const mId = line.match(
          /(?:job\s*id|req(?:uisition)?\s*id|req\s*#|job\s*#|requisition)\s*[:\-#]?\s*([a-zA-Z0-9_\-]+)/i
        );
        if (mId) jobReqId = mId[1].trim();
      }
    }

    if (!role && lines.length > 0) {
      const firstLine = lines[0];
      const mAt = firstLine.match(/^(.+?)\s+(?:at|@)\s+([A-Za-z0-9&.\s]{2,40})$/i);
      if (mAt) {
        role = mAt[1].trim();
        if (!company) company = mAt[2].trim();
      } else if (
        firstLine.length < 70 &&
        !/about us|overview|description|welcome/i.test(firstLine)
      ) {
        role = firstLine;
      }
    }

    if (!company) {
      for (const line of lines.slice(0, 20)) {
        const mAbout = line.match(/^about\s+([A-Z][A-Za-z0-9&.\s]{2,35})\b/i);
        if (mAbout) {
          company = mAbout[1].trim();
          break;
        }
        const mHiring = line.match(
          /^([A-Z][A-Za-z0-9&.\s]{2,35})\s+is\s+(?:looking|hiring|seeking)/i
        );
        if (mHiring) {
          company = mHiring[1].trim();
          break;
        }
      }
    }

    return {
      role: role.slice(0, 70).trim(),
      company: company.slice(0, 60).trim(),
      jobReqId: jobReqId.slice(0, 40).trim(),
    };
  };

  const handleInputChange = (text: string) => {
    setJobDescriptionInput(text);
    const parsed = parseMetadataLocal(text);
    if (parsed.role) setRoleInput(parsed.role);
    if (parsed.company) setCompanyInput(parsed.company);
    if (parsed.jobReqId) setJobReqIdInput(parsed.jobReqId);
  };

  const handleTextareaKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter') e.stopPropagation();
  };

  // Load Queue
  const loadQueue = useCallback(async () => {
    try {
      const items = await fetchJobQueue(selectedResumeId || undefined);
      setQueueItems(items);
    } catch (err) {
      console.error('Failed to load queue', err);
    }
  }, [selectedResumeId]);

  useEffect(() => {
    loadQueue();
  }, [loadQueue]);

  // Polling when active items exist
  useEffect(() => {
    const hasActiveItems = queueItems.some(
      (item) => item.status === 'pending' || item.status === 'processing'
    );
    if (!hasActiveItems) return;

    const interval = setInterval(async () => {
      try {
        const items = await fetchJobQueue(selectedResumeId || undefined);
        setQueueItems(items);
      } catch (err) {
        console.error('Failed to poll queue', err);
      }
    }, 2500);

    return () => clearInterval(interval);
  }, [selectedResumeId, queueItems]);

  const handleRefresh = async () => {
    setIsRefreshingQueue(true);
    try {
      await loadQueue();
    } finally {
      setIsRefreshingQueue(false);
    }
  };

  const handleAddToQueue = async () => {
    if (!selectedResumeId) {
      setQueueError('Master resume not found. Please select or upload a master resume first.');
      return;
    }
    const trimmed = jobDescriptionInput.trim();
    if (!trimmed) {
      setQueueError('Please enter a job description.');
      return;
    }
    if (trimmed.length < 20) {
      setQueueError('Job description is too short (at least 20 characters required).');
      return;
    }

    setIsAddingToQueue(true);
    setQueueError(null);
    setQueueSuccessMessage(null);

    try {
      const newItem = await addJobToQueue(
        selectedResumeId,
        trimmed,
        rateLimitSeconds,
        roleInput.trim() || undefined,
        companyInput.trim() || undefined,
        jobReqIdInput.trim() || undefined,
        selectedPromptId
      );

      setQueueItems((prev) => [newItem, ...prev.filter((i) => i.item_id !== newItem.item_id)]);
      setJobDescriptionInput('');
      setRoleInput('');
      setCompanyInput('');
      setJobReqIdInput('');
      setQueueSuccessMessage('Added to queue! You can paste another job description.');
      setTimeout(() => setQueueSuccessMessage(null), 4500);
      incrementJobs?.();
    } catch (err) {
      console.error('Failed to add job to queue', err);
      setQueueError(err instanceof Error ? err.message : 'Failed to add job to queue');
    } finally {
      setIsAddingToQueue(false);
    }
  };

  const handleDeleteItem = async (itemId: string) => {
    try {
      await deleteQueueItem(itemId);
      setQueueItems((prev) => prev.filter((i) => i.item_id !== itemId));
    } catch (err) {
      console.error('Failed to delete queue item', err);
    }
  };

  const handleClearCompleted = async () => {
    try {
      await clearQueueItems('completed');
      setQueueItems((prev) => prev.filter((i) => i.status !== 'completed'));
    } catch (err) {
      console.error('Failed to clear completed items', err);
    }
  };

  const handleClearAll = async () => {
    try {
      await clearQueueItems();
      setQueueItems([]);
    } catch (err) {
      console.error('Failed to clear all queue items', err);
    }
  };

  const currentMaster = masters.find((m) => m.resume_id === selectedResumeId);

  return (
    <div className="min-h-screen w-full bg-[#F6F5EE] flex flex-col items-center justify-start p-4 md:p-8 font-sans">
      <div className="w-full max-w-5xl bg-white border-2 border-black shadow-[6px_6px_0px_0px_rgba(0,0,0,1)] p-6 md:p-10 space-y-8">
        {/* Navigation & Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b-2 border-black pb-6">
          <div className="space-y-1">
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => router.push('/tailor')}
                className="font-mono text-xs uppercase"
              >
                <ArrowLeft className="w-3.5 h-3.5 mr-1" />
                Tailor
              </Button>
              <span className="font-mono text-xs text-gray-500">/</span>
              <span className="font-mono text-xs uppercase font-bold text-gray-700">
                Queue Manager
              </span>
            </div>
            <h1 className="font-serif text-3xl md:text-4xl font-black uppercase tracking-tight text-black mt-2">
              Tailoring Queue
            </h1>
            <p className="font-sans text-sm text-gray-600 max-w-2xl">
              Queue job descriptions for sequential background tailoring. Automatically extracts
              role and company metadata with 0 LLM calls, with configurable cooldown periods to
              prevent rate-limiting.
            </p>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href="/tailor"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-black font-mono text-xs uppercase hover:bg-gray-100 transition-colors"
            >
              Manual Tailoring
            </Link>
            <Link
              href="/settings"
              className="inline-flex items-center gap-1.5 px-3 py-1.5 border border-black font-mono text-xs uppercase hover:bg-gray-100 transition-colors"
            >
              <Settings className="w-3.5 h-3.5" />
              Settings
            </Link>
          </div>
        </div>

        {/* Warning if LLM not configured */}
        {!statusLoading && !isLlmConfigured && (
          <div className="border-2 border-amber-600 bg-amber-50 p-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2 text-amber-900 font-mono text-xs">
              <AlertCircle className="w-4 h-4 text-amber-700 shrink-0" />
              <span>
                LLM API key is not configured. Please configure an LLM provider before processing
                queue jobs.
              </span>
            </div>
            <Link
              href="/settings"
              className="px-3 py-1 bg-amber-600 text-white font-mono text-xs uppercase font-bold hover:bg-amber-700"
            >
              Configure
            </Link>
          </div>
        )}

        {/* Master Resume Selector */}
        <div className="border border-black bg-[#FAF9F5] p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Layers className="w-4 h-4 text-black shrink-0" />
            <span className="font-mono text-xs uppercase font-bold text-black">
              Target Master Resume:
            </span>
            {resumesLoading ? (
              <span className="font-mono text-xs text-gray-500">Loading...</span>
            ) : masters.length > 0 ? (
              <select
                value={selectedResumeId}
                onChange={(e) => setSelectedResumeId(e.target.value)}
                className="font-mono text-xs border border-black bg-white px-2 py-1 max-w-xs focus:outline-none"
              >
                {masters.map((m) => (
                  <option key={m.resume_id} value={m.resume_id}>
                    {m.title || m.filename || m.resume_id} ({m.resume_id.slice(0, 8)})
                  </option>
                ))}
              </select>
            ) : (
              <span className="font-mono text-xs text-red-600 font-bold">
                No Master Resume found. Please upload one in the Dashboard.
              </span>
            )}
          </div>
          {currentMaster && (
            <span className="font-mono text-[11px] text-gray-500">
              Selected: {currentMaster.title || currentMaster.filename || currentMaster.resume_id}
            </span>
          )}
        </div>

        {/* Add to Queue Form */}
        <div className="space-y-4 border-2 border-black p-5 bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
          <div className="flex items-center justify-between border-b border-black pb-2">
            <h2 className="font-serif text-lg font-bold uppercase tracking-tight">
              Add Job to Tailoring Queue
            </h2>
            <span className="font-mono text-xs text-gray-500">Instant Local Heuristics</span>
          </div>

          {/* Job Description Textarea */}
          <div className="space-y-1">
            <label className="block font-mono text-xs uppercase font-bold text-gray-700">
              Job Description
            </label>
            <textarea
              className="w-full h-36 p-3 border border-black font-sans text-sm focus:outline-none focus:ring-1 focus:ring-black bg-[#FAF9F5]"
              placeholder="Paste job description text here... Role, Company, and Req ID will be extracted automatically without calling an LLM."
              value={jobDescriptionInput}
              onChange={(e) => handleInputChange(e.target.value)}
              onKeyDown={handleTextareaKeyDown}
              disabled={isAddingToQueue}
            />
          </div>

          {/* Extracted Metadata (Role, Company, Job ID) */}
          <div className="border border-black bg-[#FAF9F5] p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-mono text-[11px] font-bold uppercase text-gray-700 flex items-center gap-1.5">
                <Sparkles className="w-3.5 h-3.5 text-blue-700" />
                Detected Job Details (Zero LLM Calls):
              </span>
              <span className="font-mono text-[10px] text-gray-400">
                Auto-extracted • Edit if needed
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
              <div className="flex items-center border border-gray-300 bg-white px-2.5 py-1.5 focus-within:border-black">
                <Briefcase className="w-3.5 h-3.5 text-gray-400 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Role (e.g. Frontend Dev)"
                  value={roleInput}
                  onChange={(e) => setRoleInput(e.target.value)}
                  className="w-full font-sans text-xs focus:outline-none"
                  disabled={isAddingToQueue}
                />
              </div>

              <div className="flex items-center border border-gray-300 bg-white px-2.5 py-1.5 focus-within:border-black">
                <Building2 className="w-3.5 h-3.5 text-gray-400 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Company (e.g. Stripe)"
                  value={companyInput}
                  onChange={(e) => setCompanyInput(e.target.value)}
                  className="w-full font-sans text-xs focus:outline-none"
                  disabled={isAddingToQueue}
                />
              </div>

              <div className="flex items-center border border-gray-300 bg-white px-2.5 py-1.5 focus-within:border-black">
                <Hash className="w-3.5 h-3.5 text-gray-400 mr-2 shrink-0" />
                <input
                  type="text"
                  placeholder="Job / Req ID (optional)"
                  value={jobReqIdInput}
                  onChange={(e) => setJobReqIdInput(e.target.value)}
                  className="w-full font-sans text-xs focus:outline-none"
                  disabled={isAddingToQueue}
                />
              </div>
            </div>
          </div>

          {/* Queue Parameters Row (Prompt Strategy + Rate Limit Seconds) */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
            <div>
              <label className="block font-mono text-xs uppercase font-bold text-gray-700 mb-1">
                Prompt Strategy
              </label>
              {promptLoading ? (
                <div className="h-9 border border-gray-300 bg-gray-50 flex items-center px-3 font-mono text-xs text-gray-400">
                  Loading strategies...
                </div>
              ) : promptOptions.length > 0 ? (
                <Dropdown
                  options={promptOptions.map((opt) => ({
                    id: opt.id,
                    label: opt.label || opt.id,
                    description: opt.description,
                  }))}
                  value={selectedPromptId}
                  onChange={(val) => {
                    hasUserSelectedPrompt.current = true;
                    setSelectedPromptId(val);
                  }}
                  className="w-full font-mono text-xs"
                />
              ) : (
                <div className="font-mono text-xs text-gray-500">Default strategy</div>
              )}
            </div>

            <div>
              <label className="block font-mono text-xs uppercase font-bold text-gray-700 mb-1 flex items-center justify-between">
                <span>Cooldown Period</span>
                <span className="text-gray-400 font-normal">Seconds between jobs</span>
              </label>
              <div className="flex items-center border border-black bg-white px-3 py-1.5">
                <Clock className="w-3.5 h-3.5 text-gray-400 mr-2 shrink-0" />
                <input
                  type="number"
                  min={1}
                  max={60}
                  step={0.5}
                  value={rateLimitSeconds}
                  onChange={(e) =>
                    setRateLimitSeconds(Math.max(1, parseFloat(e.target.value) || 1))
                  }
                  className="w-full font-mono text-xs focus:outline-none"
                  disabled={isAddingToQueue}
                />
                <span className="font-mono text-xs text-gray-500 ml-1">sec</span>
              </div>
            </div>
          </div>

          {/* Error & Success Toasts */}
          {queueError && (
            <div className="border border-red-600 bg-red-50 p-3 text-red-800 font-mono text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0 text-red-600" />
              <span>{queueError}</span>
            </div>
          )}

          {queueSuccessMessage && (
            <div className="border border-green-600 bg-green-50 p-3 text-green-800 font-mono text-xs flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0 text-green-600" />
              <span>{queueSuccessMessage}</span>
            </div>
          )}

          {/* Add Button */}
          <Button
            type="button"
            onClick={handleAddToQueue}
            disabled={
              isAddingToQueue ||
              !jobDescriptionInput.trim() ||
              !isLlmConfigured ||
              !selectedResumeId
            }
            className="w-full font-mono font-bold bg-black text-white hover:bg-gray-800"
          >
            {isAddingToQueue ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin mr-2" />
                Adding to Tailoring Queue...
              </>
            ) : !isLlmConfigured ? (
              'Configure API Key First'
            ) : !selectedResumeId ? (
              'Upload Master Resume First'
            ) : (
              <>
                <Plus className="w-4 h-4 mr-2" />
                Add to Tailoring Queue
              </>
            )}
          </Button>
        </div>

        {/* Live Queue Monitor List */}
        <div className="border-2 border-black bg-white p-5 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b-2 border-black pb-3">
            <div>
              <div className="flex items-center gap-2">
                <h2 className="font-serif text-lg font-bold uppercase tracking-tight">
                  Queue Monitor
                </h2>
                <span className="font-mono text-xs bg-black text-white px-2 py-0.5 font-bold">
                  {queueItems.length} {queueItems.length === 1 ? 'Job' : 'Jobs'}
                </span>
              </div>
              <p className="font-mono text-xs text-gray-500 mt-1">
                Cooldown: {rateLimitSeconds}s between jobs • Sequential background worker
              </p>
            </div>

            <div className="flex items-center gap-2 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={handleRefresh}
                disabled={isRefreshingQueue}
                className="font-mono text-xs h-8"
              >
                <RefreshCw
                  className={`w-3.5 h-3.5 mr-1 ${isRefreshingQueue ? 'animate-spin' : ''}`}
                />
                Refresh
              </Button>

              {queueItems.some((i) => i.status === 'completed') && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearCompleted}
                  className="font-mono text-xs h-8 text-gray-700 hover:text-black"
                >
                  <Trash2 className="w-3.5 h-3.5 mr-1" />
                  Clear Completed
                </Button>
              )}

              {queueItems.length > 0 && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleClearAll}
                  className="font-mono text-xs h-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                >
                  Clear All
                </Button>
              )}
            </div>
          </div>

          {/* Items List */}
          {queueItems.length === 0 ? (
            <div className="border-2 border-dashed border-gray-300 p-8 text-center bg-[#FAF9F5]">
              <Clock className="w-8 h-8 text-gray-400 mx-auto mb-2 opacity-60" />
              <p className="font-mono text-xs font-bold text-gray-600 uppercase">
                No jobs in queue yet
              </p>
              <p className="font-mono text-xs text-gray-400 mt-1">
                Paste a job description above and click &quot;Add to Tailoring Queue&quot;
              </p>
            </div>
          ) : (
            <div className="divide-y divide-gray-200 border border-black max-h-[500px] overflow-y-auto">
              {queueItems.map((item, idx) => {
                const titleText = item.title || item.role || 'Job Position';
                const companyText = item.company ? `@ ${item.company}` : '';
                return (
                  <div
                    key={item.item_id || idx}
                    className={`p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                      item.status === 'processing'
                        ? 'bg-blue-50/70 border-l-4 border-l-blue-600'
                        : item.status === 'completed'
                          ? 'bg-white border-l-4 border-l-green-600'
                          : item.status === 'failed'
                            ? 'bg-red-50/60 border-l-4 border-l-red-600'
                            : 'bg-gray-50 border-l-4 border-l-gray-400'
                    }`}
                  >
                    <div className="flex-1 min-w-0 pr-2">
                      <div className="flex items-center gap-2 mb-1 flex-wrap">
                        <span className="font-mono text-xs font-bold text-black">
                          {titleText} {companyText}
                        </span>
                        {item.job_req_id && (
                          <span className="font-mono text-[10px] bg-gray-100 text-gray-600 border border-gray-300 px-1.5 py-0.5">
                            ID: {item.job_req_id}
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 font-mono text-[10px] uppercase font-bold border ml-auto sm:ml-0 ${
                            item.status === 'completed'
                              ? 'bg-green-100 text-green-800 border-green-700'
                              : item.status === 'processing'
                                ? 'bg-blue-100 text-blue-800 border-blue-700 animate-pulse'
                                : item.status === 'failed'
                                  ? 'bg-red-100 text-red-800 border-red-700'
                                  : 'bg-gray-200 text-gray-700 border-gray-400'
                          }`}
                        >
                          {item.status}
                        </span>
                      </div>

                      <p className="font-mono text-xs text-gray-600 truncate">
                        {item.job_description_snippet || 'Job Description'}
                      </p>

                      {item.error && (
                        <p className="font-mono text-[11px] text-red-600 mt-1">
                          Error: {item.error}
                        </p>
                      )}
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      {item.status === 'completed' && item.tailored_resume_id && (
                        <Link
                          href={`/resumes/${item.tailored_resume_id}`}
                          className="inline-flex items-center gap-1 px-3 py-1.5 bg-black text-white font-mono text-xs font-bold uppercase hover:bg-blue-700 transition-colors"
                        >
                          View Resume <ExternalLink className="w-3 h-3" />
                        </Link>
                      )}
                      {item.status === 'processing' && (
                        <span className="inline-flex items-center gap-1.5 font-mono text-xs font-bold text-blue-700 px-2 py-1 bg-blue-50 border border-blue-200">
                          <Loader2 className="w-3.5 h-3.5 animate-spin" /> Tailoring...
                        </span>
                      )}
                      {item.status === 'pending' && (
                        <span className="inline-flex items-center gap-1 font-mono text-xs text-gray-500 px-2 py-1 bg-gray-100 border border-gray-200">
                          <Clock className="w-3.5 h-3.5" /> Queued
                        </span>
                      )}

                      {item.status !== 'processing' && (
                        <button
                          type="button"
                          title="Remove from queue"
                          onClick={() => handleDeleteItem(item.item_id)}
                          className="p-1.5 text-gray-400 hover:text-red-600 hover:bg-red-50 border border-transparent hover:border-red-200 transition-colors"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
