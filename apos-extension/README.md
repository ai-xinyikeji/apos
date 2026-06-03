# APOS Chrome Extension

APOS 浏览器扩展 - 自动同步 ChatGPT 和 Gemini 的 Session Cookies 到本地 APOS 系统。

## 功能特性

### 🔄 自动 Cookie 同步
- 自动检测 ChatGPT 和 Gemini 的登录 Cookies
- 一键同步到本地 APOS 系统
- 支持自动定时同步（可选）

### 📊 实时状态监控
- 显示 APOS 服务器连接状态
- 显示检测到的 Cookies 数量
- 实时更新同步状态

### 🎨 现代化 UI
- 深色主题设计
- 流畅的动画效果
- 清晰的状态指示

## 安装方法

### 方式 1: 开发者模式安装（推荐）

1. **打开 Chrome 扩展管理页面**
   ```
   chrome://extensions/
   ```

2. **启用开发者模式**
   - 点击右上角的"开发者模式"开关

3. **加载扩展**
   - 点击"加载已解压的扩展程序"
   - 选择 `apos-extension` 文件夹
   - 扩展将自动加载

4. **固定扩展**
   - 点击浏览器工具栏的拼图图标
   - 找到 "APOS Extension"
   - 点击图钉图标固定到工具栏

### 方式 2: 打包安装

```bash
# 在项目根目录
cd apos-extension

# Chrome 会自动打包，或使用命令行
# 打包后会生成 .crx 文件
```

## 使用指南

### 首次使用

1. **启动 APOS 服务器**
   ```bash
   cd apos
   npm run dev
   ```

2. **登录 ChatGPT 或 Gemini**
   - 访问 https://chatgpt.com 并登录
   - 或访问 https://gemini.google.com 并登录

3. **打开扩展**
   - 点击工具栏的 APOS 图标
   - 查看检测到的 Cookies

4. **同步 Cookies**
   - 点击"同步 Cookies 到 APOS"按钮
   - 等待同步完成
   - 查看成功提示

### 日常使用

#### 手动同步

1. 点击扩展图标
2. 点击"同步 Cookies 到 APOS"
3. 等待同步完成

#### 自动同步（可选）

扩展支持自动定时同步功能：

1. 打开扩展设置（未来版本）
2. 启用"自动同步"
3. 设置同步间隔（默认 30 分钟）

#### 刷新状态

- 点击"刷新状态"按钮
- 重新检测 Cookies 和服务器状态

#### 打开设置

- 点击"打开 APOS 设置"按钮
- 直接跳转到 APOS 设置页面

## 工作原理

### Cookie 检测

扩展会检测以下域名的 Cookies：

**ChatGPT**:
- `chatgpt.com`
- `openai.com`

**Gemini**:
- `gemini.google.com`
- `google.com`

### 同步流程

```
1. 用户点击同步按钮
   ↓
2. 扩展从浏览器读取 Cookies
   ↓
3. 格式化为 Cookie 字符串
   ↓
4. 发送到 APOS API (/api/settings)
   ↓
5. APOS 保存到数据库
   ↓
6. 显示同步成功
```

### 安全性

- ✅ Cookies 仅在本地网络传输（localhost）
- ✅ 不会发送到任何外部服务器
- ✅ 使用 Chrome 官方 Cookies API
- ✅ 遵循最小权限原则

## 权限说明

扩展需要以下权限：

| 权限 | 用途 |
|------|------|
| `cookies` | 读取 ChatGPT 和 Gemini 的 Cookies |
| `storage` | 保存扩展设置（如自动同步配置） |
| `tabs` | 打开 APOS 设置页面 |
| `host_permissions` | 访问特定域名的 Cookies |

## 故障排查

### 🚨 常见问题快速解决

#### ChatGPT 显示"测试中..."卡住不动

**原因**: popup 的测试按钮通过轮询 `/api/ext/test-result` 获取结果，之前的实现有 bug 导致结果读不到。已修复。

**如果仍然卡住**:
1. 确认 ChatGPT 标签页已打开并登录
2. 确认 APOS 服务正在运行 (`npm run dev`)
3. 重新加载扩展后再试

---

### 问题 1: 服务器未连接

**症状**: 状态显示"未连接"

**解决方案**:
1. 确认 APOS 服务器正在运行
   ```bash
   npm run dev
   ```
2. 访问 http://localhost:3000 确认可访问
3. 点击"刷新状态"重新检测

### 问题 2: 任务队列卡住

**症状**: 任务队列显示有任务但一直不完成

**解决方案**:
1. 确认对应网站的标签页已打开（ChatGPT/Gemini/Kimi）
2. 确认已登录对应网站
3. 刷新对应网站的标签页
4. 重新加载扩展

### 问题 3: 扩展无法加载

**症状**: Chrome 提示加载失败

**解决方案**:
1. 确认 `manifest.json` 格式正确
2. 确认所有文件都存在
3. 检查文件权限
4. 查看 Chrome 扩展错误详情

### 🔍 查看扩展日志

- **Popup 日志**: 右键扩展图标 → 检查弹出内容
- **Background 日志**: chrome://extensions/ → 检查视图 (Service Worker)
- **Content 日志**: 在 ChatGPT/Gemini/Kimi 页面按 F12 → Console

## 开发指南

### 文件结构

```
apos-extension/
├── manifest.json       # 扩展配置文件
├── background.js       # 后台服务脚本
├── content.js          # 内容脚本（注入到 APOS 页面）
├── popup.html          # 弹出窗口 HTML
├── popup.js            # 弹出窗口逻辑
├── icons/              # 扩展图标
│   ├── icon16.png
│   ├── icon48.png
│   └── icon128.png
└── README.md           # 本文档
```

### 调试方法

#### 调试 Popup

1. 右键点击扩展图标
2. 选择"检查弹出内容"
3. 打开开发者工具

#### 调试 Background Script

1. 访问 `chrome://extensions/`
2. 找到 APOS Extension
3. 点击"检查视图: Service Worker"

#### 调试 Content Script

1. 访问 http://localhost:3000/settings
2. 打开浏览器开发者工具
3. 查看 Console 标签

### 修改扩展

修改后需要重新加载：

1. 访问 `chrome://extensions/`
2. 找到 APOS Extension
3. 点击刷新图标

### 添加新功能

#### 添加新的 Cookie 来源

编辑 `background.js`:

```javascript
// 添加新的域名
const newCookies = await chrome.cookies.getAll({ 
  domain: 'example.com' 
});
```

#### 添加新的 UI 元素

编辑 `popup.html` 和 `popup.js`

#### 添加新的 API 端点

编辑 `popup.js` 中的 `APOS_SERVER_URL`

## 版本历史

### v1.0.0 (2024-01-15)

**新功能**:
- ✅ Cookie 自动检测
- ✅ 一键同步到 APOS
- ✅ 实时状态监控
- ✅ 现代化 UI 设计
- ✅ 服务器连接检测

**改进**:
- 优化 Cookie 去重逻辑
- 改进错误提示
- 添加加载动画

## 未来计划

### v1.1.0
- [ ] 自动同步设置界面
- [ ] 同步历史记录
- [ ] 更多 LLM 平台支持（Claude, Llama 等）

### v1.2.0
- [ ] 多账号管理
- [ ] Cookie 过期提醒
- [ ] 同步日志查看

### v2.0.0
- [ ] 支持远程 APOS 服务器
- [ ] 加密传输
- [ ] 团队共享功能

## 贡献

欢迎提交 Issue 和 Pull Request！

## 许可证

MIT License

## 支持

遇到问题？

1. 查看本文档的故障排查部分
2. 查看 [APOS 主文档](../README.md)
3. 提交 [GitHub Issue](https://github.com/your-repo/apos/issues)

---

**Happy Coding! 🚀**
