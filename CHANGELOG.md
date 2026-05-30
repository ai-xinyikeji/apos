# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Chrome extension completion
- Unit test coverage
- WebSocket real-time updates
- Multi-repository support
- Team collaboration features

## [0.1.0] - 2024-01-15

### Added

#### Core Features
- **AI Agent System**
  - BaseAgent abstract class with LLM integration and trace logging
  - ProtoBuilderAgent for prototype code generation
  - SignalCollectorAgent for user feedback collection
  - ReviewBotAgent for automated code review
  - ReportGeneratorAgent for weekly insight reports

- **RAG Vector Search**
  - LanceDB integration for vector storage
  - Xenova Transformers for local embeddings (all-MiniLM-L6-v2)
  - Automatic codebase indexing
  - Semantic code search for component reuse

- **Git Workflow Integration**
  - Automatic branch creation
  - Code commit and push
  - GitHub Pull Request creation
  - Diff analysis for code review

- **User Interface**
  - Dashboard with statistics and recent activity
  - Prototypes management page with real-time console
  - Insights center for signals and reports
  - Pull Requests management page
  - Settings page for API configuration
  - Components catalog for development

- **API Endpoints**
  - `/api/prototypes` - Prototype CRUD operations
  - `/api/prototypes/run` - Trigger Agent execution
  - `/api/insights` - Signals and reports management
  - `/api/insights/report` - Generate weekly report
  - `/api/pull-requests` - PR management
  - `/api/pull-requests/review` - Trigger code review
  - `/api/settings` - Configuration management
  - `/api/settings/status` - System status
  - `/api/settings/usage` - Token usage statistics
  - `/api/traces` - Agent execution logs

#### Technical Features
- **Multi-modal Input**: Support for text + sketch image input
- **Feasibility Assessment**: Pre-generation technical analysis
- **Self-healing Compilation**: Automatic error fixing (up to 3 retries)
- **Real-time Logging**: Live Agent execution console with polling
- **Token Usage Tracking**: LLM token consumption statistics

#### Database Schema
- `settings` table for key-value configuration
- `signals` table for user feedback signals
- `prototypes` table for prototype projects
- `agent_traces` table for execution logging

#### UI Components
- Complete shadcn/ui component library integration
- Dark theme design system with slate colors
- Responsive layouts for mobile and desktop
- Real-time console with color-coded status

#### Documentation
- Comprehensive README with quick start guide
- Architecture documentation (ARCHITECTURE.md)
- API documentation (API.md)
- Contributing guidelines (CONTRIBUTING.md)
- This changelog (CHANGELOG.md)

### Technical Stack
- Next.js 16 with App Router
- React 19
- TypeScript 5
- Tailwind CSS 4
- Drizzle ORM with SQLite
- LanceDB for vector storage
- Vercel AI SDK
- Anthropic Claude / OpenAI GPT / Google Gemini support

### Known Issues
- Chrome extension is incomplete (30% done)
- No unit tests yet
- No WebSocket support (using HTTP polling)
- API keys stored in plain text (should be encrypted)
- No rate limiting
- No authentication system

### Security
- Path traversal protection for file writes
- Git operations restricted to current repository
- LLM output validation with JSON schema

### Performance
- Lazy loading of Xenova Transformers model
- Efficient code chunking with overlap
- Database indexes on frequently queried fields

---

## Version History

### [0.1.0] - 2024-01-15
- Initial release with core Agent system, RAG search, and Git integration

---

## Upgrade Guide

### From Nothing to 0.1.0

This is the initial release. Follow the installation guide in README.md:

1. Clone the repository
2. Install dependencies: `npm install`
3. Initialize database: `npm run db:push`
4. Configure environment variables in `.env.local`
5. Start development server: `npm run dev`

---

## Breaking Changes

None yet (initial release).

---

## Deprecations

None yet (initial release).

---

## Contributors

Thank you to all contributors who made this release possible!

- Initial development team

---

## Links

- [Repository](https://github.com/OWNER/apos)
- [Issues](https://github.com/OWNER/apos/issues)
- [Pull Requests](https://github.com/OWNER/apos/pulls)
- [Documentation](./README.md)
