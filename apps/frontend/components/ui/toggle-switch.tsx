import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Swiss International Style Toggle Switch Component
 *
 * Design Principles:
 * - Square corners (no rounded edges) - Brutalist aesthetic
 * - Hard shadows when OFF
 * - Blue-700 background when ON (matches primary button)
 * - Clear visual state change
 */

export interface ToggleSwitchProps {
  /** Whether the toggle is checked/on */
  checked: boolean;
  /** Callback when the toggle state changes */
  onCheckedChange: (checked: boolean) => void;
  /** Label displayed next to the toggle */
  label: string;
  /** Optional description text below the label */
  description?: string;
  /** Whether the toggle is disabled */
  disabled?: boolean;
  /** Additional class names */
  className?: string;
}

export function ToggleSwitch({
  checked,
  onCheckedChange,
  label,
  description,
  disabled = false,
  className,
}: ToggleSwitchProps) {
  const handleClick = () => {
    if (!disabled) {
      onCheckedChange(!checked);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (!disabled) {
        onCheckedChange(!checked);
      }
    }
  };

  return (
    <div
      className={cn(
        'flex items-center justify-between gap-4 p-3',
        'border-2 border-black bg-white',
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
    >
      <div className="flex-1 min-w-0">
        <span className="font-mono text-sm font-medium text-black">{label}</span>
        {description && <p className="mt-0.5 text-xs text-gray-600">{description}</p>}
      </div>

      {/* Toggle Switch */}
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        disabled={disabled}
        onClick={handleClick}
        onKeyDown={handleKeyDown}
        className={cn(
          // Base styles
          'relative inline-flex h-7 w-14 shrink-0',
          'border-2 border-black',
          'transition-all duration-150 ease-out',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-2',
          // State-based styles
          checked ? 'bg-blue-700' : 'bg-[#E5E5E0] shadow-[2px_2px_0px_0px_#000000]',
          // Hover effect when OFF
          !checked && !disabled && 'hover:bg-[#D8D8D2]',
          // Disabled
          disabled && 'cursor-not-allowed'
        )}
      >
        {/* Knob */}
        <span
          className={cn(
            'absolute top-0.5 h-5 w-5',
            'border-2 border-black bg-white',
            'transition-all duration-150 ease-out',
            checked ? 'left-[calc(100%-22px)]' : 'left-0.5'
          )}
        />
      </button>
    </div>
  );
}
