import type { ReviewResult } from './types';

const API_BASE = import.meta.env.VITE_API_BASE_URL || 'http://localhost:8000';

class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ApiError';
  }
}

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json' },
    ...options,
  });

  if (!res.ok) {
    const body = await res.json().catch(() => ({ detail: res.statusText }));
    throw new ApiError(res.status, body.detail || 'Unknown error');
  }

  return res.json();
}

export const api = {
  reviewPR: (repoUrl: string) =>
    request<ReviewResult>('/review-pr', {
      method: 'POST',
      body: JSON.stringify({ repo_url: repoUrl }),
    }),

  reviewSnippet: (codeSnippet: string, language = 'auto', context?: string) =>
    request<ReviewResult>('/review-snippet', {
      method: 'POST',
      body: JSON.stringify({ code_snippet: codeSnippet, language, context }),
    }),

  streamPRReview: (prUrl: string) => {
    const url = `${API_BASE}/review-pr/stream?pr_url=${encodeURIComponent(prUrl)}`;
    return new EventSource(url);
  },

  health: () => request<{ status: string; version: string }>('/health'),
};

export { ApiError };
