import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { prototypes } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import fs from 'fs';
import path from 'path';
import { buildErrorResponse, logError, ValidationError, NotFoundError } from '@/lib/errors';

export async function GET(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const protoId = parseInt(id, 10);
    if (isNaN(protoId)) {
      throw new ValidationError('原型 ID 必须是数字');
    }

    const [proto] = await db.select().from(prototypes).where(eq(prototypes.id, protoId));
    if (!proto) {
      throw new NotFoundError('Prototype', protoId);
    }

    if (!proto.codePath) {
      return NextResponse.json([]);
    }

    let paths: string[] = [];
    try {
      paths = JSON.parse(proto.codePath);
    } catch (e) {
      console.error('Failed to parse codePath JSON:', proto.codePath, e);
      return NextResponse.json([]);
    }

    const files = [];
    for (const filePath of paths) {
      const fullPath = path.join(process.cwd(), filePath);
      if (fs.existsSync(fullPath)) {
        try {
          const content = fs.readFileSync(fullPath, 'utf8');
          files.push({
            path: filePath,
            content,
          });
        } catch (readErr) {
          console.error(`Failed to read file ${filePath}:`, readErr);
        }
      }
    }

    return NextResponse.json(files);
  } catch (error: unknown) {
    logError(error, 'GET /api/prototypes/[id]/code');
    const errorResponse = buildErrorResponse(error);
    return NextResponse.json(errorResponse, { status: errorResponse.statusCode });
  }
}
