'use client';

import * as React from 'react';
import { useTranslations } from '@/lib/i18n';
import { cn } from '@/lib/utils';

/**
 * Swiss toggle: the row's label (sentence case, with an optional description)
 * and a switch that spells its state out, an "Off | On" pair whose live half is
 * filled ink. Clicking the label or either half flips it.
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
  const { t } = useTranslations();
  const switchId = React.useId();
  const half = 'flex h-full items-center px-2 transition-colors';
  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4',
        variant === 'card' && 'border border-ink bg-white p-4 shadow-sw-nested',
        disabled && 'cursor-not-allowed opacity-50',
        className
      )}
    >
      <label htmlFor={switchId} className={cn('min-w-0 flex-1', !disabled && 'cursor-pointer')}>
        <span className="block font-sans text-sm font-medium text-ink">{label}</span>
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
          'inline-flex h-8 shrink-0 items-stretch border border-ink bg-white font-mono text-xs uppercase tracking-wider',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 focus-visible:ring-offset-canvas',
          'disabled:cursor-not-allowed'
        )}
      >
        <span
          aria-hidden="true"
          data-state={checked ? 'idle' : 'live'}
          className={cn(half, !checked ? 'bg-ink text-white' : 'text-steel')}
        >
          {t('common.off')}
        </span>
        <span
          aria-hidden="true"
          data-state={checked ? 'live' : 'idle'}
          className={cn(half, 'border-l border-ink', checked ? 'bg-ink text-white' : 'text-steel')}
        >
          {t('common.on')}
        </span>
      </button>
    </div>
  );
};
