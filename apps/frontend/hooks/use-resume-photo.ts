'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { fetchResumePhoto } from '@/lib/api/resume';

/**
 * A resume's photo for photo CVs (a data URL, or null), loaded per resume id.
 * `setPhoto` records an upload or removal the field has already saved; photos
 * are not part of the resume's autosaved JSON.
 */
export function useResumePhoto(resumeId: string | null | undefined) {
  // Keyed by id, so a switch never shows the previous resume's photo.
  const [loaded, setLoaded] = useState<{ id: string; photo: string | null } | null>(null);
  // Set once an upload or removal lands, so a load that ends after it can't
  // bring back the photo it replaced.
  const changedRef = useRef(false);

  useEffect(() => {
    changedRef.current = false;
    if (!resumeId) return;
    let cancelled = false;
    const show = (photo: string | null) => {
      if (!cancelled && !changedRef.current) setLoaded({ id: resumeId, photo });
    };
    fetchResumePhoto(resumeId)
      .then(show)
      .catch((error: unknown) => {
        // A missing photo must not block editing or previewing the resume.
        console.warn('Could not load the resume photo:', error);
        show(null);
      });
    return () => {
      cancelled = true;
    };
  }, [resumeId]);

  const setPhoto = useCallback(
    (photo: string | null) => {
      if (!resumeId) return;
      changedRef.current = true;
      setLoaded({ id: resumeId, photo });
    },
    [resumeId]
  );

  return { photo: loaded && loaded.id === resumeId ? loaded.photo : null, setPhoto };
}
