/** Why the Tailor page's Generate (and Add to queue) can't be pressed, or null when it can. */
export type TailorBlock = 'busy' | 'statusLoading' | 'noModel' | 'noMaster' | 'noJob';

/**
 * One rule for whether the job can be sent, in the order the page reads it:
 * work in flight, the model status still loading, no model (or agent mode), no
 * master resume, no job description. The first that applies is the reason.
 */
export function tailorBlock(state: {
  busy: boolean;
  statusLoading: boolean;
  modelReady: boolean;
  hasMaster: boolean;
  hasJob: boolean;
}): TailorBlock | null {
  if (state.busy) return 'busy';
  if (state.statusLoading) return 'statusLoading';
  if (!state.modelReady) return 'noModel';
  if (!state.hasMaster) return 'noMaster';
  if (!state.hasJob) return 'noJob';
  return null;
}
