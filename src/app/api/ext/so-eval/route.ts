/**
 * POST /api/ext/so-eval
 *
 * Execute ChatGPT's `so` (session object) collector scripts server-side.
 * Browser CSP blocks eval() everywhere, so we run the scripts in Node.js
 * using the `vm` module in a sandboxed context that mimics browser globals.
 *
 * Request body: { collectorDx: string, snapshotDx: string }
 * Response:     { snapshot: unknown }
 */

import { NextRequest, NextResponse } from 'next/server';
import vm from 'vm';

export const dynamic = 'force-dynamic';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: { collectorDx?: string; snapshotDx?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS });
  }

  const { collectorDx, snapshotDx } = body;
  if (typeof collectorDx !== 'string' || typeof snapshotDx !== 'string') {
    return NextResponse.json({ error: 'Missing collectorDx or snapshotDx' }, { status: 400, headers: CORS_HEADERS });
  }

  try {
    // Build a browser-like sandbox context for the scripts to run in.
    // The scripts may reference navigator, screen, window, etc.
    const sandbox: Record<string, unknown> = {
      // Browser globals the scripts commonly reference
      navigator: {
        userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36',
        language: 'en-US',
        languages: ['en-US', 'en'],
        platform: 'MacIntel',
        hardwareConcurrency: 8,
        maxTouchPoints: 0,
        cookieEnabled: true,
        onLine: true,
        vendor: 'Google Inc.',
        appName: 'Netscape',
        appVersion: '5.0 (Macintosh)',
        product: 'Gecko',
        productSub: '20030107',
        webdriver: false,
      },
      screen: {
        width: 1920,
        height: 1080,
        availWidth: 1920,
        availHeight: 1040,
        colorDepth: 24,
        pixelDepth: 24,
        orientation: { type: 'landscape-primary', angle: 0 },
      },
      window: {} as Record<string, unknown>,
      document: {
        cookie: '',
        referrer: '',
        title: 'ChatGPT',
        location: { href: 'https://chatgpt.com/', hostname: 'chatgpt.com', origin: 'https://chatgpt.com' },
        createElement: () => ({ style: {}, setAttribute: () => {}, appendChild: () => {} }),
        getElementById: () => null,
        querySelector: () => null,
        querySelectorAll: () => [],
        body: { appendChild: () => {}, removeChild: () => {} },
        head: { appendChild: () => {}, removeChild: () => {} },
        documentElement: { appendChild: () => {}, removeChild: () => {} },
      },
      location: {
        href: 'https://chatgpt.com/',
        hostname: 'chatgpt.com',
        origin: 'https://chatgpt.com',
        pathname: '/',
        protocol: 'https:',
      },
      performance: {
        now: () => Date.now(),
        timeOrigin: Date.now() - 5000,
      },
      crypto: {
        getRandomValues: (arr: Uint8Array) => {
          for (let i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
          return arr;
        },
        randomUUID: () => {
          return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
            const r = Math.random() * 16 | 0;
            return (c === 'x' ? r : (r & 0x3 | 0x8)).toString(16);
          });
        },
      },
      Math,
      Date,
      JSON,
      Array,
      Object,
      String,
      Number,
      Boolean,
      RegExp,
      Error,
      TypeError,
      parseInt,
      parseFloat,
      isNaN,
      isFinite,
      encodeURIComponent,
      decodeURIComponent,
      btoa: (s: string) => Buffer.from(s, 'binary').toString('base64'),
      atob: (s: string) => Buffer.from(s, 'base64').toString('binary'),
      setTimeout: (fn: () => void, _ms: number) => { try { fn(); } catch { /* ignore */ } return 0; },
      clearTimeout: () => {},
      setInterval: () => 0,
      clearInterval: () => {},
      console: {
        log: (...args: unknown[]) => console.log('[SO sandbox]', ...args),
        warn: (...args: unknown[]) => console.warn('[SO sandbox]', ...args),
        error: (...args: unknown[]) => console.error('[SO sandbox]', ...args),
      },
      // Snapshot result storage
      __snapshot: undefined as unknown,
    };

    // Make window === sandbox (scripts often use window.X = ...)
    sandbox.window = sandbox;
    // Make self === sandbox (service worker pattern)
    (sandbox as Record<string, unknown>).self = sandbox;

    // Log script previews for debugging
    console.log('[SO eval] collector_dx preview:', collectorDx.slice(0, 200));
    console.log('[SO eval] snapshot_dx preview:', snapshotDx.slice(0, 200));
    console.log('[SO eval] collector_dx length:', collectorDx.length, 'snapshot_dx length:', snapshotDx.length);

    // Create the VM context
    const ctx = vm.createContext(sandbox);

    // Snapshot all sandbox keys before execution
    const keysBefore = new Set(Object.keys(sandbox));

    // Execute collector_dx
    const collectorErrors: string[] = [];
    try {
      vm.runInContext(collectorDx, ctx, { timeout: 3000, filename: 'collector_dx.js' });
    } catch (e) {
      const msg = (e as Error).message;
      collectorErrors.push(msg);
      console.warn('[SO eval] collector_dx execution error:', msg);
    }

    // Execute snapshot_dx — may return the snapshot directly
    let directResult: unknown;
    const snapshotErrors: string[] = [];
    try {
      directResult = vm.runInContext(snapshotDx, ctx, { timeout: 3000, filename: 'snapshot_dx.js' });
    } catch (e) {
      const msg = (e as Error).message;
      snapshotErrors.push(msg);
      console.warn('[SO eval] snapshot_dx execution error:', msg);
    }

    // Log all new keys added to sandbox after execution
    const newKeys = Object.keys(sandbox).filter(k => !keysBefore.has(k));
    console.log('[SO eval] new sandbox keys after execution:', newKeys);
    console.log('[SO eval] directResult type:', typeof directResult, 'value:', JSON.stringify(directResult)?.slice(0, 200));
    for (const k of newKeys) {
      console.log(`[SO eval] sandbox.${k} =`, JSON.stringify((sandbox as Record<string,unknown>)[k])?.slice(0, 200));
    }
    // Also log any errors for debugging
    if (collectorErrors.length) console.log('[SO eval] collector errors:', collectorErrors);
    if (snapshotErrors.length) console.log('[SO eval] snapshot errors:', snapshotErrors);

    // Find the snapshot using various patterns
    let snapshot: unknown = null;

    // 1. Direct return value from snapshot_dx
    if (directResult !== undefined && directResult !== null) {
      snapshot = directResult;
      console.log('[SO eval] snapshot from direct return, type:', typeof snapshot);
    }

    // 2. Well-known global names
    if (snapshot === null) {
      const candidates = ['__snapshot', 'snapshot', 'dx', '_dx', '__dx',
                          'soSnapshot', 'sessionSnapshot', 'deviceSnapshot',
                          'fingerprintSnapshot', '__so', '_so', 'so'];
      for (const k of candidates) {
        const v = (sandbox as Record<string, unknown>)[k];
        if (v !== undefined && v !== null) {
          snapshot = v;
          console.log(`[SO eval] snapshot from sandbox.${k}`);
          break;
        }
      }
    }

    // 3. Well-known function names
    if (snapshot === null) {
      const fns = ['getSnapshot', 'getDx', 'getSessionObject', 'collectSnapshot',
                   'generateSnapshot', 'buildSnapshot', 'getDeviceSnapshot'];
      for (const fn of fns) {
        const f = (sandbox as Record<string, unknown>)[fn];
        if (typeof f === 'function') {
          try {
            const r = (f as () => unknown)();
            if (r !== null && r !== undefined) {
              snapshot = r;
              console.log(`[SO eval] snapshot from sandbox.${fn}()`);
              break;
            }
          } catch { /* skip */ }
        }
      }
    }

    // 4. Scan all sandbox keys for new non-primitive values
    if (snapshot === null) {
      const builtinKeys = new Set(['navigator', 'screen', 'window', 'document', 'location',
        'performance', 'crypto', 'Math', 'Date', 'JSON', 'Array', 'Object', 'String',
        'Number', 'Boolean', 'RegExp', 'Error', 'TypeError', 'parseInt', 'parseFloat',
        'isNaN', 'isFinite', 'encodeURIComponent', 'decodeURIComponent', 'btoa', 'atob',
        'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'console',
        '__snapshot', 'self']);
      for (const [k, v] of Object.entries(sandbox)) {
        if (builtinKeys.has(k)) continue;
        if (v !== undefined && v !== null && typeof v === 'object') {
          snapshot = v;
          console.log(`[SO eval] snapshot from new sandbox key: ${k}`);
          break;
        }
        if (typeof v === 'string' && v.length > 20) {
          snapshot = v;
          console.log(`[SO eval] snapshot from new string key: ${k}`);
          break;
        }
      }
    }

    console.log('[SO eval] final snapshot type:', typeof snapshot, 'null?', snapshot === null);

    return NextResponse.json({ snapshot }, { headers: CORS_HEADERS });

  } catch (e) {
    console.error('[SO eval] fatal error:', (e as Error).message);
    return NextResponse.json({ error: (e as Error).message }, { status: 500, headers: CORS_HEADERS });
  }
}
