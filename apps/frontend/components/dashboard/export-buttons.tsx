'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Download, FileJson, FileText } from 'lucide-react';
import {
	exportAsCSV,
	exportAsJSON,
	generateHTMLForPDF,
	downloadFile,
	type AnalysisExportData,
} from '@/lib/export-utils';

interface ExportButtonsProps {
	data: AnalysisExportData;
	resumeFileName?: string;
}

/**
 * Export Buttons Component
 * Provides buttons to export analysis results in CSV, JSON, and PDF formats
 */
export const ExportButtons: React.FC<ExportButtonsProps> = ({ data, resumeFileName = 'resume' }) => {
	const baseFileName = `${resumeFileName}-analysis-${new Date().toISOString().split('T')[0]}`;

	const handleExportCSV = () => {
		const csv = exportAsCSV(data);
		downloadFile(csv, `${baseFileName}.csv`, 'text/csv;charset=utf-8;');
	};

	const handleExportJSON = () => {
		const json = exportAsJSON(data);
		downloadFile(json, `${baseFileName}.json`, 'application/json;charset=utf-8;');
	};

	const handleExportPDF = () => {
		const html = generateHTMLForPDF(data);
		downloadFile(html, `${baseFileName}.html`, 'text/html;charset=utf-8;');
		// Note: To generate true PDFs, consider using a library like html2pdf or jsPDF
		// This exports as HTML which can be printed to PDF using the browser's print dialog
	};

	return (
		<div className="flex flex-wrap gap-2">
			<Button
				onClick={handleExportCSV}
				variant="outline"
				size="sm"
				className="flex items-center gap-2 text-gray-100 bg-gray-700 hover:bg-gray-600 border-gray-600 dark:text-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600"
				title="Export as CSV"
			>
				<FileText className="h-4 w-4" />
				CSV
			</Button>

			<Button
				onClick={handleExportJSON}
				variant="outline"
				size="sm"
				className="flex items-center gap-2 text-gray-100 bg-gray-700 hover:bg-gray-600 border-gray-600 dark:text-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600"
				title="Export as JSON"
			>
				<FileJson className="h-4 w-4" />
				JSON
			</Button>

			<Button
				onClick={handleExportPDF}
				variant="outline"
				size="sm"
				className="flex items-center gap-2 text-gray-100 bg-gray-700 hover:bg-gray-600 border-gray-600 dark:text-gray-100 dark:bg-gray-700 dark:hover:bg-gray-600"
				title="Export as HTML/PDF"
			>
				<Download className="h-4 w-4" />
				PDF
			</Button>
		</div>
	);
};
