'use client';

import { createContext, useContext, ReactNode } from 'react';
import { useTheme } from '@/hooks/use-theme';

interface ThemeContextType {
	theme: 'light' | 'dark';
	toggleTheme: () => void;
	setTheme: (theme: 'light' | 'dark') => void;
	mounted: boolean;
}

const ThemeContext = createContext<ThemeContextType | undefined>(undefined);

export const ThemeProvider = ({ children }: { children: ReactNode }) => {
	const { theme, toggleTheme, setTheme, mounted } = useTheme();

	if (!mounted) {
		return <>{children}</>;
	}

	return (
		<ThemeContext.Provider value={{ theme, toggleTheme, setTheme, mounted }}>
			{children}
		</ThemeContext.Provider>
	);
};

export const useThemeContext = () => {
	const context = useContext(ThemeContext);
	if (!context) {
		throw new Error('useThemeContext must be used within ThemeProvider');
	}
	return context;
};
