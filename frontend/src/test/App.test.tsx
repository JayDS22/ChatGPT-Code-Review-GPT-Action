import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import App from '../App';
import { ReviewForm } from '../components/ReviewForm';
import { ReviewResults } from '../components/ReviewResults';
import { ReviewHistory } from '../components/ReviewHistory';
import type { ReviewResult, HistoryEntry } from '../utils/types';

// ═══════════════════════════════════════════════════════════════════
// Mock data
// ═══════════════════════════════════════════════════════════════════

const mockResult: ReviewResult = {
  review_id: 'rev_test123',
  status: 'completed',
  summary: 'Found 2 issues: 1 critical security vulnerability and 1 style issue.',
  overall_quality: 'needs_improvement',
  severity_counts: { critical: 1, high: 0, medium: 0, low: 0, info: 1 },
  top_priority_fixes: ['Fix command injection in run_command()', 'Add type hints'],
  items: [
    {
      severity: 'critical',
      category: 'security',
      file_path: 'src/utils.py',
      line_range: '4-5',
      title: 'Command injection vulnerability',
      suggestion: 'Use subprocess.run with a list instead of shell=True',
      explanation: 'Using shell=True with user input is dangerous.',
      code_before: 'subprocess.call(cmd, shell=True)',
      code_after: 'subprocess.run(cmd.split(), shell=False)',
    },
    {
      severity: 'info',
      category: 'style',
      file_path: 'src/auth.py',
      line_range: '10-12',
      title: 'Good parameterized query',
      suggestion: 'Looks good, no changes needed.',
      explanation: 'Parameterized queries prevent SQL injection.',
    },
  ],
  files_reviewed: 2,
  cached: false,
  review_time_ms: 3200,
};

// ═══════════════════════════════════════════════════════════════════
// ReviewForm Tests
// ═══════════════════════════════════════════════════════════════════

describe('ReviewForm', () => {
  const onSubmitPR = vi.fn();
  const onSubmitSnippet = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders PR mode by default', () => {
    render(<ReviewForm onSubmitPR={onSubmitPR} onSubmitSnippet={onSubmitSnippet} isLoading={false} />);
    expect(screen.getByPlaceholderText(/github\.com/i)).toBeInTheDocument();
  });

  it('switches to snippet mode on click', async () => {
    render(<ReviewForm onSubmitPR={onSubmitPR} onSubmitSnippet={onSubmitSnippet} isLoading={false} />);
    await userEvent.click(screen.getByText('Code Snippet'));
    expect(screen.getByPlaceholderText(/paste your code/i)).toBeInTheDocument();
  });

  it('submits PR URL on form submit', async () => {
    render(<ReviewForm onSubmitPR={onSubmitPR} onSubmitSnippet={onSubmitSnippet} isLoading={false} />);
    const input = screen.getByPlaceholderText(/github\.com/i);
    await userEvent.type(input, 'https://github.com/owner/repo/pull/42');
    await userEvent.click(screen.getByText('Run Review'));
    expect(onSubmitPR).toHaveBeenCalledWith('https://github.com/owner/repo/pull/42');
  });

  it('submits snippet with language', async () => {
    render(<ReviewForm onSubmitPR={onSubmitPR} onSubmitSnippet={onSubmitSnippet} isLoading={false} />);
    await userEvent.click(screen.getByText('Code Snippet'));

    const textarea = screen.getByPlaceholderText(/paste your code/i);
    await userEvent.type(textarea, 'def hello(): pass');
    await userEvent.click(screen.getByText('Run Review'));
    expect(onSubmitSnippet).toHaveBeenCalledWith('def hello(): pass', 'auto');
  });

  it('disables button when loading', () => {
    render(<ReviewForm onSubmitPR={onSubmitPR} onSubmitSnippet={onSubmitSnippet} isLoading={true} />);
    expect(screen.getByText('Analyzing...')).toBeInTheDocument();
  });

  it('disables submit when PR URL is empty', () => {
    render(<ReviewForm onSubmitPR={onSubmitPR} onSubmitSnippet={onSubmitSnippet} isLoading={false} />);
    const button = screen.getByText('Run Review');
    expect(button).toBeDisabled();
  });
});

// ═══════════════════════════════════════════════════════════════════
// ReviewResults Tests
// ═══════════════════════════════════════════════════════════════════

describe('ReviewResults', () => {
  it('renders summary and quality badge', () => {
    render(<ReviewResults result={mockResult} />);
    expect(screen.getByText('Needs Work')).toBeInTheDocument();
    expect(screen.getByText(/Found 2 issues/)).toBeInTheDocument();
  });

  it('displays severity counts', () => {
    render(<ReviewResults result={mockResult} />);
    expect(screen.getByText('1')).toBeInTheDocument();
    expect(screen.getByText('Critical')).toBeInTheDocument();
  });

  it('renders top priority fixes', () => {
    render(<ReviewResults result={mockResult} />);
    expect(screen.getByText(/Fix command injection/)).toBeInTheDocument();
  });

  it('renders finding cards with code before/after', () => {
    render(<ReviewResults result={mockResult} />);
    expect(screen.getByText('Command injection vulnerability')).toBeInTheDocument();
    expect(screen.getByText(/subprocess\.call/)).toBeInTheDocument();
  });

  it('shows review time', () => {
    render(<ReviewResults result={mockResult} />);
    expect(screen.getByText('3.2s')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════
// ReviewHistory Tests
// ═══════════════════════════════════════════════════════════════════

describe('ReviewHistory', () => {
  const mockHistory: HistoryEntry[] = [
    {
      id: 'rev_1',
      type: 'pr',
      input: 'https://github.com/test/repo/pull/1',
      result: mockResult,
      timestamp: new Date(),
    },
  ];

  it('shows empty state when no history', () => {
    render(<ReviewHistory history={[]} onSelect={vi.fn()} />);
    expect(screen.getByText(/no reviews yet/i)).toBeInTheDocument();
  });

  it('renders history entries', () => {
    render(<ReviewHistory history={mockHistory} onSelect={vi.fn()} />);
    expect(screen.getByText(/test\/repo\/pull\/1/)).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════
// App Integration Test
// ═══════════════════════════════════════════════════════════════════

describe('App', () => {
  it('renders the main page with hero and form', () => {
    render(<App />);
    expect(screen.getByText('AI-Powered Code Review')).toBeInTheDocument();
    expect(screen.getByText('CodeLens')).toBeInTheDocument();
    expect(screen.getByText('Run Review')).toBeInTheDocument();
  });
});
