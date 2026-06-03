/**
 * POST /api/ext/test-connection
 * 
 * 测试与 LLM Provider 的连接
 * Body: { provider: 'chatgpt' | 'gemini' | 'kimi' }
 * 
 * 返回: { taskId: string }
 */

import { NextRequest, NextResponse } from 'next/server';
import { getExtProxyStore, type ExtProxyProvider } from '@/lib/ext-proxy-store';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, prompt } = body;

    if (!provider || !['chatgpt', 'gemini', 'kimi', 'google'].includes(provider)) {
      return NextResponse.json(
        { error: 'Invalid provider. Must be one of: chatgpt, gemini, kimi, google' },
        { status: 400, headers: CORS_HEADERS }
      );
    }

    const store = getExtProxyStore();

    // Check if extension is online
    if (!store.isExtensionOnline()) {
      return NextResponse.json(
        { error: 'Extension offline. Please ensure the APOS extension is loaded and active.' },
        { status: 503, headers: CORS_HEADERS }
      );
    }

    // Create test task
    const testPrompt = prompt || '你好，请简单回复"测试成功"即可';
    const taskId = store.dispatchStreaming(provider as ExtProxyProvider, testPrompt);

    return NextResponse.json(
      { taskId },
      { headers: CORS_HEADERS }
    );

  } catch (error: any) {
    console.error('[Test Connection] Error:', error);
    return NextResponse.json(
      { error: error.message || 'Internal server error' },
      { status: 500, headers: CORS_HEADERS }
    );
  }
}
