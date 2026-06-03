# Google AI 搜索测试指南

## ✅ 已添加测试功能

现在扩展 popup 中已经添加了 Google 搜索测试按钮！

## 🧪 如何测试

### 1. 安装扩展

```bash
# 1. 打开 Chrome
chrome://extensions

# 2. 启用"开发者模式"（右上角开关）

# 3. 点击"加载已解压的扩展程序"

# 4. 选择 apos-extension/ 目录
```

### 2. 准备测试环境

```bash
# 1. 启动 APOS 服务器
npm run dev

# 2. 打开 Google 搜索页面
在 Chrome 中打开：https://www.google.com
（不需要登录）

# 3. 打开扩展 popup
点击浏览器工具栏的 APOS 扩展图标
```

### 3. 执行测试

在扩展 popup 中：

1. 找到 **"Google Search"** 卡片
2. 确认状态显示为：
   - ✅ "Tab 已打开" （如果你打开了 google.com）
   - ⚠️ "Tab 未检测到" （如果没打开）
3. 点击 **"🧪 测试"** 按钮
4. 等待 10-30 秒
5. 查看测试结果

### 4. 预期结果

#### 成功示例 ✅
```
✅ 测试成功！
✅ 有 AI Overview (1234 字符)
3 条搜索结果
```

或者：
```
✅ 测试成功！
⚠️ 无 AI Overview
5 条搜索结果
```

#### 失败示例 ❌
```
❌ 测试失败: Google 搜索需要浏览器扩展在线
```

```
❌ 测试失败: 测试超时（30秒）

可能原因：
1. 扩展未在 google.com 标签页
2. 网络问题
3. Google DOM 结构变化
```

## 📊 测试场景覆盖

### 场景 1: 有 AI Overview 的查询 ⭐

**测试查询词**：
- `what is artificial intelligence` ✅
- `how does machine learning work` ✅
- `benefits of electric cars` ✅

**预期结果**：
- ✅ 有 AI Overview
- ✅ 3-5 条搜索结果
- ✅ 10-15 秒返回

### 场景 2: 无 AI Overview 的查询

**测试查询词**：
- `github` （品牌名称）
- `weather` （简单查询）
- `news` （新闻查询）

**预期结果**：
- ⚠️ 无 AI Overview
- ✅ 5-10 条搜索结果
- ✅ 5-10 秒返回

### 场景 3: 中文查询

**测试查询词**：
- `人工智能是什么`
- `机器学习原理`

**预期结果**：
- ⚠️ 可能无 AI Overview（中文支持较弱）
- ✅ 3-5 条搜索结果
- ✅ 10-15 秒返回

### 场景 4: 扩展离线

**测试步骤**：
1. 关闭所有 google.com 标签页
2. 点击测试按钮

**预期结果**：
```
❌ 测试失败: Google 搜索需要浏览器扩展在线
```

### 场景 5: DOM 结构变化

**如果测试失败且返回空结果**：
1. 打开浏览器控制台
2. 查看是否有错误信息
3. 检查 DOM 结构是否变化

## 🔍 调试技巧

### 1. 查看扩展控制台

```bash
# 1. 打开 Chrome 扩展页面
chrome://extensions

# 2. 找到 APOS 扩展

# 3. 点击 "Service Worker" 查看日志

# 4. 查找：
[APOS Google Hook] 任务: "..." 
[APOS Google Hook] 完成: aiOverview=true, results=3条
```

### 2. 查看网页控制台

```bash
# 1. 在 google.com 页面按 F12

# 2. 切换到 Console 标签

# 3. 执行测试后查找：
[APOS Google Hook] 任务: "what is artificial intelligence"
[APOS Google Hook] 完成: aiOverview=true, results=3条
```

### 3. 手动测试 DOM 解析

在 google.com 控制台执行：

```javascript
// 测试 AI Overview 解析
const byAttr = document.querySelector('[data-attrid="ai_overview"]');
console.log('策略 1 (data-attrid):', byAttr ? '✅ 找到' : '❌ 未找到');

const firstCitation = document.querySelector('[data-citation]');
console.log('策略 2 (data-citation):', firstCitation ? '✅ 找到' : '❌ 未找到');

const byClass = document.querySelector('.WaaZC');
console.log('策略 3 (.WaaZC):', byClass ? '✅ 找到' : '❌ 未找到');

const hvBlocks = document.querySelectorAll('[data-hveid]');
console.log('策略 4 ([data-hveid]):', hvBlocks.length, '个候选块');

// 测试搜索结果解析
const headings = document.querySelectorAll('h3');
console.log('搜索结果标题:', headings.length, '个');
```

### 4. 查看服务端日志

```bash
# APOS 终端会显示：
[GoogleSearchDiscovery] 搜索失败，跳过: ...
[GoogleSearchDiscovery] JSON 解析失败: ...

# 或成功：
[APOS Google Hook] 完成: aiOverview=true, results=3条
```

## 📈 成功率统计

建议记录测试结果：

| 日期 | 查询词 | AI Overview | 搜索结果 | 成功/失败 | 耗时 |
|-----|--------|------------|---------|---------|------|
| 2024-06-02 | what is AI | ✅ 1234字符 | 3条 | ✅ 成功 | 12秒 |
| 2024-06-02 | github | ❌ 无 | 5条 | ✅ 成功 | 8秒 |
| 2024-06-02 | 人工智能 | ❌ 无 | 4条 | ✅ 成功 | 10秒 |

## 🐛 常见问题

### Q1: 测试按钮不显示

**原因**：扩展未检测到 google.com 标签页

**解决**：
1. 打开 https://www.google.com
2. 刷新扩展 popup
3. 确认状态变为 "✅ Tab 已打开"

### Q2: 测试一直显示"等待中..."

**原因**：任务卡在队列中

**解决**：
1. 检查 APOS 服务器是否运行
2. 查看服务端日志
3. 关闭并重新打开 google.com 标签页
4. 重新测试

### Q3: 返回"无 AI Overview"

**原因**：
1. 查询词不适合 AI Overview（正常情况）
2. DOM 解析失败（需要更新代码）
3. Google 地区/语言不支持

**判断方法**：
1. 手动在 Google 搜索该查询词
2. 查看页面上是否真的有 AI Overview
3. 如果有但解析不到，说明 DOM 结构变了

### Q4: 测试超时

**原因**：
1. 网络慢
2. 扩展未激活
3. Google 显示验证码

**解决**：
1. 检查网络连接
2. 刷新 google.com 页面
3. 手动完成验证码
4. 重新测试

## 📝 测试报告模板

```markdown
# Google AI 搜索测试报告

**测试日期**: 2024-06-02  
**测试人**: XXX  
**APOS 版本**: v0.1.0  
**Chrome 版本**: 120.0.0  

## 测试环境
- ✅ APOS 服务器运行正常
- ✅ 扩展已安装并激活
- ✅ 已打开 google.com 标签页

## 测试结果

### 场景 1: 英文查询（有 AI Overview）
- 查询词: `what is artificial intelligence`
- AI Overview: ✅ 成功（1234 字符）
- 搜索结果: ✅ 3 条
- 耗时: 12 秒
- 结论: ✅ 通过

### 场景 2: 品牌查询（无 AI Overview）
- 查询词: `github`
- AI Overview: ⚠️ 无（正常）
- 搜索结果: ✅ 5 条
- 耗时: 8 秒
- 结论: ✅ 通过

### 场景 3: 中文查询
- 查询词: `人工智能是什么`
- AI Overview: ⚠️ 无
- 搜索结果: ✅ 4 条
- 耗时: 10 秒
- 结论: ✅ 通过

### 场景 4: DOM 结构验证
- 策略 1 (data-attrid): ✅ 找到
- 策略 2 (data-citation): ✅ 找到
- 策略 3 (.WaaZC): ❌ 未找到
- 策略 4 (智能扫描): ✅ 找到

## 总体评估

- 总测试数: 4
- 成功: 4
- 失败: 0
- 成功率: 100%

## 问题和建议

1. 策略 3 的 `.WaaZC` class 已经失效，需要移除或更新
2. 中文查询的 AI Overview 支持较弱，这是 Google 的限制
3. 建议增加更多测试用例

## 结论

✅ Google AI 搜索功能基本可用，但需要：
1. 定期验证 DOM 选择器
2. 监控失败率
3. 准备 fallback 方案
```

## 🚀 下一步

1. **立即测试**：按照本指南执行测试
2. **记录结果**：填写测试报告
3. **报告问题**：如果发现 DOM 解析失败，记录详细信息
4. **持续监控**：建议每周测试一次

---

**测试完成后，请更新**: `GOOGLE_SEARCH_REALITY_CHECK.md`
