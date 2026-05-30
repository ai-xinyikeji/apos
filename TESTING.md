# APOS 测试指南

本文档描述如何测试 APOS 系统的各个组件。

## 测试策略

### 测试金字塔

```
        /\
       /  \      E2E Tests (少量)
      /____\     
     /      \    Integration Tests (中等)
    /________\   
   /          \  Unit Tests (大量)
  /__________  \
```

## 手动测试清单

### 1. 环境配置测试

#### 1.1 数据库初始化

```bash
# 检查数据库文件是否存在
ls -la data/apos.db

# 如果不存在，初始化数据库
npm run db:push

# 验证表结构
sqlite3 data/apos.db ".tables"
# 应该看到: agent_traces  prototypes  settings  signals
```

#### 1.2 环境变量配置

```bash
# 检查 .env.local 是否存在
cat .env.local

# 至少应该有一个 LLM Provider 的 API Key
# ANTHROPIC_API_KEY=sk-ant-...
# 或 OPENAI_API_KEY=sk-...
# 或 GOOGLE_GENERATIVE_AI_API_KEY=...
```

#### 1.3 依赖安装

```bash
# 检查 node_modules
ls node_modules | wc -l
# 应该有大量依赖包

# 重新安装（如果需要）
npm install
```

### 2. 应用启动测试

#### 2.1 开发服务器启动

```bash
# 启动开发服务器
npm run dev

# 应该看到:
# ▲ Next.js 16.x.x
# - Local:        http://localhost:3000
# ✓ Ready in Xs
```

#### 2.2 页面访问测试

访问以下页面，确保无错误：

- [ ] http://localhost:3000/ (Dashboard)
- [ ] http://localhost:3000/prototypes (原型管理)
- [ ] http://localhost:3000/insights (洞察中心)
- [ ] http://localhost:3000/pull-requests (PR 管理)
- [ ] http://localhost:3000/settings (设置)

#### 2.3 构建测试

```bash
# 生产构建
npm run build

# 应该成功完成，无 TypeScript 错误
# ✓ Compiled successfully
```

### 3. Settings 配置测试

#### 3.1 配置 LLM Provider

1. 访问 http://localhost:3000/settings
2. 选择 LLM Provider (Anthropic / OpenAI / Google)
3. 输入 API Key
4. 选择模型
5. 点击"保存配置"
6. 应该看到成功 Toast 通知

#### 3.2 验证配置

```bash
# 查询数据库中的配置
sqlite3 data/apos.db "SELECT key, value FROM settings;"

# 应该看到:
# llm_provider|anthropic
# llm_model|claude-3-5-sonnet-20241022
# anthropic_api_key|sk-ant-...
```

#### 3.3 系统状态检查

1. 访问 http://localhost:3000/settings
2. 查看"系统状态"卡片
3. 确认：
   - [ ] LLM 配置状态为"已配置"
   - [ ] 数据库连接状态为"已连接"
   - [ ] 显示原型和信号数量

### 4. ProtoBuilder Agent 测试

#### 4.1 创建原型草稿

1. 访问 http://localhost:3000/prototypes
2. 填写表单：
   - 名称: "测试按钮组件"
   - 描述: "创建一个带有 hover 效果的按钮组件，使用 Tailwind CSS 样式"
3. 点击"保存至草稿"
4. 应该看到：
   - [ ] 成功 Toast 通知
   - [ ] 原型出现在列表中
   - [ ] 状态为 "draft"

#### 4.2 可行性评估测试

1. 点击原型的"评估方案"按钮
2. 应该看到：
   - [ ] Agent 执行控制台出现
   - [ ] 实时日志滚动显示
   - [ ] 状态变为 "assessing"
3. 等待完成（约 30-60 秒）
4. 应该看到：
   - [ ] 成功 Toast 通知
   - [ ] 状态变回 "draft"
   - [ ] 展开原型可以看到"可行性报告"

#### 4.3 代码生成测试

1. 点击原型的"生成原型"按钮
2. 应该看到：
   - [ ] Agent 执行控制台出现
   - [ ] 实时日志显示各个步骤
   - [ ] 状态变为 "generating"
3. 观察日志步骤：
   - [ ] Git Checkout (创建分支)
   - [ ] RAG Indexing (索引代码库)
   - [ ] RAG Search (检索相关代码)
   - [ ] Writing Files (写入文件)
   - [ ] Self-Heal Build Check (编译检查)
   - [ ] Git Commit & Push (提交代码)
   - [ ] Create PR (创建 PR，如果配置了 GitHub Token)
4. 等待完成（约 2-5 分钟）
5. 应该看到：
   - [ ] 成功 Toast 通知
   - [ ] 状态变为 "pr_created" 或 "generated"
   - [ ] 如果有 PR，显示"查看 PR"按钮

#### 4.4 验证生成的代码

```bash
# 查看创建的分支
git branch | grep proto/

# 切换到生成的分支
git checkout proto/test-button-component-xxxxx

# 查看生成的文件
ls -la src/app/

# 查看代码内容
cat src/app/test-button-component/page.tsx
```

#### 4.5 多模态输入测试（可选）

1. 创建新原型
2. 上传一张手绘草图或设计图
3. 点击"生成原型"
4. 验证 Agent 是否使用了图片信息

### 5. SignalCollector Agent 测试

#### 5.1 运行信号收集

1. 访问 http://localhost:3000/insights
2. 点击"采集最新反馈"按钮
3. 应该看到：
   - [ ] Agent 执行控制台出现
   - [ ] 实时日志显示
4. 等待完成（约 30-60 秒）
5. 应该看到：
   - [ ] 成功 Toast 通知
   - [ ] "用户反馈信号"标签页显示新信号
   - [ ] 信号按来源分类（amplitude / zendesk / competitor）
   - [ ] 每个信号有情感分析标签

#### 5.2 验证信号数据

```bash
# 查询数据库
sqlite3 data/apos.db "SELECT id, source, title, status FROM signals LIMIT 5;"

# 应该看到多条信号记录
```

### 6. ReportGenerator Agent 测试

#### 6.1 生成周报

1. 确保有待分析的信号（status = 'pending'）
2. 点击"汇总生成周报"按钮
3. 应该看到：
   - [ ] Agent 执行控制台出现
   - [ ] 实时日志显示
4. 等待完成（约 1-2 分钟）
5. 应该看到：
   - [ ] 成功 Toast 通知
   - [ ] "周度分析报告"标签页显示新报告
   - [ ] 报告包含完整的 Markdown 内容

#### 6.2 验证报告文件

```bash
# 查看报告文件
ls -la data/reports/

# 查看报告内容
cat data/reports/weekly-*.md
```

#### 6.3 测试闭环功能

1. 展开一个报告
2. 点击"一键启动原型建议"按钮
3. 应该：
   - [ ] 跳转到原型页面
   - [ ] 表单预填充了建议内容

### 7. ReviewBot Agent 测试

#### 7.1 运行代码审查

1. 访问 http://localhost:3000/pull-requests
2. 找到一个有 PR 的原型
3. 点击"运行审查"按钮
4. 应该看到：
   - [ ] Agent 执行控制台出现
   - [ ] 实时日志显示
5. 等待完成（约 1-2 分钟）
6. 应该看到：
   - [ ] 成功 Toast 通知
   - [ ] 审查报告显示在页面上
   - [ ] 报告包含安全审计和代码质量分析

#### 7.2 验证 GitHub 评论（如果配置了 Token）

1. 访问 GitHub PR 页面
2. 应该看到 ReviewBot 发布的评论
3. 评论包含完整的审查报告

### 8. RAG 向量检索测试

#### 8.1 验证索引

```bash
# 查看向量数据库
ls -la data/vectordb/

# 应该看到 LanceDB 文件
```

#### 8.2 测试检索功能

1. 创建一个原型，描述中提到现有组件（如 "使用 Button 组件"）
2. 运行生成
3. 查看 Agent 日志中的 "RAG Hit" 步骤
4. 应该看到检索到的相关代码片段

### 9. 错误处理测试

#### 9.1 验证错误

测试各种错误场景：

1. **空表单提交**
   - 不填写任何内容，点击提交
   - 应该看到验证错误 Toast

2. **无效的 API Key**
   - 在设置中输入错误的 API Key
   - 运行 Agent
   - 应该看到 LLM 错误 Toast

3. **网络错误模拟**
   - 断开网络
   - 尝试运行 Agent
   - 应该看到网络错误 Toast

4. **数据库错误**
   - 删除 data/apos.db
   - 刷新页面
   - 应该看到数据库错误

#### 9.2 错误恢复

1. 修复错误（如重新配置 API Key）
2. 重试操作
3. 应该成功执行

### 10. 性能测试

#### 10.1 页面加载时间

使用浏览器开发者工具测量：

- Dashboard: < 2s
- Prototypes: < 2s
- Insights: < 2s

#### 10.2 Agent 执行时间

记录各 Agent 的执行时间：

- SignalCollector: 30-60s
- ProtoBuilder (评估): 30-60s
- ProtoBuilder (生成): 2-5 分钟
- ReviewBot: 1-2 分钟
- ReportGenerator: 1-2 分钟

#### 10.3 RAG 索引时间

```bash
# 记录索引时间
# 应该在 10-30 秒内完成（取决于代码库大小）
```

### 11. 浏览器兼容性测试

测试以下浏览器：

- [ ] Chrome (最新版本)
- [ ] Firefox (最新版本)
- [ ] Safari (最新版本)
- [ ] Edge (最新版本)

### 12. 响应式设计测试

测试不同屏幕尺寸：

- [ ] 桌面 (1920x1080)
- [ ] 笔记本 (1366x768)
- [ ] 平板 (768x1024)
- [ ] 手机 (375x667)

## 自动化测试脚本

### 快速健康检查

```bash
#!/bin/bash
# scripts/health-check.sh

echo "🔍 APOS 健康检查"
echo "=================="

# 1. 检查数据库
if [ -f "data/apos.db" ]; then
  echo "✅ 数据库文件存在"
else
  echo "❌ 数据库文件不存在"
  exit 1
fi

# 2. 检查环境变量
if [ -f ".env.local" ]; then
  echo "✅ 环境变量文件存在"
else
  echo "⚠️  环境变量文件不存在"
fi

# 3. 检查依赖
if [ -d "node_modules" ]; then
  echo "✅ 依赖已安装"
else
  echo "❌ 依赖未安装"
  exit 1
fi

# 4. 检查构建
npm run build > /dev/null 2>&1
if [ $? -eq 0 ]; then
  echo "✅ 构建成功"
else
  echo "❌ 构建失败"
  exit 1
fi

echo ""
echo "✅ 所有检查通过！"
```

### API 端点测试

```bash
#!/bin/bash
# scripts/test-api.sh

BASE_URL="http://localhost:3000"

echo "🧪 测试 API 端点"
echo "================"

# 测试 GET /api/prototypes
echo -n "GET /api/prototypes ... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL/api/prototypes)
if [ $STATUS -eq 200 ]; then
  echo "✅ $STATUS"
else
  echo "❌ $STATUS"
fi

# 测试 GET /api/insights
echo -n "GET /api/insights ... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL/api/insights)
if [ $STATUS -eq 200 ]; then
  echo "✅ $STATUS"
else
  echo "❌ $STATUS"
fi

# 测试 GET /api/settings
echo -n "GET /api/settings ... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL/api/settings)
if [ $STATUS -eq 200 ]; then
  echo "✅ $STATUS"
else
  echo "❌ $STATUS"
fi

# 测试 GET /api/settings/status
echo -n "GET /api/settings/status ... "
STATUS=$(curl -s -o /dev/null -w "%{http_code}" $BASE_URL/api/settings/status)
if [ $STATUS -eq 200 ]; then
  echo "✅ $STATUS"
else
  echo "❌ $STATUS"
fi

echo ""
echo "✅ API 测试完成"
```

## 测试数据清理

### 清理测试数据

```bash
#!/bin/bash
# scripts/clean-test-data.sh

echo "🧹 清理测试数据"
echo "================"

# 备份数据库
cp data/apos.db data/apos.db.backup
echo "✅ 数据库已备份"

# 清理测试原型
sqlite3 data/apos.db "DELETE FROM prototypes WHERE name LIKE '测试%';"
echo "✅ 测试原型已清理"

# 清理测试信号
sqlite3 data/apos.db "DELETE FROM signals WHERE title LIKE '测试%';"
echo "✅ 测试信号已清理"

# 清理测试日志
sqlite3 data/apos.db "DELETE FROM agent_traces WHERE created_at < datetime('now', '-7 days');"
echo "✅ 旧日志已清理"

# 清理测试分支
git branch | grep 'proto/test-' | xargs git branch -D 2>/dev/null
echo "✅ 测试分支已清理"

echo ""
echo "✅ 清理完成"
```

## 问题排查

### 常见问题

#### 1. Agent 执行失败

**症状**: Agent 启动后立即失败

**排查步骤**:
1. 检查 API Key 是否正确配置
2. 查看浏览器控制台错误
3. 查看 agent_traces 表的错误日志
4. 检查网络连接

#### 2. RAG 检索无结果

**症状**: Agent 日志显示 "RAG Miss"

**排查步骤**:
1. 检查 data/vectordb/ 目录是否存在
2. 手动触发索引（运行一次原型生成）
3. 检查代码库是否有可索引的文件

#### 3. Git 操作失败

**症状**: Git push 或 PR 创建失败

**排查步骤**:
1. 检查 Git 配置（user.name, user.email）
2. 检查 GitHub Token 权限
3. 检查网络连接
4. 手动执行 git push 测试

#### 4. 数据库锁定

**症状**: "database is locked" 错误

**排查步骤**:
1. 关闭所有数据库连接
2. 重启开发服务器
3. 检查是否有其他进程占用数据库

## 测试报告模板

```markdown
# APOS 测试报告

**测试日期**: 2024-01-15
**测试人员**: [姓名]
**版本**: 0.1.0

## 测试环境

- OS: macOS 14.0
- Node.js: 20.10.0
- Browser: Chrome 120

## 测试结果

### 功能测试

| 功能 | 状态 | 备注 |
|------|------|------|
| 环境配置 | ✅ | 所有配置正常 |
| 应用启动 | ✅ | 启动成功 |
| Settings 配置 | ✅ | 配置保存成功 |
| ProtoBuilder | ✅ | 代码生成成功 |
| SignalCollector | ✅ | 信号收集成功 |
| ReportGenerator | ✅ | 报告生成成功 |
| ReviewBot | ✅ | 代码审查成功 |
| RAG 检索 | ✅ | 检索到相关代码 |
| 错误处理 | ✅ | 错误正确显示 |

### 性能测试

| 指标 | 目标 | 实际 | 状态 |
|------|------|------|------|
| Dashboard 加载 | < 2s | 1.2s | ✅ |
| Agent 执行 | < 5min | 3.5min | ✅ |
| RAG 索引 | < 30s | 15s | ✅ |

### 发现的问题

1. [问题描述]
   - 严重程度: 高/中/低
   - 复现步骤: ...
   - 预期结果: ...
   - 实际结果: ...

## 总结

[测试总结]

## 建议

[改进建议]
```

## 持续集成

### GitHub Actions 配置（未来）

```yaml
# .github/workflows/test.yml
name: Test

on: [push, pull_request]

jobs:
  test:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - uses: actions/setup-node@v3
        with:
          node-version: '20'
      - run: npm install
      - run: npm run build
      - run: npm run lint
```

---

**记住**: 测试是确保代码质量的关键。定期运行测试，及时发现和修复问题。
