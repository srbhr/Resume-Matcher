"use client";
import { SignUp, ClerkLoaded, ClerkLoading } from '@clerk/nextjs';

export default function Page() {
  return (
    <div className="min-h-screen flex items-center justify-center p-4">
      <ClerkLoading>
        <div className="text-sm text-muted-foreground">Lade Registrierung…</div>
      </ClerkLoading>
      <ClerkLoaded>
        <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" />
      </ClerkLoaded>
    </div>
  );
}
