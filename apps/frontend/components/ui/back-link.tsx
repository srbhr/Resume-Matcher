import Link from 'next/link';
import { ArrowLeft } from '@phosphor-icons/react/dist/ssr';
import { buttonClass } from './button';

/**
 * The arrow-only Back that opens every page's toolbar row: an outline icon button,
 * named by its label and tooltip. Server-safe.
 */
export function BackLink({ label, href = '/dashboard' }: { label: string; href?: string }) {
  return (
    <Link
      href={href}
      aria-label={label}
      title={label}
      className={buttonClass({ variant: 'outline', size: 'icon-sm', className: 'shrink-0' })}
    >
      <ArrowLeft aria-hidden="true" />
    </Link>
  );
}
