/** Agent mode: telling the agent's saves apart from the builder's own. */

import type { fetchResume } from '@/lib/api/resume';

export type ServerResume = Awaited<ReturnType<typeof fetchResume>>;
export type OwnWrites = { pending: number; epoch: number };
/** The parts of a resume the agent can change and the editor saves separately. */
export type AgentPart = 'resume' | 'coverLetter' | 'outreach';

/** Identifies one saved version of the parts the agent can change. */
export const agentVersionOf = (data: ServerResume): string =>
  JSON.stringify([
    data.processed_resume,
    data.cover_letter ?? '',
    data.outreach_message ?? '',
    data.title ?? null,
  ]);

/**
 * Count a write this editor makes. While one is pending, or when one finished
 * during an agent-change check, the server copy may be the editor's own save,
 * so the check skips that round.
 */
export const trackOwnWrite = <T>(writes: { current: OwnWrites }, write: Promise<T>): Promise<T> => {
  writes.current = { pending: writes.current.pending + 1, epoch: writes.current.epoch + 1 };
  return write.finally(() => {
    writes.current = { pending: writes.current.pending - 1, epoch: writes.current.epoch + 1 };
  });
};
