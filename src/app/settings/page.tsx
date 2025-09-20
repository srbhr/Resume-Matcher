export const metadata = {
	title: 'Settings | Experimental UI',
};

export default function SettingsPage() {
	return (
		<section className="space-y-6">
			<header>
				<h1 className="text-3xl font-light tracking-tight">Settings</h1>
				<p className="text-xs text-muted-foreground mt-1">Customize your experience</p>
			</header>
			<div className="space-y-4 text-sm leading-relaxed">
				<p>More configuration options coming soon.</p>
				<p className="text-muted-foreground">
					Use the dock to navigate or toggle the theme.
				</p>
			</div>
		</section>
	);
}
