if (typeof global.TextEncoder === 'undefined') {
  global.TextEncoder = require('util').TextEncoder;
}
if (typeof global.ReadableStream === 'undefined') {
  global.ReadableStream = require('stream/web').ReadableStream;
}


import { POST } from '../v1/messages/route';
import { routeModel } from '@/lib/llm';
import { streamText } from 'ai';

// Mock dependencies
jest.mock('@/lib/llm');
jest.mock('ai');

describe('Messages Route Proxy API', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  const makeMockRequest = (body: any) => ({
    json: async () => body,
  } as any);

  it('should classify and route message correctly when content is standard string', async () => {
    (routeModel as jest.Mock).mockResolvedValue({
      provider: 'openai',
      model: { modelId: 'gpt-4o' }
    });
    
    (streamText as jest.Mock).mockResolvedValue({
      textStream: (async function* () { yield 'test'; })()
    });

    const mockReq = makeMockRequest({
      messages: [
        { role: 'user', content: 'Please write a login page component in React' }
      ],
      stream: true
    });

    const response = await POST(mockReq);
    expect(response.status).toBe(200);
    expect(routeModel).toHaveBeenCalledWith('coding');
  });

  it('should correctly classify task when content is array of blocks', async () => {
    (routeModel as jest.Mock).mockResolvedValue({
      provider: 'openai',
      model: { modelId: 'gpt-4o' }
    });
    
    (streamText as jest.Mock).mockResolvedValue({
      textStream: (async function* () { yield 'test'; })()
    });

    // Content as block array
    const mockReq = makeMockRequest({
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: 'Can you search for API files?' }
          ]
        }
      ],
      stream: true
    });

    const response = await POST(mockReq);
    expect(response.status).toBe(200);
    expect(routeModel).toHaveBeenCalledWith('summarize');
  });

  it('should correctly classify task with nested tool_result content', async () => {
    (routeModel as jest.Mock).mockResolvedValue({
      provider: 'openai',
      model: { modelId: 'gpt-4o' }
    });
    
    (streamText as jest.Mock).mockResolvedValue({
      textStream: (async function* () { yield 'test'; })()
    });

    const mockReq = makeMockRequest({
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'tool_result',
              tool_use_id: 'tool_1',
              content: 'Failed to compile. Error: Type mismatch at line 42'
            }
          ]
        }
      ],
      stream: true
    });

    const response = await POST(mockReq);
    expect(response.status).toBe(200);
    expect(routeModel).toHaveBeenCalledWith('coding'); // because of "Failed to compile", "Error" -> coding/fix heuristics
  });
});
