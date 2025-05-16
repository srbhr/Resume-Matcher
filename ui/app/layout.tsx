import type { Metadata } from 'next';
import { Geist, Geist_Mono } from 'next/font/google';
import './css/globals.css';

const geist = Geist({
	variable: '--font-geist',
	subsets: ['latin'],
});

const geistMono = Geist_Mono({
	variable: '--font-geist-mono',
	subsets: ['latin'],
	weight: ['400', '500', '600', '700'],
});

export const metadata: Metadata = {
	title: 'Resume Matcher',
	description: 'Build your resume with Resume Matcher',
	applicationName: 'Resume Matcher',
	keywords: 'resume, matcher, job, application',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
	return (
		<html lang="en-US">
			<body className={`${geist} ${geistMono} antialiased bg-white`}>
				<div>{children}</div>
			</body>
		</html>
	);
}
