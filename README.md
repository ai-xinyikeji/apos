# APOS — AI Product Operating System

[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![Node.js](https://img.shields.io/badge/Node.js-20%2B-green.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5-blue.svg)](https://www.typescriptlang.org/)
[![Tests](https://img.shields.io/badge/Tests-161%20passing-brightgreen.svg)](https://github.com/ai-xinyikeji/apos)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](CONTRIBUTING.md)

APOS is a multi-agent AI system that automates the entire product development lifecycle — from collecting user feedback signals to generating React components and opening pull requests. It runs local-first, keeping your code and API keys on your machine, and routes LLM calls through a cost-optimizing chain (Ollama / LM Studio → cloud APIs) to minimize spend.

## Architecture

```
┌─────────────────────────────────────────────────────┐
│                     Web UI (Next.js)                 │
│   Prototypes · Insights · Pull Requests · Settings   │
└───────────────────────┬─────────────────────────────┘
                        │ HTTP / REST
┌───────────────────────▼─────────────────────────────┐
│                    API Layer                         │
│   /api/prototypes  /api/insights  /api/traces  ...   │
│   /api/v1/messages  (Claude CLI proxy)               │
└───────────────────────┬─────────────────────────────┘
                        │
┌───────────────────────▼─────────────────────────────┐
│              Agent Orchestrator (DAG)                │
│          Parallel execution · Dependency mgmt        │
└──┬──────────┬──────────┬──────────┬─────────────────┘
   │          │          │          │
┌──▼──┐  ┌───▼────┐  ┌──▼───┐  ┌──▼──────────┐
│Proto│  │Signal  │  │Review│  │  Report     │
│Build│  │Collect │  │ Bot  │  │  Generator  │
│ er  │  │  or    │  │      │  │             │
└──┬──┘  └───┬────┘  └──┬───┘  └──┬──────────┘
   │          │          │          │
┌──▼──────────▼──────────▼──────────▼──────────────────┐
│                     Data Layer                        │
│   SQLite (Drizzle)  ·  LanceDB (vectors)              │
│   LLM Router: Ollama/LM Studio → Gemini → OpenAI      │
│                       → Claude                        │
└───────────────────────────────────────────────────────┘
```

## Features

### 🤖 Agents
| Agent | What it does |
|-------|-------------|
| **ProtoBuilder** | Generates React components from text or sketch images; self-healing compiler retries up to 3× |
| **SignalCollector** | Pulls user feedback from Amplitude, Zendesk, competitor trackers, Hacker News, Reddit |
| **ReviewBot** | Automated code review with security scanning; posts comments directly to GitHub PRs |
| **ReportGenerator** | Synthesises collected signals into a weekly product insight report |

### ⚡ Performance & Cost
- **Context Compression** — AST + LLM hybrid engine, 70%+ token savings
- **Local-first LLM routing** — Ollama / LM Studio first, cloud APIs as fallback
- **Prompt Caching** — Claude cache headers cut costs 70–90%
- **Parallel DAG execution** — 50–70% faster multi-task workflows
- **Result caching** — 80%+ speedup on repeated tasks

### 🔍 RAG System
- LanceDB + Xenova Transformers (all-MiniLM-L6-v2, 384-dim)
- Automatic codebase indexing; semantic search for component reuse

### 🌐 Browser Extension
Chrome extension that integrates Google Search results into APOS as a structured data source for signal collection.

### 🔧 Integrations
- **Claude Desktop MCP** — 15 tools available inside Claude Desktop
- **Claude CLI proxy** — route CLI requests through APOS for free local inference
- **GitHub** — branch, commit, push, and PR creation are fully automated

## Quick Start

```bash
# 1. Clone
git clone https://github.com/ai-xinyikeji/apos.git
cd apos

# 2. Install dependencies
npm install

# 3. Initialise the database
npm run db:push

# 4. Configure environment
cp .env.example .env.local
# Edit .env.local — add at least one LLM API key (see below)

# 5. Start
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

### Minimum `.env.local`

```env
# Add at least one provider key
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...

# Optional — required only for PR creation
GITHUB_TOKEN=ghp_...
```

## Usage Modes

### Mode 1 — Web UI

Visit `http://localhost:3000` for the full interface: create prototypes, view signals, review PRs, and adjust settings.

### Mode 2 — Claude CLI Proxy (free) ⭐

Route every `claude` CLI call through APOS so it uses your local Ollama / LM Studio model with automatic context compression.

```bash
# One-time setup
./scripts/setup-claude-cli.sh

# Or manually add to ~/.zshrc / ~/.bashrc
export ANTHROPIC_BASE_URL=http://localhost:3000/api/v1
export ANTHROPIC_API_KEY=your_key   # still required by the CLI

source ~/.zshrc

# Then use Claude CLI as normal — inference runs locally for free
claude "Write a TypeScript function to calculate Fibonacci numbers"
```

### Mode 3 — Claude Desktop MCP

Call APOS tools (RAG search, prototype generation, code review, …) directly from Claude Desktop conversations.

```bash
./scripts/setup-claude-desktop.sh
```

Or manually add to `~/Library/Application Support/Claude/claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "apos": {
      "command": "npx",
      "args": ["tsx", "/path/to/apos/src/mcp/server.ts"],
      "env": {
        "APOS_DIR": "/path/to/apos"
      }
    }
  }
}
```

Restart Claude Desktop. The MCP tool executions use your local model, so they're free even inside paid Claude conversations.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4, shadcn/ui |
| Database | SQLite via Drizzle ORM |
| Vector DB | LanceDB |
| LLM SDK | Vercel AI SDK |
| LLM Providers | Anthropic · OpenAI · Google · Ollama · LM Studio |
| Embeddings | Xenova Transformers (local, no API key needed) |
| AST Parsing | TypeScript Compiler API, Babel Parser |
| Git | simple-git |
| Testing | Jest |

## Development Commands

```bash
npm run dev          # Start development server (port 3000)
npm run build        # Production build
npm start            # Start production server
npm run lint         # ESLint
npm test             # Run test suite

npm run db:generate  # Generate Drizzle migration files
npm run db:push      # Apply schema to the database
npm run db:studio    # Open Drizzle Studio (database GUI)
```

## Project Structure

```
apos/
├── src/
│   ├── agents/          # AI Agent implementations
│   ├── app/             # Next.js App Router pages & API routes
│   │   └── api/         # REST endpoints
│   ├── components/      # React components (shadcn/ui + features)
│   ├── lib/             # Core libraries (db, llm, rag, compression, git)
│   └── mcp/             # Claude Desktop MCP server
├── apos-extension/      # Chrome extension source
├── drizzle/             # Database migration files
└── data/                # Runtime data (SQLite + LanceDB, git-ignored)
```

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, commit message format (Conventional Commits), and the PR checklist before opening a pull request.

## License

[MIT](LICENSE) © APOS Contributors
