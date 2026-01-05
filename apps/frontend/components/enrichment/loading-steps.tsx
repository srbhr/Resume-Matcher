'use client';

import { Loader2, CheckCircle2, Sparkles, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';

interface LoadingStepProps {
  message: string;
  submessage?: string;
}

function LoadingStep({ message, submessage }: LoadingStepProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
      <div className="relative">
        <Loader2 className="w-12 h-12 animate-spin text-black" />
      </div>
      <div className="text-center">
        <p className="text-xl font-mono font-bold">{message}</p>
        {submessage && <p className="text-sm text-gray-500 mt-2 font-mono">{submessage}</p>}
      </div>
    </div>
  );
}

export function AnalyzingStep() {
  return (
    <LoadingStep
      message="Analyzing your resume..."
      submessage="Identifying areas that could use more detail"
    />
  );
}

export function GeneratingStep() {
  return (
    <LoadingStep
      message="Crafting enhanced descriptions..."
      submessage="Using your answers to improve your resume"
    />
  );
}

export function ApplyingStep() {
  return (
    <LoadingStep message="Applying enhancements..." submessage="Updating your master resume" />
  );
}

interface CompleteStepProps {
  onClose: () => void;
  updatedCount?: number;
}

export function CompleteStep({ onClose, updatedCount }: CompleteStepProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
      <div className="relative">
        <CheckCircle2 className="w-16 h-16 text-green-600" />
      </div>
      <div className="text-center">
        <p className="text-2xl font-mono font-bold">Resume Enhanced!</p>
        <p className="text-sm text-gray-500 mt-2 font-mono">
          {updatedCount
            ? `${updatedCount} item${updatedCount === 1 ? '' : 's'} updated successfully`
            : 'Your resume has been updated with enhanced descriptions'}
        </p>
      </div>
      <Button onClick={onClose} className="mt-4 gap-2">
        <Sparkles className="w-4 h-4" />
        Done
      </Button>
    </div>
  );
}

interface NoImprovementsStepProps {
  onClose: () => void;
  summary?: string;
}

export function NoImprovementsStep({ onClose, summary }: NoImprovementsStepProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
      <div className="relative">
        <CheckCircle2 className="w-16 h-16 text-green-600" />
      </div>
      <div className="text-center max-w-md">
        <p className="text-2xl font-mono font-bold">Your resume looks great!</p>
        <p className="text-sm text-gray-500 mt-2 font-mono">
          {summary ||
            "We couldn't find any items that need improvement. Your experience and project descriptions are already well-detailed."}
        </p>
      </div>
      <Button onClick={onClose} className="mt-4 gap-2">
        <Sparkles className="w-4 h-4" />
        Close
      </Button>
    </div>
  );
}

interface ErrorStepProps {
  error: string;
  onRetry: () => void;
  onClose: () => void;
}

export function ErrorStep({ error, onRetry, onClose }: ErrorStepProps) {
  return (
    <div className="flex flex-col items-center justify-center h-full min-h-[400px] gap-6">
      <div className="relative">
        <AlertCircle className="w-16 h-16 text-red-500" />
      </div>
      <div className="text-center max-w-md">
        <p className="text-xl font-mono font-bold">Something went wrong</p>
        <p className="text-sm text-red-600 mt-2 font-mono bg-red-50 p-3 border border-red-200">
          {error}
        </p>
      </div>
      <div className="flex gap-3 mt-4">
        <Button variant="outline" onClick={onClose}>
          Cancel
        </Button>
        <Button onClick={onRetry}>Try Again</Button>
      </div>
    </div>
  );
}
