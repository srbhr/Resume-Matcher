'use client';

import { useEffect } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';

/**
 * Opens the card named by `?open=<application id>` (the command palette links
 * here), then drops the parameter so the same link can open it again later.
 * Render it inside a Suspense boundary: it reads the search params.
 */
export function OpenCardFromUrl({ onOpen }: { onOpen: (id: string) => void }) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const id = searchParams.get('open');

  useEffect(() => {
    if (!id) return;
    onOpen(id);
    router.replace(pathname, { scroll: false });
  }, [id, onOpen, router, pathname]);

  return null;
}
