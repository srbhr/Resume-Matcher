'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Swiss International Style Toggle Switch Component
 *
 * Design Principles:
 * - Square corners (rounded-none on container, pill shape for toggle)
 * - High contrast states
 * - Clear label and description
 */

export interface ToggleSwitchProps {
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  label: string;
  description?: string;
  disabled?: boolean;
  className?: string;
}

export const ToggleSwitch: React.FC<ToggleSwitchProps> = ({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  className,
}) => {
  const handleToggle = () => {
    if (!disabled) {
      onCheckedChange(!checked);
    }
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between p-4 border border-black bg-white',
        'shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)]',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <div className="flex-1 mr-4">
        <div className="font-mono text-sm font-bold uppercase tracking-wider">{label}</div>
        {description && <div className="font-sans text-xs text-gray-500 mt-1">{description}</div>}
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={handleToggle}
        className={cn(
          'relative inline-flex h-6 w-12 shrink-0 cursor-pointer items-center',
          'border-2 border-black transition-colors',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2',
          'disabled:cursor-not-allowed',
          checked ? 'bg-blue-700' : 'bg-gray-200'
        )}
      >
        <span
          className={cn(
            'pointer-events-none block h-4 w-4 bg-white border border-black shadow-sm',
            'transition-transform duration-200',
            checked ? 'translate-x-6' : 'translate-x-1'
          )}
        />
      </button>
    </div>
  );
};
