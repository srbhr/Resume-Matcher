// Domain error model + mapping to i18n keys (prepared for later i18n integration)
export type DomainErrorCode =
  | 'network.error'
  | 'timeout'
  | 'resume.not_found'
  | 'job.not_found'
  | 'upload.invalid_type'
  | 'validation.failed'
  | 'ai.unavailable'
  | 'server.error';

export class DomainError extends Error {
  code: DomainErrorCode;
  status?: number;
  i18nKey: string;
  causeRaw?: unknown;
  constructor(code: DomainErrorCode, message: string, opts: { status?: number; cause?: unknown; i18nKey?: string } = {}) {
    super(message);
    this.name = 'DomainError';
    this.code = code;
    this.status = opts.status;
    this.i18nKey = opts.i18nKey || `errors.${code}`;
    this.causeRaw = opts.cause;
  }
}

interface BackendErrorShape { detail?: string | { message?: string }; request_id?: string; error?: { code?: string; message?: string } }

function hasProp<T extends string>(o: unknown, prop: T): o is Record<T, unknown> {
  return typeof o === 'object' && o !== null && prop in o;
}

export function mapFetchError(e: unknown, context?: { status?: number; path?: string }): DomainError {
  if (hasProp(e, 'name') && e.name === 'AbortError') {
    return new DomainError('timeout', 'Request timed out', { status: context?.status });
  }
  if (e instanceof TypeError && /fetch/i.test(e.message)) {
    return new DomainError('network.error', 'Network error', { status: context?.status, cause: e });
  }
  if (e instanceof DomainError) return e;
  const status = hasProp(e, 'status') && typeof e.status === 'number' ? e.status : context?.status;
  const container: unknown = hasProp(e, 'data') ? (e as any).data : hasProp(e, 'response') ? (e as any).response : undefined; // eslint-disable-line @typescript-eslint/no-explicit-any
  const data: BackendErrorShape | undefined = (typeof container === 'object' && container !== null) ? (container as BackendErrorShape) : undefined;
  const detailVal = data?.detail;
  const detail = typeof detailVal === 'string' ? detailVal : detailVal?.message;
  const backendErrCode = data?.error?.code;
  const message = data?.error?.message || detail || (hasProp(e, 'message') && typeof e.message === 'string' ? e.message : 'Error');
  if (status === 503 || backendErrCode === 'AI_PROVIDER_UNAVAILABLE') {
    return new DomainError('ai.unavailable', message || 'AI provider unavailable', { status });
  }
  if (status === 404 && /resume/i.test(message)) return new DomainError('resume.not_found', message, { status });
  if (status === 404 && /job/i.test(message)) return new DomainError('job.not_found', message, { status });
  if (status === 400 && /file type/i.test(message)) return new DomainError('upload.invalid_type', message, { status });
  if (status === 422) return new DomainError('validation.failed', message, { status });
  return new DomainError('server.error', message, { status, cause: e });
}

export function isDomainError(e: unknown): e is DomainError { return e instanceof DomainError; }
