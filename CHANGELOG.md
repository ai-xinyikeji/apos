# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Planned
- Chrome extension completion
- WebSocket real-time updates
- Multi-repository support
- Team collaboration features
- Performance monitoring panel

## [0.2.0] - 2026-05-30

### Changed
- **Ollama 替换 LM Studio** — 本地模型从 LM Studio (port 1234) 迁移到 Ollama (port 11434)，支持 `OLLAMA_BASE_URL` 环境变量配置
- **Claude 集成清理** — 从 ProtoBuilder 和 ReviewBot 中移除 ClaudeOptimizer，统一使用 `generateText()`
- **Chrome 扩展图标** — 生成 APOS 专属品牌图标（indigo 渐变 A 字形）

### Fixed
- Next.js 15 动态路由 `params` 需要 `await` 的类型错误（3 个路由文件）
- `compression.ts` 中残留的旧函数名调用
- `custom-rules-engine.ts` 中 `createdAt` 可能为 null 的类型错误

### Added
- 智能路由系统（EnhancedRoutingSystem）— 多维度路由决策
- 成本追踪系统 — 实时仪表板、预算预警、自动降级
- Task DAG 并行系统 — 依赖管理、并行执行
- Growth OS — Metrics 收集、Feature Ranking
- Code Graph — AST 代码图谱、变更影响分析
- MCP 工具集成 — 15 个工具供 Claude Desktop 调用
- Chrome 扩展 — Cookie 同步工具

## [0.1.0] - 2024-01-15

### Added

- **AI Agent 系统** — ProtoBuilder、ReviewBot、SignalCollector、ReportGenerator
- **RAG 向量检索** — LanceDB + Xenova 本地 Embedding
- **Git 工作流** — 自动分支、提交、PR 创建
- **多模型路由** — 支持 Anthropic / OpenAI / Google / Web Models
- **上下文压缩** — AST + LLM 双引擎，70%+ Token 节省
- **数据库 Schema** — settings / signals / prototypes / agent_traces 表
- **完整 UI** — Dashboard、原型管理、洞察中心、PR 管理、设置页面

### Known Issues
- No authentication system (single-user local use)
- API keys stored in plain text
- No rate limiting

---

## Roadmap

### 近期（1-3 个月）
- WebSocket 实时推送（替代 HTTP 轮询）
- 性能监控面板
- 错误报警机制

### 中期（3-6 个月）
- 多仓库支持
- 团队协作功能
- 自定义 Agent 模板

### 长期（6-12 个月）
- 云端部署版本
- 企业级权限管理
- Plugin 市场
- Product Discovery（GitHub 趋势、Reddit/HN 监测、竞品分析）
