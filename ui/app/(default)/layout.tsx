export default function DefaultLayout({ children }: { children: React.ReactNode }) {
	return (
		<>
			<main className="grow --font-geist">{children}</main>
		</>
	);
}
