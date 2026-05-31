import { NextResponse } from 'next/server';
import { db } from '@/lib/db';
import { prototypes } from '@/lib/schema';
import { eq } from 'drizzle-orm';
import { ProtoBuilderAgent } from '@/agents/proto-builder';
import crypto from 'crypto';
import { buildErrorResponse, logError, ValidationError, NotFoundError, DatabaseError } from '@/lib/errors';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { prototypeId, assessOnly, image } = body;
    
    // Validation
    if (!prototypeId || typeof prototypeId !== 'number') {
      throw new ValidationError('原型项目 ID (prototypeId) 为必填项且必须是数字');
    }
    
    if (assessOnly !== undefined && typeof assessOnly !== 'boolean') {
      throw new ValidationError('assessOnly 参数必须是布尔值');
    }
    
    if (image && typeof image !== 'string') {
      throw new ValidationError('image 参数必须是 Base64 字符串');
    }
    
    // Validate image format if provided
    if (image && !image.startsWith('data:image/')) {
      throw new ValidationError('image 必须是有效的 Base64 Data URL (data:image/...)');
    }
    
    // Retrieve prototype
    const [proto] = await db.select().from(prototypes).where(eq(prototypes.id, prototypeId));
    if (!proto) {
      throw new NotFoundError('Prototype', prototypeId);
    }
    
    // Check if prototype is in a valid state to run
    const validStates = ['draft', 'failed'];
    if (!validStates.includes(proto.status)) {
      throw new ValidationError(
        `原型状态为 ${proto.status}，无法执行。只有 draft 或 failed 状态的原型可以运行。`
      );
    }
    
    // Update db state
    try {
      await db.update(prototypes)
        .set({
          status: assessOnly ? 'assessing' : 'generating',
          updatedAt: new Date().toISOString(),
        })
        .where(eq(prototypes.id, prototypeId));
    } catch (error) {
      throw new DatabaseError('Failed to update prototype status', error);
    }
      
    // Execute Agent in the background
    const runId = crypto.randomUUID();
    const agent = new ProtoBuilderAgent();
    
    // Fire and forget - errors will be logged in agent traces
    agent.execute({
      prototypeId,
      name: proto.name,
      description: proto.description,
      branchName: proto.branchName,
      image,
      assessOnly,
    }, runId).catch(err => {
      logError(err, `ProtoBuilder Agent (runId: ${runId})`);
    });
    
    return NextResponse.json({ 
      success: true, 
      runId,
      message: `${assessOnly ? '可行性评估' : '原型生成'} Agent 已启动`
    });
  } catch (error: unknown) {
    logError(error, 'POST /api/prototypes/run');
    const errorResponse = buildErrorResponse(error);
    return NextResponse.json(errorResponse, { status: errorResponse.statusCode });
  }
}
