import { useState } from 'react';
import { Search, Code2, GitPullRequest, Loader2, Sparkles } from 'lucide-react';

interface ReviewFormProps {
  onSubmitPR: (url: string) => void;
  onSubmitSnippet: (code: string, language: string) => void;
  isLoading: boolean;
}

const LANGUAGES = [
  'auto', 'python', 'javascript', 'typescript', 'go', 'rust',
  'java', 'c++', 'c#', 'ruby', 'php', 'swift', 'kotlin',
];

export function ReviewForm({ onSubmitPR, onSubmitSnippet, isLoading }: ReviewFormProps) {
  const [mode, setMode] = useState<'pr' | 'snippet'>('pr');
  const [prUrl, setPrUrl] = useState('');
  const [snippet, setSnippet] = useState('');
  const [language, setLanguage] = useState('auto');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (mode === 'pr' && prUrl.trim()) {
      onSubmitPR(prUrl.trim());
    } else if (mode === 'snippet' && snippet.trim()) {
      onSubmitSnippet(snippet.trim(), language);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="w-full">
      {/* Mode Toggle */}
      <div className="flex gap-1 p-1 rounded-xl mb-6" style={{ background: 'var(--bg-tertiary)' }}>
        <button
          type="button"
          onClick={() => setMode('pr')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
            mode === 'pr'
              ? 'text-white shadow-lg'
              : 'text-gray-400 hover:text-gray-300'
          }`}
          style={mode === 'pr' ? { background: 'var(--accent)', color: '#000' } : {}}
        >
          <GitPullRequest size={16} />
          PR Review
        </button>
        <button
          type="button"
          onClick={() => setMode('snippet')}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg text-sm font-medium transition-all duration-200 ${
            mode === 'snippet'
              ? 'text-white shadow-lg'
              : 'text-gray-400 hover:text-gray-300'
          }`}
          style={mode === 'snippet' ? { background: 'var(--accent)', color: '#000' } : {}}
        >
          <Code2 size={16} />
          Code Snippet
        </button>
      </div>

      {/* PR URL Input */}
      {mode === 'pr' && (
        <div className="relative">
          <div className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-500">
            <Search size={18} />
          </div>
          <input
            type="url"
            value={prUrl}
            onChange={(e) => setPrUrl(e.target.value)}
            placeholder="https://github.com/owner/repo/pull/123"
            className="w-full pl-11 pr-4 py-3.5 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 transition-all"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
            }}
            disabled={isLoading}
          />
        </div>
      )}

      {/* Snippet Input */}
      {mode === 'snippet' && (
        <div className="space-y-3">
          <select
            value={language}
            onChange={(e) => setLanguage(e.target.value)}
            className="px-3 py-2 rounded-lg text-sm focus:outline-none focus:ring-2"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              color: 'var(--text-secondary)',
            }}
          >
            {LANGUAGES.map((l) => (
              <option key={l} value={l}>
                {l === 'auto' ? 'Auto-detect language' : l}
              </option>
            ))}
          </select>
          <textarea
            value={snippet}
            onChange={(e) => setSnippet(e.target.value)}
            placeholder="Paste your code here..."
            rows={12}
            className="w-full px-4 py-3 rounded-xl text-sm font-mono focus:outline-none focus:ring-2 resize-none transition-all"
            style={{
              background: 'var(--bg-tertiary)',
              border: '1px solid var(--border)',
              color: 'var(--text-primary)',
              lineHeight: '1.6',
            }}
            disabled={isLoading}
          />
        </div>
      )}

      {/* Submit Button */}
      <button
        type="submit"
        disabled={isLoading || (mode === 'pr' ? !prUrl.trim() : !snippet.trim())}
        className="w-full mt-4 py-3.5 rounded-xl text-sm font-semibold flex items-center justify-center gap-2 transition-all duration-200 disabled:opacity-40 disabled:cursor-not-allowed hover:brightness-110"
        style={{ background: 'var(--accent)', color: '#000' }}
      >
        {isLoading ? (
          <>
            <Loader2 size={16} className="animate-spin" />
            Analyzing...
          </>
        ) : (
          <>
            <Sparkles size={16} />
            Run Review
          </>
        )}
      </button>
    </form>
  );
}
