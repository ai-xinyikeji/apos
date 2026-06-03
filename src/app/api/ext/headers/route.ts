/**
 * GET  /api/ext/headers?provider=chatgpt|gemini|kimi
 * POST /api/ext/headers  { provider, headers: {...} }
 *
 * 存取浏览器扩展捕获的完整请求头（User-Agent、Authorization、cf-clearance 等）。
 * 这些头比单纯的 cookie 更稳定，可以避免 403 / Cloudflare 拦截。
 */

import { NextRequest, NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { settings } from '@/lib/schema';
import { eq } from 'drizzle-orm';

const PROVIDER_KEY_MAP: Record<string, string> = {
  chatgpt: 'chatgpt_headers',
  gemini: 'gemini_headers',
  kimi: 'kimi_headers',
};

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
      return NextResponse.json({ headers: null });
    }

    try {
      return NextResponse.json({ headers: JSON.parse(row.value) });
    } catch {
      return NextResponse.json({ headers: row.value });
    }
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { provider, headers } = body;

    if (!provider || !PROVIDER_KEY_MAP[provider]) {
      return NextResponse.json({ error: 'Invalid provider' }, { status: 400 });
    }

    const dbKey = PROVIDER_KEY_MAP[provider];
    const value = typeof headers === 'string' ? headers : JSON.stringify(headers);

    const existing = await db.select().from(settings).where(eq(settings.key, dbKey));
    if (existing.length > 0) {
      await db.update(settings)
        .set({ value, updatedAt: new Date().toISOString() })
        .where(eq(settings.key, dbKey));
    } else {
      await db.insert(settings).values({ key: dbKey, value });
    }

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
