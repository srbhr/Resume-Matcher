'use client';

import { useThemeContext } from '@/components/common/theme-provider';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * Theme Toggle Button Component
 * Displays sun/moon icon and toggles between light and dark modes
 */
export const ThemeToggle = () => {
	const { theme, toggleTheme, mounted } = useThemeContext();

	if (!mounted) {
		return null;
	}

	return (
		<Button
			variant="ghost"
			size="sm"
			onClick={toggleTheme}
			className="relative inline-flex items-center justify-center rounded-md p-2 text-gray-600 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-400 dark:hover:bg-gray-800 dark:hover:text-gray-100 transition-colors"
			aria-label="Toggle theme"
		>
			{theme === 'light' ? (
				<Moon className="h-5 w-5" />
			) : (
				<Sun className="h-5 w-5" />
			)}
		</Button>
	);
};
