import { useState } from 'react';
import { Scan, Github, ExternalLink, ArrowLeft } from 'lucide-react';
import { ReviewForm } from './components/ReviewForm';
import { ReviewResults } from './components/ReviewResults';
import { ReviewHistory } from './components/ReviewHistory';
import { useReview } from './hooks/useReview';
import type { ReviewResult } from './utils/types';

export default function App() {
  const {
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
  } = useReview();

  const [selectedHistory, setSelectedHistory] = useState<ReviewResult | null>(null);

  const displayResult = selectedHistory || result;

  const handleBack = () => {
    setSelectedHistory(null);
    reset();
  };

  return (
    <div className="min-h-screen" style={{ background: 'var(--bg-primary)' }}>
      {/* Ambient glow */}
      <div
        className="fixed top-0 left-1/2 -translate-x-1/2 w-[600px] h-[600px] rounded-full opacity-[0.03] blur-[120px] pointer-events-none"
        style={{ background: 'var(--accent)' }}
      />

      {/* Header */}
      <header
        className="sticky top-0 z-50 backdrop-blur-xl"
        style={{ background: 'rgba(10,10,15,0.85)', borderBottom: '1px solid var(--border-subtle)' }}
      >
        <div className="max-w-5xl mx-auto px-6 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div
              className="w-7 h-7 rounded-lg flex items-center justify-center"
              style={{ background: 'var(--accent)' }}
            >
              <Scan size={15} color="#000" strokeWidth={2.5} />
            </div>
            <span className="text-sm font-semibold tracking-tight" style={{ color: 'var(--text-primary)' }}>
              CodeLens
            </span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium tracking-wide"
              style={{ color: 'var(--accent)', background: 'rgba(34,197,94,0.1)' }}
            >
              GPT ACTION
            </span>
          </div>
          <a
            href="https://github.com"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center gap-1.5 text-xs transition-colors hover:text-white"
            style={{ color: 'var(--text-muted)' }}
          >
            <Github size={14} />
            View on GitHub
            <ExternalLink size={10} />
          </a>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-5xl mx-auto px-6 py-10">
        {!displayResult ? (
          /* Input View */
          <div className="max-w-2xl mx-auto">
            {/* Hero */}
            <div className="text-center mb-10">
              <h1
                className="text-3xl font-bold tracking-tight mb-3"
                style={{ fontFamily: "'Instrument Serif', serif", color: 'var(--text-primary)', fontSize: '2.5rem' }}
              >
                AI-Powered Code Review
              </h1>
              <p className="text-sm leading-relaxed max-w-md mx-auto" style={{ color: 'var(--text-secondary)' }}>
                Paste a GitHub PR URL or code snippet. Get structured security flags,
                performance suggestions, and refactoring tips in seconds.
              </p>
            </div>

            {/* Form */}
            <div
              className="rounded-2xl p-6"
              style={{ background: 'var(--bg-secondary)', border: '1px solid var(--border)' }}
            >
              <ReviewForm
                onSubmitPR={(url) => reviewPR(url)}
                onSubmitSnippet={(code, lang) => reviewSnippet(code, lang)}
                isLoading={isLoading}
              />

              {/* Progress */}
              {isLoading && progress && (
                <div className="mt-4 flex items-center gap-3">
                  <div className="h-1 flex-1 rounded-full overflow-hidden" style={{ background: 'var(--bg-tertiary)' }}>
                    <div
                      className="h-full rounded-full transition-all duration-1000"
                      style={{
                        background: 'var(--accent)',
                        width: isStreaming ? '60%' : '80%',
                        animation: 'shimmer 1.5s infinite',
                      }}
                    />
                  </div>
                  <span className="text-xs shrink-0" style={{ color: 'var(--text-muted)' }}>
                    {progress}
                  </span>
                </div>
              )}

              {/* Error */}
              {error && (
                <div
                  className="mt-4 rounded-xl p-4 text-sm"
                  style={{ background: 'rgba(239,68,68,0.08)', border: '1px solid rgba(239,68,68,0.2)', color: '#ef4444' }}
                >
                  {error}
                </div>
              )}
            </div>

            {/* History */}
            <div className="mt-10">
              <ReviewHistory
                history={history}
                onSelect={(r) => setSelectedHistory(r)}
              />
            </div>
          </div>
        ) : (
          /* Results View */
          <div>
            <button
              onClick={handleBack}
              className="flex items-center gap-1.5 mb-6 text-sm transition-colors hover:text-white group"
              style={{ color: 'var(--text-muted)' }}
            >
              <ArrowLeft size={14} className="group-hover:-translate-x-0.5 transition-transform" />
              New Review
            </button>
            <ReviewResults result={displayResult} streamItems={streamItems} />
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="max-w-5xl mx-auto px-6 py-8 mt-10" style={{ borderTop: '1px solid var(--border-subtle)' }}>
        <div className="flex items-center justify-between text-xs" style={{ color: 'var(--text-muted)' }}>
          <span>CodeLens — Built for OpenAI GPT Action Store</span>
          <span>Powered by GPT-4o-mini + FastAPI</span>
        </div>
      </footer>
    </div>
  );
}
