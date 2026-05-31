/**
 * Unit tests for CodeGraph Parser and A/B Testing Experiments Engine
 */

import { parseCodeFile } from '../codegraph/parser';
import { experimentEngine } from '../growth/experiments';

describe('CodeGraph Parser', () => {
  it('should parse imports and class symbols correctly', () => {
    const mockCode = `
      import { useState } from 'react';
      import { db } from '@/lib/db';

      export class UserService extends BaseService {
        constructor() {
          super();
        }

        async getUser(id: string) {
          const user = await db.query();
          return user;
        }
      }

      export function formatUser(user: any) {
        return user.name;
      }
    `;

    const { nodes, edges } = parseCodeFile(mockCode, 'src/services/user.ts');

    // Verify Nodes
    expect(nodes.length).toBe(4); // Class, constructor, getUser method, formatUser function
    
    const classNode = nodes.find(n => n.kind === 'class');
    expect(classNode).toBeDefined();
    expect(classNode?.name).toBe('UserService');

    const methodNode = nodes.find(n => n.kind === 'method' && n.name === 'getUser');
    expect(methodNode).toBeDefined();
    expect(methodNode?.name).toBe('getUser');

    const funcNode = nodes.find(n => n.kind === 'function');
    expect(funcNode).toBeDefined();
    expect(funcNode?.name).toBe('formatUser');

    // Verify Edges
    expect(edges.length).toBeGreaterThan(0);
    const extendsEdge = edges.find(e => e.kind === 'extends');
    expect(extendsEdge).toBeDefined();
    expect(extendsEdge?.targetName).toBe('BaseService');

    const callEdge = edges.find(e => e.kind === 'calls' && e.sourceName === 'UserService.getUser');
    expect(callEdge).toBeDefined();
  });
});
