import type { Metadata } from 'next';
import { Inter, JetBrains_Mono, Victor_Mono } from 'next/font/google';
import './globals.css';
import DockNav from '../components/dock-nav';
import { Toaster } from '@/components/ui/sonner';

const inter = Inter({
	weight: ['300'],
	subsets: ['latin'],
	variable: '--font-sans',
	display: 'swap',
});

const jetbrains = JetBrains_Mono({
	weight: ['300'],
	subsets: ['latin'],
	variable: '--font-mono',
	display: 'swap',
});

const victorMono = Victor_Mono({
	weight: ['300', '400', '500', '600', '700'],
	subsets: ['latin'],
	variable: '--font-victor-mono',
	display: 'swap',
});

export const metadata: Metadata = {
	title: 'Experimental UI',
	description: 'Personal site with resume and settings',
};

export default function RootLayout({
	children,
}: Readonly<{
	children: React.ReactNode;
}>) {
	return (
		<html lang="en-US" className="dark" suppressHydrationWarning>
			<body
				className={`${inter.variable} ${jetbrains.variable} ${victorMono.variable} font-sans font-light text-md min-h-screen bg-background text-foreground antialiased transition-colors`}
			>
				<div className="relative flex min-h-screen flex-col">
					<main className="flex-1 px-6 py-10 container mx-auto max-w-4xl w-full">
						{children}
					</main>
				</div>
				{/* Global Dock Navigation */}
				<div className="pointer-events-none fixed inset-x-0 bottom-0 z-50 flex justify-center">
					<DockNav />
				</div>
				<Toaster />
			</body>
		</html>
	);
}
