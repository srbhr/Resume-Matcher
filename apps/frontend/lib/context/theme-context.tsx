'use client';

import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';

const STORAGE_KEY = 'resume_matcher_theme';

export type ThemeId = 'default' | 'newsprint' | 'riviera' | 'midnight' | 'olive';

export interface ThemeOption {
  id: ThemeId;
  name: string;
  mood: string;
  group: 'light' | 'dark';
  canvas: string;
  surface: string;
  ink: string;
  accent: string;
  panel: string;
}

export const LIGHT_THEMES: ThemeOption[] = [
  {
    id: 'default',
    name: 'Default',
    mood: 'Warm off-white canvas',
    group: 'light',
    canvas: '#F0F0E8',
    surface: '#F0F0E8',
    ink: '#000000',
    accent: '#1D4ED8',
    panel: '#E5E5E0',
  },
  {
    id: 'newsprint',
    name: 'Newsprint',
    mood: 'Bone canvas · coffee blocks · navy',
    group: 'light',
    canvas: '#F1ECDB',
    surface: '#FCFAEF',
    ink: '#0A0703',
    accent: '#1E3A8A',
    panel: '#1A140A',
  },
  {
    id: 'riviera',
    name: 'Riviera',
    mood: 'Ice canvas · navy blocks · crimson',
    group: 'light',
    canvas: '#E5EFF5',
    surface: '#FCFEFF',
    ink: '#050B1F',
    accent: '#DC2626',
    panel: '#0F2A5C',
  },
];

export const DARK_THEMES: ThemeOption[] = [
  {
    id: 'midnight',
    name: 'Midnight',
    mood: 'Deep navy · electric cyan',
    group: 'dark',
    canvas: '#06101F',
    surface: '#122139',
    ink: '#E8EDF4',
    accent: '#38BDF8',
    panel: '#243F66',
  },
  {
    id: 'olive',
    name: 'Olive',
    mood: 'Forest green · lime',
    group: 'dark',
    canvas: '#0A140C',
    surface: '#1A2A1B',
    ink: '#EFEAD0',
    accent: '#A3E635',
    panel: '#335739',
  },
];

export const ALL_THEMES: ThemeOption[] = [...LIGHT_THEMES, ...DARK_THEMES];

interface ThemeContextValue {
  theme: ThemeId;
  setTheme: (id: ThemeId) => void;
  isDark: boolean;
}

const ThemeContext = createContext<ThemeContextValue | undefined>(undefined);

function applyTheme(id: ThemeId): void {
  if (id === 'default') {
    document.documentElement.removeAttribute('data-theme');
  } else {
    document.documentElement.setAttribute('data-theme', id);
  }
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = useState<ThemeId>('default');

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) as ThemeId | null;
    if (stored && ALL_THEMES.some((t) => t.id === stored)) {
      setThemeState(stored);
      applyTheme(stored);
    }
  }, []);

  const setTheme = useCallback((id: ThemeId) => {
    setThemeState(id);
    localStorage.setItem(STORAGE_KEY, id);
    applyTheme(id);
  }, []);

  const isDark = DARK_THEMES.some((t) => t.id === theme);

  return (
    <ThemeContext.Provider value={{ theme, setTheme, isDark }}>{children}</ThemeContext.Provider>
  );
}

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error('useTheme must be used within ThemeProvider');
  return ctx;
}
