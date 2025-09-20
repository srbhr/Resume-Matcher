'use client';

import { useEffect, useState } from 'react';
import { Moon, Sun } from 'lucide-react';
import { Button } from '@/components/ui/button';

// Cycles: dark (background) -> light (background) -> dark
export function ThemeToggle() {
	const [dark, setDark] = useState(true);

	useEffect(() => {
		const stored = localStorage.getItem('theme');
		if (stored === 'light') {
			document.documentElement.classList.remove('dark');
			setDark(false);
		} else {
			document.documentElement.classList.add('dark');
			setDark(true);
		}
	}, []);

	const toggleTheme = () => {
		if (dark) {
			document.documentElement.classList.remove('dark');
			localStorage.setItem('theme', 'light');
			setDark(false);
		} else {
			document.documentElement.classList.add('dark');
			localStorage.setItem('theme', 'dark');
			setDark(true);
		}
	};

	return (
		<Button
			variant="ghost"
			size="icon"
			onClick={toggleTheme}
			aria-label="Toggle theme"
			className="bg-transparent border-0 shadow-none hover:bg-transparent focus-visible:ring-0 focus-visible:border-0 text-inherit"
		>
			<Sun
				strokeWidth={1}
				className="h-5 w-5 rotate-0 scale-100 transition-all dark:-rotate-90 dark:scale-0"
			/>
			<Moon
				strokeWidth={1}
				className="absolute h-5 w-5 rotate-90 scale-0 transition-all dark:rotate-0 dark:scale-100"
			/>
		</Button>
	);
}
