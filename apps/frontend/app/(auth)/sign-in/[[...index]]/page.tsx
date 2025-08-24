"use client";
import { SignIn, ClerkLoaded, ClerkLoading } from '@clerk/nextjs';

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <ClerkLoading>
        <div className="text-sm text-muted-foreground">Lade Anmeldung…</div>
      </ClerkLoading>
      <ClerkLoaded>
        <SignIn routing="path" path="/sign-in" signUpUrl="/sign-up" />
      </ClerkLoaded>
    </div>
  );
}
