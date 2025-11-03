'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { fetchLlmApiKey, updateLlmApiKey } from '@/lib/api/config';
import { ChevronDown } from 'lucide-react';

type Status = 'idle' | 'loading' | 'saving' | 'saved' | 'error';

const MASK_THRESHOLD = 6;

export default function ApiKeyMenu(): React.ReactElement {
	const [isOpen, setIsOpen] = useState(false);
	const [status, setStatus] = useState<Status>('loading');
	const [apiKey, setApiKey] = useState('');
	const [draft, setDraft] = useState('');
	const [error, setError] = useState<string | null>(null);

	useEffect(() => {
		let cancelled = false;
		async function load() {
			try {
				const value = await fetchLlmApiKey();
				if (cancelled) return;
				setApiKey(value);
				setDraft(value);
				setStatus('idle');
			} catch (err) {
				console.error('Failed to load LLM API key', err);
				if (!cancelled) {
					setError('Unable to load API key');
					setStatus('error');
				}
			}
		}
		load();
		return () => {
			cancelled = true;
		};
	}, []);


	const maskedKey = useMemo(() => {
		if (!apiKey) return 'Not set';
		if (apiKey.length <= MASK_THRESHOLD) return apiKey;
		return `${apiKey.slice(0, MASK_THRESHOLD)}••••`;
	}, [apiKey]);

	const handleToggle = () => {
		setIsOpen((prev) => {
			const next = !prev;
			if (!prev) {
				setDraft(apiKey);
				setError(null);
			}
			return next;
		});
	};

	const handleSave = async () => {
		setStatus('saving');
		setError(null);
		try {
			const trimmed = draft.trim();
			const saved = await updateLlmApiKey(trimmed);
			setApiKey(saved);
			setDraft(saved);
			setStatus('saved');
			setTimeout(() => setStatus('idle'), 1800);
		} catch (err) {
			console.error('Failed to update LLM API key', err);
			setError((err as Error).message || 'Unable to update API key');
			setStatus('error');
		}
	};

	const handleClose = () => {
		setIsOpen(false);
		setDraft(apiKey);
		setError(null);
	};

	return (
		<div className="relative text-sm">
			<button
				type="button"
				onClick={handleToggle}
				className="inline-flex items-center gap-2 rounded-md border border-purple-500/50 bg-purple-600/20 px-3 py-2 text-purple-100 transition hover:bg-purple-600/40 hover:text-white"
			>
				<span className="font-semibold">LLM API</span>
				<span className="text-xs text-purple-200">{maskedKey}</span>
				<ChevronDown className="h-4 w-4" />
			</button>
			{isOpen ? (
				<>
					<div className="fixed inset-0 z-40" onClick={handleClose} aria-hidden="true" />
					<div className="absolute right-0 z-50 mt-2 w-80 rounded-md border border-gray-700 bg-gray-900/95 p-4 shadow-xl backdrop-blur">
						<h3 className="text-base font-semibold text-white mb-2">OpenAI API Key</h3>
					<p className="text-xs text-gray-400 mb-3">
						Provide your key to enable hosted OpenAI models.
					</p>
						<label htmlFor="llmKey" className="text-xs font-medium text-gray-300">
							API Key
						</label>
						<input
							id="llmKey"
							type="text"
							value={draft}
							onChange={(event) => setDraft(event.target.value)}
							placeholder="sk-..."
							className="mt-1 w-full rounded-md border border-gray-700 bg-gray-800/70 px-3 py-2 text-sm text-gray-100 focus:border-purple-500 focus:outline-none focus:ring-1 focus:ring-purple-400"
						/>
						{error ? (
							<p className="mt-2 text-xs text-red-400">{error}</p>
						) : null}
						<div className="mt-4 flex items-center justify-between gap-2">
							<button
								type="button"
								onClick={handleClose}
								className="rounded-md border border-gray-700 px-3 py-2 text-xs font-semibold text-gray-300 hover:bg-gray-800/70"
							>
								Cancel
							</button>
							<button
								type="button"
								onClick={handleSave}
								disabled={status === 'saving'}
								className={`rounded-md px-4 py-2 text-xs font-semibold transition ${status === 'saving'
									? 'bg-purple-500/40 text-purple-200 cursor-wait'
									: 'bg-purple-600 text-white hover:bg-purple-500'}`}
							>
								{status === 'saving' ? 'Saving…' : 'Save'}
							</button>
						</div>
						{status === 'saved' ? (
							<p className="mt-2 text-xs text-green-400">API key saved.</p>
						) : null}
					</div>
				</>
			) : null}
		</div>
	);
}
