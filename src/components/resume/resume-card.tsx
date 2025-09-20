'use client';

import React from 'react';
import { cn } from '@/lib/utils';

interface BaseCardProps {
	children?: React.ReactNode;
	className?: string;
	onClick?: () => void;
	disabled?: boolean;
	title?: string;
}

export function ResumeCard({ children, className, onClick, disabled, title }: BaseCardProps) {
	return (
		<button
			type="button"
			title={title}
			disabled={disabled}
			onClick={onClick}
			className={cn(
				'group relative aspect-[3/4] w-full rounded-md border text-left outline-none transition-colors flex items-center justify-center',
				'border-gray-500/60 dark:border-gray-500/40 bg-gradient-to-br from-gray-200/10 to-gray-400/10 dark:from-gray-900/30 dark:to-gray-800/10',
				'hover:border-blue-500/70 focus-visible:border-blue-500/80 focus-visible:ring-2 focus-visible:ring-blue-500/30',
				'disabled:opacity-70 disabled:cursor-default',
				className,
			)}
		>
			{children}
		</button>
	);
}

export function AddResumeCard({ onClick }: { onClick: () => void }) {
	return (
		<button
			type="button"
			onClick={onClick}
			className={cn(
				'aspect-[3/4] w-full rounded-md border-2 border-dashed flex items-center justify-center text-4xl font-light text-gray-500 dark:text-gray-400',
				'hover:text-blue-600 hover:border-blue-500/70 dark:hover:text-blue-400 transition-colors',
			)}
		>
			+
		</button>
	);
}
