import { NextResponse } from 'next/server';

// Force dynamic execution
export const dynamic = 'force-dynamic';

/**
 * GET /api/v1/models
 * Returns a list of available models in Anthropic API format
 * This endpoint is required by Claude Code CLI to validate model availability
 */
export async function GET() {
  return NextResponse.json({
    data: [
      {
        type: 'model',
        id: 'claude-3-5-sonnet-20241022',
        display_name: 'Claude 3.5 Sonnet',
        created_at: '2024-10-22T00:00:00Z',
      },
      {
        type: 'model',
        id: 'claude-3-5-haiku-20241022',
        display_name: 'Claude 3.5 Haiku',
        created_at: '2024-10-22T00:00:00Z',
      },
      {
        type: 'model',
        id: 'claude-3-opus-20240229',
        display_name: 'Claude 3 Opus',
        created_at: '2024-02-29T00:00:00Z',
      },
      {
        type: 'model',
        id: 'claude-3-sonnet-20240229',
        display_name: 'Claude 3 Sonnet',
        created_at: '2024-02-29T00:00:00Z',
      },
      {
        type: 'model',
        id: 'claude-3-haiku-20240307',
        display_name: 'Claude 3 Haiku',
        created_at: '2024-03-07T00:00:00Z',
      },
      {
        type: 'model',
        id: 'claude-sonnet-4-6',
        display_name: 'Claude Sonnet 4.6',
        created_at: '2025-01-01T00:00:00Z',
      },
    ],
  });
}
