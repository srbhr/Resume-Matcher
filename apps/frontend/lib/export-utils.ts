/**
 * Export utilities for converting analysis data to different formats
 */

export interface AnalysisExportData {
	originalScore: number;
	score: number;
	details: string;
	commentary: string;
	improvements: Array<{
		suggestion: string;
		lineNumber?: string | number;
	}>;
	exportedAt: string;
}

/**
 * Export analysis as CSV format
 */
export const exportAsCSV = (data: AnalysisExportData): string => {
	const headers = ['Metric', 'Value'];
	const rows: string[][] = [
		headers,
		['Original Score', `${data.originalScore}/100`],
		['Improved Score', `${data.score}/100`],
		['Score Delta', `${data.score - data.originalScore}`],
		['Details', `"${data.details.replace(/"/g, '""')}"`],
		['Commentary', `"${data.commentary.replace(/"/g, '""')}"`],
		['Exported At', data.exportedAt],
		[], // blank line
		['Improvements'],
	];

	data.improvements.forEach((improvement) => {
		rows.push([
			`"${improvement.suggestion.replace(/"/g, '""')}"`,
			improvement.lineNumber ? `Line ${improvement.lineNumber}` : 'N/A',
		]);
	});

	return rows.map((row) => row.join(',')).join('\n');
};

/**
 * Export analysis as JSON format
 */
export const exportAsJSON = (data: AnalysisExportData): string => {
	return JSON.stringify(
		{
			...data,
			scoreDelta: data.score - data.originalScore,
		},
		null,
		2
	);
};

/**
 * Generate HTML for PDF export
 */
export const generateHTMLForPDF = (data: AnalysisExportData): string => {
	const improvementsList = data.improvements
		.map(
			(imp, idx) =>
				`<li><strong>${idx + 1}.</strong> ${imp.suggestion}${
					imp.lineNumber ? ` <span style="color: #666; font-size: 0.9em;">(Line ${imp.lineNumber})</span>` : ''
				}</li>`
		)
		.join('');

	const scoreDelta = data.score - data.originalScore;
	const deltaColor = scoreDelta > 0 ? '#22c55e' : scoreDelta < 0 ? '#ef4444' : '#666';
	const deltaText = scoreDelta > 0 ? `+${scoreDelta}` : `${scoreDelta}`;

	return `
<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Resume Analysis Report</title>
	<style>
		body {
			font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Roboto', 'Oxygen', 'Ubuntu', 'Cantarell', sans-serif;
			line-height: 1.6;
			color: #333;
			max-width: 900px;
			margin: 0 auto;
			padding: 20px;
			background: #f5f5f5;
		}
		.container {
			background: white;
			padding: 30px;
			border-radius: 8px;
			box-shadow: 0 2px 4px rgba(0,0,0,0.1);
		}
		h1 {
			color: #1f2937;
			border-bottom: 3px solid #8b5cf6;
			padding-bottom: 10px;
			margin-bottom: 30px;
		}
		h2 {
			color: #4b5563;
			margin-top: 25px;
			margin-bottom: 15px;
		}
		.score-grid {
			display: grid;
			grid-template-columns: 1fr 1fr;
			gap: 20px;
			margin-bottom: 30px;
		}
		.score-card {
			background: #f9fafb;
			border: 2px solid #e5e7eb;
			border-radius: 8px;
			padding: 20px;
			text-align: center;
		}
		.score-card h3 {
			color: #6b7280;
			font-size: 0.9em;
			text-transform: uppercase;
			margin-bottom: 10px;
		}
		.score-number {
			font-size: 2.5em;
			font-weight: bold;
			margin: 10px 0;
		}
		.score-delta {
			color: ${deltaColor};
			font-weight: bold;
			font-size: 1.1em;
			margin-top: 10px;
		}
		.details-section {
			background: #f9fafb;
			border-left: 4px solid #8b5cf6;
			padding: 15px;
			margin-bottom: 20px;
			border-radius: 4px;
		}
		.details-section h3 {
			margin-top: 0;
			color: #1f2937;
		}
		.details-section p {
			margin: 8px 0;
			color: #4b5563;
		}
		.improvements-list {
			list-style: none;
			padding: 0;
		}
		.improvements-list li {
			background: #f9fafb;
			padding: 12px 15px;
			margin-bottom: 10px;
			border-radius: 4px;
			border-left: 3px solid #8b5cf6;
		}
		.footer {
			margin-top: 30px;
			padding-top: 20px;
			border-top: 1px solid #e5e7eb;
			color: #9ca3af;
			font-size: 0.9em;
			text-align: center;
		}
		@media print {
			body {
				background: white;
			}
			.container {
				box-shadow: none;
				padding: 0;
			}
		}
	</style>
</head>
<body>
	<div class="container">
		<h1>Resume Analysis Report</h1>
		
		<div class="score-grid">
			<div class="score-card">
				<h3>Original Score</h3>
				<div class="score-number">${data.originalScore}</div>
				<p style="color: #6b7280; margin: 0;">/100</p>
			</div>
			<div class="score-card">
				<h3>Improved Score</h3>
				<div class="score-number">${data.score}</div>
				<p style="color: #6b7280; margin: 0;">/100</p>
				<div class="score-delta">${deltaText}</div>
			</div>
		</div>

		<h2>Analysis Summary</h2>
		<div class="details-section">
			<h3>Details</h3>
			<p>${data.details}</p>
		</div>
		<div class="details-section">
			<h3>Commentary</h3>
			<p>${data.commentary}</p>
		</div>

		<h2>Improvement Recommendations</h2>
		${
			data.improvements.length > 0
				? `<ol class="improvements-list">${improvementsList}</ol>`
				: '<p style="color: #6b7280;">No specific improvement suggestions at this time.</p>'
		}

		<div class="footer">
			<p>Generated on ${new Date(data.exportedAt).toLocaleString()}</p>
			<p style="margin: 5px 0 0 0;">Resume Matcher - AI-powered Resume Optimization</p>
		</div>
	</div>
</body>
</html>
`;
};

/**
 * Trigger download of a file
 */
export const downloadFile = (content: string, filename: string, mimeType: string) => {
	const blob = new Blob([content], { type: mimeType });
	const url = window.URL.createObjectURL(blob);
	const link = document.createElement('a');
	link.href = url;
	link.download = filename;
	document.body.appendChild(link);
	link.click();
	document.body.removeChild(link);
	window.URL.revokeObjectURL(url);
};
