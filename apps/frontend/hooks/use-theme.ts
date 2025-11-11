'use client';

import { useEffect, useState } from 'react';

type Theme = 'light' | 'dark';

/**
 * Custom hook for managing theme state and persistence
 * Stores preference in localStorage and syncs with HTML element class
 */
export const useTheme = () => {
	const [theme, setThemeState] = useState<Theme>('light');
	const [mounted, setMounted] = useState(false);

	useEffect(() => {
		// Get initial theme from localStorage or system preference
		const storedTheme = localStorage.getItem('theme') as Theme | null;
		const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
		const initialTheme = storedTheme || (prefersDark ? 'dark' : 'light');

		setThemeState(initialTheme);
		applyTheme(initialTheme);
		setMounted(true);
	}, []);

	const setTheme = (newTheme: Theme) => {
		setThemeState(newTheme);
		localStorage.setItem('theme', newTheme);
		applyTheme(newTheme);
	};

	const toggleTheme = () => {
		const newTheme = theme === 'light' ? 'dark' : 'light';
		setTheme(newTheme);
	};

	return {
		theme,
		setTheme,
		toggleTheme,
		mounted,
	};
};

/**
 * Apply theme to the document
 */
function applyTheme(theme: Theme) {
	const html = document.documentElement;
	if (theme === 'dark') {
		html.classList.add('dark');
	} else {
		html.classList.remove('dark');
	}
}
