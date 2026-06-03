# APOS Architecture

## System Overview

APOS (AI Product Operating System) automates the product development loop:

```
User Feedback Signals → AI Analysis → Prototype Generation → Code Review → PR Merge
```

The system is local-first: all data stays on your machine (SQLite + LanceDB), and LLM calls are routed through a cost-optimizing chain that tries local models first before falling back to cloud APIs.

---

## Layered Architecture

```
┌────────────────────────────────────────────────────────────────┐
│                      Presentation Layer                        │
│   Next.js App Router · React 19 · Tailwind CSS · shadcn/ui    │
│   Pages: Dashboard / Prototypes / Insights / PRs / Settings   │
└───────────────────────────┬────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│                       API Layer                                │
│   Next.js Route Handlers (src/app/api/**)                     │
│   REST endpoints + Claude CLI proxy (/api/v1/messages)        │
└───────────────────────────┬────────────────────────────────────┘
                            │
┌───────────────────────────▼────────────────────────────────────┐
│                  Agent Orchestration Layer                     │
│   DAG scheduler · Dependency resolver · Result cache          │
│   Parallel execution engine (50-70% faster)                   │
└──┬────────────┬────────────┬──────────────┬────────────────────┘
   │            │            │              │
┌──▼──────┐ ┌──▼────────┐ ┌─▼────────┐ ┌──▼─────────────┐
│ Proto   │ │ Signal    │ │ Review   │ │ Report         │
│ Builder │ │ Collector │ │ Bot      │ │ Generator      │
└──┬──────┘ └──┬────────┘ └─┬────────┘ └──┬─────────────┘
   │            │            │              │
┌──▼────────────▼────────────▼──────────────▼────────────────────┐
│                       Service Layer                            │
│   LLM Router · RAG Engine · Git Service · Compression Engine  │
└──┬─────────────────────────────────────────────────────────────┘
   │
┌──▼────────────────────────────────────────────────────────────┐
│                   Infrastructure Layer                        │
│   SQLite (Drizzle ORM) · LanceDB · File System · GitHub API  │
│   Ollama / LM Studio / Anthropic / OpenAI / Google           │
└───────────────────────────────────────────────────────────────┘
```

---

## Agent System Design

### BaseAgent

All agents extend `BaseAgent<TInput, TOutput>`, which provides:

- **Unified LLM interface** — wraps Anthropic, OpenAI, and Google with a single `callLLM()` method
- **Automatic trace logging** — every step is persisted to `agent_traces`
- **Structured error handling** — exceptions are caught, logged, and surfaced to the UI
- **Generic type safety** — input/output shapes are enforced at compile time

```typescript
abstract class BaseAgent<TInput, TOutput> {
  abstract name: string;
  abstract run(input: TInput, runId: string): Promise<TOutput>;

  protected callLLM(prompt: string, options?: LLMOptions): Promise<string>
  protected trace(runId: string, step: string, status: TraceStatus, message: string, details?: object): Promise<void>
  protected getLLMConfig(): Promise<LLMConfig>
}
```

---

### ProtoBuilder Agent

Generates React/TypeScript components from a natural-language description (optionally with a sketch image) and opens a GitHub PR.

**Flow:**

```
Input: { prototypeId, name, description, branchName, image?, assessOnly? }
       │
       ▼
┌─────────────────────────────────────────┐
│ 1. Feasibility Assessment (optional)    │
│    • Read existing UI component list    │
│    • LLM analyses technical viability   │
│    • Output: Markdown report            │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 2. RAG Code Retrieval                   │
│    • Index src/ into LanceDB            │
│    • Semantic search for similar code   │
│    • Inject top-K chunks into prompt    │
│    • Compress RAG context if > 5 KB     │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 3. Code Generation                      │
│    • Multi-modal prompt (text + image)  │
│    • LLM returns JSON { files: [...] }  │
│    • Write files to disk                │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 4. Self-Healing Compilation             │
│    • Run `npm run build`                │
│    • On error: send diff to LLM         │
│    • LLM patches the code              │
│    • Retry up to 3×                    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 5. Git Workflow                         │
│    • Create feature branch              │
│    • Commit & push                      │
│    • Create GitHub Pull Request         │
└────────────────┬────────────────────────┘
                 │
                 ▼
Output: { success, prUrl?, error? }
```

---

### SignalCollector Agent

Collects user feedback from multiple sources and stores signals for analysis.

**Flow:**

```
Input: { sources?: ['amplitude', 'zendesk', 'competitor', 'hackernews', 'reddit'] }
       │
       ▼
┌─────────────────────────────────────────┐
│ 1. Per-source signal generation         │
│    • Build source-specific prompt       │
│    • callLLM() → JSON array of signals  │
│    • 3-strategy JSON extraction         │
│      (direct parse → regex → LLM fix)   │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 2. Persist to database                  │
│    • Insert into signals table          │
│    • Set status = 'pending'             │
│    • Record sentiment analysis          │
└────────────────┬────────────────────────┘
                 │
                 ▼
Output: { success, count }
```

---

### ReviewBot Agent

Runs an automated security and quality review against any open PR.

**Flow:**

```
Input: { prototypeId, branchName, prNumber? }
       │
       ▼
┌─────────────────────────────────────────┐
│ 1. Get Git Diff                         │
│    • Determine base branch              │
│    • `git diff main...branchName`       │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 2. LLM Review                           │
│    Security: direct DB writes, hardcoded│
│              secrets, unauth API access │
│    Quality:  hooks, imports, console    │
│    UI:       design system consistency  │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 3. Post GitHub Comment (if token set)   │
│    • GitHub API → PR review comment     │
└────────────────┬────────────────────────┘
                 │
                 ▼
Output: { success, report: string, error? }
```

---

### ReportGenerator Agent

Synthesises all pending signals into a Markdown weekly report.

**Flow:**

```
Input: none (reads from database automatically)
       │
       ▼
┌─────────────────────────────────────────┐
│ 1. Load pending signals                 │
│    • Query signals WHERE status=pending │
│    • Group by source                    │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 2. Generate report                      │
│    • LLM identifies trends & insights   │
│    • Output: structured Markdown        │
└────────────────┬────────────────────────┘
                 │
                 ▼
┌─────────────────────────────────────────┐
│ 3. Persist                              │
│    • Write to data/reports/weekly-*.md  │
│    • Mark signals as 'analyzed'         │
└────────────────┬────────────────────────┘
                 │
                 ▼
Output: { success, report: string, filename: string }
```

---

## RAG System Architecture

```
┌──────────────────────────────────────────────────┐
│                  Source Files                    │
│     src/**/*.ts  src/**/*.tsx  src/**/*.js       │
└─────────────────────┬────────────────────────────┘
                      │ Chunk (60 lines, 15-line overlap)
                      ▼
┌──────────────────────────────────────────────────┐
│            Embedding (local, no API)             │
│    Xenova/all-MiniLM-L6-v2  →  384-dim vector   │
└─────────────────────┬────────────────────────────┘
                      │ Upsert
                      ▼
┌──────────────────────────────────────────────────┐
│                  LanceDB                         │
│   Table: code_chunks                             │
│   Fields: vector · text · filePath · startLine  │
└─────────────────────┬────────────────────────────┘
                      │ Cosine similarity search
                      ▼
┌──────────────────────────────────────────────────┐
│           Retrieval (top-K = 3 default)          │
│   → Inject into LLM prompt                      │
└──────────────────────────────────────────────────┘
```

All embedding and retrieval happen in-process — no external API call, no cost.

---

## Context Compression Engine

Reduces tokens sent to LLMs by 70%+ using a two-path hybrid approach.

```
                    Input Code Block
                          │
                ┌─────────▼──────────┐
                │  Language detect   │
                └─────────┬──────────┘
                          │
            ┌─────────────┴──────────────┐
            │                            │
     TypeScript / JS                Other langs
            │                            │
  ┌─────────▼──────────┐       ┌─────────▼──────────┐
  │    AST Path        │       │    LLM Path        │
  │                    │       │                    │
  │ TS Compiler API    │       │ Local LM Studio    │
  │ or Babel Parser    │       │ model              │
  │                    │       │                    │
  │ Extracts:          │       │ Summarises while   │
  │  • Function sigs   │       │ preserving API     │
  │  • Class defs      │       │ surface            │
  │  • Interfaces      │       │                    │
  │  • Import/export   │       │ < 2 s              │
  │  • TODO comments   │       └─────────┬──────────┘
  │                    │                 │
  │ < 50 ms            │                 │
  └─────────┬──────────┘                 │
            └─────────────┬──────────────┘
                          │
                ┌─────────▼──────────┐
                │ Compressed context │
                │   70%+ smaller     │
                └────────────────────┘
```

**Compression levels:**

| Level | Trigger threshold | Target tokens | Typical reduction |
|-------|------------------|---------------|-------------------|
| light | > 10,000 chars | 4,096 | ~50% |
| medium | > 5,000 chars | 2,048 | ~70% |
| aggressive | > 2,000 chars | 1,024 | ~85% |

**Integration points:**
1. Claude CLI proxy (`/api/v1/messages`) — transparent, automatic
2. ProtoBuilder RAG context — compresses retrieved code before injecting into prompt

Compression failures are non-fatal: the engine falls back to the original content silently.

---

## Database Schema (ER Diagram)

```
┌──────────────┐
│   settings   │
├──────────────┤
│ id      PK   │
│ key     UK   │──── string (e.g. "llm_provider", "anthropic_api_key")
│ value        │
│ created_at   │
│ updated_at   │
└──────────────┘

┌──────────────────────┐
│       signals        │
├──────────────────────┤
│ id           PK      │
│ source       ─────── │── 'amplitude' | 'zendesk' | 'competitor'
│ title                │   'hackernews' | 'reddit'
│ content              │
│ url                  │
│ status       ─────── │── 'pending' | 'analyzed' | 'archived'
│ sentiment    ─────── │── 'positive' | 'neutral' | 'negative'
│ created_at           │
│ updated_at           │
└──────────────────────┘

┌───────────────────────────┐
│        prototypes         │
├───────────────────────────┤
│ id                 PK     │
│ name                      │
│ description               │
│ branch_name               │
│ status             ────── │── 'draft' | 'assessing' | 'generating'
│ code_path                 │   'generated' | 'pr_created'
│ preview_url               │   'merged' | 'failed'
│ commit_hash               │
│ pr_number                 │
│ pr_url                    │
│ feasibility_report        │
│ created_at                │
│ updated_at                │
└───────────────────────────┘

┌──────────────────────┐
│    agent_traces      │
├──────────────────────┤
│ id           PK      │
│ agent_name   ─────── │── 'ProtoBuilder' | 'ReviewBot' | ...
│ run_id       ─────── │── UUID (groups one agent execution)
│ step                 │
│ status       ─────── │── 'info' | 'success' | 'warning' | 'error'
│ message              │
│ details              │── JSON string (token counts, PR URLs, etc.)
│ created_at           │
└──────────────────────┘
```

---

## Prototype Lifecycle (State Machine)

```
                      ┌────────┐
                      │ draft  │◄─────────────────────┐
                      └───┬────┘                      │
                          │                           │
          ┌───────────────┼────────────────┐          │
          │               │                │          │
   assessOnly=true   assessOnly=false       │          │
          │               │                │          │
          ▼               ▼                │      (retry)
     ┌──────────┐   ┌───────────┐          │          │
     │assessing │   │generating │          │          │
     └─────┬────┘   └─────┬─────┘          │          │
           │              │                │          │
    (done) │              ├── no GitHub ──►│          │
           │              │    token       │          │
           ▼              │                ▼          │
         draft            │          ┌───────────┐   │
    (report saved         │          │ generated │   │
      to prototype)       │                      │   │
                          │ (PR created)          │   │
                          ▼                       │   │
                   ┌────────────┐                 │   │
                   │ pr_created │                 │   │
                   └─────┬──────┘                 │   │
                         │                        │   │
                ┌────────┴────────┐               │   │
                │                 │               │   │
                ▼                 ▼               │   │
           ┌────────┐        ┌────────┐           │   │
           │ merged │        │ failed │───────────┘   │
           └────────┘        └────────┘               │
                                  │                   │
                                  └───────────────────┘
```

---

## Browser Extension Architecture

The Chrome extension serves as a companion tool that integrates Google Search results into APOS. It parses AI Overview content and structured search results directly from the Google Search page DOM, then stores them as product signals — no LLM call required for this data source.

```
APOS Server
        │
        │  Dispatches 'google' search task
        ▼
┌───────────────────────────────────────────────┐
│             ExtProxyStore                     │
│   Task queue + result streaming               │
└───────────────────────────────────────────────┘
        │
        │  Extension polls for pending tasks
        ▼
┌───────────────────────────────────────────────┐
│        Chrome Extension (background.js)       │
│   Receives task from APOS server              │
│   Injects google-search-hook.js into tab      │
└───────────────────────────────────────────────┘
        │
        │  Content script runs on google.com/search
        ▼
┌───────────────────────────────────────────────┐
│        google-search-hook.js (MAIN world)     │
│   Waits for page render                       │
│   Extracts AI Overview + search results       │
│   Returns structured JSON to APOS             │
└───────────────────────────────────────────────┘
        │
        ▼
┌───────────────────────────────────────────────┐
│   Extension UI  (popup.html / popup.js)       │
│   • Connection status indicator               │
│   • Google Search test button                 │
│   • APOS server health display                │
└───────────────────────────────────────────────┘
```

The extension uses four DOM parsing strategies (in priority order) to reliably extract AI Overview content:

| Strategy | Selector | Reliability |
|----------|----------|-------------|
| 1 | `[data-attrid="ai_overview"]` | High — official attribute |
| 2 | `[data-citation]` ancestor traversal | Medium — citation-based |
| 3 | `.WaaZC` class | Low — obfuscated, may change |
| 4 | Text-length heuristic on `[data-hveid]` blocks | Medium — language-agnostic fallback |

---

## LLM Routing Strategy

APOS routes each request through a priority chain. Local models are tried first to minimise API spend; cloud APIs are used as fallback.

```
Request arrives
      │
      ▼
Is Ollama running?  ──Yes──► Use Ollama (local, no API cost)
      │ No
      ▼
Is LM Studio running? ──Yes──► Use LM Studio (local, no API cost)
      │ No
      ▼
Is Google API key set? ──Yes──► Use Gemini Flash (low cost)
      │ No
      ▼
Is DeepSeek key set? ──Yes──► Use DeepSeek (low cost)
      │ No
      ▼
Is OpenAI key set? ──Yes──► Use GPT-4o-mini
      │ No
      ▼
Use Claude Sonnet (quality fallback)
```

On HTTP 404 / model-not-found errors, the router automatically advances to the next tier.

---

## Security Considerations

| Threat | Mitigation |
|--------|-----------|
| Path traversal via LLM-generated code | Validate all write paths against `process.cwd()` before writing |
| Hardcoded secrets in generated code | ReviewBot scans every diff for secret patterns |
| Unauthorised API access | App currently assumes single local user; add auth before exposing over a network |
| Dependency vulnerabilities | Run `npm audit` regularly; pin dependency versions |
| LLM prompt injection | Treat all LLM output as untrusted; validate JSON schema before use |
| API key exposure | Keys stored in SQLite locally; masked in API responses; never committed to Git |

---

## Performance Optimisations

| Area | Technique | Benefit |
|------|-----------|---------|
| LLM calls | Prompt caching (Claude cache headers) | 70–90% cost reduction |
| LLM calls | Context compression (AST + LLM) | 70%+ token savings |
| Agent execution | DAG-based parallel scheduling | 50–70% faster |
| Repeated tasks | In-memory result cache with TTL | 80%+ speedup |
| RAG | Xenova model kept in memory after first load | No reload overhead |
| RAG | Incremental indexing (only changed files) | Fast subsequent runs |
| Frontend | Next.js Server Components by default | Minimal client JS |
| Frontend | Tailwind CSS JIT | Smallest possible CSS bundle |
| Database | Index on `agent_traces.run_id` | Fast log polling |

---

## Directory Reference

```
apos/
├── src/
│   ├── agents/
│   │   ├── base.ts               # BaseAgent abstract class
│   │   ├── proto-builder.ts      # ProtoBuilderAgent
│   │   ├── signal-collector.ts   # SignalCollectorAgent
│   │   ├── review-bot.ts         # ReviewBotAgent
│   │   └── report-generator.ts   # ReportGeneratorAgent
│   ├── app/
│   │   ├── api/
│   │   │   ├── compression/      # POST /compress, GET /stats
│   │   │   ├── insights/         # GET/POST, /report
│   │   │   ├── orchestrator/     # POST (DAG workflow)
│   │   │   ├── prototypes/       # GET/POST, /run
│   │   │   ├── pull-requests/    # GET, /review
│   │   │   ├── settings/         # GET/POST, /status
│   │   │   ├── traces/           # GET ?runId=
│   │   │   ├── growth/           # POST /optimize
│   │   │   └── v1/messages/      # Claude CLI proxy
│   │   ├── prototypes/           # Prototype management UI
│   │   ├── insights/             # Insights centre UI
│   │   ├── pull-requests/        # PR management UI
│   │   └── settings/             # Settings UI
│   ├── components/
│   │   └── ui/                   # shadcn/ui components
│   └── lib/
│       ├── compression.ts        # Context compression engine
│       ├── db.ts                 # Database connection
│       ├── git.ts                # Git operations
│       ├── llm.ts                # LLM router
│       ├── rag.ts                # RAG engine
│       └── schema.ts             # Drizzle ORM schema
├── apos-extension/               # Chrome extension
│   ├── manifest.json
│   ├── background.js
│   ├── content.js
│   ├── popup.html / popup.js
│   ├── chatgpt-hook.js
│   ├── gemini-hook.js
│   ├── kimi-hook.js
│   └── google-search-hook.js
├── drizzle/                      # Migration files
└── data/                         # Runtime data (git-ignored)
    ├── apos.db                   # SQLite database
    ├── vectordb/                 # LanceDB tables
    └── reports/                  # Generated weekly reports
```
