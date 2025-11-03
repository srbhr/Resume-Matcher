'use client';

import React from 'react';

interface InsightsPanelProps {
	details?: string;
	commentary?: string;
}

const InsightsPanel: React.FC<InsightsPanelProps> = ({ details, commentary }) => {
	const hasContent = Boolean(details?.trim()) || Boolean(commentary?.trim());

	return (
		<div className="bg-gray-900/80 backdrop-blur-sm p-6 rounded-lg shadow-xl border border-gray-800/50 flex flex-col gap-4">
			<div>
				<h2 className="text-2xl font-bold text-white mb-1">Key Insights</h2>
				<p className="text-gray-400 text-sm">
					Use these takeaways to refine your source résumé while keeping your experience factual.
				</p>
			</div>

			{details ? (
				<div className="bg-gray-800/70 rounded-md p-3 text-sm text-gray-300">
					<p className="font-semibold text-blue-300 uppercase tracking-wide text-xs mb-1">Key Insight</p>
					<p>{details}</p>
				</div>
			) : null}

			{commentary ? (
				<div className="bg-gray-800/50 rounded-md p-3 text-sm text-gray-300">
					<p className="font-semibold text-purple-300 uppercase tracking-wide text-xs mb-1">Strategy</p>
					<p>{commentary}</p>
				</div>
			) : null}

			{!hasContent && (
				<div className="bg-gray-800/40 border border-gray-700 rounded-md p-4 text-sm text-gray-300">
					Insights will appear here after your résumé has been analyzed.
				</div>
			)}
		</div>
	);
};

export default InsightsPanel;
