import { NextRequest, NextResponse } from 'next/server';
import { routeModel, generateText } from '@/lib/llm';
import { streamText } from 'ai';
import { manageContext } from '@/lib/context-manager';
import { LocalModelOptimizer } from '@/lib/local-model-optimizer';
import { EnhancedRoutingSystem } from '@/lib/routing/enhanced-routing-system';
import { CostRecorder } from '@/lib/cost/cost-recorder';

export const dynamic = 'force-dynamic';

const routingSystem = new EnhancedRoutingSystem();
const costRecorder  = new CostRecorder();

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { messages, system, temperature, max_tokens, stream } = body;

    console.log(`[APOS LLM Proxy] Request received with ${messages?.length || 0} messages`);

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
    const { model, provider } = routedProvider
      ? await routeModel(routedProvider as any)
      : await routeModel(taskType as any);

    console.log(`[APOS LLM Proxy] Routing to provider: ${provider}`);

    // Handle system parameter - it can be string, object, or array
    let systemPrompt = '';
    if (typeof system === 'string') {
      systemPrompt = system;
    } else if (Array.isArray(system)) {
      systemPrompt = system.map((s: any) => s.text || s.content || JSON.stringify(s)).join('\n');
    } else if (system && typeof system === 'object') {
      systemPrompt = (system as any).text || (system as any).content || JSON.stringify(system);
    }

    // Apply three-layer context management
    const contextResult = await manageContext(
      messages || [],
      systemPrompt,
      provider,
      model.modelId,
      true  // Enable compression
    );

    const processedMessages = contextResult.messages;
    const processedSystem = contextResult.system;

    // Log context management statistics
    console.log(`[APOS ContextManager] Stats:`, {
      originalTokens: contextResult.stats.originalTokenEstimate,
      finalTokens: contextResult.stats.finalTokenEstimate,
      reduction: `${contextResult.stats.reductionPercent}%`,
      layer1_compression: contextResult.stats.layer1_codeCompression,
      layer2_summarization: contextResult.stats.layer2_summarization,
      layer3_memory: contextResult.stats.layer3_memoryRetrieval,
      memoriesRetrieved: contextResult.stats.memoriesRetrieved,
    });

    // Use LocalModelOptimizer for ollama provider
    if (provider === 'ollama' && !stream) {
      try {
        const optimizer = new LocalModelOptimizer({
          maxMessages: 10,
          summarizationThreshold: 24_000,
          enableLocalCache: true,
          cacheExpiry: 300,
          maxTokens: max_tokens || 2048,
          temperature: temperature || 0.7,
        });

        const result = await optimizer.generate(
          processedMessages,
          processedSystem,
          taskType
        );

        console.log(`[APOS LocalOptimizer] Stats:`, {
          model: result.model,
          contextOptimization: result.stats.context,
          performance: result.stats.performance,
          cache: result.stats.cache,
        });

        return NextResponse.json({
          id: `msg_${Date.now()}`,
          type: 'message',
          role: 'assistant',
          content: [{ type: 'text', text: result.text }],
          model: result.model,
          stop_reason: 'end_turn',
          stop_sequence: null,
          usage: { input_tokens: 0, output_tokens: 0 },
        });
      } catch (err: any) {
        console.error('[APOS LocalOptimizer] Failed, falling back to standard generation:', err.message);
        // Fall through to standard generation
      }
    }

    if (stream) {
      const result = await streamText({
        model,
        messages: processedMessages,
        system: processedSystem,
        temperature: temperature,
        maxOutputTokens: max_tokens,
      });

      const encoder = new TextEncoder();
      const customStream = new ReadableStream({
        async start(controller) {
          // message_start
          controller.enqueue(encoder.encode(`event: message_start\ndata: ${JSON.stringify({
            type: "message_start",
            message: { id: `msg_${Date.now()}`, type: "message", role: "assistant", content: [], model: provider, stop_reason: null, stop_sequence: null, usage: { input_tokens: 0, output_tokens: 0 } }
          })}\n\n`));

          // content_block_start
          controller.enqueue(encoder.encode(`event: content_block_start\ndata: ${JSON.stringify({
            type: "content_block_start",
            index: 0,
            content_block: { type: "text", text: "" }
          })}\n\n`));

          try {
            for await (const chunk of result.textStream) {
              controller.enqueue(encoder.encode(`event: content_block_delta\ndata: ${JSON.stringify({
                type: "content_block_delta",
                index: 0,
                delta: { type: "text_delta", text: chunk }
              })}\n\n`));
            }
          } catch (e: any) {
            console.error('Error streaming:', e);
          }

          // content_block_stop
          controller.enqueue(encoder.encode(`event: content_block_stop\ndata: ${JSON.stringify({
            type: "content_block_stop",
            index: 0
          })}\n\n`));

          // message_delta
          controller.enqueue(encoder.encode(`event: message_delta\ndata: ${JSON.stringify({
            type: "message_delta",
            delta: { stop_reason: "end_turn", stop_sequence: null },
            usage: { output_tokens: 0 }
          })}\n\n`));

          // message_stop
          controller.enqueue(encoder.encode(`event: message_stop\ndata: ${JSON.stringify({
            type: "message_stop"
          })}\n\n`));

          controller.close();
        }
      });

      return new Response(customStream, {
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
          // Task 14.5: routing info headers
          ...(routingResult ? {
            'X-APOS-Model':       routingResult.selection.modelName,
            'X-APOS-Provider':    routingResult.selection.provider,
            'X-APOS-Cost':        String(routingResult.selection.estimatedCost),
            'X-APOS-Decision-Id': routingResult.decisionId,
            'X-APOS-Task-Type':   routingResult.taskType,
          } : {}),
        },
      });
    } else {
      const response = await generateText({
        model,
        messages: processedMessages,
        system: processedSystem,
        temperature: temperature,
        maxOutputTokens: max_tokens,
      });

      // ── Task 14.4: Record cost asynchronously ─────────────────────────────
      const usage = (response as any).usage;
      if (usage && routingResult) {
        costRecorder.record({
          provider,
          modelName: routedModel || provider,
          taskType: (routingResult.taskType as any) ?? 'default',
          inputTokens:  usage.promptTokens    ?? usage.inputTokens    ?? 0,
          outputTokens: usage.completionTokens ?? usage.outputTokens   ?? 0,
          cacheCreationTokens: usage.cacheCreationTokens ?? 0,
          cacheReadTokens:     usage.cacheReadTokens     ?? 0,
          routingDecisionId: routingResult.decisionId,
        });
      }

      // ── Task 14.5: Add routing info headers ───────────────────────────────
      const headers: Record<string, string> = {};
      if (routingResult) {
        headers['X-APOS-Model']       = routingResult.selection.modelName;
        headers['X-APOS-Provider']    = routingResult.selection.provider;
        headers['X-APOS-Cost']        = String(routingResult.selection.estimatedCost);
        headers['X-APOS-Decision-Id'] = routingResult.decisionId;
        headers['X-APOS-Task-Type']   = routingResult.taskType;
      }

      return NextResponse.json({
        id: `msg_${Date.now()}`,
        type: 'message',
        role: 'assistant',
        content: [{ type: 'text', text: response.text || '' }],
        model: provider,
        stop_reason: 'end_turn',
        stop_sequence: null,
        usage: { input_tokens: 0, output_tokens: 0 },
      }, { headers });
    }

  } catch (err: any) {
    console.error('APOS LLM Proxy error:', err);
    return NextResponse.json({
      error: {
        type: 'api_error',
        message: `APOS LLM Router Proxy error: ${err.message}`,
      }
    }, { status: 500 });
  }
}
