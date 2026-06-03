import { NextRequest, NextResponse } from 'next/server';
import { routeModel, generateText, getOllamaModels } from '@/lib/llm';
import { streamText } from 'ai';
import { manageContext } from '@/lib/context-manager';
import { LocalModelOptimizer } from '@/lib/local-model-optimizer';
import { EnhancedRoutingSystem } from '@/lib/routing/enhanced-routing-system';
import { CostRecorder } from '@/lib/cost/cost-recorder';
import { getExtProxyStore, type ExtProxyProvider } from '@/lib/ext-proxy-store';
import { createOpenAI } from '@ai-sdk/openai';
import { createAnthropic } from '@ai-sdk/anthropic';
import { createGoogleGenerativeAI } from '@ai-sdk/google';
import { db } from '@/lib/db';
import { settings } from '@/lib/schema';

export const dynamic = 'force-dynamic';

const routingSystem = new EnhancedRoutingSystem();
const costRecorder  = new CostRecorder();

// 速率限制器 - 简单的内存实现
const rateLimiter = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(clientId: string): { allowed: boolean; remaining: number; resetAt: number } {
  const now = Date.now();
  const limit = rateLimiter.get(clientId);
  
  // 每分钟 60 次请求
  const MAX_REQUESTS = 60;
  const WINDOW_MS = 60000; // 1 分钟
  
  if (!limit || now > limit.resetAt) {
    const resetAt = now + WINDOW_MS;
    rateLimiter.set(clientId, { count: 1, resetAt });
    return { allowed: true, remaining: MAX_REQUESTS - 1, resetAt };
  }
  
  if (limit.count >= MAX_REQUESTS) {
    return { allowed: false, remaining: 0, resetAt: limit.resetAt };
  }
  
  limit.count++;
  return { allowed: true, remaining: MAX_REQUESTS - limit.count, resetAt: limit.resetAt };
}

// 定期清理过期的速率限制记录
setInterval(() => {
  const now = Date.now();
  for (const [key, value] of rateLimiter.entries()) {
    if (now > value.resetAt) {
      rateLimiter.delete(key);
    }
  }
}, 60000); // 每分钟清理一次

// CORS 配置
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': process.env.CORS_ORIGIN || '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-API-Key',
  'Access-Control-Max-Age': '86400', // 24 小时
};

// 辅助函数：添加 CORS 头到响应
function addCorsHeaders(headers: Record<string, string> = {}): Record<string, string> {
  return { ...CORS_HEADERS, ...headers };
}

export async function OPTIONS(req: NextRequest) {
  return new NextResponse(null, {
    status: 204,
    headers: CORS_HEADERS,
  });
}

export async function POST(req: NextRequest) {
  // 生成请求 ID 用于追踪
  const requestId = `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  const startTime = Date.now();
  
  // 速率限制检查
  const clientId = req.headers.get('x-forwarded-for') || 
                   req.headers.get('x-real-ip') || 
                   req.headers.get('cf-connecting-ip') ||
                   'unknown';
  
  // API Key 认证（可选）
  const apiKey = req.headers.get('x-api-key') || 
                 req.headers.get('authorization')?.replace('Bearer ', '');
  
  const validApiKeys = process.env.APOS_API_KEYS?.split(',').map(k => k.trim()).filter(Boolean) || [];
  
  if (validApiKeys.length > 0 && !validApiKeys.includes(apiKey || '')) {
    console.warn(`[${requestId}] Invalid API key from client: ${clientId}`);
    return NextResponse.json({
      type: 'error',
      error: {
        type: 'authentication_error',
        message: 'Invalid or missing API key. Please provide a valid API key in the X-API-Key header or Authorization header.',
      }
    }, { 
      status: 401,
      headers: {
        'Content-Type': 'application/json',
        'WWW-Authenticate': 'Bearer realm="APOS API"',
      }
    });
  }
  
  const rateLimit = checkRateLimit(clientId);
  
  if (!rateLimit.allowed) {
    const retryAfter = Math.ceil((rateLimit.resetAt - Date.now()) / 1000);
    console.warn(`[${requestId}] Rate limit exceeded for client: ${clientId}`);
    return NextResponse.json({
      type: 'error',
      error: {
        type: 'rate_limit_error',
        message: 'Too many requests. Please try again later.',
      }
    }, { 
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'X-RateLimit-Limit': '60',
        'X-RateLimit-Remaining': '0',
        'X-RateLimit-Reset': rateLimit.resetAt.toString(),
        'Retry-After': retryAfter.toString(),
      }
    });
  }
  
  // 请求超时控制 - 120 秒
  const timeoutController = new AbortController();
  const timeoutId = setTimeout(() => {
    console.warn(`[${requestId}] Request timeout after 120s`);
    timeoutController.abort();
  }, 120000);

  let activeTaskId: string | null = null;
  if (req.signal?.addEventListener) {
    req.signal.addEventListener('abort', () => {
      if (activeTaskId) {
        console.log(`[${requestId}] Client disconnected, cancelling pending task: ${activeTaskId}`);
        getExtProxyStore().cancelTask(activeTaskId);
      }
    });
  }

  try {
    const body = await req.json();
    const { 
      messages, 
      system, 
      temperature = 1.0, 
      max_tokens = 4096, 
      stream = false,
      model: requestedModel, // Claude Desktop 传递的模型名称
      top_p,
      top_k,
      stop_sequences,
      metadata,
    } = body;

    // 结构化日志 - 请求开始
    console.log(`[${requestId}] Request started:`, {
      model: requestedModel || 'auto',
      messagesCount: messages?.length || 0,
      stream,
      temperature,
      max_tokens,
      hasSystem: !!system,
      metadata: metadata ? Object.keys(metadata) : [],
    });

    // ── 参数验证 ──────────────────────────────────────────────────────────
    
    // 验证 messages 参数
    if (!messages || !Array.isArray(messages)) {
      return NextResponse.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'messages must be an array',
        }
      }, { status: 400 });
    }

    if (messages.length === 0) {
      return NextResponse.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'messages array cannot be empty',
        }
      }, { status: 400 });
    }

    // Limit message count and total payload size to prevent abuse
    const MAX_MESSAGES = 500;
    const MAX_TOTAL_CHARS = 2_000_000; // ~2MB of text
    if (messages.length > MAX_MESSAGES) {
      return NextResponse.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: `messages array cannot exceed ${MAX_MESSAGES} items`,
        }
      }, { status: 400 });
    }
    const totalChars = messages.reduce((sum: number, m: any) => {
      const c = m.content;
      return sum + (typeof c === 'string' ? c.length : JSON.stringify(c).length);
    }, 0) + (typeof system === 'string' ? system.length : 0);
    if (totalChars > MAX_TOTAL_CHARS) {
      return NextResponse.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: `Total message content exceeds maximum size of ${MAX_TOTAL_CHARS} characters`,
        }
      }, { status: 413 });
    }

    // 验证每条消息的结构
    for (let i = 0; i < messages.length; i++) {
      const msg = messages[i];
      
      if (!msg.role) {
        return NextResponse.json({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: `messages[${i}]: missing required field 'role'`,
          }
        }, { status: 400 });
      }
      
      if (!['user', 'assistant', 'system'].includes(msg.role)) {
        return NextResponse.json({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: `messages[${i}]: role must be 'user', 'assistant', or 'system'`,
          }
        }, { status: 400 });
      }
      
      if (msg.content === undefined || msg.content === null) {
        return NextResponse.json({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: `messages[${i}]: missing required field 'content'`,
          }
        }, { status: 400 });
      }
    }

    // 验证最后一条消息必须是 user
    const lastMessage = messages[messages.length - 1];
    if (lastMessage.role !== 'user') {
      return NextResponse.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'Last message must have role "user"',
        }
      }, { status: 400 });
    }

    // 验证 temperature 参数
    if (temperature !== undefined && (typeof temperature !== 'number' || temperature < 0 || temperature > 2)) {
      return NextResponse.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'temperature must be a number between 0 and 2',
        }
      }, { status: 400 });
    }

    // 验证 max_tokens 参数并进行容错限幅处理
    let finalMaxTokens = max_tokens;
    if (max_tokens !== undefined) {
      if (typeof max_tokens !== 'number' || max_tokens <= 0) {
        return NextResponse.json({
          type: 'error',
          error: {
            type: 'invalid_request_error',
            message: 'max_tokens must be a positive number',
          }
        }, { status: 400 });
      }
      
      // 容错处理：不返回 400 报错，而是静默将过大的 max_tokens 限制在 8192 以内（或交给底层模型适配）
      // 特别是对 Claude Code CLI，它可能会请求超大 max_tokens（例如 40000）
      if (max_tokens > 8192) {
        console.log(`[${requestId}] Capping requested max_tokens ${max_tokens} to 8192 for compatibility`);
        finalMaxTokens = 8192;
      }
    }

    // 验证 top_p 参数
    if (top_p !== undefined && (typeof top_p !== 'number' || top_p < 0 || top_p > 1)) {
      return NextResponse.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'top_p must be a number between 0 and 1',
        }
      }, { status: 400 });
    }

    // 验证 top_k 参数
    if (top_k !== undefined && (typeof top_k !== 'number' || top_k < 0)) {
      return NextResponse.json({
        type: 'error',
        error: {
          type: 'invalid_request_error',
          message: 'top_k must be a non-negative number',
        }
      }, { status: 400 });
    }

    console.log(`[APOS LLM Proxy] Request received with ${messages?.length || 0} messages, model: ${requestedModel || 'auto'}`);

    // ── Task 14.2: Task classification via EnhancedRoutingSystem ─────────────
    // Extract the last user message as the prompt for routing
    const lastUserMessage = [...(messages || [])]
      .reverse()
      .find((m: any) => m.role === 'user');
    const promptText = typeof lastUserMessage?.content === 'string'
      ? lastUserMessage.content
      : Array.isArray(lastUserMessage?.content)
        ? lastUserMessage.content.map((c: any) => c.text || '').join(' ')
        : '';

    // ── Task 14.1: Integrate EnhancedRoutingSystem ────────────────────────────
    let routingResult: Awaited<ReturnType<typeof routingSystem.route>> | null = null;
    let routedProvider: string;
    let routedModel: string;

    try {
      routingResult = await routingSystem.route({ prompt: promptText });
      routedProvider = routingResult.selection.provider;
      routedModel    = routingResult.selection.modelName;
      console.log(`[APOS LLM Proxy] Enhanced routing → ${routedProvider}/${routedModel} (${routingResult.routingTimeMs}ms)`);
    } catch (routingErr) {
      console.warn('[APOS LLM Proxy] Enhanced routing failed, falling back to legacy router:', routingErr);
      routedProvider = '';
      routedModel    = '';
    }

    // Fall back to legacy router if enhanced routing failed
    const taskType = routingResult?.taskType ?? 'summarize';
    
    // 估算 token 数量用于智能模型选择
    const estimatedTokens = TokenCounter.estimateMessages(messages || []) + 
                           (system ? TokenCounter.estimate(typeof system === 'string' ? system : JSON.stringify(system)) : 0);
    
    // 使用智能模型选择器，获取按优先级排好的候选列表
    let candidates: Array<{ model: any; provider: string; reason: string }> = [];
    try {
      candidates = await SmartModelSelector.selectCandidates(
        taskType,
        estimatedTokens,
        requestedModel,
      );
    } catch (err) {
      console.warn(`[${requestId}] selectCandidates failed, using legacy router:`, err);
    }

    // 兜底：如果候选列表为空，用传统路由补一个
    if (candidates.length === 0) {
      try {
        const fallback = requestedModel
          ? await getModelByName(requestedModel)
          : routedProvider
            ? await routeModel(routedProvider as any)
            : await routeModel(taskType as any);
        candidates = [{ ...fallback, reason: 'Legacy router fallback' }];
      } catch (e) {
        console.error(`[${requestId}] Legacy router also failed:`, e);
      }
    }

    console.log(`[${requestId}] Candidates (${candidates.length}): ${candidates.map(c => c.provider).join(' → ')}`);

    // ── 执行：依次尝试候选，失败自动切换到下一个 ──────────────────────────
    // 把 stream 和 non-stream 都封装成统一的 tryExecute，对上层透明

    // Handle system parameter - it can be string, object, or array
    let systemPrompt = '';
    if (typeof system === 'string') {
      systemPrompt = system;
    } else if (Array.isArray(system)) {
      systemPrompt = system.map((s: any) => s.text || s.content || JSON.stringify(s)).join('\n');
    } else if (system && typeof system === 'object') {
      systemPrompt = (system as any).text || (system as any).content || JSON.stringify(system);
    }

    // Apply three-layer context management (once, before retry loop)
    const contextResult = await manageContext(
      messages || [],
      systemPrompt,
      candidates[0]?.provider ?? 'ollama',
      candidates[0]?.model?.modelId ?? 'unknown',
      true,
    );
    const processedMessages = contextResult.messages;
    const processedSystem   = contextResult.system;

    console.log(`[APOS ContextManager] Stats:`, {
      originalTokens: contextResult.stats.originalTokenEstimate,
      finalTokens:    contextResult.stats.finalTokenEstimate,
      reduction:      `${contextResult.stats.reductionPercent}%`,
    });

    // ── STREAMING path ────────────────────────────────────────────────────────
    if (stream) {
      const encoder = new TextEncoder();
      const msgId   = `msg_${Date.now()}`;
      const inputTokens = TokenCounter.estimateMessages(processedMessages) +
                          (processedSystem ? TokenCounter.estimate(processedSystem) : 0);

      const customStream = new ReadableStream({
        async start(controller) {
          const enqueue = (event: string, data: object) =>
            controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));

          enqueue('message_start', {
            type: 'message_start',
            message: {
              id: msgId, type: 'message', role: 'assistant', content: [],
              model: requestedModel || 'auto',
              stop_reason: null, stop_sequence: null,
              usage: { input_tokens: inputTokens, output_tokens: 0 },
            },
          });
          enqueue('content_block_start', {
            type: 'content_block_start', index: 0, content_block: { type: 'text', text: '' },
          });

          let accumulatedText = '';
          let usedProvider    = '';
          let succeeded       = false;

          for (let i = 0; i < candidates.length; i++) {
            const candidate = candidates[i];
            console.log(`[${requestId}] Trying candidate ${i + 1}/${candidates.length}: ${candidate.provider} — ${candidate.reason}`);

            try {
              // ── Web model ──
              if (candidate.provider === 'web') {
                const webModel = candidate.model as { isWebModel: true; type: ExtProxyProvider };
                const store    = getExtProxyStore();
                const taskId   = store.dispatchStreaming(webModel.type, promptText);
                activeTaskId   = taskId;

                for await (const chunk of store.streamChunks(taskId)) {
                  accumulatedText += chunk;
                  enqueue('content_block_delta', {
                    type: 'content_block_delta', index: 0,
                    delta: { type: 'text_delta', text: chunk },
                  });
                }
                usedProvider = `web:${webModel.type}`;
                succeeded    = true;
                break;
              }

              // ── Ollama / API model ──
              const result = await streamText({
                model:            candidate.model,
                messages:         processedMessages,
                system:           processedSystem,
                temperature,
                maxOutputTokens:  finalMaxTokens,
                topP:             top_p,
                topK:             top_k,
                stopSequences:    stop_sequences,
              });

              for await (const chunk of result.textStream) {
                accumulatedText += chunk;
                enqueue('content_block_delta', {
                  type: 'content_block_delta', index: 0,
                  delta: { type: 'text_delta', text: chunk },
                });
              }
              usedProvider = candidate.provider;
              succeeded    = true;
              break;

            } catch (err: any) {
              console.warn(`[${requestId}] Candidate ${candidate.provider} failed: ${err.message}`);
              if (i < candidates.length - 1) {
                console.log(`[${requestId}] Switching to next candidate: ${candidates[i + 1].provider}`);
                // 无感切换，不向客户端发任何提示
              } else {
                // 所有候选都失败了，发错误事件
                enqueue('error', {
                  type: 'error',
                  error: { type: 'api_error', message: `All models failed. Last error: ${err.message}` },
                });
              }
            }
          }

          enqueue('content_block_stop', { type: 'content_block_stop', index: 0 });
          enqueue('message_delta', {
            type: 'message_delta',
            delta: { stop_reason: 'end_turn', stop_sequence: null },
            usage: { output_tokens: TokenCounter.estimate(accumulatedText) },
          });
          enqueue('message_stop', { type: 'message_stop' });
          controller.close();

          if (succeeded) {
            console.log(`[${requestId}] Stream completed via ${usedProvider}, ${accumulatedText.length} chars`);
          }
        },
      });

      const finalProvider = candidates[0]?.provider ?? 'unknown';
      return new Response(customStream, {
        headers: addCorsHeaders({
          'Content-Type':    'text/event-stream',
          'Cache-Control':   'no-cache',
          'Connection':      'keep-alive',
          'X-APOS-Provider': finalProvider,
          ...(routingResult ? {
            'X-APOS-Model':       routingResult.selection.modelName,
            'X-APOS-Cost':        String(routingResult.selection.estimatedCost),
            'X-APOS-Decision-Id': routingResult.decisionId,
            'X-APOS-Task-Type':   routingResult.taskType,
          } : {}),
        }),
      });
    }

    // ── NON-STREAMING path ────────────────────────────────────────────────────
    let responseText = '';
    let usedProvider = '';

    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      console.log(`[${requestId}] Trying candidate ${i + 1}/${candidates.length}: ${candidate.provider} — ${candidate.reason}`);

      try {
        // Web model (non-stream): dispatch and wait
        if (candidate.provider === 'web') {
          const webModel = candidate.model as { isWebModel: true; type: ExtProxyProvider };
          const store    = getExtProxyStore();
          const taskId   = `ext_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
          activeTaskId   = taskId;
          const result   = await store.dispatch(webModel.type, promptText, taskId);
          if (result.error) throw new Error(result.error);
          responseText = result.text ?? '';
          usedProvider = `web:${webModel.type}`;
          break;
        }

        // Ollama non-stream: try LocalModelOptimizer first
        if (candidate.provider === 'ollama') {
          try {
            const optimizer = new LocalModelOptimizer({
              maxMessages:             10,
              summarizationThreshold:  24_000,
              enableLocalCache:        true,
              cacheExpiry:             300,
              maxTokens:               finalMaxTokens || 2048,
              temperature:             temperature || 0.7,
            });
            const result = await optimizer.generate(processedMessages, processedSystem, taskType);
            responseText = result.text;
            usedProvider = 'ollama';
            break;
          } catch (optErr: any) {
            console.warn(`[${requestId}] LocalModelOptimizer failed, trying standard generateText:`, optErr.message);
          }
        }

        // Standard generateText
        const response = await generateText({
          model:           candidate.model,
          messages:        processedMessages,
          system:          processedSystem,
          temperature,
          maxOutputTokens: finalMaxTokens,
          topP:            top_p,
          topK:            top_k,
          stopSequences:   stop_sequences,
        });
        responseText = response.text ?? '';
        usedProvider = candidate.provider;

        // Record cost
        const usage = (response as any).usage;
        if (usage && routingResult) {
          costRecorder.record({
            provider:           candidate.provider,
            modelName:          routedModel || candidate.provider,
            taskType:           (routingResult.taskType as any) ?? 'default',
            inputTokens:        usage.promptTokens    ?? usage.inputTokens    ?? 0,
            outputTokens:       usage.completionTokens ?? usage.outputTokens  ?? 0,
            cacheCreationTokens: usage.cacheCreationTokens ?? 0,
            cacheReadTokens:     usage.cacheReadTokens     ?? 0,
            routingDecisionId:  routingResult.decisionId,
          });
        }
        break;

      } catch (err: any) {
        console.warn(`[${requestId}] Candidate ${candidate.provider} failed: ${err.message}`);
        if (i === candidates.length - 1) {
          // All candidates exhausted — surface the error
          throw err;
        }
        console.log(`[${requestId}] Switching to next candidate: ${candidates[i + 1].provider}`);
      }
    }

    // Token counting
    let inputTokens: number;
    let outputTokens: number;
    try {
      inputTokens  = await TokenCounter.estimateMessagesAsync(processedMessages, usedProvider);
      if (processedSystem) inputTokens += await TokenCounter.estimateAsync(processedSystem, usedProvider);
      outputTokens = await TokenCounter.estimateAsync(responseText, usedProvider);
    } catch {
      inputTokens  = TokenCounter.estimateMessages(processedMessages) +
                     (processedSystem ? TokenCounter.estimate(processedSystem) : 0);
      outputTokens = TokenCounter.estimate(responseText);
    }

    const duration = Date.now() - startTime;
    console.log(`[${requestId}] Response completed via ${usedProvider}:`, {
      inputTokens, outputTokens, duration: `${duration}ms`, textLength: responseText.length,
    });

    const headers: Record<string, string> = { 'X-APOS-Provider': usedProvider };
    if (routingResult) {
      headers['X-APOS-Model']       = routingResult.selection.modelName;
      headers['X-APOS-Cost']        = String(routingResult.selection.estimatedCost);
      headers['X-APOS-Decision-Id'] = routingResult.decisionId;
      headers['X-APOS-Task-Type']   = routingResult.taskType;
    }

    return NextResponse.json({
      id:           `msg_${Date.now()}`,
      type:         'message',
      role:         'assistant',
      content:      [{ type: 'text', text: responseText }],
      model:        requestedModel || usedProvider,
      stop_reason:  'end_turn',
      stop_sequence: null,
      usage:        { input_tokens: inputTokens, output_tokens: outputTokens },
    }, { headers: addCorsHeaders(headers) });

  } catch (err: any) {
    console.error('APOS LLM Proxy error:', err);
    
    // 检查是否是超时错误
    if (err.name === 'AbortError' || err.message?.includes('aborted')) {
      return NextResponse.json({
        type: 'error',
        error: {
          type: 'timeout_error',
          message: 'Request timeout after 120 seconds',
        }
      }, { 
        status: 504,
        headers: {
          'Content-Type': 'application/json',
        }
      });
    }
    
    // 分类错误类型
    let errorType = 'api_error';
    let statusCode = 500;
    
    const errorMessage = err.message || 'Unknown error';
    
    if (errorMessage.includes('未配置') || errorMessage.includes('API 密钥') || errorMessage.includes('API key')) {
      errorType = 'authentication_error';
      statusCode = 401;
    } else if (errorMessage.includes('超时') || errorMessage.includes('timeout') || errorMessage.includes('timed out')) {
      errorType = 'timeout_error';
      statusCode = 504;
    } else if (errorMessage.includes('rate limit') || errorMessage.includes('限额') || errorMessage.includes('quota')) {
      errorType = 'rate_limit_error';
      statusCode = 429;
    } else if (errorMessage.includes('invalid') || errorMessage.includes('无效') || errorMessage.includes('Invalid')) {
      errorType = 'invalid_request_error';
      statusCode = 400;
    } else if (errorMessage.includes('not found') || errorMessage.includes('未找到')) {
      errorType = 'not_found_error';
      statusCode = 404;
    }
    
    return NextResponse.json({
      type: 'error',
      error: {
        type: errorType,
        message: errorMessage,
      }
    }, { 
      status: statusCode,
      headers: addCorsHeaders({
        'Content-Type': 'application/json',
      })
    });
  } finally {
    // 清理超时定时器
    clearTimeout(timeoutId);
  }
}

/**
 * 智能模型选择器
 *
 * 优先级（无手动指定时）：
 *   1. Web 网页端模型（免费，通过浏览器扩展）
 *   2. Ollama 本地模型（免费）
 *   3. 云端 API（DeepSeek → Gemini → OpenAI → Anthropic → Custom）
 *
 * 手动指定 model 参数时直接使用指定模型，不走自动优先级。
 *
 * selectCandidates() 返回按优先级排好的候选列表，调用方依次尝试，
 * 失败后自动切换到下一个，对上层完全透明。
 */
class SmartModelSelector {

  /** 构建按优先级排序的候选列表 */
  static async selectCandidates(
    taskType: string,
    estimatedTokens: number,
    requestedModel?: string,
  ): Promise<Array<{ model: any; provider: string; reason: string }>> {
    const available = await getAvailableModels();

    // ── 手动指定：直接返回单一候选 ──────────────────────────────────────────
    if (requestedModel) {
      try {
        const result = await getModelByName(requestedModel);
        return [{ ...result, reason: `User specified: ${requestedModel}` }];
      } catch (e) {
        console.warn(`[SmartModelSelector] Requested model "${requestedModel}" not resolvable, building auto list`);
        // fall through to auto selection
      }
    }

    const candidates: Array<{ model: any; provider: string; reason: string }> = [];

    // ── 第 1 优先：Web 网页端模型（免费）────────────────────────────────────
    const store = getExtProxyStore();
    if (store.isExtensionOnline()) {
      // 按 chatgpt → gemini → kimi 顺序，有 cookie 的才加入
      if (available.chatgptCookies) {
        candidates.push({
          model: { isWebModel: true, type: 'chatgpt' as const },
          provider: 'web',
          reason: 'Web model: ChatGPT (free)',
        });
      }
      if (available.geminiCookies) {
        candidates.push({
          model: { isWebModel: true, type: 'gemini' as const },
          provider: 'web',
          reason: 'Web model: Gemini (free)',
        });
      }
      if (available.kimiCookies) {
        candidates.push({
          model: { isWebModel: true, type: 'kimi' as const },
          provider: 'web',
          reason: 'Web model: Kimi (free)',
        });
      }
      // Google AI Search — 不需要 Cookie/登录，只要扩展在线就可用
      candidates.push({
        model: { isWebModel: true, type: 'google' as const },
        provider: 'web',
        reason: 'Web model: Google AI Search (free, no login)',
      });
    }

    // ── 第 2 优先：Ollama 本地模型（免费）───────────────────────────────────
    if (available.ollamaModels.length > 0) {
      const ollama = createOpenAI({
        baseURL: `${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/v1`,
        apiKey: 'ollama',
      });

      // 根据任务类型挑选最合适的本地模型
      let selectedModel = available.ollamaModels[0];
      let ollamaReason = 'Local Ollama model (free)';

      if (taskType === 'coding' || taskType === 'refactor' || taskType === 'review') {
        const codeModel = available.ollamaModels.find(m =>
          (m.includes('deepseek') && m.includes('coder')) ||
          m.includes('coder') ||
          m.includes('code')
        ) ?? available.ollamaModels.find(m => m.includes('qwen'));
        if (codeModel) { selectedModel = codeModel; ollamaReason = 'Local code model (Ollama, free)'; }
      } else if (taskType === 'reasoning' || taskType === 'planning') {
        const largeModel = available.ollamaModels.find(m =>
          m.includes('14b') || m.includes('32b') || m.includes('70b')
        );
        if (largeModel) { selectedModel = largeModel; ollamaReason = 'Local large model for reasoning (Ollama, free)'; }
      } else {
        const qwen = available.ollamaModels.find(m => m.includes('qwen'));
        if (qwen) selectedModel = qwen;
      }

      candidates.push({
        model: ollama(selectedModel),
        provider: 'ollama',
        reason: ollamaReason,
      });
    }

    // ── 第 3 优先：云端 API ──────────────────────────────────────────────────
    // 大上下文任务优先长上下文模型
    if (estimatedTokens > 10000) {
      if (available.googleKey) {
        const google = createGoogleGenerativeAI({ apiKey: available.googleKey });
        candidates.push({ model: google('gemini-1.5-pro-latest'), provider: 'google', reason: 'Large context: Gemini Pro (1M tokens)' });
      }
      if (available.anthropicKey) {
        const anthropic = createAnthropic({ apiKey: available.anthropicKey });
        candidates.push({ model: anthropic('claude-3-5-sonnet-20241022'), provider: 'anthropic', reason: 'Large context: Claude Sonnet (200K tokens)' });
      }
    }

    // 推理任务
    if (taskType === 'reasoning' || taskType === 'planning') {
      if (available.deepseekKey) {
        const ds = createOpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey: available.deepseekKey });
        candidates.push({ model: ds('deepseek-reasoner'), provider: 'deepseek', reason: 'Reasoning: DeepSeek Reasoner' });
      }
      if (available.anthropicKey) {
        const anthropic = createAnthropic({ apiKey: available.anthropicKey });
        candidates.push({ model: anthropic('claude-3-5-sonnet-20241022'), provider: 'anthropic', reason: 'Reasoning: Claude Sonnet' });
      }
      if (available.openaiKey) {
        const openai = createOpenAI({ apiKey: available.openaiKey });
        candidates.push({ model: openai('gpt-4o'), provider: 'openai', reason: 'Reasoning: GPT-4o' });
      }
    }

    // 编码任务
    if (taskType === 'coding' || taskType === 'refactor' || taskType === 'review') {
      if (available.deepseekKey) {
        const ds = createOpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey: available.deepseekKey });
        candidates.push({ model: ds('deepseek-chat'), provider: 'deepseek', reason: 'Coding: DeepSeek Chat' });
      }
      if (available.anthropicKey) {
        const anthropic = createAnthropic({ apiKey: available.anthropicKey });
        candidates.push({ model: anthropic('claude-3-5-sonnet-20241022'), provider: 'anthropic', reason: 'Coding: Claude Sonnet' });
      }
    }

    // 通用 API 兜底（DeepSeek → Gemini Flash → GPT-4o-mini → Claude Haiku → Custom）
    if (available.deepseekKey) {
      const ds = createOpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey: available.deepseekKey });
      candidates.push({ model: ds('deepseek-chat'), provider: 'deepseek', reason: 'API fallback: DeepSeek Chat' });
    }
    if (available.googleKey) {
      const google = createGoogleGenerativeAI({ apiKey: available.googleKey });
      candidates.push({ model: google('gemini-1.5-flash-latest'), provider: 'google', reason: 'API fallback: Gemini Flash' });
    }
    if (available.openaiKey) {
      const openai = createOpenAI({ apiKey: available.openaiKey });
      candidates.push({ model: openai('gpt-4o-mini'), provider: 'openai', reason: 'API fallback: GPT-4o-mini' });
    }
    if (available.anthropicKey) {
      const anthropic = createAnthropic({ apiKey: available.anthropicKey });
      candidates.push({ model: anthropic('claude-3-5-haiku-20241022'), provider: 'anthropic', reason: 'API fallback: Claude Haiku' });
    }
    if (available.customKey && available.customBase) {
      const custom = createOpenAI({ baseURL: available.customBase, apiKey: available.customKey });
      candidates.push({ model: custom(available.customModel || 'gpt-4o'), provider: 'custom', reason: 'API fallback: Custom OpenAI-compatible' });
    }

    // 去重：同一 provider+model 只保留第一次出现
    const seen = new Set<string>();
    return candidates.filter(c => {
      const key = `${c.provider}:${typeof c.model === 'object' && c.model?.isWebModel ? c.model.type : (c.model?.modelId ?? c.provider)}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }

  /** 向后兼容：返回第一个候选（旧调用方使用） */
  static async selectBestModel(
    taskType: string,
    estimatedTokens: number,
    requestedModel?: string,
  ): Promise<{ model: any; provider: string; reason: string }> {
    const candidates = await this.selectCandidates(taskType, estimatedTokens, requestedModel);
    if (candidates.length === 0) {
      // 最终兜底
      const result = await routeModel(taskType as any);
      return { ...result, reason: 'Legacy router fallback - no candidates' };
    }
    return candidates[0];
  }
}

/**
 * 获取所有可用的 API Keys 和模型
 * 用于降级机制
 */
async function getAvailableModels(): Promise<{
  ollamaModels: string[];
  chatgptCookies?: string;
  geminiCookies?: string;
  kimiCookies?: string;
  googleKey?: string;
  deepseekKey?: string;
  openaiKey?: string;
  anthropicKey?: string;
  customKey?: string;
  customBase?: string;
  customModel?: string;
}> {
  let keysMap = new Map<string, string>();
  
  try {
    const list = await db.select().from(settings);
    keysMap = new Map(list.map(s => [s.key, s.value]));
  } catch (error) {
    console.warn('[APOS] Failed to read settings', error);
  }

  return {
    ollamaModels: await getOllamaModels(),
    chatgptCookies: keysMap.get('chatgpt_cookies'),
    geminiCookies: keysMap.get('gemini_cookies'),
    kimiCookies: keysMap.get('kimi_cookies'),
    googleKey: keysMap.get('google_api_key'),
    deepseekKey: keysMap.get('deepseek_api_key'),
    openaiKey: keysMap.get('openai_api_key'),
    anthropicKey: keysMap.get('anthropic_api_key'),
    customKey: keysMap.get('custom_openai_api_key'),
    customBase: keysMap.get('custom_openai_base_url'),
    customModel: keysMap.get('custom_openai_model'),
  };
}


/**
 * 根据模型名称获取模型实例
 * 支持 Anthropic 模型名称映射
 */
async function getModelByName(modelName: string): Promise<{ model: any; provider: string }> {
  let keysMap = new Map<string, string>();
  
  try {
    const list = await db.select().from(settings);
    keysMap = new Map(list.map(s => [s.key, s.value]));
  } catch (error) {
    console.warn('[APOS] Failed to read settings for model selection', error);
  }

  const anthropicKey = keysMap.get('anthropic_api_key');
  const openaiKey = keysMap.get('openai_api_key');
  const googleKey = keysMap.get('google_api_key');
  const deepseekKey = keysMap.get('deepseek_api_key');

  // Google AI 搜索网页版 (isWebModel)
  if (modelName === 'google' || modelName === 'google_web') {
    return { model: { isWebModel: true, type: 'google' as const }, provider: 'web' };
  }

  // Anthropic 模型映射
  if (modelName.startsWith('claude-')) {
    if (anthropicKey) {
      const anthropic = createAnthropic({ apiKey: anthropicKey });
      return { model: anthropic(modelName), provider: 'anthropic' };
    }
    console.warn(`[APOS] Anthropic API key not configured, falling back for model: ${modelName}`);
    // Fall through to default routing
  }

  // OpenAI 模型映射
  if (modelName.startsWith('gpt-')) {
    if (openaiKey) {
      const openai = createOpenAI({ apiKey: openaiKey });
      return { model: openai(modelName), provider: 'openai' };
    }
    console.warn(`[APOS] OpenAI API key not configured, falling back for model: ${modelName}`);
    // Fall through to default routing
  }

  // Gemini 模型映射
  if (modelName.startsWith('gemini-')) {
    if (googleKey) {
      const google = createGoogleGenerativeAI({ apiKey: googleKey });
      return { model: google(modelName), provider: 'google' };
    }
    console.warn(`[APOS] Google API key not configured, falling back for model: ${modelName}`);
    // Fall through to default routing
  }

  // DeepSeek 模型映射
  if (modelName.startsWith('deepseek-')) {
    if (deepseekKey) {
      const ds = createOpenAI({ baseURL: 'https://api.deepseek.com/v1', apiKey: deepseekKey });
      return { model: ds(modelName), provider: 'deepseek' };
    }
    console.warn(`[APOS] DeepSeek API key not configured, falling back for model: ${modelName}`);
    // Fall through to default routing
  }

  // Ollama 本地模型映射
  if (modelName.includes('qwen') || modelName.includes('llama') || modelName.includes('gemma') || 
      modelName.includes('mistral') || modelName.includes('deepseek') || modelName.includes('coder')) {
    const ollamaModels = await getOllamaModels();
    const matchedModel = ollamaModels.find(m => m.includes(modelName) || modelName.includes(m.split(':')[0]));
    if (matchedModel) {
      console.log(`[APOS] Using Ollama model: ${matchedModel}`);
      const ollama = createOpenAI({
        baseURL: `${process.env.OLLAMA_BASE_URL || 'http://localhost:11434'}/v1`,
        apiKey: 'ollama',
      });
      return { model: ollama(matchedModel), provider: 'ollama' };
    }
  }

  // 未知模型或 API key 未配置，使用默认路由
  console.warn(`[APOS] Unknown or unconfigured model: ${modelName}, using default routing`);
  const result = await routeModel('default');
  return result;
}

/**
 * Token 计数器 - 精确估算文本的 token 数量
 * 支持多种模型的精确计数
 */
class TokenCounter {
  private static encodingCache: Map<string, any> = new Map();

  /**
   * 获取模型的编码器（带缓存）
   */
  private static async getEncoding(modelName?: string): Promise<any | null> {
    if (!modelName) return null;

    // 检查缓存
    if (this.encodingCache.has(modelName)) {
      return this.encodingCache.get(modelName);
    }

    try {
      const { encoding_for_model } = await import('tiktoken');
      
      // 映射模型名称到 tiktoken 支持的模型
      let tiktokenModel = modelName;
      if (modelName.startsWith('gpt-4o')) {
        tiktokenModel = 'gpt-4o';
      } else if (modelName.startsWith('gpt-4-turbo')) {
        tiktokenModel = 'gpt-4-turbo';
      } else if (modelName.startsWith('gpt-4')) {
        tiktokenModel = 'gpt-4';
      } else if (modelName.startsWith('gpt-3.5-turbo')) {
        tiktokenModel = 'gpt-3.5-turbo';
      }

      const encoding = encoding_for_model(tiktokenModel as any);
      this.encodingCache.set(modelName, encoding);
      return encoding;
    } catch (e) {
      // tiktoken 不支持该模型，返回 null 使用启发式方法
      return null;
    }
  }

  /**
   * 估算文本的 token 数量
   * 优先使用 tiktoken 精确计数，降级到启发式方法
   */
  static async estimateAsync(text: string, modelName?: string): Promise<number> {
    if (!text) return 0;

    // 尝试使用 tiktoken 精确计数
    if (modelName) {
      const encoding = await this.getEncoding(modelName);
      if (encoding) {
        try {
          const tokens = encoding.encode(text);
          return tokens.length;
        } catch (e) {
          // 编码失败，降级到启发式方法
        }
      }
    }

    // 启发式方法（降级）
    return this.estimate(text);
  }

  /**
   * 估算文本的 token 数量（同步版本，使用启发式方法）
   * 使用启发式方法：中文约 1.5 字符/token，英文约 4 字符/token
   */
  static estimate(text: string): number {
    if (!text) return 0;
    
    // 统计中文字符（包括中文标点）
    const chineseChars = (text.match(/[\u4e00-\u9fa5\u3000-\u303f\uff00-\uffef]/g) || []).length;
    // 统计其他字符
    const otherChars = text.length - chineseChars;
    
    // 中文：1.5 字符/token，英文：4 字符/token
    return Math.ceil(chineseChars / 1.5 + otherChars / 4);
  }

  /**
   * 估算消息数组的 token 数量（异步版本）
   */
  static async estimateMessagesAsync(messages: any[], modelName?: string): Promise<number> {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += await this.estimateAsync(msg.content, modelName);
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.text) {
            total += await this.estimateAsync(block.text, modelName);
          }
          // 图片等其他类型暂时按 100 tokens 计算
          if (block.type === 'image') {
            total += 100;
          }
        }
      }
      // 每条消息额外 4 tokens（角色标记、格式等）
      total += 4;
    }
    return total;
  }

  /**
   * 估算消息数组的 token 数量（同步版本）
   */
  static estimateMessages(messages: any[]): number {
    let total = 0;
    for (const msg of messages) {
      if (typeof msg.content === 'string') {
        total += this.estimate(msg.content);
      } else if (Array.isArray(msg.content)) {
        for (const block of msg.content) {
          if (block.text) {
            total += this.estimate(block.text);
          }
          // 图片等其他类型暂时按 100 tokens 计算
          if (block.type === 'image') {
            total += 100;
          }
        }
      }
      // 每条消息额外 4 tokens（角色标记、格式等）
      total += 4;
    }
    return total;
  }

  /**
   * 清理编码器缓存（释放内存）
   */
  static clearCache(): void {
    for (const encoding of this.encodingCache.values()) {
      if (encoding && typeof encoding.free === 'function') {
        encoding.free();
      }
    }
    this.encodingCache.clear();
  }
}
