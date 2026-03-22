export type Severity = 'critical' | 'high' | 'medium' | 'low' | 'info';
export type Category =
  | 'security'
  | 'performance'
  | 'bug'
  | 'style'
  | 'refactoring'
  | 'best_practice'
  | 'documentation'
  | 'error_handling'
  | 'testing';

export type OverallQuality = 'excellent' | 'good' | 'needs_improvement' | 'poor';

export interface SeverityCounts {
  critical: number;
  high: number;
  medium: number;
  low: number;
  info: number;
}

export interface ReviewItem {
  severity: Severity;
  category: Category;
  file_path?: string | null;
  line_range?: string | null;
  title: string;
  suggestion: string;
  explanation: string;
  code_before?: string | null;
  code_after?: string | null;
}

export interface ReviewResult {
  review_id: string;
  status: string;
  summary: string;
  overall_quality: OverallQuality;
  severity_counts: SeverityCounts;
  top_priority_fixes: string[];
  items: ReviewItem[];
  files_reviewed: number;
  cached: boolean;
  review_time_ms: number;
  created_at?: string;
}

export interface SSEEvent {
  event: 'start' | 'chunk_start' | 'token' | 'finding' | 'complete' | 'error' | 'done';
  data?: string;
  review_id?: string;
  files?: number;
  chunk?: number;
  total?: number;
  summary?: string;
  overall_quality?: string;
  top_priority_fixes?: string[];
  total_findings?: number;
  review_time_ms?: number;
  error?: string;
}

export interface HistoryEntry {
  id: string;
  type: 'pr' | 'snippet';
  input: string;
  result: ReviewResult;
  timestamp: Date;
}
