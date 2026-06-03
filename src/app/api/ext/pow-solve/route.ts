/**
 * POST /api/ext/pow-solve
 *
 * ChatGPT PoW 挑战求解器。
 * SubtleCrypto 不支持 SHA3-512，所以由服务器用 Node crypto 求解。
 *
 * ChatGPT PoW 算法：
 *   difficulty 是一个十六进制字符串（如 "0714ff"）
 *   找到整数 i，使得 sha3-512(seed + i) 的十六进制字符串 < difficulty 左填充到 128 位
 *   即：hash.padEnd(128,'0') < difficulty.padEnd(128,'f')
 *
 * Request body: { seed: string, difficulty: string | number | null }
 * Response:     { answer: number | null }
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 10_000_000;

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

export async function OPTIONS() {
  return new NextResponse(null, { status: 204, headers: CORS_HEADERS });
}

export async function POST(req: NextRequest) {
  let body: { seed?: string; difficulty?: string | number | null };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400, headers: CORS_HEADERS });
  }

  const { seed, difficulty: rawDifficulty } = body;
  if (typeof seed !== 'string' || !seed) {
    return NextResponse.json({ error: 'Missing seed' }, { status: 400, headers: CORS_HEADERS });
  }

  // Build the target hex string for comparison
  // ChatGPT sends difficulty as a hex string like "0714ff"
  // We pad it to 128 chars with 'f' so we can do a simple string comparison
  let paddedTarget: string;
  if (rawDifficulty == null) {
    // No difficulty — trivially solvable
    paddedTarget = '0000' + 'f'.repeat(124);
  } else if (typeof rawDifficulty === 'string') {
    paddedTarget = rawDifficulty.toLowerCase().padEnd(128, 'f');
  } else {
    // Legacy numeric: number of leading zero hex chars
    const n = Math.max(0, Math.floor(Number(rawDifficulty)));
    paddedTarget = '0'.repeat(n).padEnd(128, 'f');
  }

  const startTime = Date.now();
  // Run in chunks to avoid blocking the event loop
  const CHUNK = 50_000;
  for (let i = 0; i < MAX_ATTEMPTS; i += CHUNK) {
    const end = Math.min(i + CHUNK, MAX_ATTEMPTS);
    for (let j = i; j < end; j++) {
      const hash = crypto.createHash('sha3-512').update(`${seed}${j}`).digest('hex');
      if (hash < paddedTarget) {
        console.log(`[PoW Solve] Solved in ${j} attempts (${Date.now() - startTime}ms), target=${rawDifficulty}`);
        return NextResponse.json({ answer: j }, { headers: CORS_HEADERS });
      }
    }
    // Yield to event loop between chunks
    await new Promise(resolve => setImmediate(resolve));
  }

  console.warn(`[PoW Solve] Failed after ${MAX_ATTEMPTS} attempts, target=${rawDifficulty}`);
  return NextResponse.json({ answer: null }, { headers: CORS_HEADERS });
}
