'use client';

import { Check, X as XIcon } from 'lucide-react';

import type { DiffHunk } from '@/lib/api/chat';

import styles from './chat-bot.module.css';

interface DiffHunkCardProps {
  hunk: DiffHunk;
  index: number;
  total: number;
  onAccept: () => void;
  onReject: () => void;
}

function diffLines(
  original: string,
  proposed: string
): { type: 'removed' | 'added' | 'context'; text: string }[] {
  const lines: { type: 'removed' | 'added' | 'context'; text: string }[] = [];
  const origLines = original ? original.split('\n') : [];
  const propLines = proposed ? proposed.split('\n') : [];

  for (const line of origLines) {
    lines.push({ type: 'removed', text: line });
  }
  for (const line of propLines) {
    lines.push({ type: 'added', text: line });
  }

  return lines;
}

export function DiffHunkCard({ hunk, index, total, onAccept, onReject }: DiffHunkCardProps) {
  const lines = diffLines(hunk.original_text, hunk.proposed_text);

  return (
    <div className={styles.diffCard}>
      <div className={styles.diffHeader}>
        <span className={styles.diffProgress}>
          EDIT {index + 1} OF {total}
        </span>
        <span className={styles.diffLabel}>{hunk.label}</span>
      </div>

      <div className={styles.diffContent}>
        {lines.map((line, i) => (
          <div
            key={i}
            className={
              line.type === 'removed'
                ? styles.diffLineRemoved
                : line.type === 'added'
                  ? styles.diffLineAdded
                  : styles.diffLineContext
            }
          >
            <span className={styles.diffPrefix}>
              {line.type === 'removed' ? '−' : line.type === 'added' ? '+' : ' '}
            </span>
            <span>{line.text || ' '}</span>
          </div>
        ))}
      </div>

      {hunk.reason && (
        <div className={styles.diffReason}>
          <span className={styles.diffReasonLabel}>WHY:</span> {hunk.reason}
        </div>
      )}

      <div className={styles.diffActions}>
        <button type="button" className={styles.diffAccept} onClick={onAccept}>
          <Check size={12} strokeWidth={2} />
          Accept
        </button>
        <button type="button" className={styles.diffReject} onClick={onReject}>
          <XIcon size={12} strokeWidth={2} />
          Reject
        </button>
      </div>
    </div>
  );
}

interface DiffHunkResolvedProps {
  hunk: DiffHunk;
  index: number;
  total: number;
  accepted: boolean;
}

export function DiffHunkResolved({ hunk, index, total, accepted }: DiffHunkResolvedProps) {
  return (
    <div className={`${styles.diffCard} ${styles.diffCardResolved}`}>
      <div className={styles.diffHeader}>
        <span className={styles.diffProgress}>
          EDIT {index + 1} OF {total}
        </span>
        <span className={styles.diffLabel}>{hunk.label}</span>
      </div>
      <div className={accepted ? styles.diffResolved : styles.diffRejected}>
        {accepted ? (
          <>
            <Check size={12} strokeWidth={2} /> Accepted
          </>
        ) : (
          <>
            <XIcon size={12} strokeWidth={2} /> Rejected
          </>
        )}
      </div>
    </div>
  );
}
