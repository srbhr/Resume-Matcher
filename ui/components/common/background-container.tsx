import { DotPattern } from '@/components/common/dot-pattern-glow';
import { cn } from '@/lib/utils';

/**
 * BackgroundContainer Component
 *
 * Provides a full-screen section with a gradient background,
 * a dark inner container with rounded corners, and a glowing dot pattern.
 * It accepts children elements to render inside the inner container.
 *
 * @param {object} props - The component props.
 * @param {React.ReactNode} props.children - The content to be rendered inside the container.
 * @param {string} [props.className] - Optional additional class names for the section element.
 * @param {string} [props.innerClassName] - Optional additional class names for the inner div element.
 * @param {string} [props.dotClassName] - Optional additional class names for the DotPattern component.
 * @returns {JSX.Element} The rendered BackgroundContainer component.
 */

interface BackgroundContainerProps {
	children: React.ReactNode;
	className?: string;
	innerClassName?: string;
	dotClassName?: string;
}

const BackgroundContainer = ({
	children,
	className,
	innerClassName,
	dotClassName,
}: BackgroundContainerProps) => {
	return (
		<section
			className={cn(
				'relative flex h-screen items-center justify-center overflow-hidden p-2 bg-gradient-to-br from-sky-400 to-via-blue-500 to-blue-700',
				className,
			)}
		>
			{/* Inner container with dark background, padding, and rounded corners */}
			<div
				className={cn(
					'relative z-10 flex h-full w-full flex-col items-center justify-center bg-slate-950 p-8 rounded-2xl',
					innerClassName, // Allow overriding or extending inner div styles
				)}
			>
				{/* Dot pattern component for visual effect */}
				<DotPattern
					cr={2} // Circle radius for dots
					glow={true} // Enable glow effect
					className={cn(
						'absolute inset-0 -z-10 text-blue-400 [mask-image:radial-gradient(400px_circle_at_center,white,transparent)]',
						dotClassName, // Allow overriding or extending dot pattern styles
					)}
				/>
				{/* Render children content above the dot pattern */}
				<div className="relative z-10 w-full h-full flex flex-col items-center justify-center">
					{children}
				</div>
			</div>
		</section>
	);
};

// Example Usage (replace with your actual content)
// Assuming you have the necessary imports for DotPattern and cn
// You would use it in another component like this:

/*
import BackgroundContainer from './BackgroundContainer'; // Adjust import path

export default function MyPage() {
    return (
        <BackgroundContainer>
            {/* Add your specific content here *}
            <h1 className="text-4xl text-white mb-4">My Content Title</h1>
            <p className="text-lg text-gray-300 mb-8">This content is inside the reusable container.</p>
            <button className="bg-lime-500 text-black px-6 py-2 rounded-full hover:bg-lime-600 transition-colors">
                Click Me
            </button>
        </BackgroundContainer>
    );
}
*/

export default BackgroundContainer;
