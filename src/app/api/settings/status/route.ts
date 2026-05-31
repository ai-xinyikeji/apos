import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { settings } from '@/lib/schema';

export async function GET() {
  try {
    const list = await db.select().from(settings);
    const keysMap = new Map(list.map(s => [s.key, s.value]));
    
    return NextResponse.json({
      openai: !!keysMap.get('openai_api_key'),
      anthropic: !!keysMap.get('anthropic_api_key'),
      google: !!keysMap.get('google_api_key'),
      github: !!keysMap.get('github_token'),
      chatgpt_cookies: !!keysMap.get('chatgpt_cookies'),
      gemini_cookies: !!keysMap.get('gemini_cookies'),
    });
  } catch (error: any) {
    console.error('Error fetching settings status:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
