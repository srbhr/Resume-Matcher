'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { motionTokens } from '@/lib/motion/tokens';
import { AlertTriangle, CheckCircle } from 'lucide-react';

export type FormFieldProps = {
	label: string;
	value: string;
	onChange: (val: string) => void;
	type?: React.HTMLInputTypeAttribute;
	placeholder?: string;
	required?: boolean;
	error?: string;
	className?: string;
	inputClassName?: string;
};

export const AnimatedFormField = React.memo(function AnimatedFormField({
	label,
	value,
	onChange,
	type = 'text',
	placeholder,
	required = false,
	error,
	className,
	inputClassName,
}: FormFieldProps) {
	const [isFocused, setIsFocused] = React.useState(false);
	const hasContent = !!value;

	return (
		<motion.div
			className={cn('relative', className)}
			initial={{ opacity: 0, y: 12 }}
			animate={{ opacity: 1, y: 0 }}
			transition={motionTokens.spring.gentle}
		>
			<motion.div
				className={cn(
					'relative rounded-xl border-2 transition-all duration-200',
					'bg-background dark:bg-card',
					isFocused
						? 'border-blue-500 shadow-lg shadow-blue-500/20'
						: error
						? 'border-red-400 shadow-lg shadow-red-500/10'
						: 'border-border hover:border-ring',
				)}
				whileHover={{ scale: 1.002 }}
				transition={motionTokens.spring.gentle}
			>
				<motion.label
					className={cn(
						'absolute left-4 transition-all duration-200 font-medium pointer-events-none',
						isFocused || hasContent
							? 'top-2 text-xs text-blue-600 dark:text-blue-300'
							: 'top-3.5 text-sm text-muted-foreground',
					)}
					animate={{
						scale: isFocused || hasContent ? 0.9 : 1,
						y: isFocused || hasContent ? -2 : 0,
					}}
					transition={motionTokens.spring.medium}
				>
					{label}
					{required && (
						<motion.span
							className="text-red-500 ml-0.5"
							animate={{ opacity: [1, 0.6, 1] }}
							transition={{ duration: 2, repeat: Infinity }}
						>
							*
						</motion.span>
					)}
				</motion.label>

				<input
					type={type}
					value={value}
					onChange={(e) => onChange(e.target.value)}
					onFocus={() => setIsFocused(true)}
					onBlur={() => setIsFocused(false)}
					placeholder={isFocused ? placeholder : ''}
					className={cn(
						'w-full bg-transparent border-0 outline-none text-foreground',
						'placeholder:text-muted-foreground',
						isFocused || hasContent ? 'pt-7 pb-2 px-4' : 'py-3.5 px-4',
						inputClassName,
					)}
				/>

				<motion.div
					className="absolute inset-0 rounded-xl border-2 border-blue-500 opacity-0 pointer-events-none"
					animate={{ opacity: isFocused ? 0.25 : 0, scale: isFocused ? 1.02 : 1 }}
					transition={motionTokens.spring.gentle}
				/>
			</motion.div>

			<AnimatePresence>
				{error && (
					<motion.p
						className="mt-2 text-sm text-red-600 dark:text-red-400 flex items-center gap-2"
						initial={{ opacity: 0, height: 0 }}
						animate={{ opacity: 1, height: 'auto' }}
						exit={{ opacity: 0, height: 0 }}
						transition={motionTokens.spring.gentle}
					>
						<AlertTriangle className="w-4 h-4" />
						{error}
					</motion.p>
				)}
			</AnimatePresence>

			<AnimatePresence>
				{value && !error && (
					<motion.div
						className="absolute top-3.5 right-4 text-green-500"
						initial={{ scale: 0, opacity: 0 }}
						animate={{ scale: 1, opacity: 1 }}
						exit={{ scale: 0, opacity: 0 }}
						transition={motionTokens.spring.bouncy}
						aria-hidden
					>
						<CheckCircle className="w-5 h-5" />
					</motion.div>
				)}
			</AnimatePresence>
		</motion.div>
	);
});
