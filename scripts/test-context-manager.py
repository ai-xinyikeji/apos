#!/usr/bin/env python3
"""
APOS 三层上下文管理系统测试
模拟 Claude Code CLI 的多轮对话场景
"""
import json
import urllib.request
import urllib.error

BASE = "http://localhost:3000/api/v1/messages"
HEADERS = {
    "Content-Type": "application/json",
    "x-api-key": "test",
    "anthropic-version": "2023-06-01",
}

def send(messages, max_tokens=300):
    payload = json.dumps({
        "model": "claude-3-5-sonnet-20241022",
        "max_tokens": max_tokens,
        "stream": False,
        "messages": messages,
    }).encode()
    req = urllib.request.Request(BASE, data=payload, headers=HEADERS, method="POST")
    try:
        with urllib.request.urlopen(req, timeout=90) as resp:
            d = json.loads(resp.read())
            return d.get("content", [{}])[0].get("text", "")
    except Exception as e:
        return f"ERROR: {e}"

def check(answer, keywords, test_name):
    answer_lower = answer.lower()
    found = [kw for kw in keywords if kw.lower() in answer_lower]
    ok = len(found) == len(keywords)
    status = "✅ PASS" if ok else "❌ FAIL"
    print(f"  {status} {test_name}")
    if not ok:
        missing = [kw for kw in keywords if kw.lower() not in answer_lower]
        print(f"     缺少关键词: {missing}")
        print(f"     实际回答: {answer[:300]}")
    return ok

passed = 0
total = 0

print("=" * 60)
print("APOS 三层上下文管理系统测试")
print("=" * 60)

# ── 测试 1: 基础多轮上下文保持 ──────────────────────────────
print("\n【测试 1】基础多轮上下文保持")
history = [
    {"role": "user", "content": "我叫小明，我是 Python 开发者，项目用 Django 和 PostgreSQL"},
    {"role": "assistant", "content": "好的，我记住了：你叫小明，Python 开发者，项目使用 Django + PostgreSQL。"},
    {"role": "user", "content": "我叫什么名字？项目用什么数据库？只需简短回答"},
]
ans = send(history)
total += 1
if check(ans, ["小明", "postgresql"], "多轮对话上下文保持"): passed += 1

# ── 测试 2: 代码上下文保持 ──────────────────────────────────
print("\n【测试 2】代码上下文保持")
history = [
    {"role": "user", "content": "我有一个函数 def calculate_tax(income): return income * 0.3"},
    {"role": "assistant", "content": "好的，这是一个计算税率的函数，税率固定为 30%。"},
    {"role": "user", "content": "我刚才定义的函数叫什么名字？税率是多少？"},
]
ans = send(history)
total += 1
if check(ans, ["calculate_tax", "30"], "代码上下文保持"): passed += 1

# ── 测试 3: 长对话上下文（20轮）──────────────────────────────
print("\n【测试 3】长对话上下文（20 轮）")
history = []
pairs = [
    ("项目名叫 ToonFlow", "好的，项目名是 ToonFlow。"),
    ("后端用 Node.js", "了解，后端使用 Node.js。"),
    ("前端用 React", "好的，前端是 React。"),
    ("数据库用 MongoDB", "了解，数据库是 MongoDB。"),
    ("部署在 AWS", "好的，部署在 AWS 上。"),
    ("用 Docker 容器化", "了解，使用 Docker 容器化。"),
    ("CI/CD 用 GitHub Actions", "好的，CI/CD 使用 GitHub Actions。"),
    ("测试框架用 Jest", "了解，测试框架是 Jest。"),
    ("代码风格用 ESLint", "好的，使用 ESLint 做代码规范。"),
    ("包管理用 pnpm", "了解，使用 pnpm 管理依赖。"),
]
for u, a in pairs:
    history.append({"role": "user", "content": u})
    history.append({"role": "assistant", "content": a})
history.append({"role": "user", "content": "项目叫什么名字？用什么数据库？部署在哪里？简短回答"})
ans = send(history, max_tokens=200)
total += 1
if check(ans, ["toonflow", "mongodb", "aws"], "长对话上下文保持（20轮）"): passed += 1

# ── 测试 4: 错误恢复 ──────────────────────────────────────
print("\n【测试 4】空消息列表容错")
ans = send([{"role": "user", "content": "hello"}], max_tokens=50)
total += 1
ok = "ERROR" not in ans
status = "✅ PASS" if ok else "❌ FAIL"
print(f"  {status} 空历史单条消息正常响应")
if ok: passed += 1

print("\n" + "=" * 60)
print(f"结果: {passed}/{total} 通过")
print("=" * 60)
print("\n请同时查看 APOS 服务器日志中的 [APOS ContextManager] 输出")
