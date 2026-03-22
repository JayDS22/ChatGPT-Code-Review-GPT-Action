import { useState } from 'react';
import {
  AlertTriangle, ShieldAlert, Bug, Zap, Paintbrush,
  BookOpen, ChevronDown, ChevronRight, Clock, FileCode,
  CheckCircle2, XCircle, AlertCircle, Info, Wrench
} from 'lucide-react';
import type { ReviewResult, ReviewItem, Severity, Category } from '../utils/types';

interface ReviewResultsProps {
  result: ReviewResult;
  streamItems?: ReviewItem[];
}

const SEVERITY_CONFIG: Record<Severity, { color: string; bg: string; icon: typeof AlertTriangle; label: string }> = {
  critical: { color: '#ef4444', bg: 'rgba(239,68,68,0.12)', icon: XCircle, label: 'Critical' },
  high:     { color: '#f97316', bg: 'rgba(249,115,22,0.12)', icon: AlertTriangle, label: 'High' },
  medium:   { color: '#eab308', bg: 'rgba(234,179,8,0.12)', icon: AlertCircle, label: 'Medium' },
  low:      { color: '#3b82f6', bg: 'rgba(59,130,246,0.12)', icon: Info, label: 'Low' },
  info:     { color: '#6b7280', bg: 'rgba(107,114,128,0.12)', icon: Info, label: 'Info' },
};

const CATEGORY_ICONS: Record<Category, typeof ShieldAlert> = {
  security: ShieldAlert,
  performance: Zap,
  bug: Bug,
  style: Paintbrush,
  refactoring: Wrench,
  best_practice: CheckCircle2,
  documentation: BookOpen,
  error_handling: AlertTriangle,
  testing: FileCode,
};

const QUALITY_CONFIG: Record<string, { color: string; label: string; emoji: string }> = {
  excellent:         { color: '#22c55e', label: 'Excellent', emoji: '🏆' },
  good:              { color: '#3b82f6', label: 'Good', emoji: '👍' },
  needs_improvement: { color: '#eab308', label: 'Needs Work', emoji: '⚠️' },
  poor:              { color: '#ef4444', label: 'Poor', emoji: '🚨' },
};

function SeverityBadge({ severity }: { severity: Severity }) {
  const config = SEVERITY_CONFIG[severity];
  const Icon = config.icon;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-semibold"
      style={{ color: config.color, background: config.bg }}
    >
      <Icon size={12} />
      {config.label}
    </span>
  );
}

function CategoryBadge({ category }: { category: Category }) {
  const Icon = CATEGORY_ICONS[category] || Info;
  return (
    <span
      className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs"
      style={{ color: 'var(--text-secondary)', background: 'var(--bg-tertiary)' }}
    >
      <Icon size={11} />
      {category.replace('_', ' ')}
    </span>
  );
}

function FindingCard({ item, index }: { item: ReviewItem; index: number }) {
  const [expanded, setExpanded] = useState(index < 3);

  return (
    <div
      className="rounded-xl overflow-hidden transition-all duration-200 animate-slide-up"
      style={{
        background: 'var(--bg-secondary)',
        border: `1px solid var(--border)`,
        animationDelay: `${index * 50}ms`,
      }}
    >
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-start gap-3 p-4 text-left hover:brightness-110 transition-all"
      >
        <div className="mt-0.5">
          {expanded ? <ChevronDown size={14} className="text-gray-500" /> : <ChevronRight size={14} className="text-gray-500" />}
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap mb-1">
            <SeverityBadge severity={item.severity} />
            <CategoryBadge category={item.category} />
            {item.file_path && (
              <span className="text-xs font-mono" style={{ color: 'var(--text-muted)' }}>
                {item.file_path}
                {item.line_range && `:${item.line_range}`}
              </span>
            )}
          </div>
          <h4 className="text-sm font-medium" style={{ color: 'var(--text-primary)' }}>
            {item.title}
          </h4>
        </div>
      </button>

      {expanded && (
        <div className="px-4 pb-4 pl-11 space-y-3">
          <p className="text-sm leading-relaxed" style={{ color: 'var(--text-secondary)' }}>
            {item.explanation}
          </p>

          <div
            className="rounded-lg p-3 text-sm"
            style={{ background: 'rgba(34,197,94,0.08)', border: '1px solid rgba(34,197,94,0.2)' }}
          >
            <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: 'var(--accent)' }}>
              Suggestion
            </span>
            <p className="mt-1" style={{ color: 'var(--text-primary)' }}>{item.suggestion}</p>
          </div>

          {(item.code_before || item.code_after) && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
              {item.code_before && (
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(239,68,68,0.3)' }}>
                  <div className="px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(239,68,68,0.1)', color: '#ef4444' }}>
                    Before
                  </div>
                  <pre className="p-3 text-xs overflow-x-auto" style={{ background: 'var(--bg-primary)' }}>
                    <code>{item.code_before}</code>
                  </pre>
                </div>
              )}
              {item.code_after && (
                <div className="rounded-lg overflow-hidden" style={{ border: '1px solid rgba(34,197,94,0.3)' }}>
                  <div className="px-3 py-1.5 text-xs font-semibold" style={{ background: 'rgba(34,197,94,0.1)', color: '#22c55e' }}>
                    After
                  </div>
                  <pre className="p-3 text-xs overflow-x-auto" style={{ background: 'var(--bg-primary)' }}>
                    <code>{item.code_after}</code>
                  </pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export function ReviewResults({ result, streamItems = [] }: ReviewResultsProps) {
  const allItems = result.items.length > 0 ? result.items : streamItems;
  const quality = QUALITY_CONFIG[result.overall_quality] || QUALITY_CONFIG.good;
  const [filterSeverity, setFilterSeverity] = useState<Severity | 'all'>('all');

  const filteredItems = filterSeverity === 'all'
    ? allItems
    : allItems.filter(i => i.severity === filterSeverity);

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Summary Header */}
      <div className="rounded-2xl p-6" style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}>
        <div className="flex items-start justify-between mb-4">
          <div>
            <div className="flex items-center gap-2 mb-2">
              <span className="text-2xl">{quality.emoji}</span>
              <span className="text-lg font-semibold" style={{ color: quality.color }}>
                {quality.label}
              </span>
            </div>
            <p className="text-sm leading-relaxed max-w-2xl" style={{ color: 'var(--text-secondary)' }}>
              {result.summary}
            </p>
          </div>
          <div className="text-right shrink-0 ml-6">
            <div className="flex items-center gap-1 text-xs" style={{ color: 'var(--text-muted)' }}>
              <Clock size={12} />
              {(result.review_time_ms / 1000).toFixed(1)}s
            </div>
            {result.cached && (
              <span className="text-xs px-2 py-0.5 rounded-md mt-1 inline-block" style={{ color: 'var(--accent)', background: 'rgba(34,197,94,0.1)' }}>
                Cached
              </span>
            )}
          </div>
        </div>

        {/* Severity Counts */}
        <div className="flex gap-3 flex-wrap">
          {(Object.entries(result.severity_counts) as [Severity, number][]).map(([sev, count]) => {
            if (count === 0) return null;
            const config = SEVERITY_CONFIG[sev];
            return (
              <div
                key={sev}
                className="flex items-center gap-2 px-3 py-1.5 rounded-lg cursor-pointer hover:brightness-125 transition"
                style={{ background: config.bg }}
                onClick={() => setFilterSeverity(filterSeverity === sev ? 'all' : sev)}
              >
                <span className="text-lg font-bold" style={{ color: config.color }}>{count}</span>
                <span className="text-xs" style={{ color: config.color }}>{config.label}</span>
              </div>
            );
          })}
        </div>

        {/* Top Fixes */}
        {result.top_priority_fixes.length > 0 && (
          <div className="mt-4 pt-4" style={{ borderTop: '1px solid var(--border)' }}>
            <h4 className="text-xs font-semibold uppercase tracking-wider mb-2" style={{ color: 'var(--text-muted)' }}>
              Top Priority Fixes
            </h4>
            <ol className="space-y-1.5">
              {result.top_priority_fixes.map((fix, i) => (
                <li key={i} className="flex items-start gap-2 text-sm" style={{ color: 'var(--text-secondary)' }}>
                  <span className="font-mono font-bold shrink-0" style={{ color: 'var(--accent)' }}>{i + 1}.</span>
                  {fix}
                </li>
              ))}
            </ol>
          </div>
        )}
      </div>

      {/* Findings List */}
      <div className="space-y-2">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold" style={{ color: 'var(--text-primary)' }}>
            Findings ({filteredItems.length})
          </h3>
          {filterSeverity !== 'all' && (
            <button
              onClick={() => setFilterSeverity('all')}
              className="text-xs underline"
              style={{ color: 'var(--accent)' }}
            >
              Show all
            </button>
          )}
        </div>
        {filteredItems.map((item, i) => (
          <FindingCard key={`${item.title}-${i}`} item={item} index={i} />
        ))}
      </div>
    </div>
  );
}
