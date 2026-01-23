'use client';

import { SwissGrid } from '@/components/home/swiss-grid';
import { ResumeUploadDialog } from '@/components/dashboard/resume-upload-dialog';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Loader2, AlertCircle, RefreshCw, Plus } from 'lucide-react';
import {
  fetchResume,
  fetchResumeList,
  deleteResume,
  type ResumeListItem,
  fetchResumeLocal,
  fetchResumeList_local,
} from '@/lib/api/resume';
import { useStatusCache } from '@/lib/context/status-cache';
import Link from 'next/link';
import { Settings, AlertTriangle } from 'lucide-react';

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'loading';

export default function DashboardPage() {
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('loading');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tailoredResumes, setTailoredResumes] = useState<ResumeListItem[]>([]);
  const router = useRouter();

  // Status cache for optimistic counter updates and LLM status check
  const {
    status: systemStatus,
    isLoading: statusLoading,
    incrementResumes,
    decrementResumes,
    setHasMasterResume,
  } = useStatusCache();

  // Check if LLM is configured (API key is set)
  const isLlmConfigured = !statusLoading && systemStatus?.llm_configured;

  const cardBaseClass = 'bg-[#F0F0E8] p-6 md:p-8 aspect-square h-full relative flex flex-col';
  // The physics class from your Hero, adapted for cards
  const interactiveCardClass = `${cardBaseClass} transition-all duration-200 ease-in-out hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_0px_#000000] cursor-pointer group`;

  const isTailorEnabled =
    Boolean(masterResumeId) && processingStatus === 'ready' && isLlmConfigured;

  const formatDate = (value: string) => {
    if (!value) return 'Unknown';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return 'Unknown';
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: '2-digit',
      year: 'numeric',
    });
  };

  const checkResumeStatus = useCallback(async (resumeId: string) => {
    try {
      setProcessingStatus('loading');
      // fetch resume local
      //const status = data.raw_resume?.processing_status || 'pending';
      const data = await fetchResumeLocal(resumeId);
      console.log('Resume status:', data);
      
      // Data from fetchResumeLocal is now adapted to match ResumeResponse['data']
      // So processing_status is inside raw_resume
      const status = data.raw_resume?.processing_status || 'pending';

      setProcessingStatus(status as ProcessingStatus);
    } catch (err: unknown) {
      console.error('Failed to check resume status:', err);
      // If resume not found (404), clear the stale localStorage
      if (err instanceof Error && err.message.includes('404')) {
        localStorage.removeItem('master_resume_id');
        setMasterResumeId(null);
        return;
      }
      setProcessingStatus('failed');
    }
  }, []);

  useEffect(() => {
    const storedId = localStorage.getItem('master_resume_id');
    if (storedId) {
      setMasterResumeId(storedId);
      checkResumeStatus(storedId);
    }
  }, [checkResumeStatus]);

  const loadTailoredResumes = useCallback(async () => {
    try {
      let data: ResumeListItem[] = [];
      
      // Try local fetch first
      try {
        const localData = await fetchResumeList_local(true);
        if (localData && localData.length > 0) {
          data = localData;
        }
      } catch (localErr) {
        console.log('Local list fetch failed or empty, trying API...', localErr);
      }

      // Fallback to API if local is empty/failed
      if (data.length === 0) {
         data = await fetchResumeList(true);
      }

      const masterFromList = data.find((r) => r.is_master);
      const storedId = localStorage.getItem('master_resume_id');
      const resolvedMasterId = masterFromList?.resume_id || storedId;

      if (resolvedMasterId) {
        localStorage.setItem('master_resume_id', resolvedMasterId);
        setMasterResumeId(resolvedMasterId);
        checkResumeStatus(resolvedMasterId);
      } else {
        localStorage.removeItem('master_resume_id');
        setMasterResumeId(null);
      }

      const filtered = data.filter((r) => r.resume_id !== resolvedMasterId);
      setTailoredResumes(filtered);
    } catch (err) {
      console.error('Failed to load tailored resumes:', err);
    }
  }, [checkResumeStatus]);

  useEffect(() => {
    loadTailoredResumes();
  }, [loadTailoredResumes]);

  // Refresh list when window gains focus (e.g., returning from viewer after delete)
  useEffect(() => {
    const handleFocus = () => {
      loadTailoredResumes();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, [loadTailoredResumes, checkResumeStatus]);

  const handleUploadComplete = (resumeId: string) => {
    localStorage.setItem('master_resume_id', resumeId);
    setMasterResumeId(resumeId);
    // Check status after upload completes
    checkResumeStatus(resumeId);
    // Update cached counters
    incrementResumes();
    setHasMasterResume(true);
  };

  const handleRetryProcessing = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (masterResumeId) {
      // For now, just re-check the status
      // In the future, could add a retry endpoint
      checkResumeStatus(masterResumeId);
    }
  };

  const getStatusDisplay = () => {
    switch (processingStatus) {
      case 'loading':
        return {
          text: 'CHECKING...',
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          color: 'text-gray-500',
        };
      case 'processing':
        return {
          text: 'PROCESSING...',
          icon: <Loader2 className="w-3 h-3 animate-spin" />,
          color: 'text-blue-700',
        };
      case 'ready':
        return { text: 'READY', icon: null, color: 'text-green-700' };
      case 'failed':
        return {
          text: 'PROCESSING FAILED',
          icon: <AlertCircle className="w-3 h-3" />,
          color: 'text-red-600',
        };
      default:
        return { text: 'PENDING', icon: null, color: 'text-gray-500' };
    }
  };

  const confirmDeleteMaster = async () => {
    // Delete from backend if it exists
    if (masterResumeId) {
      try {
        await deleteResume(masterResumeId);
        // Update cached counters
        decrementResumes();
        setHasMasterResume(false);
      } catch (err) {
        console.error('Failed to delete resume from server:', err);
      }
    }
    // Clear localStorage
    localStorage.removeItem('master_resume_id');
    setMasterResumeId(null);
    setProcessingStatus('loading');
    // Refresh the tailored resumes list
    loadTailoredResumes();
  };

  const totalCards = 1 + tailoredResumes.length + 1;
  const fillerCount = Math.max(0, (5 - (totalCards % 5)) % 5);
  const extraFillerCount = 5;
  const fillerPalette = ['bg-[#E5E5E0]', 'bg-[#D8D8D2]', 'bg-[#CFCFC7]', 'bg-[#E0E0D8]'];

  return (
    <div className="space-y-6">
      {/* Configuration Warning Banner */}
      {masterResumeId && !isLlmConfigured && !statusLoading && (
        <div className="border-2 border-amber-500 bg-amber-50 p-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] mb-6 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            <div>
              <p className="font-mono text-sm font-bold uppercase tracking-wider text-amber-800">
                [ LLM NOT CONFIGURED ]
              </p>
              <p className="font-mono text-xs text-amber-700 mt-0.5">
                {'>'} API keys are missing. Resume tailoring is disabled until configured in
                settings.
              </p>
            </div>
          </div>
          <Link href="/settings">
            <Button variant="outline" size="sm" className="border-amber-500 text-amber-700">
              <Settings className="w-4 h-4 mr-2" />
              Settings
            </Button>
          </Link>
        </div>
      )}

      <SwissGrid>
        {/* 1. Master Resume Logic */}
        {!masterResumeId ? (
          // Check if LLM is configured first
          !isLlmConfigured && !statusLoading ? (
            // LLM Not Configured - Show Setup Required Card
            <Link href="/settings" className="block h-full">
              <div
                className={`${cardBaseClass} border-2 border-dashed border-amber-500 bg-amber-50 transition-all duration-200 ease-in-out hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_0px_rgba(0,0,0,0.2)] cursor-pointer group`}
              >
                <div className="flex-1 flex flex-col justify-between">
                  <div className="w-14 h-14 border-2 border-amber-500 bg-white flex items-center justify-center mb-4">
                    <AlertTriangle className="w-7 h-7 text-amber-600" />
                  </div>
                  <div>
                    <h3 className="font-mono text-lg font-bold uppercase text-amber-800">
                      [ SETUP REQUIRED ]
                    </h3>
                    <p className="font-mono text-xs mt-2 text-amber-700">
                      {'>'} Configure API key in settings to enable resume tailoring.
                    </p>
                    <div className="flex items-center gap-2 mt-4 text-amber-700 group-hover:text-amber-900">
                      <Settings className="w-4 h-4" />
                      <span className="font-mono text-xs font-bold uppercase">Go to Settings</span>
                    </div>
                  </div>
                </div>
              </div>
            </Link>
          ) : (
            // Upload State - Pass the card as the trigger
            <ResumeUploadDialog
              onUploadComplete={handleUploadComplete}
              trigger={
                <div className={`${interactiveCardClass} hover:bg-blue-700 hover:text-[#F0F0E8]`}>
                  <div className="flex-1 flex flex-col justify-between pointer-events-none">
                    <div className="w-14 h-14 border-2 border-current flex items-center justify-center mb-4">
                      <span className="text-2xl leading-none relative top-[-2px]">+</span>
                    </div>
                    <div>
                      <h3 className="font-mono text-xl font-bold uppercase">
                        Initialize Master Resume
                      </h3>
                      <p className="font-mono text-xs mt-2 opacity-60 group-hover:opacity-100">
                        {'// Initialize Sequence'}
                      </p>
                    </div>
                  </div>
                </div>
              }
            />
          )
        ) : (
          // Master Resume Exists - Click to View
          <Link
            href={`/resumes/${masterResumeId}`}
            className={interactiveCardClass}
          >
            <div className="flex-1 flex flex-col h-full">
              <div className="flex justify-between items-start mb-6">
                <div className="w-16 h-16 border-2 border-black bg-blue-700 text-white flex items-center justify-center">
                  <span className="font-mono font-bold text-lg">M</span>
                </div>
                <div className="flex gap-1">
                  {processingStatus === 'failed' && (
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 hover:bg-blue-100 hover:text-blue-700 z-10 rounded-none"
                      onClick={handleRetryProcessing}
                      title="Refresh status"
                    >
                      <RefreshCw className="w-4 h-4" />
                    </Button>
                  )}
                </div>
              </div>

              <h3 className="font-bold text-lg font-serif leading-tight group-hover:text-blue-700">
                Master Resume
              </h3>
              <p
                className={`text-xs font-mono mt-auto pt-4 flex items-center gap-1 ${getStatusDisplay().color}`}
              >
                {getStatusDisplay().icon}
                STATUS: {getStatusDisplay().text}
              </p>
            </div>
          </Link>
        )}

        {/* 2. Tailored Resumes */}
        {tailoredResumes.map((resume) => (
          <Link
            key={resume.resume_id}
            href={`/resumes/${resume.resume_id}`}
            className={`${interactiveCardClass} bg-[#E5E5E0]`}
          >
            <div className="flex-1 flex flex-col">
              <div className="flex justify-between items-start mb-6">
                <div className="w-12 h-12 border-2 border-black bg-white text-black flex items-center justify-center">
                  <span className="font-mono font-bold">T</span>
                </div>
                <span className="font-mono text-xs text-gray-500 uppercase">
                  {resume.processing_status}
                </span>
              </div>
              <h3 className="font-bold text-lg font-serif leading-tight">
                {resume.filename || 'Tailored Resume'}
              </h3>
              <p className="text-xs font-mono mt-auto pt-4 text-gray-500 uppercase">
                Edited {formatDate(resume.updated_at || resume.created_at)}
              </p>
            </div>
          </Link>
        ))}

        {/* 3. Create Tailored Resume */}
        <div className={cardBaseClass}>
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <Button
              onClick={() => router.push('/tailor')}
              disabled={!isTailorEnabled}
              className="w-20 h-20 bg-blue-700 text-white border-2 border-black shadow-[4px_4px_0px_0px_#000000] hover:bg-blue-800 hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all rounded-none"
            >
              <Plus className="w-8 h-8" />
            </Button>
            <p className="text-xs font-mono mt-4 uppercase text-green-700">Create Resume</p>
          </div>
        </div>

        {/* 4. Fillers (Static, no hover effect, just structure) */}
        {Array.from({ length: fillerCount }).map((_, index) => (
          <div
            key={`filler-${index}`}
            className="hidden md:block bg-[#F0F0E8] aspect-square h-full opacity-50 pointer-events-none"
          ></div>
        ))}

        {Array.from({ length: extraFillerCount }).map((_, index) => (
          <div
            key={`extra-filler-${index}`}
            className={`hidden md:block ${fillerPalette[index % fillerPalette.length]} aspect-square h-full opacity-70 pointer-events-none`}
          ></div>
        ))}

        {/* Delete Confirmation Dialog */}
        <ConfirmDialog
          open={showDeleteDialog}
          onOpenChange={setShowDeleteDialog}
          title="Delete Master Resume"
          description="This action cannot be undone. Your master resume will be permanently removed from the system."
          confirmLabel="Delete Resume"
          cancelLabel="Keep Resume"
          onConfirm={confirmDeleteMaster}
          variant="danger"
        />
      </SwissGrid>
    </div>
  );
}
