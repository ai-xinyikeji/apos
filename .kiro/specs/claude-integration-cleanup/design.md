# Design Document: Claude Integration Cleanup

## Overview

This design document specifies the technical approach for removing ClaudeOptimizer integration from active code paths in the APOS system while preserving Claude optimization files as optional features. The cleanup focuses on two agents (ProtoBuilder and ReviewBot) that currently use ClaudeOptimizer for prompt caching, replacing this with standard `generateText()` calls that work uniformly across all LLM providers.

### Goals

1. **Simplify agent code**: Remove provider-specific branching logic and ClaudeOptimizer dependencies
2. **Preserve optionality**: Keep Claude optimization files intact for future use
3. **Maintain functionality**: Ensure all existing features continue working identically
4. **Improve maintainability**: Reduce code complexity and conditional logic paths

### Non-Goals

- Deleting or modifying Claude optimization library files
- Changing the behavior of `generateText()` function
- Modifying other agents beyond ProtoBuilder and ReviewBot
- Implementing new features or optimizations

## Architecture

### Current Architecture

```
ProtoBuilder Agent
├── ClaudeOptimizer instance (lazy-initialized)
├── getOptimizer() method
└── Code generation logic
    ├── Check provider === 'anthropic'
    ├── If true: use optimizer.generate()
    ├── If false: use generateText()
    └── Fallback handling for cache failures

ReviewBot Agent
├── ClaudeOptimizer instance (lazy-initialized)
├── getOptimizer() method
└── Code review logic
    ├── Check provider === 'anthropic'
    ├── If true: use optimizer.generate()
    ├── If false: use generateText()
    └── Fallback handling for cache failures
```

### Target Architecture

```
ProtoBuilder Agent
└── Code generation logic
    └── Always use generateText()

ReviewBot Agent
└── Code review logic
    └── Always use generateText()

Claude Optimization Files (preserved, unused)
├── claude-optimizer.ts
├── claude-cache.ts
├── claude-model-selector.ts
├── claude-context-optimizer.ts
└── claude-error-recovery.ts
```

### Design Principles

1. **Single code path**: All LLM providers use the same `generateText()` function
2. **No provider detection**: Remove conditional logic based on `llm.provider`
3. **Standard error handling**: Use existing error handling without ClaudeOptimizer-specific recovery
4. **Preserve file structure**: Keep all Claude files in `src/lib/` without modifications (except documentation comments)

## Components and Interfaces

### Component 1: ProtoBuilder Agent Refactoring

**File**: `src/agents/proto-builder.ts`

**Changes**:

1. **Remove imports**:
   ```typescript
   // REMOVE
   import { ClaudeOptimizer } from '@/lib/claude-optimizer';
   ```

2. **Remove class properties**:
   ```typescript
   // REMOVE
   private optimizer: ClaudeOptimizer | null = null;
   ```

3. **Remove methods**:
   ```typescript
   // REMOVE entire method
   private async getOptimizer(): Promise<ClaudeOptimizer | null> { ... }
   ```

4. **Simplify code generation logic**:
   ```typescript
   // BEFORE (complex branching)
   const optimizer = await this.getOptimizer();
   if (llm.provider === 'anthropic' && optimizer) {
     try {
       const result = await optimizer.generate(...);
       // cache-specific logging
     } catch (cacheError) {
       // fallback to generateText()
     }
   } else {
     // use generateText()
   }

   // AFTER (single path)
   const generationPrompt = `${systemPrompt}\n\n${context}\n\n${userMessage}`;
   let messages: any[] = [{ role: 'user', content: generationPrompt }];
   
   if (image) {
     // multimodal handling
   }

   const result = await generateText({
     model: llm.model,
     messages,
   });
   
   text = result.text;
   usage = result.usage;
   ```

5. **Simplify token usage logging**:
   ```typescript
   // REMOVE cache-specific logging
   // await this.trace(runId, 'Prompt Caching 节省', 'success', ...);

   // KEEP standard token logging
   if (usage) {
     await this.trace(runId, 'Token 使用统计', 'info', 
       `代码生成 Token 消耗: Input=${usage.inputTokens}, Output=${usage.outputTokens}`,
       { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, provider: llm.provider }
     );
   }
   ```

**Interface Preservation**:
- Public method signature `run(input: ProtoBuilderInput, runId: string)` remains unchanged
- Return type remains `{ success: boolean; error?: string; prUrl?: string }`
- All existing features (RAG, multimodal, self-healing, Git operations) remain functional

### Component 2: ReviewBot Agent Refactoring

**File**: `src/agents/review-bot.ts`

**Changes**:

1. **Remove imports**:
   ```typescript
   // REMOVE
   import { ClaudeOptimizer } from '@/lib/claude-optimizer';
   ```

2. **Remove class properties**:
   ```typescript
   // REMOVE
   private optimizer: ClaudeOptimizer | null = null;
   ```

3. **Remove methods**:
   ```typescript
   // REMOVE entire method
   private async getOptimizer(): Promise<ClaudeOptimizer | null> { ... }
   ```

4. **Simplify code review logic**:
   ```typescript
   // BEFORE (complex branching)
   const optimizer = await this.getOptimizer();
   if (llm.provider === 'anthropic' && optimizer) {
     try {
       const result = await optimizer.generate(...);
       // cache-specific logging
     } catch (cacheError) {
       // fallback to generateText()
     }
   } else {
     // use generateText()
   }

   // AFTER (single path)
   const auditPrompt = `${systemPrompt}\n${context}\n\n${userMessage}`;
   const result = await generateText({
     model: llm.model,
     prompt: auditPrompt,
   });
   
   text = result.text;
   usage = result.usage;
   ```

5. **Simplify token usage logging**:
   ```typescript
   // REMOVE cache-specific logging
   // await this.trace(runId, 'Prompt Caching 节省', 'success', ...);

   // KEEP standard token logging
   if (usage) {
     await this.trace(runId, 'Token 使用统计', 'info', 
       `代码评审 Token 消耗: Input=${usage.inputTokens}, Output=${usage.outputTokens}`,
       { inputTokens: usage.inputTokens, outputTokens: usage.outputTokens, provider: llm.provider }
     );
   }
   ```

**Interface Preservation**:
- Public method signature `run(input: ReviewBotInput, runId: string)` remains unchanged
- Return type remains `{ success: boolean; report: string; error?: string }`
- All existing features (CodeGraph impact analysis, GitHub PR comments) remain functional

### Component 3: Claude Optimization Files Documentation

**Files to update with documentation comments**:
- `src/lib/claude-optimizer.ts`
- `src/lib/claude-cache.ts`
- `src/lib/claude-model-selector.ts`
- `src/lib/claude-context-optimizer.ts`
- `src/lib/claude-error-recovery.ts`

**Documentation comment format**:
```typescript
/**
 * Optional feature: Requires Anthropic API key to use
 * 
 * This module provides Claude-specific optimizations including prompt caching,
 * model selection, context management, and error recovery. These features are
 * not used by default and require an Anthropic API key to function.
 * 
 * To enable: Set ANTHROPIC_API_KEY environment variable or configure in settings.
 */
```

**Additional fix for claude-error-recovery.ts**:
```typescript
/**
 * Placeholder implementation - requires actual Claude API integration
 * 
 * This function is a placeholder that needs to be replaced with actual
 * Claude API client integration. The entire error recovery system requires
 * a working Claude API client to function.
 * 
 * @throws Error Always throws "Not implemented" error
 */
async function makeClaudeRequest(request: any): Promise<string> {
  throw new Error('Not implemented: This function requires actual Claude API client integration');
}
```

## Data Models

No database schema changes are required. The cleanup only affects code structure, not data models.

## Error Handling

### Current Error Handling (Complex)

```typescript
try {
  const result = await optimizer.generate(...);
} catch (cacheError) {
  await this.trace(runId, 'Prompt Caching 失败', 'warning', ...);
  // Fallback to generateText()
  const result = await generateText(...);
}
```

### Target Error Handling (Simplified)

```typescript
// Standard error handling from generateText()
// Errors propagate naturally to the agent's top-level try-catch
const result = await generateText({
  model: llm.model,
  messages,
});
```

**Error propagation**:
- `generateText()` errors propagate to agent's main try-catch block
- Agent logs error via `this.trace(runId, '生成失败', 'error', ...)`
- Agent updates database status to 'failed'
- No special handling for Claude-specific errors

## Testing Strategy

### Unit Tests

**Test file**: `tests/agents/proto-builder.test.ts`

Test cases:
1. **No ClaudeOptimizer import**: Verify import statement is removed
2. **No optimizer property**: Verify class has no `optimizer` property
3. **No getOptimizer method**: Verify method does not exist
4. **Single code path**: Verify code generation uses only `generateText()`
5. **Multimodal support**: Verify image input still works with `generateText()`
6. **Token logging**: Verify standard token usage logging (no cache metrics)
7. **Error handling**: Verify errors propagate correctly without ClaudeOptimizer fallback

**Test file**: `tests/agents/review-bot.test.ts`

Test cases:
1. **No ClaudeOptimizer import**: Verify import statement is removed
2. **No optimizer property**: Verify class has no `optimizer` property
3. **No getOptimizer method**: Verify method does not exist
4. **Single code path**: Verify code review uses only `generateText()`
5. **Token logging**: Verify standard token usage logging (no cache metrics)
6. **Error handling**: Verify errors propagate correctly without ClaudeOptimizer fallback
7. **CodeGraph integration**: Verify impact analysis still works

**Test file**: `tests/lib/claude-files.test.ts`

Test cases:
1. **Files exist**: Verify all Claude optimization files are present
2. **Documentation comments**: Verify each file has "Optional feature" comment
3. **Placeholder documentation**: Verify `makeClaudeRequest()` has clear placeholder comment
4. **No imports in agents**: Verify ProtoBuilder and ReviewBot don't import Claude files

### Integration Tests

**Test file**: `tests/integration/proto-builder-e2e.test.ts`

Test scenarios:
1. **Code generation with LM Studio**: Full prototype generation flow
2. **Multimodal input**: Generate code from design image
3. **Self-healing**: Verify compilation check and auto-repair
4. **Git operations**: Verify branch creation, commit, push, PR creation
5. **RAG integration**: Verify vector search and context injection
6. **Error scenarios**: Verify error handling and database status updates

**Test file**: `tests/integration/review-bot-e2e.test.ts`

Test scenarios:
1. **Code review with LM Studio**: Full code review flow
2. **CodeGraph analysis**: Verify change impact analysis
3. **GitHub PR comments**: Verify comment posting (with mock GitHub API)
4. **Error scenarios**: Verify error handling and trace logging

### Manual Testing Checklist

- [ ] ProtoBuilder generates code successfully with LM Studio
- [ ] ProtoBuilder handles multimodal image input correctly
- [ ] ProtoBuilder self-healing loop works (compilation check + auto-repair)
- [ ] ProtoBuilder creates Git branch, commits, pushes, and creates PR
- [ ] ReviewBot reviews code successfully with LM Studio
- [ ] ReviewBot performs CodeGraph impact analysis
- [ ] ReviewBot posts comments to GitHub PR (if configured)
- [ ] No errors related to ClaudeOptimizer in logs
- [ ] Token usage statistics are logged correctly
- [ ] All Claude optimization files remain in `src/lib/` directory
- [ ] Documentation comments are present in Claude files

### Regression Testing

**Critical paths to verify**:
1. Prototype generation end-to-end (ProtoBuilder)
2. Code review end-to-end (ReviewBot)
3. Multimodal image input (ProtoBuilder)
4. Self-healing compilation checks (ProtoBuilder)
5. CodeGraph change impact analysis (ReviewBot)
6. GitHub PR creation and commenting (both agents)
7. RAG vector search and context injection (ProtoBuilder)

**Success criteria**:
- All existing features work identically to before cleanup
- No new errors or warnings in logs
- Code is simpler and easier to understand
- No performance degradation

## Implementation Plan

### Phase 1: ProtoBuilder Cleanup

1. Remove ClaudeOptimizer import
2. Remove optimizer property and getOptimizer() method
3. Simplify code generation logic to single path
4. Remove cache-specific logging
5. Update token usage logging to standard format
6. Test with LM Studio provider

### Phase 2: ReviewBot Cleanup

1. Remove ClaudeOptimizer import
2. Remove optimizer property and getOptimizer() method
3. Simplify code review logic to single path
4. Remove cache-specific logging
5. Update token usage logging to standard format
6. Test with LM Studio provider

### Phase 3: Documentation

1. Add "Optional feature" comments to all Claude files
2. Update makeClaudeRequest() placeholder documentation
3. Verify comments are clear and informative

### Phase 4: Testing

1. Run unit tests for both agents
2. Run integration tests for both agents
3. Perform manual testing checklist
4. Run regression tests on critical paths

### Phase 5: Verification

1. Code review of all changes
2. Verify no ClaudeOptimizer references in agent files
3. Verify all Claude files are preserved
4. Verify documentation comments are present
5. Final smoke test with LM Studio

## Migration Notes

### For Developers

**Before cleanup**:
- ProtoBuilder and ReviewBot check for Anthropic API key
- If key exists, use ClaudeOptimizer with prompt caching
- If key missing or caching fails, fallback to generateText()

**After cleanup**:
- ProtoBuilder and ReviewBot always use generateText()
- No API key checking or provider-specific logic
- Claude optimization files remain available for future use

### For Users

**No user-facing changes**:
- All features continue working identically
- No configuration changes required
- No workflow changes required
- LM Studio integration works exactly as before

### For Future Claude Integration

**To re-enable Claude optimizations**:
1. Import ClaudeOptimizer in agent file
2. Initialize optimizer with API key
3. Replace generateText() calls with optimizer.generate()
4. Add cache-specific logging if desired

**Example**:
```typescript
import { ClaudeOptimizer } from '@/lib/claude-optimizer';

// In agent class
private optimizer = new ClaudeOptimizer(process.env.ANTHROPIC_API_KEY!);

// In generation logic
const result = await this.optimizer.generate(messages, system, 'coding');
```

## Risks and Mitigations

### Risk 1: Breaking Existing Functionality

**Likelihood**: Low  
**Impact**: High  
**Mitigation**:
- Comprehensive unit and integration tests
- Manual testing checklist
- Regression testing on critical paths
- Gradual rollout (ProtoBuilder first, then ReviewBot)

### Risk 2: Performance Degradation

**Likelihood**: Very Low  
**Impact**: Low  
**Mitigation**:
- User only uses LM Studio (local), no API costs
- generateText() is already used as fallback, proven to work
- No performance difference expected

### Risk 3: Incomplete Cleanup

**Likelihood**: Low  
**Impact**: Medium  
**Mitigation**:
- Code review to verify all ClaudeOptimizer references removed
- Automated tests to check for imports
- Manual verification of agent files

### Risk 4: Documentation Insufficient

**Likelihood**: Low  
**Impact**: Low  
**Mitigation**:
- Clear "Optional feature" comments in all Claude files
- Placeholder documentation in makeClaudeRequest()
- Migration notes in this design document

## Success Metrics

1. **Code simplicity**: Reduced lines of code in agents (remove ~50 lines per agent)
2. **Maintainability**: Single code path for all providers (no branching)
3. **Functionality**: All existing features work identically (100% pass rate on tests)
4. **Documentation**: All Claude files have clear "Optional feature" comments
5. **No regressions**: Zero new errors or warnings in logs

## Appendix

### Files Modified

1. `src/agents/proto-builder.ts` - Remove ClaudeOptimizer integration
2. `src/agents/review-bot.ts` - Remove ClaudeOptimizer integration
3. `src/lib/claude-optimizer.ts` - Add documentation comment
4. `src/lib/claude-cache.ts` - Add documentation comment
5. `src/lib/claude-model-selector.ts` - Add documentation comment
6. `src/lib/claude-context-optimizer.ts` - Add documentation comment
7. `src/lib/claude-error-recovery.ts` - Add documentation comment + fix placeholder

### Files Preserved (No Changes)

All other files in the codebase remain unchanged, including:
- `src/lib/llm.ts` (generateText function)
- `src/lib/db.ts` (database operations)
- `src/lib/git.ts` (Git operations)
- `src/lib/rag.ts` (vector search)
- `src/lib/codegraph/` (CodeGraph analysis)
- All other agents and components

### References

- Requirements Document: `.kiro/specs/claude-integration-cleanup/requirements.md`
- ProtoBuilder Agent: `src/agents/proto-builder.ts`
- ReviewBot Agent: `src/agents/review-bot.ts`
- Claude Optimizer: `src/lib/claude-optimizer.ts`
- LLM Interface: `src/lib/llm.ts`
