#!/usr/bin/env python3
"""
APOS 上下文管理压力测试 — 使用真实文件内容模拟 Claude Code 会话

真实 Claude Code 会话特征：
- system prompt: CLAUDE.md (~9KB) + 工具定义 (~5KB) ≈ 14KB ≈ 3500 tokens
- 每轮对话包含真实代码文件内容，单条消息 2000-7000 tokens
- 多轮后总 token 数超过 Qwen3.5 9B 的 24K 上下文限制
"""
import json
import urllib.request
import time
import os

BASE = "http://localhost:3000/api/v1/messages"
HEADERS = {
    "Content-Type": "application/json",
    "x-api-key": "test",
    "anthropic-version": "2023-06-01",
}

APOS_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

def read_file(path, max_chars=None):
    try:
        with open(os.path.join(APOS_DIR, path)) as f:
            content = f.read()
            return content[:max_chars] if max_chars else content
    except:
        return f"// {path} not found"

def estimate_tokens(text):
    return len(text) // 4

def send(messages, system="", max_tokens=400, timeout=120):
    payload = json.dumps({
        "model": "claude-3-5-sonnet-20241022",
        "max_tokens": max_tokens,
        "stream": False,
        "system": system,
        "messages": messages,
    }).encode()
    req = urllib.request.Request(BASE, data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=timeout) as resp:
            d = json.loads(resp.read())
            return d.get("content", [{}])[0].get("text", "")
    except Exception as e:
        return f"ERROR: {e}"

def check(answer, keywords, test_name):
    if answer.startswith("ERROR"):
        print(f"  ❌ FAIL {test_name}")
        print(f"     {answer[:200]}")
        return False
    answer_lower = answer.lower()
    found = [kw for kw in keywords if kw.lower() in answer_lower]
    ok = len(found) == len(keywords)
    print(f"  {'✅ PASS' if ok else '❌ FAIL'} {test_name}")
    if not ok:
        print(f"     缺少: {[kw for kw in keywords if kw.lower() not in answer_lower]}")
        print(f"     回答: {answer[:300]}")
    return ok

# ── 读取真实文件 ──────────────────────────────────────────────
CLAUDE_MD = read_file("CLAUDE.md")
LLM_TS = read_file("src/lib/llm.ts")
COMPRESSION_TS = read_file("src/lib/compression.ts", max_chars=8000)
MESSAGES_ROUTE = read_file("src/app/api/v1/messages/route.ts", max_chars=8000)
CONTEXT_MANAGER = read_file("src/lib/context-manager.ts")

# 真实 system prompt = CLAUDE.md + 工具定义模拟
REAL_SYSTEM = CLAUDE_MD + """

## 可用工具
- Bash: 执行 shell 命令
- Read: 读取文件内容
- Write: 写入文件
- Edit: 编辑文件
- Search: 搜索代码
- TodoRead/TodoWrite: 管理任务列表

## 环境信息
- OS: macOS darwin arm64
- Node: v20.19.6
- Shell: zsh
- CWD: /Users/clive/Documents/source/cousor/apos
- Git: main branch, clean
"""

passed = 0
total = 0

print("=" * 65)
print("APOS 上下文管理压力测试 — 真实 Claude Code 会话模拟")
print("=" * 65)
print(f"\n📁 真实文件大小:")
print(f"   CLAUDE.md:          {len(CLAUDE_MD):,} chars (~{estimate_tokens(CLAUDE_MD):,} tokens)")
print(f"   llm.ts:             {len(LLM_TS):,} chars (~{estimate_tokens(LLM_TS):,} tokens)")
print(f"   compression.ts:     {len(COMPRESSION_TS):,} chars (~{estimate_tokens(COMPRESSION_TS):,} tokens)")
print(f"   messages/route.ts:  {len(MESSAGES_ROUTE):,} chars (~{estimate_tokens(MESSAGES_ROUTE):,} tokens)")
print(f"   System prompt:      {len(REAL_SYSTEM):,} chars (~{estimate_tokens(REAL_SYSTEM):,} tokens)")
print(f"\n   Qwen3.5 9B 上下文限制: 24,000 tokens (保守值)")
print(f"   Layer 2 触发阈值:    {int(24000*0.65):,} tokens (65%)")

# ─────────────────────────────────────────────────────────────
# 测试 1: 真实 system prompt + 多轮代码对话，验证上下文保持
# ─────────────────────────────────────────────────────────────
print("\n" + "─" * 65)
print("【测试 1】真实 system prompt + 多轮代码对话")
history = [
    {"role": "user",      "content": f"请阅读 llm.ts 文件：\n\n```typescript\n{LLM_TS[:3000]}\n```\n\n这个文件的核心导出函数是 routeModel，记住这个函数名"},
    {"role": "assistant", "content": "好的，llm.ts 的核心导出函数是 routeModel，它根据任务类型智能路由到最优模型（LM Studio 本地模型优先）。"},
    {"role": "user",      "content": f"现在看 context-manager.ts：\n\n```typescript\n{CONTEXT_MANAGER[:2000]}\n```\n\n这个文件实现了三层上下文管理"},
    {"role": "assistant", "content": "了解，context-manager.ts 实现三层：Layer1 代码压缩、Layer2 摘要、Layer3 向量记忆。"},
    {"role": "user",      "content": "我最开始让你看的文件叫什么？它的核心函数是什么？"},
]
sys_tokens = estimate_tokens(REAL_SYSTEM)
msg_tokens = sum(estimate_tokens(m["content"]) for m in history)
total_tokens = sys_tokens + msg_tokens
print(f"   Token 估算: system={sys_tokens:,} + messages={msg_tokens:,} = {total_tokens:,}")
ans = send(history, system=REAL_SYSTEM)
total += 1
if check(ans, ["llm.ts", "routemodel"], "真实 system prompt 多轮上下文保持"): passed += 1

# ─────────────────────────────────────────────────────────────
# 测试 2: 大文件内容触发 Layer 1 代码压缩
# ─────────────────────────────────────────────────────────────
print("\n" + "─" * 65)
print("【测试 2】大文件内容（触发 Layer 1 代码压缩）")
history = [
    {"role": "user",      "content": f"分析完整的 compression.ts 文件：\n\n```typescript\n{COMPRESSION_TS}\n```\n\n这个文件的主入口函数是 compressMessages，记住这个函数名"},
    {"role": "assistant", "content": "好的，compression.ts 的主入口是 compressMessages，支持 light/medium/aggressive 三种压缩级别。"},
    {"role": "user",      "content": f"再看 messages/route.ts：\n\n```typescript\n{MESSAGES_ROUTE}\n```\n\n这是 Claude CLI 代理路由"},
    {"role": "assistant", "content": "了解，messages/route.ts 是 Claude CLI 代理，拦截请求并路由到本地模型。"},
    {"role": "user",      "content": "compression.ts 的主入口函数叫什么？"},
]
sys_tokens = estimate_tokens(REAL_SYSTEM)
msg_tokens = sum(estimate_tokens(m["content"]) for m in history)
total_tokens = sys_tokens + msg_tokens
l1_threshold = int(24000 * 0.4)
print(f"   Token 估算: {total_tokens:,} | Layer 1 触发阈值: {l1_threshold:,}")
if total_tokens > l1_threshold:
    print(f"   ⚡ 预期触发 Layer 1 代码压缩")
ans = send(history, system=REAL_SYSTEM, timeout=180)
total += 1
if check(ans, ["compressmessages"], "大文件后上下文保持"): passed += 1

# ─────────────────────────────────────────────────────────────
# 测试 3: 超长对话触发 Layer 2 摘要
# ─────────────────────────────────────────────────────────────
print("\n" + "─" * 65)
print("【测试 3】超长对话（触发 Layer 2 摘要）")
history = []
# 用真实文件内容构造多轮对话，每轮都包含代码片段
rounds = [
    (f"分析 llm.ts 第1部分：\n```typescript\n{LLM_TS[:2000]}\n```\n记住：这里定义了 LMSTUDIO_BASE_URL 常量",
     "好的，llm.ts 第1部分定义了 LMSTUDIO_BASE_URL 常量，默认值是 http://localhost:1234。"),
    (f"llm.ts 第2部分：\n```typescript\n{LLM_TS[2000:4000]}\n```\n这里有 getLMStudioModels 函数",
     "了解，getLMStudioModels 函数通过 fetch 获取 LM Studio 已加载的模型列表。"),
    (f"llm.ts 第3部分：\n```typescript\n{LLM_TS[4000:6000]}\n```\n这里是 routeModel 函数的开始",
     "好的，routeModel 函数根据 taskType 从数据库读取配置，决定路由到哪个模型。"),
    (f"llm.ts 第4部分：\n```typescript\n{LLM_TS[6000:8000]}\n```\n这里是 getLLMClient 函数",
     "了解，getLLMClient 函数按优先级选择模型：LM Studio > Web模型 > 付费API。"),
    (f"llm.ts 第5部分：\n```typescript\n{LLM_TS[8000:10000]}\n```\n这里是 generateText 网关函数",
     "好的，generateText 是统一网关，自动判断是否走 web 模型或原生 AI SDK。"),
    (f"compression.ts 第1部分：\n```typescript\n{COMPRESSION_TS[:2000]}\n```\n定义了 CompressionResult 接口",
     "了解，CompressionResult 接口包含 compressedMessages、compressedSystem 和 stats 字段。"),
    (f"compression.ts 第2部分：\n```typescript\n{COMPRESSION_TS[2000:4000]}\n```\n这里有 AST 压缩逻辑",
     "好的，AST 压缩使用 TypeScript 编译器 API 提取函数签名，去掉实现体。"),
    (f"messages/route.ts 第1部分：\n```typescript\n{MESSAGES_ROUTE[:2000]}\n```\n这是 Claude CLI 代理入口",
     "了解，messages/route.ts 是 POST /api/v1/messages 的处理器，拦截 Claude CLI 请求。"),
    (f"messages/route.ts 第2部分：\n```typescript\n{MESSAGES_ROUTE[2000:4000]}\n```\n这里有 classifyPrompt 函数",
     "好的，classifyPrompt 用关键词启发式分类任务类型：summarize/coding/refactor/planning/reasoning。"),
    (f"context-manager.ts 完整内容：\n```typescript\n{CONTEXT_MANAGER[:3000]}\n```\n实现了三层上下文管理",
     "好的，context-manager.ts 的 manageContext 函数依次执行三层处理后返回优化后的 messages。"),
    ("我们讨论的第一个文件里，LMSTUDIO_BASE_URL 的默认值是什么？",
     "LMSTUDIO_BASE_URL 的默认值是 http://localhost:1234。"),
]
for user_msg, assistant_msg in rounds:
    history.append({"role": "user", "content": user_msg})
    history.append({"role": "assistant", "content": assistant_msg})

history.append({"role": "user", "content": "我们最开始讨论的第一个文件里，LMSTUDIO_BASE_URL 的默认值是什么？compression.ts 里定义了什么接口？"})

sys_tokens = estimate_tokens(REAL_SYSTEM)
msg_tokens = sum(estimate_tokens(m["content"]) for m in history)
total_tokens = sys_tokens + msg_tokens
l2_threshold = int(24000 * 0.65)
print(f"   Token 估算: system={sys_tokens:,} + messages={msg_tokens:,} = {total_tokens:,}")
print(f"   Layer 2 触发阈值: {l2_threshold:,} tokens")
if total_tokens > l2_threshold:
    print(f"   ⚡ 预期触发 Layer 2 摘要！")
else:
    print(f"   ℹ️  差 {l2_threshold - total_tokens:,} tokens 触发 Layer 2")

ans = send(history, system=REAL_SYSTEM, max_tokens=300, timeout=180)
total += 1
if check(ans, ["localhost:1234", "compressionresult"], "超长对话后早期信息保留"): passed += 1

# ─────────────────────────────────────────────────────────────
# 测试 4: 极端超大 payload — 验证兜底截断不崩溃
# ─────────────────────────────────────────────────────────────
print("\n" + "─" * 65)
print("【测试 4】极端超大 payload — 兜底截断不崩溃")
history = []
# 把所有真实文件都塞进去，远超上下文限制
all_files = [
    ("llm.ts", LLM_TS),
    ("compression.ts", COMPRESSION_TS),
    ("messages/route.ts", MESSAGES_ROUTE),
    ("context-manager.ts", CONTEXT_MANAGER),
]
for fname, content in all_files:
    history.append({"role": "user", "content": f"读取文件 {fname}：\n```typescript\n{content}\n```"})
    history.append({"role": "assistant", "content": f"好的，已读取 {fname}。"})
history.append({"role": "user", "content": "以上共读取了几个文件？只回答数字"})

sys_tokens = estimate_tokens(REAL_SYSTEM)
msg_tokens = sum(estimate_tokens(m["content"]) for m in history)
total_tokens = sys_tokens + msg_tokens
print(f"   Token 估算: {total_tokens:,} (上下文限制 24,000 的 {total_tokens/24000:.1f}x)")
print(f"   测试目标：触发兜底截断，不崩溃，正常返回")

start = time.time()
ans = send(history, system=REAL_SYSTEM, max_tokens=50, timeout=180)
elapsed = time.time() - start
total += 1
ok = not ans.startswith("ERROR") and len(ans) > 0
print(f"  {'✅ PASS' if ok else '❌ FAIL'} 超大 payload 不崩溃 (耗时 {elapsed:.1f}s)")
print(f"  回答: {ans[:150]}")
if ok: passed += 1

# ─────────────────────────────────────────────────────────────
# 结果汇总
# ─────────────────────────────────────────────────────────────
print("\n" + "=" * 65)
print(f"结果: {passed}/{total} 通过")
print("=" * 65)
