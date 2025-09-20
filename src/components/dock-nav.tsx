'use client';

import { usePathname } from 'next/navigation';
import Link from 'next/link';
import { Dock, DockIcon } from '@/components/magicui/dock';
import { motion } from 'motion/react';
import { Home, FileText, Settings as SettingsIcon } from 'lucide-react';
import { ThemeToggle } from '@/components/theme-toggle';

export default function DockNav() {
	const pathname = usePathname();
	// Base style: center icon, smooth color transition; will layer custom motion hover scale via DockIcon intrinsic magnification + framer hover
	const baseIconClasses =
		'flex size-full items-center justify-center transition-colors duration-300';
	const inactive = 'text-muted-foreground';
	const activeColor = 'text-foreground';

	const linkWrapper = (href: string, icon: React.ReactNode, label: string) => {
		const active = pathname === href;
		return (
			<div className="relative flex items-center justify-center">
				{active && (
					<span className="pointer-events-none absolute -top-3 h-1.5 w-1.5 rounded-full bg-blue-500" />
				)}
				<Link
					href={href}
					aria-label={label}
					className={[baseIconClasses, active ? activeColor : inactive].join(' ')}
				>
					{icon}
				</Link>
			</div>
		);
	};

	return (
		<motion.div
			initial={{ opacity: 0, y: 16 }}
			animate={{ opacity: 1, y: 0 }}
			transition={{ type: 'spring', stiffness: 120, damping: 14 }}
		>
			<Dock
				className="pointer-events-auto mb-6 border border-border/80 bg-white/50 dark:bg-gray-950/50 backdrop-blur-xl px-3 h-[58px] rounded-2xl transition-colors duration-500 shadow-lg shadow-black/5 dark:shadow-white/5"
				iconSize={40}
				iconMagnification={56}
				iconDistance={120}
			>
				<DockIcon className="bg-transparent shadow-none" whileHover={{ y: -2 }}>
					{linkWrapper('/', <Home strokeWidth={1} className="size-5" />, 'Home')}
				</DockIcon>
				<DockIcon className="bg-transparent shadow-none" whileHover={{ y: -2 }}>
					{linkWrapper(
						'/resume',
						<FileText strokeWidth={1} className="size-5" />,
						'Resume',
					)}
				</DockIcon>
				<DockIcon className="bg-transparent shadow-none" whileHover={{ y: -2 }}>
					{linkWrapper(
						'/settings',
						<SettingsIcon strokeWidth={1} className="size-5" />,
						'Settings',
					)}
				</DockIcon>
				<div className="mx-1 h-8 w-px self-stretch bg-border/40" />
				<DockIcon
					className="bg-transparent shadow-none"
					aria-label="Toggle Theme"
					whileHover={{ y: -2 }}
				>
					{/* active dot for theme toggle when user is on specific route? Not route-based, so none */}
					<div className="transition-colors duration-300">
						<ThemeToggle />
					</div>
				</DockIcon>
			</Dock>
		</motion.div>
	);
}
