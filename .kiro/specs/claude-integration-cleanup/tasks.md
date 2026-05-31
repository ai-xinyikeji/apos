# Implementation Plan

## Overview

本实施计划定义了 APOS Claude 集成清理功能的开发任务。该功能将从 ProtoBuilder 和 ReviewBot 代理中移除 ClaudeOptimizer 集成，简化代码路径，同时保留 Claude 优化文件作为可选功能，并添加文档注释。

## Tasks

- [x] 1. 清理 ProtoBuilder 代理 - 从 ProtoBuilder 中移除 ClaudeOptimizer 集成
  - [x] 1.1. 移除 ClaudeOptimizer import 语句
  - [x] 1.2. 移除 optimizer 私有属性
  - [x] 1.3. 移除 getOptimizer() 方法
  - [x] 1.4. 简化代码生成逻辑为单一路径（仅使用 generateText()）
  - [x] 1.5. 移除缓存相关日志（Prompt Caching 节省/失败）
  - [x] 1.6. 更新 token 使用统计日志为标准格式
  - [x] 1.7. 验证多模态图片输入功能仍然正常
  
  **Acceptance Criteria**: ProtoBuilder 不再导入 ClaudeOptimizer；代码生成使用单一 generateText() 路径；多模态功能正常；无 provider 条件分支
  
  **Estimated Time**: 2 hours

- [x] 2. 清理 ReviewBot 代理 - 从 ReviewBot 中移除 ClaudeOptimizer 集成
  - [x] 2.1. 移除 ClaudeOptimizer import 语句
  - [x] 2.2. 移除 optimizer 私有属性
  - [x] 2.3. 移除 getOptimizer() 方法
  - [x] 2.4. 简化代码评审逻辑为单一路径（仅使用 generateText()）
  - [x] 2.5. 移除缓存相关日志（Prompt Caching 节省/失败）
  - [x] 2.6. 更新 token 使用统计日志为标准格式
  - [x] 2.7. 验证 CodeGraph 集成功能仍然正常
  
  **Acceptance Criteria**: ReviewBot 不再导入 ClaudeOptimizer；代码评审使用单一 generateText() 路径；CodeGraph 功能正常；无 provider 条件分支
  
  **Estimated Time**: 2 hours

- [x] 3. 添加 Claude 文件文档注释 - 为所有 Claude 优化文件添加"可选功能"注释
  - [x] 3.1. 在 claude-optimizer.ts 顶部添加"Optional feature"注释块
  - [x] 3.2. 在 claude-cache.ts 顶部添加"Optional feature"注释块
  - [x] 3.3. 在 claude-model-selector.ts 顶部添加"Optional feature"注释块
  - [x] 3.4. 在 claude-context-optimizer.ts 顶部添加"Optional feature"注释块
  - [x] 3.5. 在 claude-error-recovery.ts 顶部添加"Optional feature"注释块
  - [x] 3.6. 修复 claude-error-recovery.ts 中 makeClaudeRequest() 占位符，添加清晰注释并抛出 "Not implemented" 错误
  
  **Acceptance Criteria**: 所有 Claude 文件包含"Optional feature: Requires Anthropic API key to use"注释；makeClaudeRequest() 抛出明确的未实现错误；文件内容其余部分不变
  
  **Estimated Time**: 1 hour

- [x] 4. 验证和测试 - 验证清理后功能完整性
  - [x] 4.1. 检查 ProtoBuilder 和 ReviewBot 中无 ClaudeOptimizer 引用
  - [x] 4.2. 验证所有 Claude 优化文件仍然存在且未被删除
  - [x] 4.3. 运行现有测试套件确保无回归
  - [x] 4.4. 验证 TypeScript 编译无错误
  
  **Acceptance Criteria**: 无 ClaudeOptimizer 引用残留；所有 Claude 文件完整保留；测试通过；TypeScript 编译成功
  
  **Estimated Time**: 1 hour
  
  **Dependencies**: 1, 2, 3

## Task Dependency Graph

```json
{
  "waves": [
    {
      "wave": 1,
      "tasks": ["1", "2", "3"]
    },
    {
      "wave": 2,
      "tasks": ["4"]
    }
  ]
}
```
