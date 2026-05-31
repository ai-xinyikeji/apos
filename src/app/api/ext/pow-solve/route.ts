/**
 * POST /api/ext/pow-solve
 *
 * 浏览器扩展无法使用 SHA3-512（SubtleCrypto 不支持），
 * 所以把 ChatGPT PoW 挑战发到这里，由服务器用 Node 原生 crypto 求解。
 *
 * Request body: { seed: string, difficulty: number }
 * Response:     { answer: number | null }
 */

import { NextRequest, NextResponse } from 'next/server';
import crypto from 'crypto';

export const dynamic = 'force-dynamic';

const MAX_ATTEMPTS = 500_000;

export async function POST(req: NextRequest) {
  let body: { seed?: string; difficulty?: number };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
  }

  const { seed, difficulty: rawDifficulty } = body;
  if (typeof seed !== 'string' || rawDifficulty === undefined || rawDifficulty === null) {
    return NextResponse.json({ error: 'Missing seed or difficulty' }, { status: 400 });
  }
  // ChatGPT sentinel may return difficulty as a string — coerce to number
  const difficulty = Number(rawDifficulty);
  if (!Number.isFinite(difficulty) || difficulty < 0) {
    return NextResponse.json({ error: 'Invalid difficulty value' }, { status: 400 });
  }

  const target = '0'.repeat(difficulty);
  for (let i = 0; i < MAX_ATTEMPTS; i++) {
    const hash = crypto.createHash('sha3-512').update(`${seed}${i}`).digest('hex');
    if (hash.startsWith(target)) {
      return NextResponse.json({ answer: i });
    }
  }

  // Could not solve within limit — return null so caller can proceed without PoW
  console.warn(`[PoW Solve] Could not solve challenge (seed=${seed}, difficulty=${difficulty}) within ${MAX_ATTEMPTS} attempts`);
  return NextResponse.json({ answer: null });
}
