'use client';

import React, { useEffect, useId, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useTranslations } from '@/lib/i18n';

export interface DropdownOption {
  id: string;
  label: string;
  description?: string;
}

interface DropdownProps {
  options: DropdownOption[];
  value: string;
  onChange: (value: string) => void;
  label?: string;
  description?: string;
  /** Shown, and nothing is marked selected, when `value` matches no option. */
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

/** Swiss select: a field-style trigger and a listbox with full keyboard support. */
export function Dropdown({
  options,
  value,
  onChange,
  label,
  description,
  placeholder,
  disabled = false,
  className,
}: DropdownProps) {
  const { t } = useTranslations();
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const optionRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const baseId = useId();
  const labelId = `${baseId}-label`;
  const valueId = `${baseId}-value`;
  const listId = `${baseId}-list`;

  const selectedIndex = options.findIndex((option) => option.id === value);
  const selected = selectedIndex >= 0 ? options[selectedIndex] : undefined;

  useEffect(() => {
    if (!isOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node))
        setIsOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [isOpen]);

  useEffect(() => {
    if (isOpen && activeIndex >= 0) optionRefs.current[activeIndex]?.focus();
  }, [isOpen, activeIndex]);

  const openAt = (index: number) => {
    if (disabled || options.length === 0) return;
    setActiveIndex(index);
    setIsOpen(true);
  };
  const close = (returnFocus: boolean) => {
    setIsOpen(false);
    setActiveIndex(-1);
    if (returnFocus) triggerRef.current?.focus();
  };
  const choose = (id: string) => {
    onChange(id);
    close(true);
  };

  const onTriggerKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>) => {
    if (event.key === 'ArrowDown' || event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      openAt(selectedIndex >= 0 ? selectedIndex : 0);
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      openAt(selectedIndex >= 0 ? selectedIndex : options.length - 1);
    }
  };

  const onOptionKeyDown = (event: React.KeyboardEvent<HTMLButtonElement>, index: number) => {
    const last = options.length - 1;
    const moves: Record<string, number> = {
      ArrowDown: index === last ? 0 : index + 1,
      ArrowUp: index === 0 ? last : index - 1,
      Home: 0,
      End: last,
    };
    if (event.key in moves) {
      event.preventDefault();
      setActiveIndex(moves[event.key]);
    } else if (event.key === 'Escape') {
      event.preventDefault();
      close(true);
    } else if (event.key === 'Tab') {
      close(false);
    }
  };

  return (
    <div ref={containerRef} className={cn('space-y-1', className)}>
      {label && (
        <span
          id={labelId}
          className="block font-mono text-xs font-bold uppercase tracking-wider text-ink-soft"
        >
          {label}
        </span>
      )}
      {description && <p className="text-sm text-ink-soft">{description}</p>}
      <div className="relative">
        <button
          ref={triggerRef}
          type="button"
          disabled={disabled}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={isOpen ? listId : undefined}
          aria-labelledby={label ? `${labelId} ${valueId}` : valueId}
          onClick={() => (isOpen ? close(false) : openAt(selectedIndex >= 0 ? selectedIndex : 0))}
          onKeyDown={onTriggerKeyDown}
          className="flex h-10 w-full items-center justify-between gap-2 rounded-none border border-ink bg-white px-3 text-left font-mono text-sm focus-visible:border-primary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-primary disabled:cursor-not-allowed disabled:opacity-50"
        >
          <span
            id={valueId}
            className={cn(
              'min-w-0 flex-1 truncate',
              selected ? 'font-bold text-ink' : 'text-steel'
            )}
          >
            {selected ? selected.label : (placeholder ?? t('common.selectOption'))}
          </span>
          <ChevronDown
            aria-hidden="true"
            className={cn('size-4 shrink-0 transition-transform', isOpen && 'rotate-180')}
          />
        </button>

        {isOpen && (
          <div
            id={listId}
            role="listbox"
            aria-labelledby={label ? labelId : undefined}
            className="absolute left-0 right-0 top-full z-50 mt-1 max-h-64 divide-y divide-ink overflow-y-auto rounded-none border border-ink bg-white shadow-sw-default"
          >
            {options.map((option, index) => {
              const isSelected = option.id === value;
              return (
                <button
                  key={option.id}
                  ref={(el) => {
                    optionRefs.current[index] = el;
                  }}
                  type="button"
                  role="option"
                  aria-selected={isSelected}
                  tabIndex={index === activeIndex ? 0 : -1}
                  onClick={() => choose(option.id)}
                  onKeyDown={(event) => onOptionKeyDown(event, index)}
                  className={cn(
                    'flex w-full items-start justify-between gap-2 px-3 py-2 text-left font-mono text-sm transition-colors focus-visible:bg-panel focus-visible:outline-none',
                    isSelected ? 'bg-panel font-bold text-ink' : 'bg-white text-ink hover:bg-panel'
                  )}
                >
                  <span className="min-w-0 flex-1">
                    <span className="block">{option.label}</span>
                    {option.description && (
                      <span className="mt-1 block text-xs font-normal text-steel">
                        {option.description}
                      </span>
                    )}
                  </span>
                  {isSelected && <Check aria-hidden="true" className="mt-0.5 size-4 shrink-0" />}
                </button>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
