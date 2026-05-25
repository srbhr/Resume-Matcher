export function downloadBlobAsFile(blob: Blob, filename: string): void {
  if (typeof document === 'undefined') return;
  if (!document.body) return;
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  document.body.appendChild(link);
  link.click();
  setTimeout(() => {
    URL.revokeObjectURL(url);
    link.remove();
  }, 1000);
}

export function openUrlInNewTab(url: string): boolean {
  if (typeof window === 'undefined') return false;
  const newWindow = window.open(url, '_blank', 'noopener,noreferrer');
  if (newWindow) {
    newWindow.opener = null;
    return true;
  }
  return false;
}

/**
 * Sanitize a resume title for use as a filename
 * - Removes/replaces invalid filename characters
 * - Truncates to reasonable length
 * - Provides fallback if title is empty
 */
export function sanitizeFilename(
  title: string | null | undefined,
  fallbackId: string,
  type: 'resume' | 'cover-letter' | 'cv' = 'resume'
): string {
  const fallbackPrefix =
    type === 'resume' ? `resume_${fallbackId}` :
    type === 'cv' ? `cv_${fallbackId}` :
    `cover_letter_${fallbackId}`;
  return sanitizeDownloadFilename(title, fallbackPrefix, 'pdf');
}

export function sanitizeDownloadFilename(
  title: string | null | undefined,
  fallbackBaseName: string,
  extension: string
): string {
  // Use fallback if no title
  if (!title?.trim()) {
    return `${fallbackBaseName}.${extension}`;
  }

  // Normalize Unicode to NFC form to ensure consistent representation
  let sanitized = title.normalize('NFC').trim();

  // Remove or replace invalid characters: / \ : * ? " < > |
  sanitized = sanitized
    .replace(/[/\\:*?"<>|]/g, '-') // Replace invalid chars with dash
    .replace(/\s+/g, ' ') // Normalize whitespace
    .trim();

  // Truncate to 100 characters using Array.from() to handle multi-byte characters correctly
  const chars = Array.from(sanitized);
  if (chars.length > 100) {
    sanitized = chars.slice(0, 100).join('').trim();
  }

  return `${sanitized}.${extension}`;
}

/**
 * Build a personalized download filename for resume or cover letter PDFs.
 * Format: "{Name} - {Type} - {Company}.pdf" (falls back gracefully when data is missing)
 */
export function buildResumeFilename(
  name: string | null | undefined,
  company: string | null | undefined,
  fallbackId: string,
  type: 'resume' | 'cover-letter' | 'cv' = 'resume'
): string {
  const typeLabel =
    type === 'resume' ? 'Resume' : type === 'cv' ? 'CV' : 'Cover Letter';
  const cleanName = name?.trim() || null;
  const cleanCompany = company?.trim() || null;

  let raw: string;
  if (cleanName && cleanCompany) {
    raw = `${cleanName} - ${typeLabel} - ${cleanCompany}`;
  } else if (cleanName) {
    raw = `${cleanName} - ${typeLabel}`;
  } else {
    return sanitizeFilename(
      cleanCompany ? `${typeLabel} - ${cleanCompany}` : null,
      fallbackId,
      type
    );
  }

  return sanitizeFilename(raw, fallbackId, type);
}
