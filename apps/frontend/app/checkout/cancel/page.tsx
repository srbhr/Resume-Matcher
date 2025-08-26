"use client";

import Link from 'next/link';

export default function CancelPage() {
  return (
    <main className="mx-auto max-w-xl px-6 py-16 text-center">
      <h1 className="text-2xl font-semibold">Payment canceled</h1>
      <p className="mt-3 text-muted-foreground">
        Your payment was canceled. You can try again anytime.
      </p>
      <div className="mt-8">
        <Link href="/" className="text-primary underline">
          Back to Home
        </Link>
      </div>
    </main>
  );
}
