'use client';

import * as React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import type { ResumeJSON } from '@/types/resume-schema';
import { motionTokens } from '@/lib/motion/tokens';

function calculateCompletionScore(resume?: ResumeJSON) {
	if (!resume) return 0;
	// naive score: count of filled sections
	const sections = [
		!!resume['contact-details'],
		!!resume['work-experiences']?.length,
		!!resume.education?.length,
		!!resume.projects?.length,
		!!resume.skills && Object.keys(resume.skills).length > 0,
		!!resume.certifications?.length,
		!!resume.languages?.length,
		!!resume.awards?.length,
		!!resume['volunteer-work']?.length,
		!!resume.publications?.length,
	];
	const filled = sections.filter(Boolean).length;
	return Math.round((filled / sections.length) * 100);
}

export const EnhancedResumeCard = React.memo(function EnhancedResumeCard({
	resume,
	onClick,
	isActive = false,
}: {
	resume?: ResumeJSON;
	onClick?: () => void;
	isActive?: boolean;
}) {
	const [isHovered, setIsHovered] = React.useState(false);
	const [completionScore] = React.useState(() => calculateCompletionScore(resume));

	return (
		<motion.div
			className="group cursor-pointer"
			onHoverStart={() => setIsHovered(true)}
			onHoverEnd={() => setIsHovered(false)}
			onClick={onClick}
			layout
			layoutId={resume?.id}
		>
			<motion.div
				className={cn(
					'relative aspect-[3/4] rounded-xl overflow-hidden',
					'bg-gradient-to-br from-background via-muted to-card',
					'dark:from-background dark:via-card dark:to-muted',
					'border border-border',
					'shadow-lg hover:shadow-xl',
					'transition-all duration-300',
				)}
				whileHover={{
					scale: 1.02,
					y: -4,
					transition: motionTokens.spring.gentle,
				}}
				whileTap={{ scale: 0.98 }}
				animate={{
					borderColor: isActive ? 'hsl(var(--ring))' : undefined,
					boxShadow: isActive
						? '0 0 0 2px hsl(var(--ring) / 0.3), 0 8px 30px hsl(var(--background) / 0.12)'
						: undefined,
				}}
			>
				<div className="absolute inset-0 opacity-5">
					<svg className="w-full h-full" viewBox="0 0 400 600">
						<defs>
							<pattern id="resume-lines" x="0" y="0" width="100%" height="20">
								<line
									x1="20"
									y1="10"
									x2="380"
									y2="10"
									stroke="currentColor"
									strokeWidth="0.5"
								/>
							</pattern>
						</defs>
						<rect width="100%" height="100%" fill="url(#resume-lines)" />
					</svg>
				</div>

				<div className="relative p-4 h-full flex flex-col">
					<div className="space-y-3">
						<div className="space-y-1">
							<div className="h-4 bg-muted-foreground rounded opacity-80 w-3/4" />
							<div className="h-2 bg-muted rounded opacity-60 w-1/2" />
						</div>
						<div className="space-y-2">
							{Array.from({ length: 4 }).map((_, i) => (
								<motion.div
									key={i}
									className="space-y-1"
									initial={{ opacity: 0.3 }}
									animate={{
										opacity: isHovered ? 0.7 : 0.3,
										transition: { delay: i * 0.05 },
									}}
								>
									<div className="h-2 bg-muted-foreground rounded w-1/4" />
									<div className="h-1.5 bg-muted rounded w-full" />
									<div className="h-1.5 bg-muted rounded w-4/5" />
								</motion.div>
							))}
						</div>
					</div>

					<motion.div
						className="absolute top-3 right-3"
						initial={{ scale: 0, opacity: 0 }}
						animate={{ scale: isHovered ? 1 : 0.8, opacity: isHovered ? 1 : 0.7 }}
						transition={motionTokens.spring.gentle}
					>
						<div
							className={cn(
								'flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium',
								'bg-background/80 dark:bg-card/80 backdrop-blur-sm border',
								completionScore > 80
									? 'text-green-700 border-green-200 dark:text-green-300 dark:border-green-800'
									: completionScore > 50
									? 'text-orange-700 border-orange-200 dark:text-orange-300 dark:border-orange-800'
									: 'text-red-700 border-red-200 dark:text-red-300 dark:border-red-800',
							)}
						>
							<div
								className={cn(
									'w-1.5 h-1.5 rounded-full',
									completionScore > 80
										? 'bg-green-500'
										: completionScore > 50
										? 'bg-orange-500'
										: 'bg-red-500',
								)}
							/>
							{completionScore}%
						</div>
					</motion.div>
				</div>

				<motion.div
					className="absolute inset-0 bg-gradient-to-t from-blue-600/10 via-transparent to-transparent"
					initial={{ opacity: 0 }}
					animate={{ opacity: isHovered ? 1 : 0 }}
					transition={{ duration: motionTokens.duration.normal / 1000 }}
				/>

				<AnimatePresence>
					{isHovered && (
						<motion.div
							className="absolute bottom-4 left-4 right-4"
							initial={{ opacity: 0, y: 20 }}
							animate={{ opacity: 1, y: 0 }}
							exit={{ opacity: 0, y: 10 }}
							transition={motionTokens.spring.gentle}
						>
							<button className="w-full py-2 px-4 bg-blue-600 hover:bg-blue-700 text-white text-sm font-medium rounded-lg shadow-lg hover:shadow-xl transition-all duration-200">
								Edit Resume
							</button>
						</motion.div>
					)}
				</AnimatePresence>
			</motion.div>

			<motion.div
				className="mt-3 text-center"
				animate={{ color: isHovered ? 'hsl(var(--ring))' : undefined }}
				transition={{ duration: motionTokens.duration.fast / 1000 }}
			>
				<p className="font-medium text-sm truncate">
					{resume?.name || resume?.id || 'Untitled Resume'}
				</p>
				<p className="text-xs text-muted-foreground">
					{resume
						? new Date(resume.lastModified ?? Date.now()).toLocaleDateString()
						: 'New'}
				</p>
			</motion.div>
		</motion.div>
	);
});
