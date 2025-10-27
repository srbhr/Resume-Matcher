const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ApiKeyResponse {
	api_key: string;
}

export async function fetchLlmApiKey(): Promise<string> {
	const res = await fetch(`${API_URL}/api/v1/config/llm-api-key`, {
		method: 'GET',
		credentials: 'include',
	});

	if (!res.ok) {
		throw new Error(`Failed to load API key (status ${res.status}).`);
	}

	const data: ApiKeyResponse = await res.json();
	return data.api_key ?? '';
}

export async function updateLlmApiKey(value: string): Promise<string> {
	const res = await fetch(`${API_URL}/api/v1/config/llm-api-key`, {
		method: 'PUT',
		headers: { 'Content-Type': 'application/json' },
		credentials: 'include',
		body: JSON.stringify({ api_key: value }),
	});

	if (!res.ok) {
		const message = await res.text();
		throw new Error(message || `Failed to update API key (status ${res.status}).`);
	}

	const data: ApiKeyResponse = await res.json();
	return data.api_key ?? '';
}
