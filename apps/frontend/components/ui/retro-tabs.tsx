import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Windows 98 Retro + Swiss Brutalist Tabs Component
 *
 * Design Principles:
 * - Square corners (no rounded edges) - Brutalist aesthetic
 * - Active tab merges with content area (no bottom border)
 * - Inactive tabs have hard shadows
 * - Clear visual distinction between states
 */

export interface TabItem {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface RetroTabsProps {
  /** Array of tab items */
  tabs: TabItem[];
  /** Currently active tab ID */
  activeTab: string;
  /** Callback when tab changes */
  onTabChange: (id: string) => void;
  /** Additional class names for the container */
  className?: string;
}

export function RetroTabs({ tabs, activeTab, onTabChange, className }: RetroTabsProps) {
  return (
    <div className={cn('flex flex-col', className)}>
      {/* Tab Row */}
      <div className="flex items-end gap-0.5">
        {tabs.map((tab) => {
          const isActive = tab.id === activeTab;
          const isDisabled = tab.disabled;

          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={isActive}
              aria-disabled={isDisabled}
              disabled={isDisabled}
              onClick={() => !isDisabled && onTabChange(tab.id)}
              className={cn(
                // Base styles
                'px-4 py-2 font-mono text-xs uppercase tracking-wider',
                'transition-colors duration-100',
                'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-offset-1',
                // Active tab - merges with content
                isActive && [
                  'bg-white',
                  'border-2 border-black border-b-white',
                  'font-bold',
                  'relative -mb-[2px] z-10', // Overlap to hide content border
                ],
                // Inactive tab
                !isActive &&
                  !isDisabled && [
                    'bg-[#E5E5E0]',
                    'border-2 border-black',
                    'shadow-[2px_2px_0px_0px_#000000]',
                    'hover:bg-[#D8D8D2]',
                    'active:shadow-none active:translate-x-[2px] active:translate-y-[2px]',
                  ],
                // Disabled tab
                isDisabled && [
                  'bg-[#E5E5E0]',
                  'border-2 border-gray-400',
                  'text-gray-400',
                  'cursor-not-allowed',
                ]
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* Content Border (visual connection to active tab) */}
      <div className="border-t-2 border-black" />
    </div>
  );
}

/**
 * RetroTabPanel - Container for tab content
 */
export interface RetroTabPanelProps {
  children: React.ReactNode;
  className?: string;
}

export function RetroTabPanel({ children, className }: RetroTabPanelProps) {
  return (
    <div role="tabpanel" className={cn('border-2 border-t-0 border-black bg-white', className)}>
      {children}
    </div>
  );
}
