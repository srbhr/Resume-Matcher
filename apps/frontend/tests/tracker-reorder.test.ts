import { describe, it, expect } from 'vitest';
import { planMove } from '@/components/tracker/reorder';
import {
  APPLICATION_STATUS_ORDER,
  type Application,
  type ApplicationColumns,
  type ApplicationStatus,
} from '@/lib/api/tracker';

function card(id: string, status: ApplicationStatus, position: number): Application {
  return {
    application_id: id,
    job_id: `job-${id}`,
    resume_id: `res-${id}`,
    master_resume_id: null,
    status,
    company: null,
    role: null,
    applied_at: null,
    notes: null,
    position,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
  };
}

function emptyColumns(): ApplicationColumns {
  return APPLICATION_STATUS_ORDER.reduce((acc, status) => {
    acc[status] = [];
    return acc;
  }, {} as ApplicationColumns);
}

describe('planMove', () => {
  it('returns null when dropped on itself', () => {
    const columns = { ...emptyColumns(), applied: [card('a', 'applied', 0)] };
    expect(planMove(columns, 'a', 'a')).toBeNull();
  });

  it('reorders within a column and renumbers positions', () => {
    const columns = {
      ...emptyColumns(),
      applied: [card('a', 'applied', 0), card('b', 'applied', 1), card('c', 'applied', 2)],
    };
    // Drag 'a' onto 'c' → a moves to the end.
    const plan = planMove(columns, 'a', 'c');
    expect(plan).not.toBeNull();
    expect(plan!.status).toBe('applied');
    expect(plan!.next.applied.map((x) => x.application_id)).toEqual(['b', 'c', 'a']);
    expect(plan!.next.applied.map((x) => x.position)).toEqual([0, 1, 2]);
    expect(plan!.position).toBe(2); // a's new index
  });

  it('moves a card across columns, updates status, and renumbers both', () => {
    const columns = {
      ...emptyColumns(),
      applied: [card('a', 'applied', 0), card('b', 'applied', 1)],
      interview: [card('c', 'interview', 0)],
    };
    // Drop 'a' onto 'c' in the interview column → inserts before c (index 0).
    const plan = planMove(columns, 'a', 'c');
    expect(plan!.status).toBe('interview');
    expect(plan!.position).toBe(0);
    expect(plan!.next.interview.map((x) => x.application_id)).toEqual(['a', 'c']);
    expect(plan!.next.interview.find((x) => x.application_id === 'a')!.status).toBe('interview');
    // Source column renumbered to a contiguous sequence.
    expect(plan!.next.applied.map((x) => x.application_id)).toEqual(['b']);
    expect(plan!.next.applied[0].position).toBe(0);
  });

  it('accepts a drop on an empty column droppable (column:<status>)', () => {
    const columns = {
      ...emptyColumns(),
      applied: [card('a', 'applied', 0)],
    };
    const plan = planMove(columns, 'a', 'column:rejected');
    expect(plan!.status).toBe('rejected');
    expect(plan!.position).toBe(0);
    expect(plan!.next.rejected.map((x) => x.application_id)).toEqual(['a']);
    expect(plan!.next.applied).toEqual([]);
  });

  it('returns null for an unknown active card', () => {
    const columns = { ...emptyColumns(), applied: [card('a', 'applied', 0)] };
    expect(planMove(columns, 'ghost', 'a')).toBeNull();
  });
});
