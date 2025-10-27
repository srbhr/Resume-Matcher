'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
	DialogFooter,
	DialogClose,
} from '@/components/ui/dialog';

interface ImprovementSuggestion {
	suggestion: string;
	lineNumber?: string | number;
}

export interface ResumeAnalysisProps {
	originalScore: number;
	score: number;
	details: string;
	commentary: string;
	improvements: ImprovementSuggestion[];
}

const ResumeAnalysis: React.FC<ResumeAnalysisProps> = ({
	originalScore,
	score,
	details,
	commentary,
	improvements,
}) => {
	const [isModalOpen, setIsModalOpen] = useState(false);

	const getScoreColor = (value: number) => {
		if (value >= 80) return 'text-green-500';
		if (value >= 60) return 'text-yellow-500';
		return 'text-red-500';
	};

	const truncatedDetails = details.length > 100 ? details.slice(0, 97) + '...' : details;
	const truncatedCommentary = commentary.length > 100 ? commentary.slice(0, 97) + '...' : commentary;
	const delta = score - originalScore;
	const sign = delta === 0 ? '' : delta > 0 ? '+' : '−';
	const deltaAbs = Math.abs(delta);

	return (
		<div className="bg-gray-900/80 p-6 rounded-lg shadow-xl text-gray-100">
			<Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
				<DialogTrigger asChild>
					<div className="cursor-pointer">
						<div className="flex justify-between items-center mb-4">
							<h3 className="text-xl font-semibold text-gray-100">Resume Analysis</h3>
							<div className="text-right">
								<div className={`text-3xl font-bold ${getScoreColor(score)}`}>{score}<span className="text-sm">/100</span></div>
								<p className="text-xs text-gray-400">Baseline: {originalScore}/100</p>
							</div>
						</div>
						<p className="text-sm text-gray-400 mb-2">{truncatedDetails}</p>
						<p className="text-sm text-gray-400">{truncatedCommentary}</p>
						{delta !== 0 && (
							<p className={`text-xs mt-2 ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
								{sign}{deltaAbs} point{deltaAbs === 1 ? '' : 's'} vs original
							</p>
						)}
						<Button variant="link" className="text-blue-400 hover:text-blue-300 p-0 h-auto mt-2 text-sm">
							View Full Analysis
						</Button>
					</div>
				</DialogTrigger>

				<DialogContent className="bg-gray-900 border-gray-700 text-gray-100 sm:max-w-[600px] md:max-w-[800px] lg:max-w-[1000px] p-0">
					<DialogHeader className="p-6 border-b border-gray-700">
						<DialogTitle className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-purple-400 to-pink-500">
							Detailed Resume Analysis
						</DialogTitle>
					</DialogHeader>

					<div className="p-6 max-h-[70vh] overflow-y-auto">
						<div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-6">
							<div className="md:col-span-1 bg-gray-800 p-4 rounded-lg space-y-4">
								<h4 className="text-lg font-semibold text-blue-400 mb-2">Compatibility Scores</h4>
								<div className="space-y-3">
									<div>
										<p className="text-xs uppercase tracking-wide text-gray-500">Before</p>
										<div className="flex items-center justify-between">
											<div className="text-4xl font-semibold text-gray-200">{originalScore}</div>
											<span className="text-xs text-gray-400">/100</span>
										</div>
										<div className="w-full bg-gray-700 rounded-full h-2 mt-1">
											<div className="bg-gray-500 h-2 rounded-full" style={{ width: `${Math.min(100, Math.max(0, originalScore))}%` }} />
										</div>
									</div>
									<div>
										<p className="text-xs uppercase tracking-wide text-gray-500">After</p>
										<div className="flex items-center justify-between">
											<div className={`text-4xl font-semibold ${getScoreColor(score)}`}>{score}</div>
											<span className="text-xs text-gray-400">/100</span>
										</div>
										<div className="w-full bg-gray-700 rounded-full h-2 mt-1">
											<div className={`${score >= 80 ? 'bg-green-500' : score >= 60 ? 'bg-yellow-500' : 'bg-red-500'} h-2 rounded-full`}
												style={{ width: `${Math.min(100, Math.max(0, score))}%` }}
											/>
										</div>
									</div>
								</div>
								{delta !== 0 && (
									<p className={`text-xs text-center ${delta > 0 ? 'text-green-400' : 'text-red-400'}`}>
										Change: {sign}{deltaAbs} point{deltaAbs === 1 ? '' : 's'}
									</p>
								)}
							</div>

							<div className="md:col-span-2 bg-gray-800 p-4 rounded-lg">
								<h4 className="text-lg font-semibold text-blue-400 mb-2">Summary</h4>
								<p className="text-gray-300 text-sm mb-1">
									<strong>Details:</strong> {details}
								</p>
								<p className="text-gray-300 text-sm">
									<strong>Commentary:</strong> {commentary}
								</p>
							</div>
						</div>

						<div>
							<h4 className="text-xl font-semibold text-blue-400 mb-3">Improvement Suggestions</h4>
							{improvements.length > 0 ? (
								<ul className="space-y-3">
									{improvements.map((item, idx) => (
										<li key={idx} className="bg-gray-800 p-4 rounded-md shadow">
											<p className="text-gray-200 text-sm">{item.suggestion}</p>
											{item.lineNumber && (
												<p className="text-xs text-gray-500 mt-1">Reference: {item.lineNumber}</p>
											)}
										</li>
									))}
								</ul>
							) : (
								<p className="text-gray-400 text-sm">No specific improvement suggestions at this time.</p>
							)}
						</div>
					</div>

					<DialogFooter className="p-6 border-t border-gray-700">
						<DialogClose asChild>
							<Button variant="outline" className="text-gray-100 bg-gray-700 hover:bg-gray-600 border-gray-600">
								Close
							</Button>
						</DialogClose>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</div>
	);
};

export default ResumeAnalysis;
