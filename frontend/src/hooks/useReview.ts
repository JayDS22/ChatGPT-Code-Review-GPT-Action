import { useState, useCallback, useRef } from 'react';
import type { ReviewResult, ReviewItem, SSEEvent, HistoryEntry } from '../utils/types';
import { api } from '../utils/api';

interface UseReviewReturn {
  result: ReviewResult | null;
  streamItems: ReviewItem[];
  isLoading: boolean;
  isStreaming: boolean;
  error: string | null;
  progress: string;
  reviewPR: (url: string, stream?: boolean) => Promise<void>;
  reviewSnippet: (code: string, language?: string) => Promise<void>;
  reset: () => void;
  history: HistoryEntry[];
}

export function useReview(): UseReviewReturn {
  const [result, setResult] = useState<ReviewResult | null>(null);
  const [streamItems, setStreamItems] = useState<ReviewItem[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState('');
  const [history, setHistory] = useState<HistoryEntry[]>(() => {
    try {
      const saved = sessionStorage.getItem('codelens_history');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });

  const eventSourceRef = useRef<EventSource | null>(null);

  const addToHistory = useCallback((type: 'pr' | 'snippet', input: string, res: ReviewResult) => {
    const entry: HistoryEntry = {
      id: res.review_id,
      type,
      input,
      result: res,
      timestamp: new Date(),
    };
    setHistory(prev => {
      const next = [entry, ...prev].slice(0, 50);
      try { sessionStorage.setItem('codelens_history', JSON.stringify(next)); } catch {}
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setResult(null);
    setStreamItems([]);
    setError(null);
    setProgress('');
    setIsLoading(false);
    setIsStreaming(false);
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  }, []);

  const reviewPR = useCallback(async (url: string, stream = false) => {
    reset();
    setIsLoading(true);

    if (stream) {
      setIsStreaming(true);
      setProgress('Connecting...');

      const es = api.streamPRReview(url);
      eventSourceRef.current = es;

      es.addEventListener('message', (e) => {
        try {
          const data: SSEEvent = JSON.parse(e.data);

          switch (data.event) {
            case 'start':
              setProgress(`Starting review of ${data.files} files...`);
              break;
            case 'chunk_start':
              setProgress(`Reviewing chunk ${data.chunk}/${data.total}...`);
              break;
            case 'finding':
              if (data.data) {
                const item = (typeof data.data === 'string' ? JSON.parse(data.data) : data.data) as ReviewItem;
                setStreamItems(prev => [...prev, item]);
              }
              break;
            case 'complete':
              setResult({
                review_id: '',
                status: 'completed',
                summary: data.summary || '',
                overall_quality: (data.overall_quality as ReviewResult['overall_quality']) || 'good',
                severity_counts: { critical: 0, high: 0, medium: 0, low: 0, info: 0 },
                top_priority_fixes: data.top_priority_fixes || [],
                items: [],
                files_reviewed: 0,
                cached: false,
                review_time_ms: data.review_time_ms || 0,
              });
              setIsStreaming(false);
              setIsLoading(false);
              setProgress('Complete!');
              break;
            case 'error':
              setError(data.error || 'Stream error');
              setIsStreaming(false);
              setIsLoading(false);
              break;
          }
        } catch {}
      });

      es.addEventListener('done', () => {
        es.close();
        setIsStreaming(false);
        setIsLoading(false);
      });

      es.onerror = () => {
        setError('Connection lost. Please try again.');
        es.close();
        setIsStreaming(false);
        setIsLoading(false);
      };
    } else {
      try {
        setProgress('Fetching PR and running review...');
        const res = await api.reviewPR(url);
        setResult(res);
        addToHistory('pr', url, res);
        setProgress('Complete!');
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'Review failed');
      } finally {
        setIsLoading(false);
      }
    }
  }, [reset, addToHistory]);

  const reviewSnippet = useCallback(async (code: string, language = 'auto') => {
    reset();
    setIsLoading(true);
    setProgress('Analyzing code...');

    try {
      const res = await api.reviewSnippet(code, language);
      setResult(res);
      addToHistory('snippet', code.slice(0, 80) + '...', res);
      setProgress('Complete!');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Review failed');
    } finally {
      setIsLoading(false);
    }
  }, [reset, addToHistory]);

  return {
    result,
    streamItems,
    isLoading,
    isStreaming,
    error,
    progress,
    reviewPR,
    reviewSnippet,
    reset,
    history,
  };
}
