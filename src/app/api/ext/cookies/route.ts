import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { settings } from '@/lib/schema';

const PROVIDER_KEY_MAP: Record<string, string> = {
  chatgpt: 'chatgpt_cookies',
  gemini: 'gemini_cookies',
  kimi: 'kimi_cookies',
};

/**
 * GET /api/ext/cookies?provider=chatgpt|gemini|kimi
 *
 * Returns the latest stored cookies for a given provider.
 * Used by the browser extension after a re-sync to retry a failed LLM task
 * with fresh cookies without needing to restart the task from scratch.
 */
export async function GET(req: NextRequest) {
  const provider = req.nextUrl.searchParams.get('provider');

  if (!provider || !PROVIDER_KEY_MAP[provider]) {
    return NextResponse.json(
      { error: `Invalid provider. Must be one of: ${Object.keys(PROVIDER_KEY_MAP).join(', ')}` },
      { status: 400 }
    );
  }

  try {
    const dbKey = PROVIDER_KEY_MAP[provider];
    const rows = await db.select().from(settings);
    const row = rows.find(r => r.key === dbKey);

    if (!row?.value) {
      return NextResponse.json({ cookies: null });
    }

    return NextResponse.json({ cookies: row.value });
  } catch (error: any) {
    console.error('[ext/cookies] Failed to fetch cookies:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
