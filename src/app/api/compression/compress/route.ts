import { NextRequest, NextResponse } from 'next/server';
import { 
  compressMessages, 
  compressFile, 
  compressFiles, 
  smartCompress,
  type CompressionLevel 
} from '@/lib/compression';

export const dynamic = 'force-dynamic';

/**
 * POST /api/compression/compress
 * 
 * Compress content using the hybrid AST + LLM compression system
 * 
 * Request body:
 * - mode: 'messages' | 'file' | 'files' | 'smart'
 * - level: 'light' | 'medium' | 'aggressive' (optional, default: 'medium')
 * - messages: array (for mode='messages')
 * - system: string (for mode='messages', optional)
 * - content: string (for mode='file' or mode='smart')
 * - filename: string (for mode='file' or mode='smart', optional)
 * - files: array of {path, content} (for mode='files')
 */
export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { mode, level = 'medium', messages, system, content, filename, files } = body;

    // Validate compression level
    const validLevels: CompressionLevel[] = ['light', 'medium', 'aggressive'];
    const compressionLevel: CompressionLevel = validLevels.includes(level) ? level : 'medium';

    switch (mode) {
      case 'messages': {
        if (!messages || !Array.isArray(messages)) {
          return NextResponse.json(
            { error: 'messages array is required for mode=messages' },
            { status: 400 }
          );
        }

        const result = await compressMessages(
          messages,
          system || '',
          compressionLevel
        );

        return NextResponse.json({
          success: true,
          mode: 'messages',
          compressedMessages: result.compressedMessages,
          compressedSystem: result.compressedSystem,
          stats: result.stats,
        });
      }

      case 'file': {
        if (!content || typeof content !== 'string') {
          return NextResponse.json(
            { error: 'content string is required for mode=file' },
            { status: 400 }
          );
        }

        const result = await compressFile(
          filename || 'unknown.txt',
          content,
          compressionLevel
        );

        return NextResponse.json({
          success: true,
          mode: 'file',
          compressed: result.compressed,
          stats: result.stats,
        });
      }

      case 'files': {
        if (!files || !Array.isArray(files)) {
          return NextResponse.json(
            { error: 'files array is required for mode=files' },
            { status: 400 }
          );
        }

        const result = await compressFiles(files, compressionLevel);

        return NextResponse.json({
          success: true,
          mode: 'files',
          files: result.files,
          totalStats: result.totalStats,
        });
      }

      case 'smart': {
        if (!content || typeof content !== 'string') {
          return NextResponse.json(
            { error: 'content string is required for mode=smart' },
            { status: 400 }
          );
        }

        const result = await smartCompress(content, filename);

        return NextResponse.json({
          success: true,
          mode: 'smart',
          compressed: result.compressed,
          level: result.level,
          stats: result.stats,
        });
      }

      default:
        return NextResponse.json(
          { error: 'Invalid mode. Must be one of: messages, file, files, smart' },
          { status: 400 }
        );
    }
  } catch (error: any) {
    console.error('[Compression API] Error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message || 'Compression failed' 
      },
      { status: 500 }
    );
  }
}

/**
 * GET /api/compression/compress
 * 
 * Get compression system status and configuration
 */
export async function GET() {
  try {
    const { isOllamaAvailable } = await import('@/lib/llm');
    const lmAvailable = await isOllamaAvailable();

    return NextResponse.json({
      success: true,
      status: {
        ollamaAvailable: lmAvailable,
        supportedModes: ['messages', 'file', 'files', 'smart'],
        supportedLevels: ['light', 'medium', 'aggressive'],
        compressionMethods: ['ast', 'llm', 'hybrid'],
      },
    });
  } catch (error: any) {
    console.error('[Compression API] Status check error:', error);
    return NextResponse.json(
      { 
        success: false,
        error: error.message 
      },
      { status: 500 }
    );
  }
}
