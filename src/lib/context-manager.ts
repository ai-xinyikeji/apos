/**
 * APOS 三层上下文管理系统
 *
 * Layer 1 — 代码块压缩（复用 compression.ts）
 *   把消息里的大代码块用 AST/LLM 压缩，保留签名去掉实现体
 *   无信息损失，减少 30-70% token
 *
 * Layer 2 — 滑动窗口 + 递归摘要
 *   超出模型上下文阈值时，把最老的一批消息用本地模型摘要化
 *   摘要注入 system prompt，保留最近消息原文
 *   摘要可递归叠加（上次摘要 + 新老消息 → 新摘要）
 *
 * Layer 3 — 向量记忆检索
 *   把每轮对话的关键内容存入 LanceDB
 *   下次对话时按当前问题语义检索相关历史片段注入 context
 *   实现跨会话记忆
 */

import { db } from './db';
import { conversationMemories } from './schema';
import { eq, desc } from 'drizzle-orm';
import { getLMStudioModels } from './llm';
import { getEmbedding } from './rag';
import path from 'path';
import fs from 'fs';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export interface ContextManagementResult {
  messages: any[];
  system: string;
  stats: {
    layer1_codeCompression: boolean;
    layer2_summarization: boolean;
    layer3_memoryRetrieval: boolean;
    originalTokenEstimate: number;
    finalTokenEstimate: number;
    reductionPercent: number;
    summaryInjected: boolean;
    memoriesRetrieved: number;
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// Constants
// ─────────────────────────────────────────────────────────────────────────────

/** Rough token estimate: 1 token ≈ 4 chars */
const CHARS_PER_TOKEN = 4;

/** Context limits per model (conservative — leave room for output) */
const MODEL_CONTEXT_LIMITS: Record<string, number> = {
  'gemma':  100_000,  // Gemma E2B 131K ctx
  'qwen':    24_000,  // Qwen3.5 9B 32K ctx
  'llama':   24_000,
  'default': 24_000,
};

/** When total tokens exceed this fraction of the limit, trigger Layer 2 */
const SUMMARIZATION_TRIGGER_RATIO = 0.05;  // 激进策略：5% 就触发（~5K tokens）

/** Keep this many recent messages verbatim after summarization */
const RECENT_MESSAGES_TO_KEEP = 3;  // 只保留最近 3 条消息

/** Max memories to retrieve from vector store per request */
const MAX_MEMORY_RESULTS = 3;

/** Auto-reset session after this many message rounds to prevent context explosion */
const MAX_ROUNDS_BEFORE_RESET = 15;  // 每 15 轮对话后自动重置（30 条消息）

// ─────────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────────

function estimateTokens(text: string): number {
  return Math.ceil(text.length / CHARS_PER_TOKEN);
}

function getTextFromMessage(msg: any): string {
  if (typeof msg.content === 'string') return msg.content;
  if (Array.isArray(msg.content)) {
    return msg.content
      .map((b: any) => {
        if (b?.type === 'text') return b.text || '';
        if (b?.type === 'tool_result') return getTextFromMessage({ content: b.content });
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return '';
}

function getModelContextLimit(modelId?: string): number {
  if (!modelId) return MODEL_CONTEXT_LIMITS.default;
  const id = modelId.toLowerCase();
  for (const [key, limit] of Object.entries(MODEL_CONTEXT_LIMITS)) {
    if (key !== 'default' && id.includes(key)) return limit;
  }
  return MODEL_CONTEXT_LIMITS.default;
}

function estimateTotalTokens(messages: any[], system: string): number {
  const systemTokens = estimateTokens(system || '');
  const msgTokens = (messages || []).reduce(
    (acc, m) => acc + estimateTokens(getTextFromMessage(m)),
    0,
  );
  return systemTokens + msgTokens;
}

/**
 * Extract a stable session ID from the messages.
 * Uses a hash of the first user message content as a stable session key.
 */
function deriveSessionId(messages: any[]): string {
  const firstUser = messages.find(m => m.role === 'user');
  if (!firstUser) return 'default-session';
  const text = getTextFromMessage(firstUser).slice(0, 200);
  // Simple hash
  let hash = 0;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) - hash) + text.charCodeAt(i);
    hash |= 0;
  }
  return `session_${Math.abs(hash).toString(36)}`;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 2: Summarization
// ─────────────────────────────────────────────────────────────────────────────

const SUMMARIZATION_PROMPT = `You are a conversation summarizer. Summarize the following conversation history concisely.
Focus on:
1. Key decisions made and conclusions reached
2. Code changes discussed or implemented (file names, function names, what changed)
3. Problems identified and solutions applied
4. Important context that would be needed to continue the conversation

Output a concise summary in the same language as the conversation. Be specific about technical details.
Do NOT include pleasantries or meta-commentary. Output ONLY the summary text.`;

async function summarizeMessages(messages: any[]): Promise<string> {
  const models = await getLMStudioModels();
  if (models.length === 0) {
    // Fallback: simple concatenation truncated
    return messages
      .map(m => `${m.role}: ${getTextFromMessage(m).slice(0, 200)}`)
      .join('\n');
  }

  const conversationText = messages
    .map(m => `${m.role === 'user' ? 'User' : 'Assistant'}: ${getTextFromMessage(m)}`)
    .join('\n\n');

  const lmStudioBase = process.env.LMSTUDIO_BASE_URL || 'http://localhost:1234';
  try {
    const response = await fetch(`${lmStudioBase}/v1/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: models[0],
        messages: [
          { role: 'system', content: SUMMARIZATION_PROMPT },
          { role: 'user', content: `Conversation to summarize:\n\n${conversationText}` },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
      signal: AbortSignal.timeout(30_000),
    });

    if (!response.ok) throw new Error(`Ollama error: ${response.statusText}`);
    const data = await response.json();
    const choice = data.choices?.[0]?.message;
    return choice?.content || choice?.reasoning_content || conversationText.slice(0, 1000);
  } catch (err: any) {
    console.warn('[APOS ContextManager] Summarization failed, using truncated fallback:', err.message);
    return messages
      .map(m => `${m.role}: ${getTextFromMessage(m).slice(0, 300)}`)
      .join('\n');
  }
}

async function getOrUpdateSummary(
  sessionId: string,
  oldMessages: any[],
): Promise<string> {
  // Load existing summary for this session
  const existing = await db
    .select()
    .from(conversationMemories)
    .where(eq(conversationMemories.sessionId, sessionId))
    .orderBy(desc(conversationMemories.updatedAt))
    .limit(1);

  const previousSummary = existing[0]?.summary || '';

  // Build input for new summary: previous summary + old messages
  const inputMessages: any[] = [];
  if (previousSummary) {
    inputMessages.push({
      role: 'assistant',
      content: `[Previous conversation summary]\n${previousSummary}`,
    });
  }
  inputMessages.push(...oldMessages);

  const newSummary = await summarizeMessages(inputMessages);

  // Persist to SQLite
  if (existing.length > 0) {
    await db
      .update(conversationMemories)
      .set({
        summary: newSummary,
        messageCount: (existing[0].messageCount || 0) + oldMessages.length,
        totalTokensEstimate: estimateTokens(newSummary),
        updatedAt: new Date().toISOString(),
      })
      .where(eq(conversationMemories.id, existing[0].id));
  } else {
    await db.insert(conversationMemories).values({
      sessionId,
      summary: newSummary,
      messageCount: oldMessages.length,
      totalTokensEstimate: estimateTokens(newSummary),
    });
  }

  return newSummary;
}

// ─────────────────────────────────────────────────────────────────────────────
// Layer 3: Vector Memory
// ─────────────────────────────────────────────────────────────────────────────

const MEMORY_TABLE = 'conversation_memories_vec';

async function storeMemoryVector(sessionId: string, text: string): Promise<void> {
  const APOS_DIR = process.env.APOS_DIR || process.cwd();
  const DB_DIR = path.join(APOS_DIR, 'data/vectordb');

  try {
    const lancedb = await import('@lancedb/lancedb');
    const vector = await getEmbedding(text);
    const ldb = await lancedb.connect(DB_DIR);
    const tableNames = await ldb.tableNames();

    const record = {
      vector,
      text: text.slice(0, 2000), // cap stored text
      sessionId,
      createdAt: new Date().toISOString(),
    };

    if (tableNames.includes(MEMORY_TABLE)) {
      const table = await ldb.openTable(MEMORY_TABLE);
      await table.add([record]);
    } else {
      await ldb.createTable(MEMORY_TABLE, [record]);
    }
  } catch (err: any) {
    console.warn('[APOS ContextManager] Failed to store memory vector:', err.message);
  }
}

async function retrieveRelevantMemories(
  query: string,
  currentSessionId: string,
): Promise<string[]> {
  const APOS_DIR = process.env.APOS_DIR || process.cwd();
  const DB_DIR = path.join(APOS_DIR, 'data/vectordb');

  if (!fs.existsSync(DB_DIR)) return [];

  try {
    const lancedb = await import('@lancedb/lancedb');
    const ldb = await lancedb.connect(DB_DIR);
    const tableNames = await ldb.tableNames();
    if (!tableNames.includes(MEMORY_TABLE)) return [];

    const queryVector = await getEmbedding(query);
    const table = await ldb.openTable(MEMORY_TABLE);
    const results = await table
      .search(queryVector)
      .limit(MAX_MEMORY_RESULTS + 5) // fetch extra, filter below
      .toArray();

    return results
      .filter((r: any) => r.sessionId !== currentSessionId) // exclude current session
      .slice(0, MAX_MEMORY_RESULTS)
      .map((r: any) => r.text as string);
  } catch (err: any) {
    console.warn('[APOS ContextManager] Failed to retrieve memories:', err.message);
    return [];
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Main Entry Point
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Apply all three context management layers to a request before sending to the model.
 *
 * @param messages   - Full message history from the client
 * @param system     - System prompt
 * @param provider   - Model provider ('lmstudio', 'anthropic', etc.)
 * @param modelId    - Model identifier (used to determine context limit)
 * @param enableCompression - Whether Layer 1 code compression is enabled (from settings)
 */
export async function manageContext(
  messages: any[],
  system: string,
  provider: string,
  modelId?: string,
  enableCompression = false,
): Promise<ContextManagementResult> {
  const originalTokenEstimate = estimateTotalTokens(messages, system);
  
  // Claude-specific optimization: use larger context window and less aggressive summarization
  const isClaudeProvider = provider === 'anthropic';
  const isLMStudioProvider = provider === 'lmstudio';
  
  const contextLimit = isClaudeProvider
    ? 200_000  // Claude has 200K context window
    : isLMStudioProvider
    ? getModelContextLimit(modelId)  // Local models: 24K-32K
    : 200_000; // cloud APIs have large enough context, skip heavy processing

  console.log(`[APOS ContextManager] Provider: ${provider}, Context Limit: ${contextLimit}, Original Tokens: ${originalTokenEstimate}`);

  let processedMessages = [...messages];
  let processedSystem = system;

  const stats = {
    layer1_codeCompression: false,
    layer2_summarization: false,
    layer3_memoryRetrieval: false,
    originalTokenEstimate,
    finalTokenEstimate: originalTokenEstimate,
    reductionPercent: 0,
    summaryInjected: false,
    memoriesRetrieved: 0,
  };

  // Claude-specific: adjust thresholds for better information retention
  const CLAUDE_MAX_MESSAGES = 20;  // Keep more messages for Claude
  const CLAUDE_SUMMARIZATION_THRESHOLD = 150_000;  // Only summarize at 150K tokens
  const CLAUDE_SUMMARIZATION_RATIO = 0.75;  // 75% of context limit
  
  const maxMessagesToKeep = isClaudeProvider ? CLAUDE_MAX_MESSAGES : RECENT_MESSAGES_TO_KEEP;
  const summarizationThreshold = isClaudeProvider ? CLAUDE_SUMMARIZATION_THRESHOLD : contextLimit * SUMMARIZATION_TRIGGER_RATIO;

  // ── Session Reset Protection ──────────────────────────────────────────────
  // 如果消息数量过多，自动重置会话（保留摘要）
  if (messages.length > MAX_ROUNDS_BEFORE_RESET * 2) {
    try {
      const sessionId = deriveSessionId(messages);
      console.log(`[APOS ContextManager] Session too long (${messages.length} messages), triggering auto-reset`);
      
      const summary = await getOrUpdateSummary(sessionId, messages);
      
      // 将摘要注入 system prompt，而不是作为消息（避免 "No user query" 错误）
      const summaryBlock = `\n\n---\n[Earlier Conversation Summary]\n${summary}\n---`;
      processedSystem = processedSystem + summaryBlock;
      
      // 只保留最后一条用户消息
      const lastUserMsg = [...messages].reverse().find(m => m.role === 'user');
      processedMessages = lastUserMsg ? [lastUserMsg] : messages.slice(-1);
      
      stats.layer2_summarization = true;
      stats.summaryInjected = true;
      console.log(`[APOS ContextManager] Session reset: ${messages.length} messages → 1 message (summary in system prompt)`);
    } catch (err: any) {
      console.warn('[APOS ContextManager] Session reset failed:', err.message);
    }
  }

  // ── Layer 1: Code Block Compression ───────────────────────────────────────
  // Claude-specific: less aggressive compression threshold
  const compressionThreshold = isClaudeProvider ? 2000 : 500;
  
  if (enableCompression && originalTokenEstimate > compressionThreshold) {
    try {
      const { compressMessages } = await import('./compression');
      const level = originalTokenEstimate > 10000 ? 'aggressive'
        : originalTokenEstimate > 5000 ? 'medium' : 'light';
      const result = await compressMessages(processedMessages, processedSystem, level);
      if (result.stats.blocksCompressed > 0) {
        processedMessages = result.compressedMessages;
        processedSystem = result.compressedSystem;
        stats.layer1_codeCompression = true;
        console.log(`[APOS ContextManager] Layer 1: compressed ${result.stats.blocksCompressed} code blocks (${result.stats.reductionPercent}% reduction)`);
      }
    } catch (err: any) {
      console.warn('[APOS ContextManager] Layer 1 failed:', err.message);
    }
  }

  // ── Layer 2: Sliding Window + Recursive Summarization ─────────────────────
  const tokensAfterL1 = estimateTotalTokens(processedMessages, processedSystem);

  // 触发条件：token 超过阈值 OR 消息数量超过阈值
  const shouldSummarize = (tokensAfterL1 > summarizationThreshold || processedMessages.length > maxMessagesToKeep * 2) 
    && processedMessages.length > maxMessagesToKeep;

  // 调试日志
  console.log(`[APOS ContextManager] Layer 2 check (${isClaudeProvider ? 'Claude' : 'Standard'}):`, {
    tokensAfterL1,
    summarizationThreshold,
    messagesLength: processedMessages.length,
    messageThreshold: maxMessagesToKeep * 2,
    shouldSummarize
  });

  if (shouldSummarize) {
    try {
      const sessionId = deriveSessionId(messages);
      const splitPoint = processedMessages.length - maxMessagesToKeep;
      const oldMessages = processedMessages.slice(0, splitPoint);
      const recentMessages = processedMessages.slice(splitPoint);

      console.log(`[APOS ContextManager] Layer 2: summarizing ${oldMessages.length} old messages (tokens: ${tokensAfterL1}, session: ${sessionId})`);

      const summary = await getOrUpdateSummary(sessionId, oldMessages);

      // Store the summary as a vector memory for future sessions (Layer 3 prep)
      storeMemoryVector(sessionId, summary).catch(() => {}); // fire-and-forget

      // Inject summary into system prompt
      const summaryBlock = `\n\n---\n[Earlier conversation summary]\n${summary}\n---`;
      processedSystem = processedSystem + summaryBlock;
      processedMessages = recentMessages;

      stats.layer2_summarization = true;
      stats.summaryInjected = true;
      console.log(`[APOS ContextManager] Layer 2: summary injected, keeping ${recentMessages.length} recent messages`);
    } catch (err: any) {
      console.warn('[APOS ContextManager] Layer 2 failed:', err.message);
    }
  }

  // ── Layer 3: Vector Memory Retrieval ──────────────────────────────────────
  // Retrieve relevant memories from past sessions and inject into system
  try {
    const sessionId = deriveSessionId(messages);
    const lastUserMsg = [...processedMessages].reverse().find(m => m.role === 'user');
    const queryText = lastUserMsg ? getTextFromMessage(lastUserMsg) : '';

    if (queryText.length > 20) {
      const memories = await retrieveRelevantMemories(queryText, sessionId);
      if (memories.length > 0) {
        const memoryBlock = `\n\n---\n[Relevant context from past sessions]\n${memories.map((m, i) => `${i + 1}. ${m}`).join('\n\n')}\n---`;
        processedSystem = processedSystem + memoryBlock;
        stats.layer3_memoryRetrieval = true;
        stats.memoriesRetrieved = memories.length;
        console.log(`[APOS ContextManager] Layer 3: injected ${memories.length} relevant memories`);
      }
    }
  } catch (err: any) {
    console.warn('[APOS ContextManager] Layer 3 failed:', err.message);
  }

  // ── Hard truncation safety net ─────────────────────────────────────────────
  // If still over limit after all layers, truncate from the oldest messages
  const tokensAfterAllLayers = estimateTotalTokens(processedMessages, processedSystem);
  if (tokensAfterAllLayers > contextLimit && processedMessages.length > 2) {
    let kept = [...processedMessages];
    while (estimateTotalTokens(kept, processedSystem) > contextLimit && kept.length > 2) {
      kept = kept.slice(1); // drop oldest
    }
    if (kept.length < processedMessages.length) {
      console.log(`[APOS ContextManager] Hard truncation: dropped ${processedMessages.length - kept.length} messages`);
      processedMessages = kept;
    }
  }

  const finalTokenEstimate = estimateTotalTokens(processedMessages, processedSystem);
  stats.finalTokenEstimate = finalTokenEstimate;
  stats.reductionPercent = originalTokenEstimate > 0
    ? Math.round((1 - finalTokenEstimate / originalTokenEstimate) * 100)
    : 0;

  return { messages: processedMessages, system: processedSystem, stats };
}
