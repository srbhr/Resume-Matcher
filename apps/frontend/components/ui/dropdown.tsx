'use client';

import React, { useState, useRef, useEffect } from 'react';
import { ChevronDown } from 'lucide-react';

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
  disabled?: boolean;
  className?: string;
}

export function Dropdown({
  options,
  value,
  onChange,
  label,
  description,
  disabled = false,
  className = '',
}: DropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const buttonRef = useRef<HTMLButtonElement>(null);

  const selectedOption = options.find((opt) => opt.id === value);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (optionId: string) => {
    onChange(optionId);
    setIsOpen(false);
  };

  return (
    <div className={`space-y-1 ${className}`} ref={containerRef}>
      {label && (
        <label className="font-mono text-xs font-bold uppercase tracking-wider text-gray-700 block">
          {label}
        </label>
      )}

      {description && <p className="text-sm text-gray-600">{description}</p>}

      <div className="relative">
        {/* Trigger Button */}
        <button
          ref={buttonRef}
          type="button"
          onClick={() => setIsOpen(!isOpen)}
          disabled={disabled}
          className="w-full flex items-center justify-between border border-black bg-white px-4 py-3 font-mono text-sm transition-all duration-150 ease-out shadow-[2px_2px_0px_0px_rgba(0,0,0,0.1)] hover:shadow-none hover:translate-y-[2px] hover:translate-x-[2px] disabled:opacity-50 disabled:cursor-not-allowed rounded-none"
        >
          <div className="flex-1 text-left min-w-0">
            {selectedOption ? (
              <div>
                <div className="font-bold text-black truncate">{selectedOption.label}</div>
                {selectedOption.description && (
                  <div className="text-xs text-gray-500 mt-1 font-normal truncate">
                    {selectedOption.description}
                  </div>
                )}
              </div>
            ) : (
              <span className="text-gray-400">Select an option...</span>
            )}
          </div>
          <ChevronDown
            className={`w-4 h-4 transition-transform duration-200 ml-2 shrink-0 ${
              isOpen ? 'rotate-180' : ''
            }`}
          />
        </button>

        {/* Dropdown Menu */}
        {isOpen && (
          <div className="absolute top-full left-0 right-0 mt-1 z-50 border border-black bg-white shadow-[4px_4px_0px_0px_rgba(0,0,0,0.1)] rounded-none">
            <div className="max-h-64 overflow-y-auto">
              {options.map((option, index) => (
                <React.Fragment key={option.id}>
                  <button
                    onClick={() => handleSelect(option.id)}
                    className={`w-full px-4 py-3 text-left font-mono transition-colors duration-150 border border-black ${
                      option.id === value
                        ? 'bg-green-700 text-white'
                        : 'bg-white text-black hover:bg-gray-50'
                    } ${index > 0 ? '-mt-[1px]' : ''} active:bg-gray-100`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex-1">
                        <div className="font-bold text-sm">{option.label}</div>
                        {option.description && (
                          <div className="text-xs mt-1 opacity-80">{option.description}</div>
                        )}
                      </div>
                      {option.id === value && <div className="text-lg font-bold mt-0.5">✓</div>}
                    </div>
                  </button>
                </React.Fragment>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
