'use client';

import { useCallback, useLayoutEffect, useRef } from 'react';

/** Async results belong to one mounted context and one uninterrupted operation. */
export function useOperationOwner(contextKey: string) {
  const owner = useRef({ key: contextKey, version: 0, mounted: false });

  useLayoutEffect(() => {
    owner.current = { key: contextKey, version: owner.current.version + 1, mounted: true };
    return () => {
      owner.current.mounted = false;
      owner.current.version += 1;
    };
  }, [contextKey]);

  const begin = useCallback(() => {
    if (!owner.current.mounted || owner.current.key !== contextKey) return null;
    return ++owner.current.version;
  }, [contextKey]);

  const isCurrent = useCallback(
    (token: number) =>
      owner.current.mounted && owner.current.key === contextKey && owner.current.version === token,
    [contextKey]
  );

  const invalidate = useCallback(() => {
    owner.current.version += 1;
  }, []);
  return { begin, isCurrent, invalidate };
}
