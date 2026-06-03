import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { settings } from '@/lib/schema';
import { getExtProxyStore } from '@/lib/ext-proxy-store';
import { getExtStatusStore } from '@/lib/ext-status-store';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function GET() {
  try {
    const list = await db.select().from(settings);
    const keysMap = new Map(list.map(s => [s.key, s.value]));

    const extStore = getExtProxyStore();
    const statusStore = getExtStatusStore();
    const snapshot = statusStore.getSnapshot();

    return NextResponse.json({
      // API key status
      openai: !!keysMap.get('openai_api_key'),
      anthropic: !!keysMap.get('anthropic_api_key'),
      google: !!keysMap.get('google_api_key'),
      github: !!keysMap.get('github_token'),
      // Extension status
      extensionOnline: extStore.isExtensionOnline(),
      queueLength: extStore.queueLength(),
      pendingCount: extStore.pendingCount(),
      // Tab statuses
      tabs: snapshot.tabs,
    }, { headers: CORS_HEADERS });
  } catch (error: any) {
    console.error('Error fetching settings status:', error);
    return NextResponse.json({ error: error.message }, { status: 500, headers: CORS_HEADERS });
  }
}
