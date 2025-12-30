'use client';

import React, { useEffect, useState } from 'react';
import { useRouter, useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ConfirmDialog } from '@/components/ui/confirm-dialog';
import Resume, { ResumeData } from '@/components/dashboard/resume-component';
import { fetchResume, downloadResumePdf, deleteResume } from '@/lib/api/resume';
import { useStatusCache } from '@/lib/context/status-cache';
import { ArrowLeft, Edit, Download, Loader2, AlertCircle, Sparkles } from 'lucide-react';
import { EnrichmentModal } from '@/components/enrichment/enrichment-modal';

type ProcessingStatus = 'pending' | 'processing' | 'ready' | 'failed';

export default function ResumeViewerPage() {
  const params = useParams();
  const router = useRouter();
  const { decrementResumes, setHasMasterResume } = useStatusCache();
  const [resumeData, setResumeData] = useState<ResumeData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [processingStatus, setProcessingStatus] = useState<ProcessingStatus | null>(null);
  const [isMasterResume, setIsMasterResume] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [showSuccessDialog, setShowSuccessDialog] = useState(false);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [showEnrichmentModal, setShowEnrichmentModal] = useState(false);

  const resumeId = params?.id as string;

  useEffect(() => {
    if (!resumeId) return;

    const loadResume = async () => {
      try {
        setLoading(true);
        const data = await fetchResume(resumeId);

        // Get processing status
        const status = (data.raw_resume?.processing_status || 'pending') as ProcessingStatus;
        setProcessingStatus(status);

        // Prioritize processed_resume if available (structured JSON)
        if (data.processed_resume) {
          setResumeData(data.processed_resume as ResumeData);
        } else if (status === 'failed') {
          setError(
            'Resume processing failed. The AI service could not extract structured data from your resume. You can still use the Tailor feature or try uploading again.'
          );
        } else if (status === 'processing') {
          setError('Resume is still being processed. Please wait a moment and refresh the page.');
        } else if (data.raw_resume?.content) {
          // Try to parse raw_resume content as JSON (for tailored resumes stored as JSON)
          try {
            const parsed = JSON.parse(data.raw_resume.content);
            setResumeData(parsed as ResumeData);
          } catch {
            setError(
              'Resume has not been processed yet. Please use the Tailor feature to generate a structured resume.'
            );
          }
        } else {
          setError('No resume data available.');
        }
      } catch (err) {
        console.error('Failed to load resume:', err);
        setError('Failed to load resume data.');
      } finally {
        setLoading(false);
      }
    };

    loadResume();
    setIsMasterResume(localStorage.getItem('master_resume_id') === resumeId);
  }, [resumeId]);

  const handleEdit = () => {
    router.push(`/builder?id=${resumeId}`);
  };

  // Reload resume data after enrichment
  const reloadResumeData = async () => {
    try {
      const data = await fetchResume(resumeId);
      if (data.processed_resume) {
        setResumeData(data.processed_resume as ResumeData);
      }
    } catch (err) {
      console.error('Failed to reload resume:', err);
    }
  };

  const handleEnrichmentComplete = () => {
    setShowEnrichmentModal(false);
    reloadResumeData();
  };

  const handleDownload = async () => {
    try {
      const blob = await downloadResumePdf(resumeId);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `resume_${resumeId}.pdf`;
      link.click();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      console.error('Failed to download resume:', err);
    }
  };

  const handleDeleteResume = async () => {
    try {
      setDeleteError(null);
      await deleteResume(resumeId);
      // Update cached counters
      decrementResumes();
      if (isMasterResume) {
        localStorage.removeItem('master_resume_id');
        setHasMasterResume(false);
      }
      setShowDeleteDialog(false);
      setShowSuccessDialog(true);
    } catch (err) {
      console.error('Failed to delete resume:', err);
      setDeleteError('Failed to delete resume. Please try again.');
      setShowDeleteDialog(false);
    }
  };

  const handleSuccessConfirm = () => {
    setShowSuccessDialog(false);
    router.push('/dashboard');
  };

  if (loading) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0F0E8]">
        <Loader2 className="w-10 h-10 animate-spin text-blue-700 mb-4" />
        <p className="font-mono text-sm font-bold uppercase text-blue-700">Loading Resume...</p>
      </div>
    );
  }

  if (error || !resumeData) {
    const isProcessing = processingStatus === 'processing';
    const isFailed = processingStatus === 'failed';

    return (
      <div className="min-h-screen flex flex-col items-center justify-center bg-[#F0F0E8] p-4">
        <div
          className={`border p-6 text-center max-w-md shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] ${
            isProcessing
              ? 'bg-blue-50 border-blue-200'
              : isFailed
                ? 'bg-orange-50 border-orange-200'
                : 'bg-red-50 border-red-200'
          }`}
        >
          <div className="flex justify-center mb-4">
            {isProcessing ? (
              <Loader2 className="w-8 h-8 animate-spin text-blue-700" />
            ) : isFailed ? (
              <AlertCircle className="w-8 h-8 text-orange-600" />
            ) : (
              <AlertCircle className="w-8 h-8 text-red-600" />
            )}
          </div>
          <p
            className={`font-bold mb-4 ${
              isProcessing ? 'text-blue-700' : isFailed ? 'text-orange-700' : 'text-red-700'
            }`}
          >
            {error || 'Resume not found'}
          </p>
          <div className="flex flex-col gap-2">
            {isFailed && <Button onClick={() => router.push('/tailor')}>Use Tailor Feature</Button>}
            <Button variant="outline" onClick={() => router.push('/dashboard')}>
              Return to Dashboard
            </Button>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#F0F0E8] py-12 px-4 md:px-8 overflow-y-auto">
      <div className="max-w-7xl mx-auto">
        {/* Header Actions */}
        <div className="mb-8 flex flex-col md:flex-row justify-between items-start md:items-center gap-4 no-print">
          <Button variant="outline" onClick={() => router.push('/dashboard')}>
            <ArrowLeft className="w-4 h-4" />
            Back to Dashboard
          </Button>

          <div className="flex gap-3">
            {isMasterResume && (
              <Button onClick={() => setShowEnrichmentModal(true)} className="gap-2">
                <Sparkles className="w-4 h-4" />
                Enhance Resume
              </Button>
            )}
            <Button variant="outline" onClick={handleEdit}>
              <Edit className="w-4 h-4" />
              Edit Resume
            </Button>
            <Button variant="success" onClick={handleDownload}>
              <Download className="w-4 h-4" />
              Download Resume
            </Button>
          </div>
        </div>

        {/* Resume Viewer */}
        <div className="flex justify-center pb-4">
          <div className="resume-print w-full max-w-[250mm] shadow-[8px_8px_0px_0px_#000000] border-2 border-black bg-white">
            <Resume resumeData={resumeData} />
          </div>
        </div>

        <div className="flex justify-end pt-4 no-print">
          <Button variant="destructive" onClick={() => setShowDeleteDialog(true)}>
            {isMasterResume ? 'Delete Master Resume' : 'Delete Resume'}
          </Button>
        </div>
      </div>

      <ConfirmDialog
        open={showDeleteDialog}
        onOpenChange={setShowDeleteDialog}
        title={isMasterResume ? 'Delete Master Resume' : 'Delete Resume'}
        description={
          isMasterResume
            ? 'This action cannot be undone. Your master resume will be permanently removed from the system.'
            : 'This action cannot be undone. The resume will be permanently removed from the system.'
        }
        confirmLabel="Delete Resume"
        cancelLabel="Keep Resume"
        onConfirm={handleDeleteResume}
        variant="danger"
      />

      <ConfirmDialog
        open={showSuccessDialog}
        onOpenChange={setShowSuccessDialog}
        title="Resume Deleted"
        description={
          isMasterResume
            ? 'Your master resume has been permanently deleted from the system.'
            : 'The resume has been permanently deleted from the system.'
        }
        confirmLabel="Return to Dashboard"
        onConfirm={handleSuccessConfirm}
        variant="success"
        showCancelButton={false}
      />

      {deleteError && (
        <ConfirmDialog
          open={!!deleteError}
          onOpenChange={() => setDeleteError(null)}
          title="Delete Failed"
          description={deleteError}
          confirmLabel="OK"
          onConfirm={() => setDeleteError(null)}
          variant="danger"
          showCancelButton={false}
        />
      )}

      {/* Enrichment Modal - Only for master resume */}
      {isMasterResume && (
        <EnrichmentModal
          resumeId={resumeId}
          isOpen={showEnrichmentModal}
          onClose={() => setShowEnrichmentModal(false)}
          onComplete={handleEnrichmentComplete}
        />
      )}
    </div>
  );
}
