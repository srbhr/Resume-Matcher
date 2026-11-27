'use client';

import * as React from 'react';
import { cn } from '@/lib/utils';

/**
 * Swiss International Style Tabs Component
 *
 * One ink-bordered bar of segments, labels on one line in the label face. The
 * selected tab fills ink (selection is ink). Segments share the width; when
 * they don't fit, they wrap to another row, ruled like the dashboard grid (1px
 * ink gaps over an ink ground), so no label wraps or hides off the edge. A tab
 * that `startsGroup` opens a second bar after a gap: one tablist, two kinds of tab.
 */

export interface Tab {
  id: string;
  label: string;
  disabled?: boolean;
  /** Starts a new bar, set apart from the tabs before it (the arrow keys still cross). */
  startsGroup?: boolean;
}

export interface RetroTabsProps {
  tabs: Tab[];
  activeTab: string;
  onTabChange: (tabId: string) => void;
  /**
   * When set, tabs get ids `${idPrefix}-tab-${id}`, and the selected tab gets aria-controls
   * `${idPrefix}-panel-${id}`. Only the selected tab's panel is rendered, so only it is referenced.
   */
  idPrefix?: string;
  className?: string;
  'aria-label'?: string;
  'aria-labelledby'?: string;
}

export const RetroTabs: React.FC<RetroTabsProps> = ({
  tabs,
  activeTab,
  onTabChange,
  idPrefix,
  className,
  ...aria
}) => {
  const refs = React.useRef<(HTMLButtonElement | null)[]>([]);
  const enabled = tabs.map((tab, i) => ({ tab, i })).filter(({ tab }) => !tab.disabled);
  // A disabled button cannot take focus, so when the active tab is disabled the first
  // enabled one holds the tab stop instead of leaving the group unreachable by keyboard.
  const activeIndex = tabs.findIndex((tab) => tab.id === activeTab && !tab.disabled);
  const tabStop = activeIndex >= 0 ? activeIndex : (enabled[0]?.i ?? -1);

  const focusTab = (from: number, delta: number) => {
    const pos = enabled.findIndex(({ i }) => i === from);
    const next = enabled[(pos + delta + enabled.length) % enabled.length];
    if (!next) return;
    onTabChange(next.tab.id);
    refs.current[next.i]?.focus();
  };

  const renderTab = (tab: Tab, i: number) => {
    const isActive = activeTab === tab.id;
    return (
      <button
        key={tab.id}
        ref={(el) => {
          refs.current[i] = el;
        }}
        type="button"
        role="tab"
        id={idPrefix ? `${idPrefix}-tab-${tab.id}` : undefined}
        aria-controls={idPrefix && isActive ? `${idPrefix}-panel-${tab.id}` : undefined}
        aria-selected={isActive}
        tabIndex={i === tabStop ? 0 : -1}
        disabled={tab.disabled}
        onClick={() => !tab.disabled && onTabChange(tab.id)}
        onKeyDown={(e) => {
          if (e.key === 'ArrowRight') {
            e.preventDefault();
            focusTab(i, 1);
          }
          if (e.key === 'ArrowLeft') {
            e.preventDefault();
            focusTab(i, -1);
          }
        }}
        className={cn(
          'flex-auto whitespace-nowrap px-2 py-2 font-mono text-xs uppercase tracking-wide',
          // Inset, so the neighbouring segments don't cover it.
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-primary',
          isActive && 'bg-ink font-bold text-white',
          !isActive && !tab.disabled && 'bg-white text-ink-soft hover:bg-panel hover:text-ink',
          tab.disabled && 'cursor-not-allowed bg-paper text-steel'
        )}
      >
        {tab.label}
      </button>
    );
  };

  const BAR = 'flex flex-wrap gap-px border border-ink bg-ink';
  const groups: Array<Array<[Tab, number]>> = [];
  tabs.forEach((tab, i) => {
    if (tab.startsGroup || groups.length === 0) groups.push([]);
    groups[groups.length - 1].push([tab, i]);
  });

  if (groups.length > 1) {
    return (
      <div role="tablist" {...aria} className={cn('flex flex-wrap gap-2', className)}>
        {groups.map((group) => (
          <div key={group[0][0].id} className={cn(BAR, 'flex-auto')}>
            {group.map(([tab, i]) => renderTab(tab, i))}
          </div>
        ))}
      </div>
    );
  }

  return (
    <div role="tablist" {...aria} className={cn(BAR, className)}>
      {tabs.map((tab, i) => renderTab(tab, i))}
    </div>
  );
};
