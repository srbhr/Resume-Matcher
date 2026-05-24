'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Swiss International Style Segmented Tabs
 *
 * A pill-style segmented control where exactly one segment is active.
 * Distinct from RetroTabs (folder metaphor for sub-panels) — this lives
 * at page-header scale, switching between sibling document views.
 */

export interface SegmentedTab {
  id: string;
  label: string;
  disabled?: boolean;
}

export interface SegmentedTabsProps {
  tabs: SegmentedTab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  className?: string;
  ariaLabel?: string;
}

export const SegmentedTabs: React.FC<SegmentedTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  className,
  ariaLabel,
}) => {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className={cn(
        'inline-flex flex-wrap border border-black bg-background',
        'shadow-[3px_3px_0_0_#000] rounded-none',
        className
      )}
    >
      {tabs.map((tab, index) => {
        const isActive = activeTab === tab.id;
        const isLast = index === tabs.length - 1;
        return (
          <button
            key={tab.id}
            role="tab"
            type="button"
            aria-selected={isActive}
            disabled={tab.disabled}
            onClick={() => !tab.disabled && onTabChange(tab.id)}
            className={cn(
              'font-mono text-[10.5px] uppercase tracking-[0.16em] leading-none',
              'px-4 py-[11px] cursor-pointer transition-colors duration-100 ease-out',
              'border-r border-black bg-transparent rounded-none',
              'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-700 focus-visible:ring-inset',
              isLast && 'border-r-0',
              isActive ? 'bg-black text-white font-bold' : 'text-ink-soft hover:bg-paper-tint',
              tab.disabled && 'opacity-50 cursor-not-allowed hover:bg-transparent'
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </div>
  );
};
