"use client";

import Link from 'next/link';

export default function SuccessPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Payment successful</h1>
      <p className="mt-3 text-muted-foreground">
        Your purchase was completed. Credits will appear in your account shortly.
      </p>
      <div className="mt-8">
        <Link href="/" className="text-primary underline">
          Continue
        </Link>
      </div>
    </main>
  );
}
