# APOS API Reference

## Base URL

```
http://localhost:3000/api
```

## Authentication

The current release is designed for local single-user use and does not require authentication. Do not expose the server on a public network without adding an auth layer first.

## Content Type

All endpoints accept and return `application/json` unless noted otherwise.

## Error Format

All error responses share a common shape:

```json
{ "error": "Human-readable description" }
```

Common status codes:

| Code | Meaning |
|------|---------|
| `200` | Success |
| `400` | Missing or invalid request parameters |
| `404` | Resource not found |
| `500` | Internal server error |

---

## Prototypes

### `POST /api/prototypes`

Create a new prototype in `draft` status.

**Request body**

```typescript
{
  name: string;        // required — display name
  description: string; // required — feature description in plain English
}
```

**Response**

```json
{
  "id": 1,
  "name": "User List Card",
  "description": "Card component showing a paginated, searchable user list",
  "branchName": "feature/user-list-card-1737123456",
  "status": "draft",
  "createdAt": "2026-06-03T10:30:00.000Z"
}
```

**Errors**

| Code | Condition |
|------|-----------|
| `400` | `name` or `description` missing |
| `500` | Database error |

---

### `GET /api/prototypes`

Return all prototypes, newest first.

**Response**

```json
[
  {
    "id": 1,
    "name": "User List Card",
    "description": "Card component showing a paginated, searchable user list",
    "branchName": "feature/user-list-card-1737123456",
    "status": "pr_created",
    "codePath": null,
    "previewUrl": null,
    "commitHash": "a1b2c3d",
    "prNumber": 42,
    "prUrl": "https://github.com/owner/repo/pull/42",
    "feasibilityReport": "## Technical Feasibility\n...",
    "createdAt": "2026-06-03T10:30:00.000Z",
    "updatedAt": "2026-06-03T11:00:00.000Z"
  }
]
```

**Errors**

| Code | Condition |
|------|-----------|
| `500` | Database error |

---

### `POST /api/prototypes/run`

Trigger the ProtoBuilder Agent for a specific prototype. The agent runs asynchronously — this endpoint returns a `runId` immediately. Poll `/api/traces?runId=<id>` to follow progress.

**Request body**

```typescript
{
  prototypeId: number;  // required
  assessOnly?: boolean; // optional, default false — run feasibility check only
  image?: string;       // optional — base64-encoded PNG/JPEG sketch or mockup
}
```

**Response**

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440000",
  "message": "ProtoBuilder Agent started"
}
```

**Errors**

| Code | Condition |
|------|-----------|
| `400` | `prototypeId` missing |
| `404` | Prototype not found |
| `500` | Agent startup error |

---

## Traces

### `GET /api/traces`

Fetch execution log entries for an agent run. Designed to be polled every 2 seconds while an agent is running.

**Query parameters**

| Parameter | Type | Required | Description |
|-----------|------|----------|-------------|
| `runId` | `string` | Yes | UUID returned by any `*/run` endpoint |

**Response**

```json
[
  {
    "id": 1,
    "agentName": "ProtoBuilder",
    "runId": "550e8400-e29b-41d4-a716-446655440000",
    "step": "Start",
    "status": "info",
    "message": "Starting code generation for prototype [User List Card]",
    "details": null,
    "createdAt": "2026-06-03T10:30:00.000Z"
  },
  {
    "id": 2,
    "agentName": "ProtoBuilder",
    "runId": "550e8400-e29b-41d4-a716-446655440000",
    "step": "RAG Indexing",
    "status": "info",
    "message": "Updating vector index for local codebase",
    "details": null,
    "createdAt": "2026-06-03T10:30:05.000Z"
  },
  {
    "id": 5,
    "agentName": "ProtoBuilder",
    "runId": "550e8400-e29b-41d4-a716-446655440000",
    "step": "Success",
    "status": "success",
    "message": "Prototype [User List Card] generated successfully",
    "details": "{\"prUrl\":\"https://github.com/owner/repo/pull/42\"}",
    "createdAt": "2026-06-03T10:35:00.000Z"
  }
]
```

Trace `status` values: `"info"` · `"success"` · `"warning"` · `"error"`

**Errors**

| Code | Condition |
|------|-----------|
| `400` | `runId` missing |
| `500` | Database error |

---

## Insights

### `POST /api/insights`

Trigger the SignalCollector Agent to gather user feedback signals. Returns a `runId` for polling.

**Request body**

```typescript
{
  sources?: Array<'amplitude' | 'zendesk' | 'competitor' | 'hackernews' | 'reddit'>;
  // optional — defaults to all five sources
}
```

**Response**

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440001",
  "message": "SignalCollector Agent started"
}
```

**Errors**

| Code | Condition |
|------|-----------|
| `500` | Agent startup error |

---

### `GET /api/insights`

Return all collected signals and generated reports.

**Response**

```json
{
  "signals": [
    {
      "id": 1,
      "source": "zendesk",
      "title": "Ticket #1084: Users want CSV export",
      "content": "Multiple users have requested the ability to export report data as CSV...",
      "url": "https://zendesk.com/tickets/1084",
      "status": "pending",
      "sentiment": "neutral",
      "createdAt": "2026-06-03T09:00:00.000Z",
      "updatedAt": "2026-06-03T09:00:00.000Z"
    }
  ],
  "reports": [
    {
      "filename": "weekly-20260603-100000.md",
      "title": "Weekly Product Insights — 2026-06-03",
      "content": "# Weekly Product Insights\n\n## Key Findings\n...",
      "createdAt": "2026-06-03T10:00:00.000Z"
    }
  ]
}
```

**Errors**

| Code | Condition |
|------|-----------|
| `500` | Database or filesystem error |

---

### `POST /api/insights/report`

Trigger the ReportGenerator Agent. It reads all `pending` signals and synthesises a Markdown report. Returns a `runId`.

**Request body**

None required.

**Response**

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440002",
  "message": "ReportGenerator Agent started"
}
```

**Errors**

| Code | Condition |
|------|-----------|
| `400` | No pending signals to analyse |
| `500` | Agent startup error |

---

## Pull Requests

### `POST /api/pull-requests/review`

Trigger the ReviewBot Agent for a prototype's open PR. Returns a `runId`.

**Request body**

```typescript
{
  prototypeId: number; // required
}
```

**Response**

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440003",
  "message": "ReviewBot Agent started"
}
```

**Errors**

| Code | Condition |
|------|-----------|
| `400` | `prototypeId` missing |
| `404` | Prototype not found or has no open PR |
| `500` | Agent startup error |

---

### `GET /api/pull-requests`

List all prototypes that have an associated pull request.

**Response**

```json
[
  {
    "id": 1,
    "name": "User List Card",
    "branchName": "feature/user-list-card-1737123456",
    "prNumber": 42,
    "prUrl": "https://github.com/owner/repo/pull/42",
    "status": "pr_created",
    "createdAt": "2026-06-03T10:30:00.000Z"
  }
]
```

**Errors**

| Code | Condition |
|------|-----------|
| `500` | Database error |

---

## Settings

### `GET /api/settings`

Return all stored configuration values. API key values are partially masked (`sk-ant-***`).

**Response**

```json
{
  "llm_provider": "anthropic",
  "llm_model": "claude-3-5-sonnet-20241022",
  "anthropic_api_key": "sk-ant-***",
  "openai_api_key": "",
  "google_api_key": "",
  "github_token": "ghp_***",
  "compression_enabled": "true",
  "compression_threshold": "8000"
}
```

**Errors**

| Code | Condition |
|------|-----------|
| `500` | Database error |

---

### `POST /api/settings`

Update one or more configuration values. Omitted keys are left unchanged.

**Request body**

```typescript
{
  llm_provider?: 'anthropic' | 'openai' | 'google' | 'ollama' | 'lmstudio';
  llm_model?: string;
  anthropic_api_key?: string;
  openai_api_key?: string;
  google_api_key?: string;
  github_token?: string;
  compression_enabled?: 'true' | 'false';
  compression_threshold?: string; // character count as string, e.g. "8000"
}
```

**Response**

```json
{ "success": true }
```

**Errors**

| Code | Condition |
|------|-----------|
| `500` | Database error |

---

### `GET /api/settings/status`

Return a snapshot of the system's current health and configuration state.

**Response**

```json
{
  "llm": {
    "configured": true,
    "provider": "anthropic",
    "model": "claude-3-5-sonnet-20241022"
  },
  "github": {
    "configured": true,
    "hasToken": true
  },
  "database": {
    "connected": true,
    "prototypesCount": 5,
    "signalsCount": 12
  },
  "rag": {
    "indexed": true,
    "chunksCount": 234
  },
  "compression": {
    "enabled": true,
    "lmStudioAvailable": true,
    "threshold": 8000
  }
}
```

**Errors**

| Code | Condition |
|------|-----------|
| `500` | System error |

---

## Compression

### `POST /api/compression/compress`

Compress a block of code or text using the AST + LLM hybrid engine.

**Request body**

```typescript
{
  content: string;                            // required — text to compress
  filename?: string;                          // optional — used for language detection
  level?: 'light' | 'medium' | 'aggressive'; // optional, default 'medium'
}
```

**Response**

```json
{
  "compressed": "// UserListCard.tsx\ninterface UserListCardProps {...}\nexport function UserListCard(...) {...}",
  "stats": {
    "originalChars": 4200,
    "compressedChars": 980,
    "reduction": 76.7,
    "method": "ast",
    "durationMs": 34
  }
}
```

**Errors**

| Code | Condition |
|------|-----------|
| `400` | `content` missing |
| `500` | Compression engine error |

---

### `GET /api/compression/stats`

Return aggregate compression statistics for the current session.

**Response**

```json
{
  "totalRequests": 142,
  "totalOriginalChars": 1840000,
  "totalCompressedChars": 512000,
  "averageReduction": 72.2,
  "methodBreakdown": {
    "ast": 118,
    "llm": 21,
    "fallback": 3
  },
  "estimatedTokensSaved": 329400,
  "estimatedCostSaved": "$0.99"
}
```

**Errors**

| Code | Condition |
|------|-----------|
| `500` | Stats calculation error |

---

## Orchestrator

### `POST /api/orchestrator`

Execute a named DAG workflow. Tasks inside the workflow run in parallel where dependencies allow.

**Request body**

```typescript
{
  workflow: string;          // required — workflow name (see available workflows below)
  params?: Record<string, unknown>; // optional — workflow-specific parameters
}
```

Available workflows:

| Name | Description |
|------|-------------|
| `full-cycle` | Collect signals → generate report → create prototype |
| `review-and-merge` | Review PR → update prototype status |
| `insights-only` | Collect signals + generate report in parallel |

**Response**

```json
{
  "runId": "550e8400-e29b-41d4-a716-446655440010",
  "workflow": "full-cycle",
  "tasks": [
    { "id": "collect-signals", "status": "pending" },
    { "id": "generate-report", "status": "pending", "dependsOn": ["collect-signals"] },
    { "id": "create-prototype", "status": "pending", "dependsOn": ["generate-report"] }
  ]
}
```

**Errors**

| Code | Condition |
|------|-----------|
| `400` | Unknown workflow name |
| `500` | Orchestrator error |

---

## Growth

### `POST /api/growth/optimize`

Analyse current UI metrics and signal data to produce ranked feature and optimisation suggestions.

**Request body**

```typescript
{
  targetMetric?: 'engagement' | 'retention' | 'conversion'; // optional, default 'engagement'
  topN?: number;  // optional — number of suggestions to return, default 5
}
```

**Response**

```json
{
  "suggestions": [
    {
      "rank": 1,
      "title": "Add keyboard shortcuts to prototype editor",
      "impact": "high",
      "effort": "low",
      "rationale": "3 Zendesk tickets and 1 Reddit thread requested this in the past 7 days",
      "signals": [4, 7, 12]
    },
    {
      "rank": 2,
      "title": "Add CSV export to insights page",
      "impact": "medium",
      "effort": "medium",
      "rationale": "Highest-volume Amplitude event is 'export_attempt_failed'",
      "signals": [1]
    }
  ],
  "generatedAt": "2026-06-03T10:00:00.000Z"
}
```

**Errors**

| Code | Condition |
|------|-----------|
| `500` | Analysis error |

---

## Claude CLI Proxy

### `POST /api/v1/messages`

Anthropic-compatible endpoint. Set `ANTHROPIC_BASE_URL=http://localhost:3000/api/v1` in your environment to route all `claude` CLI calls through APOS. APOS applies context compression automatically and routes the request through its LLM chain.

This endpoint is not intended to be called directly — use it via the Claude CLI or the Anthropic SDK.

---

## Data Models

```typescript
interface Prototype {
  id: number;
  name: string;
  description: string;
  branchName: string;
  status: 'draft' | 'assessing' | 'generating' | 'generated' | 'pr_created' | 'merged' | 'failed';
  codePath: string | null;
  previewUrl: string | null;
  commitHash: string | null;
  prNumber: number | null;
  prUrl: string | null;
  feasibilityReport: string | null;
  createdAt: string; // ISO 8601
  updatedAt: string;
}

interface Signal {
  id: number;
  source: 'amplitude' | 'zendesk' | 'competitor' | 'hackernews' | 'reddit';
  title: string;
  content: string;
  url: string | null;
  status: 'pending' | 'analyzed' | 'archived';
  sentiment: 'positive' | 'neutral' | 'negative' | null;
  createdAt: string;
  updatedAt: string;
}

interface AgentTrace {
  id: number;
  agentName: 'ProtoBuilder' | 'SignalCollector' | 'ReviewBot' | 'ReportGenerator';
  runId: string; // UUID
  step: string;
  status: 'info' | 'success' | 'warning' | 'error';
  message: string;
  details: string | null; // JSON string
  createdAt: string;
}

interface Report {
  filename: string;
  title: string;
  content: string;  // Markdown
  createdAt: string;
}
```

---

## End-to-End Example

```bash
BASE="http://localhost:3000/api"

# 1. Create a prototype
curl -s -X POST $BASE/prototypes \
  -H "Content-Type: application/json" \
  -d '{"name":"User List Card","description":"Paginated card showing users with avatar, name, and role badge"}' \
  | jq .

# 2. Run feasibility check (returns runId)
RUN=$(curl -s -X POST $BASE/prototypes/run \
  -H "Content-Type: application/json" \
  -d '{"prototypeId":1,"assessOnly":true}' | jq -r .runId)

# 3. Poll until done
while true; do
  STATUS=$(curl -s "$BASE/traces?runId=$RUN" | jq -r '.[-1].status')
  echo "Latest status: $STATUS"
  [[ "$STATUS" == "success" || "$STATUS" == "error" ]] && break
  sleep 2
done

# 4. Generate the component and open a PR
RUN2=$(curl -s -X POST $BASE/prototypes/run \
  -H "Content-Type: application/json" \
  -d '{"prototypeId":1,"assessOnly":false}' | jq -r .runId)

# 5. Review the PR
curl -s -X POST $BASE/pull-requests/review \
  -H "Content-Type: application/json" \
  -d '{"prototypeId":1}' | jq .
```
