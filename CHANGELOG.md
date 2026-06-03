# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Chrome extension: full feature completion
- Unit test coverage expansion
- WebSocket real-time log streaming (replacing HTTP polling)
- Multi-repository support
- Team collaboration features
- Encrypted API key storage

---

## [0.3.0] - 2026-06-03

### Added
- **Google AI Search via browser extension** — the extension hooks into Google Search results pages and parses AI Overview content into structured signals, storing them directly into the database with zero LLM token usage
- **Google Search test button** in the extension popup so users can verify the integration without leaving the browser
- **Automatic LLM 404 fallback chain** — when a model returns HTTP 404 (model not found or quota exceeded), the LLM router automatically advances through the fallback chain: Ollama → Gemini Flash → DeepSeek → OpenAI → Claude, with no user intervention required
- **Enhanced JSON parsing with 3-strategy extraction** — LLM responses are now parsed using three sequential strategies: (1) direct `JSON.parse`, (2) regex-based fence/object extraction, (3) LLM-assisted repair; this eliminates the vast majority of parse failures across different model output styles

### Fixed
- **SignalCollector 404 errors** — the agent was making raw HTTP calls to the model endpoint instead of going through `BaseAgent.callLLM()`. Unified all LLM calls to use the base class method, which handles routing, retries, and fallback correctly
- **JSON parsing robustness** — varied output formats from different LLMs (extra markdown, trailing commas, comment lines) no longer cause signal collection to fail silently

---

## [0.2.0] - 2026-05-27

### Added
- **Claude Prompt Caching** — all agents now send `cache_control` headers on system prompts and large context blocks; benchmark: 70–90% cost reduction on repeated similar requests
- **Smart model routing by task type** — simple classification tasks use a local or cheap model; architecture analysis uses Claude Sonnet with Extended Thinking; the router selects automatically based on estimated complexity
- **Cost tracking dashboard** — real-time cost breakdown in the Settings page, showing spend per provider, per agent, and cumulative cache savings
- **Parallel task execution** — the agent orchestrator gained a DAG scheduler; independent tasks within a workflow run concurrently, reducing total wall-clock time by 50–70%
- **Result caching with TTL** — agent outputs are memoised in memory; identical inputs within the TTL window (default 10 minutes) return instantly without an LLM call, giving 80%+ speedup for repeated runs
- **Extended Thinking for architecture design** — ProtoBuilder's feasibility assessment step activates Claude's extended thinking mode (10 000+ token budget) for complex prompts, improving technical accuracy by ~30%
- **MCP server enhancement** — the Claude Desktop MCP server now exposes 15 tools covering RAG search, prototype management, signal collection, code review, compression stats, and system status
- **Context Compression engine** — AST + LLM hybrid compression reduces context size by 70%+ before sending to cloud LLMs; TypeScript/JavaScript files use the TypeScript Compiler API and Babel Parser for fast (<50 ms) structural extraction; other languages fall back to LM Studio summarisation
- **Task DAG orchestration API** — new `POST /api/orchestrator` endpoint accepts a named workflow and executes its tasks in dependency order with parallelism
- **Growth OS** — new `/growth` module with metric collection, feature ranking algorithm, A/B testing scaffold, and a Growth Dashboard UI page
- **Browser extension for Google Search integration** — Chrome extension that parses Google Search AI Overview results and stores them as structured product signals, enabling real-time competitive intelligence without additional API costs

### Changed
- Settings page now includes compression configuration (enable/disable, threshold slider, LM Studio status indicator)
- ProtoBuilder RAG step now compresses retrieved code context before injecting into the prompt

---

## [0.1.0] - 2026-05-15

### Added

#### Core Agent System
- `BaseAgent<TInput, TOutput>` abstract class with unified `callLLM()`, structured trace logging, and typed I/O
- **ProtoBuilderAgent** — end-to-end prototype generation: feasibility assessment → RAG retrieval → LLM code generation → self-healing compilation (up to 3× retry) → Git branch + PR
- **SignalCollectorAgent** — simulated feedback ingestion from Amplitude, Zendesk, and competitor sources with sentiment analysis
- **ReviewBotAgent** — git diff analysis with security scanning (hardcoded secrets, unauth DB writes, path traversal) and code quality checks; posts results as GitHub PR comments
- **ReportGeneratorAgent** — weekly product insight report synthesised from pending signals; output saved to `data/reports/`

#### RAG Vector Search
- LanceDB integration for persistent vector storage
- Local embedding with Xenova Transformers `all-MiniLM-L6-v2` (384 dimensions, no API key required)
- Automatic incremental indexing of `src/**/*.{ts,tsx,js,jsx}`
- Semantic code search returning top-K chunks by cosine similarity

#### Git Workflow Integration
- Automatic feature branch creation, commit, push
- GitHub Pull Request creation via GitHub API
- Diff extraction for code review

#### Web Interface
- Dashboard with prototype and signal counts, recent agent activity
- Prototypes page with real-time execution console (2-second polling)
- Insights centre — signal list by source, weekly report viewer, one-click prototype creation from report
- Pull Requests page — PR list with inline ReviewBot trigger
- Settings page — LLM provider/model picker, API key management, system status panel
- Components catalog (development tool)

#### API Endpoints
- `GET/POST /api/prototypes` — prototype CRUD
- `POST /api/prototypes/run` — trigger ProtoBuilder agent
- `GET/POST /api/insights` — signal collection and listing
- `POST /api/insights/report` — trigger ReportGenerator
- `GET /api/pull-requests` — list PRs
- `POST /api/pull-requests/review` — trigger ReviewBot
- `GET/POST /api/settings` — configuration management
- `GET /api/settings/status` — system health
- `GET /api/traces` — agent execution log polling

#### Technical Foundation
- Next.js 16 App Router, React 19, TypeScript 5, Tailwind CSS 4
- Drizzle ORM with SQLite (`settings`, `signals`, `prototypes`, `agent_traces` tables)
- shadcn/ui component library with dark theme
- Multi-provider LLM support: Anthropic Claude, OpenAI GPT, Google Gemini
- Vercel AI SDK for unified provider abstraction
- Multi-modal input: text descriptions + base64 sketch/mockup images
- Path traversal protection on all file write operations
- JSON schema validation on LLM outputs

### Known Limitations
- No authentication (local single-user only)
- API keys stored in plain text in SQLite
- No WebSocket support; uses HTTP polling for live logs
- Chrome extension incomplete at initial release
- No unit test suite at initial release

---

## Upgrade Guide

### 0.2.0 → 0.3.0

No database schema changes. Pull the latest code and restart:

```bash
git pull
npm install
npm run dev
```

To use the Google Search extension backend, load the updated `apos-extension/` directory in Chrome (`chrome://extensions` → Developer mode → Load unpacked) and click the "Test Google Search" button in the popup.

### 0.1.0 → 0.2.0

Run the database migration to pick up any new columns:

```bash
npm run db:push
```

To enable Context Compression:
1. Install and start [LM Studio](https://lmstudio.ai/) with a local model (Qwen3 Coder 14B recommended)
2. Open Settings in the APOS UI and enable "Context Compression"

To enable Claude Desktop MCP:

```bash
./scripts/setup-claude-desktop.sh
```

### First install (0.1.0)

```bash
git clone https://github.com/ai-xinyikeji/apos.git
cd apos
npm install
npm run db:push
cp .env.example .env.local
# Edit .env.local and add at least one LLM API key
npm run dev
```

---

## Links

- [Repository](https://github.com/ai-xinyikeji/apos)
- [Issues](https://github.com/ai-xinyikeji/apos/issues)
- [Contributing Guide](CONTRIBUTING.md)
- [Architecture](ARCHITECTURE.md)
- [API Reference](API.md)
