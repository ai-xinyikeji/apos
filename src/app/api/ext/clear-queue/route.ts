import { NextResponse } from 'next/server';
import { getExtProxyStore } from '@/lib/ext-proxy-store';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST() {
  try {
    const store = getExtProxyStore();
    store.clear();
    console.log(`[APOS Store] Queue and pending tasks cleared manually`);
    return NextResponse.json({ success: true, message: 'Queue cleared' }, { headers: CORS_HEADERS });
  } catch (err: any) {
    return NextResponse.json({ error: err.message }, { status: 500, headers: CORS_HEADERS });
  }
}
