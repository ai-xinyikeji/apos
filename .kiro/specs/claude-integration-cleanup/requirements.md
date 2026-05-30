# Requirements Document

## Introduction

This document specifies the requirements for cleaning up Claude API integration code from the APOS (AI-Powered Prototype System) codebase. The system currently integrates ClaudeOptimizer in proto-builder and review-bot agents, but the user only uses local LM Studio models and will not call Claude API. The Claude optimization files should be preserved as optional features but removed from active code paths.

## Glossary

- **ClaudeOptimizer**: A class that provides prompt caching and optimization features for Claude API calls
- **ProtoBuilder**: An agent that generates prototype code based on user descriptions
- **ReviewBot**: An agent that performs automated code review on git branches
- **LM_Studio**: A local LLM server that provides OpenAI-compatible API without requiring cloud API keys
- **generateText()**: The standard LLM text generation function that works with all providers
- **Agent**: A specialized autonomous component that performs specific tasks (code generation, review, etc.)

## Requirements

### Requirement 1: Remove ClaudeOptimizer from ProtoBuilder Agent

**User Story:** As a developer using only LM Studio, I want the ProtoBuilder agent to use standard generateText() function, so that I don't have unnecessary Claude API integration code in my execution path.

#### Acceptance Criteria

1. THE ProtoBuilder SHALL NOT import ClaudeOptimizer from '@/lib/claude-optimizer'
2. THE ProtoBuilder SHALL NOT contain a private optimizer property of type ClaudeOptimizer
3. THE ProtoBuilder SHALL NOT contain a getOptimizer() method
4. WHEN generating code, THE ProtoBuilder SHALL use the standard generateText() function for all LLM providers
5. THE ProtoBuilder SHALL NOT check for Anthropic API keys or attempt to initialize ClaudeOptimizer
6. THE ProtoBuilder SHALL NOT contain conditional logic that branches between ClaudeOptimizer and standard generation
7. WHEN an error occurs during code generation, THE ProtoBuilder SHALL use standard error handling without ClaudeOptimizer fallback logic

### Requirement 2: Remove ClaudeOptimizer from ReviewBot Agent

**User Story:** As a developer using only LM Studio, I want the ReviewBot agent to use standard generateText() function, so that code review doesn't depend on Claude-specific optimization code.

#### Acceptance Criteria

1. THE ReviewBot SHALL NOT import ClaudeOptimizer from '@/lib/claude-optimizer'
2. THE ReviewBot SHALL NOT contain a private optimizer property of type ClaudeOptimizer
3. THE ReviewBot SHALL NOT contain a getOptimizer() method
4. WHEN performing code review, THE ReviewBot SHALL use the standard generateText() function for all LLM providers
5. THE ReviewBot SHALL NOT check for Anthropic API keys or attempt to initialize ClaudeOptimizer
6. THE ReviewBot SHALL NOT contain conditional logic that branches between ClaudeOptimizer and standard generation
7. WHEN an error occurs during code review, THE ReviewBot SHALL use standard error handling without ClaudeOptimizer fallback logic

### Requirement 3: Preserve Claude Optimization Files

**User Story:** As a future developer who might want to use Claude API, I want the Claude optimization files to remain in the codebase, so that I can optionally enable them if I obtain an Anthropic API key.

#### Acceptance Criteria

1. THE System SHALL preserve the file 'src/lib/claude-optimizer.ts' without modifications
2. THE System SHALL preserve the file 'src/lib/claude-cache.ts' without modifications
3. THE System SHALL preserve the file 'src/lib/claude-model-selector.ts' without modifications
4. THE System SHALL preserve the file 'src/lib/claude-context-optimizer.ts' without modifications
5. THE System SHALL preserve the file 'src/lib/claude-error-recovery.ts' without modifications
6. THE System SHALL preserve all other Claude-related utility files in 'src/lib/' directory

### Requirement 4: Add Documentation Comments

**User Story:** As a developer reviewing the codebase, I want clear documentation about Claude optimization features, so that I understand they are optional and require API keys.

#### Acceptance Criteria

1. THE claude-optimizer.ts file SHALL contain a comment block at the top stating "Optional feature: Requires Anthropic API key to use"
2. THE claude-cache.ts file SHALL contain a comment block at the top stating "Optional feature: Requires Anthropic API key to use"
3. THE claude-error-recovery.ts file SHALL contain a comment block at the top stating "Optional feature: Requires Anthropic API key to use"
4. THE claude-model-selector.ts file SHALL contain a comment block at the top stating "Optional feature: Requires Anthropic API key to use"
5. THE claude-context-optimizer.ts file SHALL contain a comment block at the top stating "Optional feature: Requires Anthropic API key to use"
6. WHEN a developer reads any Claude optimization file, THE comment SHALL clearly indicate the feature is optional and not used by default

### Requirement 5: Simplify Agent Code Generation Logic

**User Story:** As a developer maintaining the agents, I want simplified code generation logic without provider-specific branching, so that the code is easier to understand and maintain.

#### Acceptance Criteria

1. THE ProtoBuilder code generation logic SHALL use a single code path for all LLM providers
2. THE ReviewBot code review logic SHALL use a single code path for all LLM providers
3. WHEN generating text, THE agents SHALL construct messages and call generateText() without checking provider type
4. THE agents SHALL NOT contain try-catch blocks specifically for "Prompt Caching 失败" (caching failure)
5. THE agents SHALL NOT log "Prompt Caching 节省" (caching savings) messages
6. THE agents SHALL NOT contain fallback logic from ClaudeOptimizer to standard generation
7. WHEN token usage is available, THE agents SHALL log standard token usage statistics without cache-specific metrics

### Requirement 6: Maintain Existing Functionality

**User Story:** As a user of the system, I want all existing features to continue working after the cleanup, so that my workflow is not disrupted.

#### Acceptance Criteria

1. WHEN ProtoBuilder generates code, THE generated code quality SHALL be equivalent to before the cleanup
2. WHEN ReviewBot reviews code, THE review quality SHALL be equivalent to before the cleanup
3. THE ProtoBuilder SHALL continue to support multimodal image input for design sketches
4. THE ReviewBot SHALL continue to support CodeGraph change impact analysis
5. THE ProtoBuilder SHALL continue to support self-healing compilation checks
6. THE ReviewBot SHALL continue to support posting comments to GitHub PRs
7. WHEN using LM Studio, THE agents SHALL function identically to before the cleanup

### Requirement 7: Fix claude-error-recovery.ts Placeholder

**User Story:** As a developer reviewing the codebase, I want the placeholder makeClaudeRequest() function to be clearly marked as unimplemented, so that I understand it's not functional without additional integration work.

#### Acceptance Criteria

1. THE makeClaudeRequest() function in claude-error-recovery.ts SHALL contain a comment stating "Placeholder implementation - requires actual Claude API integration"
2. THE makeClaudeRequest() function SHALL throw an error with message "Not implemented: This function requires actual Claude API client integration"
3. WHEN a developer reads the claude-error-recovery.ts file, THE placeholder status SHALL be immediately obvious
4. THE file SHALL contain a top-level comment explaining that the entire error recovery system requires Claude API integration to function

