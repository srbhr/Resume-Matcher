'use client';

import { SwissGrid } from '@/components/home/swiss-grid';
import { ResumeUploadDialog } from '@/components/dashboard/resume-upload-dialog';
import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import { Trash2, Loader2, AlertCircle, RefreshCw } from 'lucide-react';
import { fetchResume } from '@/lib/api/resume';

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed' | 'loading';

export default function DashboardPage() {
  const [masterResumeId, setMasterResumeId] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus>('loading');
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const router = useRouter();

  // The physics class from your Hero, adapted for cards
  const cardWrapperClass =
    'bg-[#F0F0E8] p-8 md:p-12 h-full transition-all duration-200 ease-in-out hover:-translate-y-1 hover:-translate-x-1 hover:shadow-[6px_6px_0px_0px_#000000] cursor-pointer group relative flex flex-col';

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
            <div className={`${cardWrapperClass} hover:bg-blue-700 hover:text-[#F0F0E8]`}>
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
        <div onClick={() => router.push(`/resumes/${masterResumeId}`)} className={cardWrapperClass}>
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

      {/* 2. Fillers (Static, no hover effect, just structure) */}
      {[1, 2, 3].map((i) => (
        <div
          key={i}
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
