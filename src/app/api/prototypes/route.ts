import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { prototypes } from '@/lib/schema';
import { desc } from 'drizzle-orm';
import { buildErrorResponse, logError, ValidationError, DatabaseError } from '@/lib/errors';

export async function GET() {
  try {
    const list = await db.select().from(prototypes).orderBy(desc(prototypes.createdAt));
    return NextResponse.json(list);
  } catch (error: unknown) {
    logError(error, 'GET /api/prototypes');
    const errorResponse = buildErrorResponse(new DatabaseError('Failed to fetch prototypes'));
    return NextResponse.json(errorResponse, { status: errorResponse.statusCode });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, description } = body;
    
    // Validation
    if (!name || typeof name !== 'string' || name.trim().length === 0) {
      throw new ValidationError('原型名称为必填项且不能为空');
    }
    
    if (!description || typeof description !== 'string' || description.trim().length === 0) {
      throw new ValidationError('需求描述为必填项且不能为空');
    }
    
    if (name.length > 100) {
      throw new ValidationError('原型名称不能超过 100 个字符');
    }
    
    if (description.length > 5000) {
      throw new ValidationError('需求描述不能超过 5000 个字符');
    }
    
    // Sanitize string to create valid branch name (ASCII alpha-num and hyphens)
    // Supports English and removes special characters
    const cleanName = name.toLowerCase()
      .replace(/[\s_]+/g, '-')
      .replace(/[^a-z0-9\-]+/g, '')
      .replace(/^-+|-+$/g, '') || 'feature';
      
    const timestamp = Date.now().toString().slice(-6);
    const branchName = `proto/${cleanName}-${timestamp}`;
    
    const [newProto] = await db.insert(prototypes).values({
      name: name.trim(),
      description: description.trim(),
      branchName,
      status: 'draft',
    }).returning();

    // Trigger CLAUDE.md hot-reload in background
    try {
      const { updateClaudeMdIfConfigured } = await import('@/mcp/claude-md-generator');
      updateClaudeMdIfConfigured().catch(err => {
        console.error('Failed to auto-update CLAUDE.md on prototype creation:', err);
      });
    } catch (err) {
      // Ignore imports error
    }
    
    return NextResponse.json(newProto, { status: 201 });
  } catch (error: unknown) {
    logError(error, 'POST /api/prototypes');
    const errorResponse = buildErrorResponse(error);
    return NextResponse.json(errorResponse, { status: errorResponse.statusCode });
  }
}
