"use client";
import { useEffect, useState } from 'react';
import { SignIn, ClerkLoaded, ClerkLoading } from '@clerk/nextjs';

export default function Page() {
  const [slow, setSlow] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setSlow(true), 6000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <ClerkLoading>
        <div className="space-y-2 text-sm text-muted-foreground text-center max-w-md">
          <div>Lade Anmeldung…</div>
          {slow && (
            <div className="mt-3 rounded-md border border-yellow-600/40 bg-yellow-900/20 p-3 text-yellow-200">
              <div className="font-medium mb-1">Hinweis:</div>
              <ul className="list-disc text-left ml-5 space-y-1">
                <li>Custom Domains in Clerk noch nicht verifiziert (SSL ausstehend).</li>
                <li>Stelle sicher: NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY ist gesetzt.</li>
                <li>CSP erlaubt *.clerk.com / *.clerk.services und deine Custom Domains.</li>
              </ul>
            </div>
          )}
        </div>
      </ClerkLoading>
      <ClerkLoaded>
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
      </ClerkLoaded>
    </div>
  );
}
