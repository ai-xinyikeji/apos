import { NextResponse } from 'next/server';

// Health check endpoint for Claude CLI
// Claude CLI sends HEAD /v1 to verify the proxy is alive
export async function HEAD() {
  return new NextResponse(null, { status: 200 });
}

export async function GET() {
  return NextResponse.json({ status: 'ok', proxy: 'apos' });
}
