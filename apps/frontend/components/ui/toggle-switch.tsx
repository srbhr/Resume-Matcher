'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Swiss International Style Toggle Switch Component
 *
 * Design Principles:
 * - Square thumb and track; the row label toggles the switch
 * - High contrast states
 * - Clear label and description
 */

export interface ToggleSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  variant?: 'card' | 'inline';
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  variant = 'card',
  className,
}) => {
  const switchId = React.useId();
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4',
        variant === 'card' && 'border border-ink bg-white p-4 shadow-sw-sm',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <label htmlFor={switchId} className={cn('min-w-0 flex-1', !disabled && 'cursor-pointer')}>
        <span className="block font-mono text-sm font-bold uppercase tracking-wider text-ink">
          {label}
        </span>
        {description && (
          <span className="mt-1 block font-sans text-xs text-steel">{description}</span>
        )}
      </label>
      <button
        id={switchId}
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onCheckedChange(!checked)}
        className={cn(
          'relative inline-flex h-6 w-12 shrink-0 items-center border-2 border-ink transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          'disabled:cursor-not-allowed',
          checked ? 'bg-primary' : 'bg-panel'
        )}
      >
        <span
          aria-hidden="true"
          className={cn(
            'pointer-events-none block h-4 w-4 border border-ink bg-white transition-transform',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
};
