'use client';

import { useCallback, useState } from 'react';
import { CheckCheck, Loader2 } from 'lucide-react';

import type { EditProposal, DocumentType, HunkVerdict } from '@/lib/api/chat';
import { applyHunkVerdicts } from '@/lib/api/chat';

import { DiffHunkCard, DiffHunkResolved } from './diff-hunk-card';
import styles from './chat-bot.module.css';

interface DiffReviewFlowProps {
  resumeId: string;
  documentType: DocumentType;
  proposal: EditProposal;
  onComplete: (appliedCount: number, rejectedCount: number) => void;
}

export function DiffReviewFlow({
  resumeId,
  documentType,
  proposal,
  onComplete,
}: DiffReviewFlowProps) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [verdicts, setVerdicts] = useState<Map<string, boolean>>(new Map());
  const [applying, setApplying] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const allReviewed = currentIndex >= proposal.hunks.length;

  const recordVerdict = useCallback((hunkId: string, accepted: boolean) => {
    setVerdicts((prev) => {
      const next = new Map(prev);
      next.set(hunkId, accepted);
      return next;
    });
    setCurrentIndex((i) => i + 1);
  }, []);

  const acceptAll = useCallback(() => {
    setVerdicts((prev) => {
      const next = new Map(prev);
      for (let i = currentIndex; i < proposal.hunks.length; i++) {
        next.set(proposal.hunks[i].hunk_id, true);
      }
      return next;
    });
    setCurrentIndex(proposal.hunks.length);
  }, [currentIndex, proposal.hunks]);

  const submitVerdicts = useCallback(async () => {
    setApplying(true);
    setError(null);
    try {
      const verdictList: HunkVerdict[] = proposal.hunks.map((h) => ({
        hunk_id: h.hunk_id,
        accepted: verdicts.get(h.hunk_id) ?? false,
      }));

      const hasAccepted = verdictList.some((v) => v.accepted);
      if (!hasAccepted) {
        onComplete(0, proposal.hunks.length);
        return;
      }

      const result = await applyHunkVerdicts(resumeId, {
        proposal_id: proposal.proposal_id,
        document_type: documentType,
        verdicts: verdictList,
        hunks: proposal.hunks,
      });
      onComplete(result.applied_count, result.rejected_count);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Failed to apply changes.');
    } finally {
      setApplying(false);
    }
  }, [verdicts, proposal, resumeId, documentType, onComplete]);

  return (
    <div className={styles.diffFlow}>
      {proposal.hunks.map((hunk, i) => {
        if (i < currentIndex) {
          return (
            <DiffHunkResolved
              key={hunk.hunk_id}
              hunk={hunk}
              index={i}
              total={proposal.hunks.length}
              accepted={verdicts.get(hunk.hunk_id) ?? false}
            />
          );
        }
        if (i === currentIndex && !allReviewed) {
          return (
            <DiffHunkCard
              key={hunk.hunk_id}
              hunk={hunk}
              index={i}
              total={proposal.hunks.length}
              onAccept={() => recordVerdict(hunk.hunk_id, true)}
              onReject={() => recordVerdict(hunk.hunk_id, false)}
            />
          );
        }
        return null;
      })}

      {!allReviewed && proposal.hunks.length - currentIndex > 1 && (
        <button type="button" className={styles.allowAll} onClick={acceptAll}>
          <CheckCheck size={12} strokeWidth={2} />
          Accept all remaining ({proposal.hunks.length - currentIndex})
        </button>
      )}

      {allReviewed && (
        <div className={styles.diffSummaryCard}>
          <div className={styles.diffSummaryStats}>
            {Array.from(verdicts.values()).filter(Boolean).length} accepted,{' '}
            {Array.from(verdicts.values()).filter((v) => !v).length} rejected
          </div>
          {error && <div className={styles.diffError}>{error}</div>}
          <button
            type="button"
            className={styles.diffApplyAll}
            onClick={() => void submitVerdicts()}
            disabled={applying}
          >
            {applying ? (
              <>
                <Loader2 size={12} className={styles.diffSpinner} />
                Applying…
              </>
            ) : (
              'Apply changes'
            )}
          </button>
        </div>
      )}
    </div>
  );
}
