import { NextResponse } from 'next/server';

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const url = searchParams.get('url');
    if (!url) {
      return NextResponse.json({ available: false, error: 'URL is required' }, { status: 400 });
    }

    // Target the specific status API of OpenHands
    const statusUrl = url.endsWith('/') ? `${url}api/status` : `${url}/api/status`;
    
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1500); // 1.5 seconds timeout

    try {
      const response = await fetch(statusUrl, {
        method: 'GET',
        signal: controller.signal,
      });
      clearTimeout(timeoutId);
      return NextResponse.json({
        available: response.ok || response.status === 401 || response.status === 403,
        status: response.status,
      });
    } catch (fetchErr: any) {
      clearTimeout(timeoutId);
      
      // Fallback: try checking root URL if status subpath timed out or refused
      const rootController = new AbortController();
      const rootTimeoutId = setTimeout(() => rootController.abort(), 1500);
      try {
        const rootResponse = await fetch(url, {
          method: 'GET',
          signal: rootController.signal,
        });
        clearTimeout(rootTimeoutId);
        return NextResponse.json({
          available: rootResponse.ok || rootResponse.status === 401 || rootResponse.status === 403,
          status: rootResponse.status,
        });
      } catch (rootErr) {
        clearTimeout(rootTimeoutId);
        return NextResponse.json({ available: false, error: fetchErr.message });
      }
    }
  } catch (err: any) {
    return NextResponse.json({ available: false, error: err.message }, { status: 500 });
  }
}
