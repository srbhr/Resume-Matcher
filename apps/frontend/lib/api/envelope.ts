// Small utility to normalize backend responses that may wrap payloads in { data: ... }
export function unwrapEnvelope<T = unknown>(json: unknown): T {
  if (json && typeof json === 'object' && 'data' in (json as Record<string, unknown>)) {
    const data = (json as Record<string, unknown>)['data'];
    return data as T;
  }
  return json as T;
}

// Optional helper to safely read nested fields without any-casts
export function getResumeIdFromUpload(json: unknown): string | undefined {
  const payload = unwrapEnvelope<{ resume_id?: unknown }>(json);
  return typeof payload?.resume_id === 'string' ? payload.resume_id : undefined;
}
