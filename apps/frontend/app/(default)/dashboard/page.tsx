'use client';

import { SwissGrid } from '@/components/home/swiss-grid';
import { ResumeUploadDialog } from '@/components/dashboard/resume-upload-dialog';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Trash2, Loader2, AlertCircle, RefreshCw, Plus } from 'lucide-react';
import { fetchResume, fetchResumeList, type ResumeListItem } from '@/lib/api/resume';

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'loading';

export default function DashboardPage() {
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('loading');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [tailoredResumes, setTailoredResumes] = useState<ResumeListItem[]>([]);
  const router = useRouter();

  const cardBaseClass = 'bg-[#F0F0E8] p-8 md:p-12 h-full relative flex flex-col';
  // The physics class from your Hero, adapted for cards
  const interactiveCardClass = `${cardBaseClass} transition-all duration-200 ease-in-out hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_0px_#000000] cursor-pointer group`;

  const isTailorEnabled = Boolean(masterResumeId) && processingStatus === 'ready';

  const getTailorStatus = () => {
    if (!masterResumeId) {
      return { text: 'MASTER RESUME REQUIRED', color: 'text-gray-500' };
    }
    if (processingStatus === 'ready') {
      return { text: 'READY TO TAILOR', color: 'text-green-700' };
    }
    if (processingStatus === 'failed') {
      return { text: 'MASTER PROCESSING FAILED', color: 'text-red-600' };
    }
    if (processingStatus === 'processing' || processingStatus === 'loading') {
      return { text: 'PROCESSING MASTER', color: 'text-blue-700' };
    }
    return { text: 'WAITING FOR MASTER', color: 'text-gray-500' };
  };

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
      const data = await fetchResume(resumeId);
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

  useEffect(() => {
    let cancelled = false;
    const loadTailoredResumes = async () => {
      try {
        const data = await fetchResumeList(false);
        if (!cancelled) {
          setTailoredResumes(data);
        }
      } catch (err) {
        console.error('Failed to load tailored resumes:', err);
      }
    };
    loadTailoredResumes();
    return () => {
      cancelled = true;
    };
  }, []);

  const handleUploadComplete = (resumeId: string) => {
    localStorage.setItem('master_resume_id', resumeId);
    setMasterResumeId(resumeId);
    // Check status after upload completes
    checkResumeStatus(resumeId);
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

  const handleClearMaster = (e: React.MouseEvent) => {
    e.stopPropagation(); // Prevent navigation
    setShowDeleteDialog(true);
  };

  const confirmDeleteMaster = async () => {
    // Delete from backend if it exists
    if (masterResumeId) {
      try {
        const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';
        await fetch(`${API_URL}/api/v1/resumes/${masterResumeId}`, {
          method: 'DELETE',
        });
      } catch (err) {
        console.error('Failed to delete resume from server:', err);
      }
    }
    // Clear localStorage
    localStorage.removeItem('master_resume_id');
    setMasterResumeId(null);
    setProcessingStatus('loading');
  };

  return (
    <SwissGrid>
      {/* 1. Master Resume Logic */}
      {!masterResumeId ? (
        // Upload State - Pass the card as the trigger
        <ResumeUploadDialog
          onUploadComplete={handleUploadComplete}
          trigger={
            <div className={`${interactiveCardClass} hover:bg-blue-700 hover:text-[#F0F0E8]`}>
              <div className="flex-1 flex flex-col justify-between pointer-events-none">
                <div className="w-12 h-12 border-2 border-current rounded-full flex items-center justify-center mb-4">
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
      ) : (
        // Master Resume Exists - Click to View
        <div
          onClick={() => router.push(`/resumes/${masterResumeId}`)}
          className={interactiveCardClass}
        >
          <div className="flex-1 flex flex-col h-full">
            <div className="flex justify-between items-start mb-6">
              <div className="w-12 h-12 border-2 border-black bg-blue-700 text-white flex items-center justify-center">
                <span className="font-mono font-bold">M</span>
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
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 hover:bg-red-100 hover:text-red-600 z-10 rounded-none"
                  onClick={handleClearMaster}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
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
        </div>
      )}

      {/* 2. Create Tailored Resume */}
      <div className={cardBaseClass}>
        <div className="flex-1 flex flex-col">
          <div className="w-12 h-12 border-2 border-black bg-white text-black flex items-center justify-center mb-4">
            <Plus className="w-6 h-6" />
          </div>
          <h3 className="font-bold text-lg font-serif leading-tight">Create Tailored Resume</h3>
          <p className={`text-xs font-mono mt-2 uppercase ${getTailorStatus().color}`}>
            {getTailorStatus().text}
          </p>
          <Button
            onClick={() => router.push('/tailor')}
            disabled={!isTailorEnabled}
            className="mt-auto w-full h-11 text-sm font-bold uppercase tracking-widest rounded-none border-2 border-black shadow-[4px_4px_0px_0px_#000000] hover:translate-y-[2px] hover:translate-x-[2px] hover:shadow-none transition-all"
          >
            +
          </Button>
        </div>
      </div>

      {/* 3. Tailored Resumes */}
      {tailoredResumes.map((resume) => (
        <div
          key={resume.resume_id}
          onClick={() => router.push(`/resumes/${resume.resume_id}`)}
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
        </div>
      ))}

      {/* 4. Fillers (Static, no hover effect, just structure) */}
      {Array.from({
        length: Math.max(0, 3 - tailoredResumes.length),
      }).map((_, index) => (
        <div
          key={`filler-${index}`}
          className="hidden md:block bg-[#F0F0E8] h-full min-h-[300px] opacity-50 pointer-events-none"
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
  );
}
