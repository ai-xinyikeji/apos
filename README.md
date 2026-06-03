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
│   SQLite (Drizzle ORM)  ·  LanceDB (vector store)     │
│   LLM Router: Ollama → Gemini → OpenAI → Anthropic    │
└───────────────────────────────────────────────────────┘
```

## Features

### 🤖 AI Agents

| Agent | What it does |
|-------|-------------|
| **ProtoBuilder** | Generates complete React components from text descriptions or sketch images; includes a self-healing compiler that auto-fixes TypeScript errors up to 3× |
| **SignalCollector** | Aggregates user feedback from Amplitude, Zendesk, competitor trackers, Hacker News, and Reddit into structured signals |
| **ReviewBot** | Automated code review with security scanning (path traversal, hardcoded secrets, unauth DB writes); posts results as GitHub PR comments |
| **ReportGenerator** | Synthesises collected signals into a weekly Markdown product insight report |

### ⚡ Performance & Cost Optimization

- **Context Compression** — AST + LLM hybrid engine reduces token usage by 70%+
- **Local-first LLM routing** — Ollama / LM Studio tried first, cloud APIs as fallback
- **Parallel DAG execution** — independent agent tasks run concurrently, 50–70% faster
- **Result caching** — memoises agent outputs with TTL, 80%+ speedup on repeated runs
- **Smart model routing** — selects model tier based on task complexity

### 🔍 RAG-Powered Code Search

- **LanceDB** vector store with **Xenova Transformers** embeddings (all-MiniLM-L6-v2, 384-dim, fully local)
- Automatically indexes your codebase; ProtoBuilder retrieves relevant components before generating new code
- No external embedding API required

### 🌐 Google Search Signal Integration

Chrome extension that parses Google Search AI Overview results and injects them as structured product signals — no additional API cost for this data source.

### � GitHub Integration

Fully automated Git workflow: branch creation → commit → push → Pull Request via GitHub API.

## Quick Start

### Prerequisites

- Node.js 20+
- npm
- Git
- (Optional) [Ollama](https://ollama.ai) for local, free inference

### Installation

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
# Edit .env.local — add at least one LLM API key
```

### Minimum `.env.local`

```env
# Add at least one provider key
OPENAI_API_KEY=sk-...
GOOGLE_GENERATIVE_AI_API_KEY=AIza...
ANTHROPIC_API_KEY=sk-ant-...

# Optional — required only for automated PR creation
GITHUB_TOKEN=ghp_...
```

### Start

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000).

## Using APOS

### 1. Configure your LLM provider

Go to **Settings** → select a provider and paste your API key. APOS supports:

| Provider | Notes |
|----------|-------|
| **Ollama** | Local, no API cost. Install from [ollama.ai](https://ollama.ai) |
| **LM Studio** | Local GUI model runner |
| **OpenAI** | GPT-4o, GPT-4o-mini |
| **Google Gemini** | Gemini 1.5 Pro / Flash |
| **Anthropic** | Claude 3.5 Sonnet / Haiku |
| **DeepSeek** | Via OpenAI-compatible API |
| **Custom OpenAI-compatible** | Any provider with an OpenAI-compatible endpoint |

### 2. Generate a prototype

1. Go to **Prototypes** → **New Prototype**
2. Describe the feature in plain English (optionally attach a sketch image)
3. Click **Assess Feasibility** to get a technical plan, or **Generate** to produce code immediately
4. APOS creates a feature branch, writes the files, commits, and opens a PR

### 3. Collect product signals

Go to **Insights** → **Collect Signals**. The SignalCollector agent pulls feedback from configured sources and stores them for analysis.

### 4. Generate a weekly report

Go to **Insights** → **Generate Report**. The ReportGenerator synthesises all pending signals into a prioritised Markdown report.

### 5. Review pull requests

Go to **Pull Requests** → select a PR → **Run Review**. ReviewBot analyses the diff and posts security and quality findings as a GitHub comment.

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Framework | Next.js 16 (App Router), React 19 |
| Language | TypeScript 5 |
| Styling | Tailwind CSS 4, shadcn/ui |
| Database | SQLite via Drizzle ORM |
| Vector DB | LanceDB |
| LLM SDK | Vercel AI SDK |
| LLM Providers | OpenAI · Google Gemini · Anthropic · Ollama · LM Studio · DeepSeek |
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
│   │   ├── base.ts      # BaseAgent abstract class
│   │   ├── proto-builder.ts
│   │   ├── signal-collector.ts
│   │   ├── review-bot.ts
│   │   └── report-generator.ts
│   ├── app/             # Next.js App Router pages & API routes
│   │   └── api/         # REST endpoints
│   ├── components/      # React components (shadcn/ui + features)
│   └── lib/             # Core libraries
│       ├── llm.ts       # LLM router with fallback chain
│       ├── rag.ts       # Vector search engine
│       ├── compression.ts # Context compression engine
│       ├── db.ts        # Database connection
│       └── git.ts       # Git operations
├── apos-extension/      # Chrome extension (Google Search integration)
├── drizzle/             # Database migration files
└── data/                # Runtime data — SQLite + LanceDB (git-ignored)
```

## Contributing

Contributions are welcome. Please read [CONTRIBUTING.md](CONTRIBUTING.md) for branch naming, commit message conventions (Conventional Commits), and the PR checklist.

## License

[MIT](LICENSE) © APOS Contributors
