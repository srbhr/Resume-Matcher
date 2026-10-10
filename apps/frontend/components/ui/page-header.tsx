import * as React from 'react';
import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr';
import { cn } from '@/lib/utils';
import { buttonClass } from '@/components/ui/button';

type Children = { children: React.ReactNode };

function PageHeaderRoot({ className, children }: Children & { className?: string }) {
  return (
    <header
      className={cn('relative z-30 shrink-0 border-b border-ink bg-canvas p-8 md:p-12', className)}
    >
      {children}
    </header>
  );
}

function Back({ href, children }: Children & { href: string }) {
  return (
    <Link
      href={href}
      className={buttonClass({ variant: 'outline', size: 'sm', className: 'mb-8' })}
    >
      <ArrowLeft aria-hidden="true" />
      {children}
    </Link>
  );
}

function Title({ children, className }: Children & { className?: string }) {
  return (
    <h1
      className={cn(
        'font-serif text-4xl font-bold uppercase leading-none tracking-tight text-balance text-ink md:text-5xl',
        className
      )}
    >
      {children}
    </h1>
  );
}

function Subtitle({ children }: Children) {
  return (
    <p className="mt-4 max-w-[60ch] font-mono text-sm font-bold uppercase tracking-wide text-steel">
      {'// '}
      {children}
    </p>
  );
}

function Actions({ children }: Children) {
  return <div className="mt-6 flex flex-wrap items-center gap-3">{children}</div>;
}

/** One page-header recipe. Actions hold at most one primary Button. Server-safe. */
export const PageHeader = Object.assign(PageHeaderRoot, { Back, Title, Subtitle, Actions });
