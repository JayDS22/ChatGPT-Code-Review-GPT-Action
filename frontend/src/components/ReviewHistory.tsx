import { useState } from 'react';
import { History, Search, GitPullRequest, Code2, ChevronRight } from 'lucide-react';
import type { HistoryEntry, ReviewResult } from '../utils/types';

interface ReviewHistoryProps {
  history: HistoryEntry[];
  onSelect: (result: ReviewResult) => void;
}

const QUALITY_COLORS: Record<string, string> = {
  excellent: '#22c55e',
  good: '#3b82f6',
  needs_improvement: '#eab308',
  poor: '#ef4444',
};

export function ReviewHistory({ history, onSelect }: ReviewHistoryProps) {
  const [search, setSearch] = useState('');
  const [filterType, setFilterType] = useState<'all' | 'pr' | 'snippet'>('all');

  const filtered = history.filter((entry) => {
    const matchesSearch = search === '' || entry.input.toLowerCase().includes(search.toLowerCase());
    const matchesType = filterType === 'all' || entry.type === filterType;
    return matchesSearch && matchesType;
  });

  if (history.length === 0) {
    return (
      <div className="text-center py-12">
        <History size={32} className="mx-auto mb-3 opacity-30" />
        <p className="text-sm" style={{ color: 'var(--text-muted)' }}>
          No reviews yet. Run your first review above!
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <History size={16} style={{ color: 'var(--text-muted)' }} />
        <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
          Review History
        </h3>
        <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: 'var(--text-muted)', background: 'var(--bg-tertiary)' }}>
          {history.length}
        </span>
      </div>

      {/* Search + Filter */}
      <div className="flex gap-2">
        <div className="relative flex-1">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search reviews..."
            className="w-full pl-8 pr-3 py-2 rounded-lg text-xs focus:outline-none"
            style={{ background: 'var(--bg-tertiary)', border: '1px solid var(--border)', color: 'var(--text-primary)' }}
          />
        </div>
        <div className="flex gap-1 p-0.5 rounded-lg" style={{ background: 'var(--bg-tertiary)' }}>
          {(['all', 'pr', 'snippet'] as const).map((t) => (
            <button
              key={t}
              onClick={() => setFilterType(t)}
              className={`px-2.5 py-1.5 rounded-md text-xs transition-all ${filterType === t ? 'font-medium' : ''}`}
              style={{
                background: filterType === t ? 'var(--bg-elevated)' : 'transparent',
                color: filterType === t ? 'var(--text-primary)' : 'var(--text-muted)',
              }}
            >
              {t === 'all' ? 'All' : t === 'pr' ? 'PRs' : 'Snippets'}
            </button>
          ))}
        </div>
      </div>

      {/* History List */}
      <div className="space-y-1.5 max-h-96 overflow-y-auto">
        {filtered.map((entry) => {
          const qualityColor = QUALITY_COLORS[entry.result.overall_quality] || '#6b7280';
          const totalFindings = Object.values(entry.result.severity_counts).reduce((a, b) => a + b, 0);

          return (
            <button
              key={entry.id}
              onClick={() => onSelect(entry.result)}
              className="w-full flex items-center gap-3 p-3 rounded-xl text-left hover:brightness-110 transition-all group"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border-subtle)' }}
            >
              <div
                className="shrink-0 w-8 h-8 rounded-lg flex items-center justify-center"
                style={{ background: 'var(--bg-tertiary)' }}
              >
                {entry.type === 'pr' ? (
                  <GitPullRequest size={14} style={{ color: 'var(--accent)' }} />
                ) : (
                  <Code2 size={14} style={{ color: '#a78bfa' }} />
                )}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-xs font-mono truncate" style={{ color: 'var(--text-primary)' }}>
                  {entry.input}
                </p>
                <div className="flex items-center gap-2 mt-1">
                  <span className="text-xs font-medium" style={{ color: qualityColor }}>
                    {entry.result.overall_quality.replace('_', ' ')}
                  </span>
                  <span className="text-xs" style={{ color: 'var(--text-muted)' }}>
                    {totalFindings} findings
                  </span>
                </div>
              </div>
              <ChevronRight size={14} className="text-gray-600 group-hover:text-gray-400 transition" />
            </button>
          );
        })}
      </div>
    </div>
  );
}
