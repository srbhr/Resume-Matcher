'use client';

import { useCallback, useEffect, useState } from 'react';
import { fetchResumePhoto } from '@/lib/api/resume';

/**
 * A resume's photo for photo CVs (a data URL, or null), loaded per resume id.
 * `setPhoto` records an upload or removal the field has already saved; photos
 * are not part of the resume's autosaved JSON.
 */
export function useResumePhoto(resumeId: string | null | undefined) {
  // Keyed by id, so a switch never shows the previous resume's photo.
  const [loaded, setLoaded] = useState<{ id: string; photo: string | null } | null>(null);

  useEffect(() => {
    if (!resumeId) return;
    let cancelled = false;
    fetchResumePhoto(resumeId)
      .then((photo) => {
        if (!cancelled) setLoaded({ id: resumeId, photo });
      })
      .catch((error: unknown) => {
        // A missing photo must not block editing or previewing the resume.
        console.warn('Could not load the resume photo:', error);
        if (!cancelled) setLoaded({ id: resumeId, photo: null });
      });
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  const setPhoto = useCallback(
    (photo: string | null) => {
      if (resumeId) setLoaded({ id: resumeId, photo });
    },
    [resumeId]
  );

  return { photo: loaded && loaded.id === resumeId ? loaded.photo : null, setPhoto };
}
