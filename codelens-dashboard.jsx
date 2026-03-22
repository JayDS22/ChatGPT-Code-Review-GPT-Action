import { useState, useCallback, useEffect } from "react";

// ── Types ──────────────────────────────────────────────────────────────
const SEVERITIES = ["critical", "high", "medium", "low", "info"];
const CATEGORIES = ["security", "performance", "bug", "style", "refactoring", "best_practice", "error_handling"];

const SEVERITY_CONFIG = {
  critical: { color: "#ef4444", bg: "rgba(239,68,68,0.12)", label: "Critical" },
  high: { color: "#f97316", bg: "rgba(249,115,22,0.12)", label: "High" },
  medium: { color: "#eab308", bg: "rgba(234,179,8,0.12)", label: "Medium" },
  low: { color: "#3b82f6", bg: "rgba(59,130,246,0.12)", label: "Low" },
  info: { color: "#6b7280", bg: "rgba(107,114,128,0.12)", label: "Info" },
};

const QUALITY_CONFIG = {
  excellent: { color: "#22c55e", label: "Excellent", emoji: "🏆" },
  good: { color: "#3b82f6", label: "Good", emoji: "👍" },
  needs_improvement: { color: "#eab308", label: "Needs Work", emoji: "⚠️" },
  poor: { color: "#ef4444", label: "Poor", emoji: "🚨" },
};

// ── Demo Data ──────────────────────────────────────────────────────────
const DEMO_RESULTS = {
  pr: {
    review_id: "rev_a8f3c21e9b04",
    status: "completed",
    summary: "This PR introduces authentication helpers with 1 critical command injection vulnerability in utils.py and solid SQL injection fixes in auth.py. Addressing the subprocess shell usage should be the top priority before merge.",
    overall_quality: "needs_improvement",
    severity_counts: { critical: 1, high: 1, medium: 2, low: 1, info: 2 },
    top_priority_fixes: [
      "Fix command injection in run_command() — never use shell=True with user input",
      "Add input validation to the authenticate() endpoint parameters",
      "Implement rate limiting on authentication attempts to prevent brute force",
    ],
    items: [
      {
        severity: "critical", category: "security", file_path: "src/utils.py", line_range: "4-5",
        title: "Command Injection via shell=True",
        suggestion: "Use subprocess.run() with a list of arguments and shell=False",
        explanation: "subprocess.call(cmd, shell=True) passes the command through the system shell, allowing an attacker to inject arbitrary commands via semicolons, pipes, or backticks. This is a CVSS 9.8 critical vulnerability.",
        code_before: "def run_command(cmd):\n    return subprocess.call(cmd, shell=True)",
        code_after: "def run_command(cmd: list[str]):\n    return subprocess.run(cmd, shell=False, check=True, capture_output=True)",
      },
      {
        severity: "high", category: "error_handling", file_path: "src/auth.py", line_range: "15-22",
        title: "Missing error handling for database connection failures",
        suggestion: "Wrap database calls in try/except and return appropriate HTTP error responses",
        explanation: "If the database connection drops mid-query, the current code will raise an unhandled exception that leaks internal stack traces to the client, potentially exposing sensitive configuration details.",
        code_before: "def authenticate(username, password):\n    cursor.execute(query, (username,))\n    user = cursor.fetchone()",
        code_after: "def authenticate(username, password):\n    try:\n        cursor.execute(query, (username,))\n        user = cursor.fetchone()\n    except DatabaseError as e:\n        logger.error(f\"Auth DB error: {e}\")\n        raise HTTPException(503, \"Service unavailable\")",
      },
      {
        severity: "medium", category: "performance", file_path: "src/utils.py", line_range: "12-18",
        title: "Unbounded file reading without size limit",
        suggestion: "Add a maximum file size check before reading the entire file into memory",
        explanation: "Reading files without size limits can cause out-of-memory errors when processing large files, potentially bringing down the service.",
        code_before: "def read_file(path):\n    with open(path) as f:\n        return f.read()",
        code_after: "MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB\n\ndef read_file(path):\n    size = os.path.getsize(path)\n    if size > MAX_FILE_SIZE:\n        raise ValueError(f\"File too large: {size}\")\n    with open(path) as f:\n        return f.read()",
      },
      {
        severity: "medium", category: "security", file_path: "src/auth.py", line_range: "28-30",
        title: "Plaintext password comparison",
        suggestion: "Use bcrypt or argon2 for password hashing and constant-time comparison",
        explanation: "Comparing passwords as plaintext strings is vulnerable to timing attacks and means passwords are stored in recoverable form.",
      },
      {
        severity: "low", category: "refactoring", file_path: "src/utils.py", line_range: "1-3",
        title: "Unused import: os module",
        suggestion: "Remove the unused import to keep the codebase clean",
        explanation: "Unused imports add cognitive overhead and may trigger linter warnings in CI.",
      },
      {
        severity: "info", category: "best_practice", file_path: "src/auth.py", line_range: "10-12",
        title: "Good: Parameterized SQL query",
        suggestion: "The SQL injection fix using parameterized queries looks correct. Nice work!",
        explanation: "Using cursor.execute(query, params) instead of f-strings prevents SQL injection attacks by properly escaping user input.",
      },
      {
        severity: "info", category: "style", file_path: "src/utils.py", line_range: "8",
        title: "Consider adding type hints",
        suggestion: "Add Python type annotations for better IDE support and documentation",
        explanation: "Type hints improve code maintainability and enable static analysis tools like mypy to catch bugs early.",
      },
    ],
    files_reviewed: 2,
    cached: false,
    review_time_ms: 4200,
  },
  snippet: {
    review_id: "rev_c7e2a9f14d38",
    status: "completed",
    summary: "The Express.js route handler has a critical SQL injection vulnerability through string interpolation, missing input validation, and no error handling. The authentication logic also lacks rate limiting.",
    overall_quality: "poor",
    severity_counts: { critical: 1, high: 1, medium: 1, low: 0, info: 1 },
    top_priority_fixes: [
      "Replace string interpolation in SQL query with parameterized queries",
      "Add input validation and sanitization for request parameters",
      "Implement try/catch error handling around database operations",
    ],
    items: [
      {
        severity: "critical", category: "security", line_range: "3-4",
        title: "SQL Injection via string template literal",
        suggestion: "Use parameterized queries with placeholder syntax",
        explanation: "Template literal interpolation in SQL queries allows attackers to manipulate the query structure, potentially dumping the entire database or bypassing authentication.",
        code_before: "const query = `SELECT * FROM users WHERE id = '${req.params.id}'`;\ndb.query(query);",
        code_after: "const query = 'SELECT * FROM users WHERE id = $1';\ndb.query(query, [req.params.id]);",
      },
      {
        severity: "high", category: "error_handling", line_range: "1-6",
        title: "No error handling for database operations",
        suggestion: "Wrap database calls in try/catch and return proper HTTP error responses",
        explanation: "Unhandled database errors will crash the process or leak internal error details to the client.",
        code_after: "app.get('/user/:id', async (req, res) => {\n  try {\n    const result = await db.query('SELECT * FROM users WHERE id = $1', [req.params.id]);\n    res.json(result.rows[0] ?? null);\n  } catch (err) {\n    console.error('DB error:', err);\n    res.status(500).json({ error: 'Internal server error' });\n  }\n});",
      },
      {
        severity: "medium", category: "best_practice", line_range: "2",
        title: "Missing input validation for route parameter",
        suggestion: "Validate that req.params.id is a valid format before querying",
        explanation: "Without validation, malformed input reaches the database layer, wasting resources and potentially triggering unexpected behavior.",
      },
      {
        severity: "info", category: "style", line_range: "5",
        title: "Consider using async/await pattern consistently",
        suggestion: "Use async handler with await for database calls instead of callback style",
        explanation: "Consistent async/await usage improves readability and makes error handling more straightforward with try/catch.",
      },
    ],
    files_reviewed: 1,
    cached: false,
    review_time_ms: 1800,
  },
};

const DEMO_PR_URL = "https://github.com/acme-corp/auth-service/pull/42";
const DEMO_SNIPPET = `app.get('/user/:id', (req, res) => {
  const query = \`SELECT * FROM users WHERE id = '\${req.params.id}'\`;
  db.query(query, (err, result) => {
    res.json(result.rows[0]);
  });
});`;

// ── Icons (inline SVG) ─────────────────────────────────────────────────
const Icon = ({ d, size = 16, color = "currentColor", ...props }) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" {...props}>
    <path d={d} />
  </svg>
);

const Icons = {
  scan: (p) => <Icon d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2M7 12h10M12 7v10" {...p} />,
  search: (p) => <Icon d="M11 3a8 8 0 1 0 0 16 8 8 0 0 0 0-16zM21 21l-4.35-4.35" {...p} />,
  code: (p) => <Icon d="M16 18l6-6-6-6M8 6l-6 6 6 6" {...p} />,
  pr: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke={p.color||"currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="18" cy="18" r="3"/><circle cx="6" cy="6" r="3"/><path d="M6 9v12M18 9a9 9 0 0 0-9 9"/></svg>,
  loader: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke={p.color||"currentColor"} strokeWidth={2}><path d="M21 12a9 9 0 1 1-6.219-8.56"/></svg>,
  sparkles: (p) => <Icon d="M12 2l2.09 6.26L20 10.27l-4.91 3.82L16.18 22 12 17.77 7.82 22l1.09-7.91L4 10.27l5.91-2.01L12 2z" {...p} />,
  chevDown: (p) => <Icon d="M6 9l6 6 6-6" {...p} />,
  chevRight: (p) => <Icon d="M9 18l6-6-6-6" {...p} />,
  clock: (p) => <Icon d="M12 2a10 10 0 1 0 0 20 10 10 0 0 0 0-20zM12 6v6l4 2" {...p} />,
  arrowLeft: (p) => <Icon d="M19 12H5M12 19l-7-7 7-7" {...p} />,
  shield: (p) => <Icon d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" {...p} />,
  zap: (p) => <Icon d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" {...p} />,
  bug: (p) => <Icon d="M8 2l1.88 1.88M14.12 3.88L16 2M9 7.13v-1a3 3 0 0 1 6 0v1M12 20c-3.3 0-6-2.7-6-6v-3a4 4 0 0 1 4-4h4a4 4 0 0 1 4 4v3c0 3.3-2.7 6-6 6zM6 13H2M22 13h-4" {...p} />,
  file: (p) => <Icon d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8zM14 2v6h6" {...p} />,
  check: (p) => <Icon d="M22 11.08V12a10 10 0 1 1-5.93-9.14M22 4L12 14.01l-3-3" {...p} />,
  x: (p) => <Icon d="M18 6L6 18M6 6l12 12" {...p} />,
  alert: (p) => <Icon d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0zM12 9v4M12 17h.01" {...p} />,
  info: (p) => <svg width={p.size||16} height={p.size||16} viewBox="0 0 24 24" fill="none" stroke={p.color||"currentColor"} strokeWidth={2} strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></svg>,
};

const SevIcon = ({ severity, size = 12 }) => {
  const map = { critical: Icons.x, high: Icons.alert, medium: Icons.alert, low: Icons.info, info: Icons.info };
  const C = map[severity] || Icons.info;
  return <C size={size} color={SEVERITY_CONFIG[severity]?.color} />;
};

// ── Components ─────────────────────────────────────────────────────────

function SeverityBadge({ severity }) {
  const c = SEVERITY_CONFIG[severity];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, fontSize: 11, fontWeight: 600, color: c.color, background: c.bg }}>
      <SevIcon severity={severity} />
      {c.label}
    </span>
  );
}

function CategoryBadge({ category }) {
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: "2px 8px", borderRadius: 6, fontSize: 11, color: "#9898a8", background: "#1a1a26" }}>
      {category.replace(/_/g, " ")}
    </span>
  );
}

function FindingCard({ item, index, defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div style={{ background: "#12121a", border: "1px solid #2a2a3a", borderRadius: 12, overflow: "hidden", animation: `fadeSlideUp 0.3s ease-out ${index * 60}ms both` }}>
      <button onClick={() => setOpen(!open)} style={{ width: "100%", display: "flex", alignItems: "flex-start", gap: 12, padding: 16, textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "#e8e8ed" }}>
        <div style={{ marginTop: 2 }}>
          {open ? <Icons.chevDown size={14} color="#5a5a6e" /> : <Icons.chevRight size={14} color="#5a5a6e" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap", marginBottom: 4 }}>
            <SeverityBadge severity={item.severity} />
            <CategoryBadge category={item.category} />
            {item.file_path && <span style={{ fontSize: 11, fontFamily: "'JetBrains Mono', monospace", color: "#5a5a6e" }}>{item.file_path}{item.line_range && `:${item.line_range}`}</span>}
          </div>
          <div style={{ fontSize: 13, fontWeight: 500 }}>{item.title}</div>
        </div>
      </button>
      {open && (
        <div style={{ padding: "0 16px 16px 42px" }}>
          <p style={{ fontSize: 13, lineHeight: 1.6, color: "#9898a8", marginBottom: 12 }}>{item.explanation}</p>
          <div style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.18)", borderRadius: 8, padding: 12, marginBottom: 12 }}>
            <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#22c55e", marginBottom: 4 }}>Suggestion</div>
            <div style={{ fontSize: 13, color: "#e8e8ed" }}>{item.suggestion}</div>
          </div>
          {(item.code_before || item.code_after) && (
            <div style={{ display: "grid", gridTemplateColumns: item.code_before && item.code_after ? "1fr 1fr" : "1fr", gap: 8 }}>
              {item.code_before && (
                <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(239,68,68,0.25)" }}>
                  <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, background: "rgba(239,68,68,0.08)", color: "#ef4444" }}>Before</div>
                  <pre style={{ padding: 12, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", background: "#0a0a0f", overflowX: "auto", margin: 0, color: "#e8e8ed", lineHeight: 1.5 }}>{item.code_before}</pre>
                </div>
              )}
              {item.code_after && (
                <div style={{ borderRadius: 8, overflow: "hidden", border: "1px solid rgba(34,197,94,0.25)" }}>
                  <div style={{ padding: "6px 12px", fontSize: 10, fontWeight: 700, background: "rgba(34,197,94,0.08)", color: "#22c55e" }}>After</div>
                  <pre style={{ padding: 12, fontSize: 11, fontFamily: "'JetBrains Mono', monospace", background: "#0a0a0f", overflowX: "auto", margin: 0, color: "#e8e8ed", lineHeight: 1.5 }}>{item.code_after}</pre>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ── Main App ───────────────────────────────────────────────────────────

export default function CodeLensApp() {
  const [mode, setMode] = useState("pr");
  const [prUrl, setPrUrl] = useState("");
  const [snippet, setSnippet] = useState("");
  const [language, setLanguage] = useState("auto");
  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState("");
  const [result, setResult] = useState(null);
  const [filterSev, setFilterSev] = useState("all");
  const [error, setError] = useState(null);

  const simulate = useCallback(async (type) => {
    setLoading(true);
    setError(null);
    setResult(null);
    setFilterSev("all");

    const steps = type === "pr"
      ? ["Fetching PR metadata...", "Downloading 2 file diffs...", "Reviewing chunk 1/1...", "Generating summary...", "Done!"]
      : ["Analyzing code snippet...", "Running security scan...", "Generating suggestions...", "Done!"];

    for (let i = 0; i < steps.length; i++) {
      setProgress(steps[i]);
      await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
    }

    setResult(DEMO_RESULTS[type]);
    setLoading(false);
    setProgress("");
  }, []);

  const handleSubmit = (e) => {
    e?.preventDefault?.();
    if (mode === "pr") {
      if (!prUrl.trim()) {
        // Auto-fill demo URL
        setPrUrl(DEMO_PR_URL);
        setTimeout(() => simulate("pr"), 100);
      } else {
        simulate("pr");
      }
    } else {
      if (!snippet.trim()) {
        setSnippet(DEMO_SNIPPET);
        setTimeout(() => simulate("snippet"), 100);
      } else {
        simulate("snippet");
      }
    }
  };

  const handleBack = () => {
    setResult(null);
    setFilterSev("all");
  };

  const allItems = result?.items || [];
  const filtered = filterSev === "all" ? allItems : allItems.filter(i => i.severity === filterSev);
  const quality = result ? QUALITY_CONFIG[result.overall_quality] : null;

  return (
    <div style={{ minHeight: "100vh", background: "#0a0a0f", color: "#e8e8ed", fontFamily: "'DM Sans', system-ui, sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=DM+Sans:wght@300;400;500;600;700&family=JetBrains+Mono:wght@400;500;600&family=Instrument+Serif&display=swap');
        * { box-sizing: border-box; margin: 0; padding: 0; }
        @keyframes fadeSlideUp { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
        @keyframes spin { to { transform: rotate(360deg); } }
        @keyframes shimmer { 0% { background-position: -200% 0; } 100% { background-position: 200% 0; } }
        input:focus, textarea:focus, select:focus { outline: none; box-shadow: 0 0 0 2px rgba(34,197,94,0.3); }
        ::-webkit-scrollbar { width: 5px; } ::-webkit-scrollbar-track { background: #12121a; } ::-webkit-scrollbar-thumb { background: #2a2a3a; border-radius: 3px; }
        button { font-family: inherit; }
        pre { white-space: pre-wrap; word-break: break-word; }
      `}</style>

      {/* Ambient */}
      <div style={{ position: "fixed", top: -200, left: "50%", transform: "translateX(-50%)", width: 600, height: 600, borderRadius: "50%", background: "#22c55e", opacity: 0.025, filter: "blur(120px)", pointerEvents: "none" }} />

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 50, backdropFilter: "blur(20px)", background: "rgba(10,10,15,0.85)", borderBottom: "1px solid #1e1e2e" }}>
        <div style={{ maxWidth: 900, margin: "0 auto", padding: "0 24px", height: 56, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <div style={{ width: 28, height: 28, borderRadius: 8, background: "#22c55e", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <Icons.scan size={15} color="#000" />
            </div>
            <span style={{ fontSize: 14, fontWeight: 600, letterSpacing: "-0.02em" }}>CodeLens</span>
            <span style={{ fontSize: 9, padding: "2px 6px", borderRadius: 4, fontWeight: 600, letterSpacing: "0.05em", color: "#22c55e", background: "rgba(34,197,94,0.1)" }}>GPT ACTION</span>
          </div>
          <span style={{ fontSize: 11, color: "#5a5a6e" }}>Interactive Demo</span>
        </div>
      </header>

      {/* Main */}
      <main style={{ maxWidth: 900, margin: "0 auto", padding: "40px 24px" }}>
        {!result ? (
          <div style={{ maxWidth: 640, margin: "0 auto" }}>
            {/* Hero */}
            <div style={{ textAlign: "center", marginBottom: 40 }}>
              <h1 style={{ fontFamily: "'Instrument Serif', serif", fontSize: 42, fontWeight: 400, letterSpacing: "-0.02em", marginBottom: 12 }}>AI-Powered Code Review</h1>
              <p style={{ fontSize: 14, color: "#9898a8", lineHeight: 1.6, maxWidth: 440, margin: "0 auto" }}>
                Paste a GitHub PR URL or code snippet. Get structured security flags, performance suggestions, and refactoring tips in seconds.
              </p>
            </div>

            {/* Form */}
            <div style={{ background: "#12121a", border: "1px solid #2a2a3a", borderRadius: 16, padding: 24 }}>
              {/* Mode Toggle */}
              <div style={{ display: "flex", gap: 4, padding: 4, borderRadius: 12, background: "#1a1a26", marginBottom: 24 }}>
                {[["pr", "PR Review", Icons.pr], ["snippet", "Code Snippet", Icons.code]].map(([m, label, Ic]) => (
                  <button key={m} onClick={() => setMode(m)} style={{ flex: 1, display: "flex", alignItems: "center", justifyContent: "center", gap: 8, padding: "10px 16px", borderRadius: 10, fontSize: 13, fontWeight: 500, border: "none", cursor: "pointer", transition: "all 0.2s", background: mode === m ? "#22c55e" : "transparent", color: mode === m ? "#000" : "#6b7280" }}>
                    <Ic size={15} color={mode === m ? "#000" : "#6b7280"} />
                    {label}
                  </button>
                ))}
              </div>

              <form onSubmit={handleSubmit}>
                {mode === "pr" ? (
                  <div style={{ position: "relative" }}>
                    <div style={{ position: "absolute", left: 14, top: "50%", transform: "translateY(-50%)" }}><Icons.search size={16} color="#5a5a6e" /></div>
                    <input value={prUrl} onChange={e => setPrUrl(e.target.value)} placeholder="https://github.com/owner/repo/pull/123  (leave empty for demo)" disabled={loading} style={{ width: "100%", padding: "14px 16px 14px 40px", borderRadius: 12, fontSize: 13, fontFamily: "'JetBrains Mono', monospace", background: "#1a1a26", border: "1px solid #2a2a3a", color: "#e8e8ed" }} />
                  </div>
                ) : (
                  <div>
                    <select value={language} onChange={e => setLanguage(e.target.value)} style={{ padding: "8px 12px", borderRadius: 8, fontSize: 12, background: "#1a1a26", border: "1px solid #2a2a3a", color: "#9898a8", marginBottom: 12 }}>
                      {["auto","python","javascript","typescript","go","rust","java"].map(l => <option key={l} value={l}>{l === "auto" ? "Auto-detect" : l}</option>)}
                    </select>
                    <textarea value={snippet} onChange={e => setSnippet(e.target.value)} placeholder="Paste your code here... (leave empty for demo)" rows={10} disabled={loading} style={{ width: "100%", padding: 16, borderRadius: 12, fontSize: 12, fontFamily: "'JetBrains Mono', monospace", background: "#1a1a26", border: "1px solid #2a2a3a", color: "#e8e8ed", resize: "none", lineHeight: 1.6 }} />
                  </div>
                )}

                <button type="submit" disabled={loading} style={{ width: "100%", marginTop: 16, padding: "14px 0", borderRadius: 12, fontSize: 13, fontWeight: 600, border: "none", cursor: loading ? "not-allowed" : "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8, background: loading ? "#166534" : "#22c55e", color: "#000", opacity: loading ? 0.7 : 1, transition: "all 0.2s" }}>
                  {loading ? <><span style={{ display: "inline-block", animation: "spin 1s linear infinite" }}><Icons.loader size={15} color="#000" /></span>Analyzing...</> : <><Icons.sparkles size={15} color="#000" />Run Review</>}
                </button>
              </form>

              {/* Progress */}
              {loading && progress && (
                <div style={{ marginTop: 16, display: "flex", alignItems: "center", gap: 12 }}>
                  <div style={{ flex: 1, height: 4, borderRadius: 2, background: "#1a1a26", overflow: "hidden" }}>
                    <div style={{ height: "100%", borderRadius: 2, background: "linear-gradient(90deg, #22c55e, #4ade80, #22c55e)", backgroundSize: "200% 100%", animation: "shimmer 1.5s infinite", width: "70%", transition: "width 0.5s" }} />
                  </div>
                  <span style={{ fontSize: 11, color: "#5a5a6e", flexShrink: 0 }}>{progress}</span>
                </div>
              )}

              {error && (
                <div style={{ marginTop: 16, padding: 16, borderRadius: 12, background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)", color: "#ef4444", fontSize: 13 }}>{error}</div>
              )}
            </div>

            {/* Feature cards */}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginTop: 32 }}>
              {[
                { icon: Icons.shield, label: "Security Scan", desc: "SQL injection, XSS, command injection" },
                { icon: Icons.zap, label: "Performance", desc: "Memory leaks, N+1 queries, bottlenecks" },
                { icon: Icons.bug, label: "Bug Detection", desc: "Race conditions, null refs, edge cases" },
              ].map(({ icon: Ic, label, desc }) => (
                <div key={label} style={{ padding: 16, borderRadius: 12, background: "#12121a", border: "1px solid #1e1e2e" }}>
                  <Ic size={18} color="#22c55e" />
                  <div style={{ fontSize: 12, fontWeight: 600, marginTop: 8, marginBottom: 4 }}>{label}</div>
                  <div style={{ fontSize: 11, color: "#5a5a6e", lineHeight: 1.4 }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>
        ) : (
          /* Results View */
          <div style={{ animation: "fadeSlideUp 0.4s ease-out" }}>
            <button onClick={handleBack} style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 24, background: "none", border: "none", cursor: "pointer", color: "#5a5a6e", fontSize: 13, padding: 0 }}>
              <Icons.arrowLeft size={14} /> New Review
            </button>

            {/* Summary */}
            <div style={{ background: "#12121a", border: "1px solid #2a2a3a", borderRadius: 16, padding: 24, marginBottom: 24 }}>
              <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 16 }}>
                <div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <span style={{ fontSize: 24 }}>{quality.emoji}</span>
                    <span style={{ fontSize: 18, fontWeight: 600, color: quality.color }}>{quality.label}</span>
                  </div>
                  <p style={{ fontSize: 13, lineHeight: 1.6, color: "#9898a8", maxWidth: 560 }}>{result.summary}</p>
                </div>
                <div style={{ textAlign: "right", flexShrink: 0, marginLeft: 24 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#5a5a6e" }}>
                    <Icons.clock size={12} /> {(result.review_time_ms / 1000).toFixed(1)}s
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 4, fontSize: 11, color: "#5a5a6e", marginTop: 4 }}>
                    <Icons.file size={12} /> {result.files_reviewed} files
                  </div>
                </div>
              </div>

              {/* Severity pills */}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                {Object.entries(result.severity_counts).filter(([, c]) => c > 0).map(([sev, count]) => {
                  const c = SEVERITY_CONFIG[sev];
                  return (
                    <button key={sev} onClick={() => setFilterSev(filterSev === sev ? "all" : sev)} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 14px", borderRadius: 10, background: c.bg, border: filterSev === sev ? `2px solid ${c.color}` : "2px solid transparent", cursor: "pointer", transition: "all 0.15s" }}>
                      <span style={{ fontSize: 18, fontWeight: 700, color: c.color }}>{count}</span>
                      <span style={{ fontSize: 11, color: c.color }}>{c.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Top fixes */}
              {result.top_priority_fixes.length > 0 && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: "1px solid #2a2a3a" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, color: "#5a5a6e", marginBottom: 8 }}>Top Priority Fixes</div>
                  {result.top_priority_fixes.map((fix, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, fontSize: 13, color: "#9898a8", marginBottom: 6 }}>
                      <span style={{ fontFamily: "monospace", fontWeight: 700, color: "#22c55e" }}>{i + 1}.</span>
                      {fix}
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Findings */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600 }}>Findings ({filtered.length})</div>
              {filterSev !== "all" && (
                <button onClick={() => setFilterSev("all")} style={{ fontSize: 11, color: "#22c55e", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}>Show all</button>
              )}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              {filtered.map((item, i) => (
                <FindingCard key={`${item.title}-${i}`} item={item} index={i} defaultOpen={i < 2} />
              ))}
            </div>
          </div>
        )}
      </main>

      <footer style={{ maxWidth: 900, margin: "0 auto", padding: "32px 24px", borderTop: "1px solid #1e1e2e", marginTop: 40 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11, color: "#5a5a6e" }}>
          <span>CodeLens — Built for OpenAI GPT Action Store</span>
          <span>Powered by GPT-4o-mini + FastAPI + React</span>
        </div>
      </footer>
    </div>
  );
}
