# APOS Extension 安装指南

详细的 Chrome 扩展安装步骤。

## 前置要求

- ✅ Google Chrome 浏览器（版本 88+）
- ✅ APOS 系统已安装并运行
- ✅ 已登录 ChatGPT 或 Gemini（可选，用于测试）

## 安装步骤

### 步骤 1: 准备扩展文件

确认 `apos-extension` 目录包含以下文件：

```
apos-extension/
├── manifest.json       ✅
├── background.js       ✅
├── content.js          ✅
├── popup.html          ✅
├── popup.js            ✅
├── icons/              ⚠️ (图标可选)
└── README.md           ✅
```

### 步骤 2: 打开 Chrome 扩展管理页面

**方式 1**: 地址栏输入
```
chrome://extensions/
```

**方式 2**: 菜单导航
1. 点击 Chrome 右上角的三个点
2. 选择"更多工具" → "扩展程序"

### 步骤 3: 启用开发者模式

1. 在扩展管理页面右上角
2. 找到"开发者模式"开关
3. 点击开启（变为蓝色）

![开发者模式](https://via.placeholder.com/600x100/4f46e5/ffffff?text=Developer+Mode+ON)

### 步骤 4: 加载扩展

1. 点击"加载已解压的扩展程序"按钮
2. 在文件选择器中，导航到项目目录
3. 选择 `apos-extension` 文件夹
4. 点击"选择文件夹"

### 步骤 5: 验证安装

安装成功后，您应该看到：

- ✅ 扩展卡片出现在列表中
- ✅ 显示 "APOS Extension" 名称
- ✅ 显示版本号 "1.0.0"
- ✅ 状态为"已启用"

### 步骤 6: 固定到工具栏（推荐）

1. 点击浏览器工具栏右侧的拼图图标 🧩
2. 找到 "APOS Extension"
3. 点击图钉图标 📌 固定到工具栏

现在扩展图标会一直显示在工具栏上。

## 首次使用

### 1. 启动 APOS 服务器

```bash
cd apos
npm run dev
```

确认服务器运行在 http://localhost:3000

### 2. 测试扩展

1. 点击工具栏的 APOS 扩展图标
2. 弹出窗口应该显示：
   - 服务器状态：已连接 ✅
   - ChatGPT Cookies: 0
   - Gemini Cookies: 0

### 3. 登录 LLM 平台（可选）

**登录 ChatGPT**:
1. 访问 https://chatgpt.com
2. 登录您的账号
3. 刷新扩展状态
4. ChatGPT Cookies 数量应该 > 0

**登录 Gemini**:
1. 访问 https://gemini.google.com
2. 登录您的 Google 账号
3. 刷新扩展状态
4. Gemini Cookies 数量应该 > 0

### 4. 同步 Cookies

1. 点击"同步 Cookies 到 APOS"按钮
2. 等待同步完成
3. 看到成功提示 ✅

### 5. 验证同步

1. 访问 http://localhost:3000/settings
2. 检查 Cookie 配置是否已保存

## 常见问题

### Q1: 扩展加载失败

**错误**: "无法加载扩展"

**解决方案**:
1. 检查 `manifest.json` 格式是否正确
2. 确认所有必需文件都存在
3. 查看错误详情并修复
4. 重新加载扩展

### Q2: 图标不显示

**原因**: 缺少图标文件

**解决方案**:
1. 图标是可选的，不影响功能
2. 如需添加图标，参考 `icons/README.md`
3. 或暂时忽略，使用默认图标

### Q3: 服务器未连接

**错误**: 状态显示"未连接"

**解决方案**:
1. 确认 APOS 服务器正在运行
2. 访问 http://localhost:3000 测试
3. 检查防火墙设置
4. 点击"刷新状态"重试

### Q4: 未检测到 Cookies

**原因**: 未登录或 Cookies 被清除

**解决方案**:
1. 登录 ChatGPT 或 Gemini
2. 确保浏览器允许 Cookies
3. 刷新登录页面
4. 点击"刷新状态"

### Q5: 同步失败

**错误**: "同步失败: ..."

**解决方案**:
1. 检查 APOS 服务器日志
2. 确认 API 端点正常
3. 查看浏览器控制台错误
4. 重启扩展和服务器

## 更新扩展

当扩展代码更新后：

1. 访问 `chrome://extensions/`
2. 找到 APOS Extension
3. 点击刷新图标 🔄
4. 扩展将重新加载

## 卸载扩展

如需卸载：

1. 访问 `chrome://extensions/`
2. 找到 APOS Extension
3. 点击"移除"按钮
4. 确认删除

## 调试技巧

### 查看扩展日志

**Popup 日志**:
1. 右键点击扩展图标
2. 选择"检查弹出内容"
3. 查看 Console 标签

**Background 日志**:
1. 访问 `chrome://extensions/`
2. 找到 APOS Extension
3. 点击"检查视图: Service Worker"
4. 查看 Console 标签

**Content Script 日志**:
1. 访问 http://localhost:3000/settings
2. 打开浏览器开发者工具 (F12)
3. 查看 Console 标签
4. 搜索 "[APOS Extension]"

### 重置扩展

如果扩展出现问题：

1. 卸载扩展
2. 关闭所有 Chrome 窗口
3. 重新打开 Chrome
4. 重新安装扩展

## 权限说明

扩展需要以下权限才能正常工作：

| 权限 | 必需 | 用途 |
|------|------|------|
| cookies | ✅ | 读取 ChatGPT 和 Gemini 的 Cookies |
| storage | ✅ | 保存扩展设置 |
| tabs | ✅ | 打开 APOS 设置页面 |
| host_permissions | ✅ | 访问特定域名 |

所有权限都在本地使用，不会发送到外部服务器。

## 安全提示

- ✅ 扩展仅在本地网络工作
- ✅ Cookies 不会发送到互联网
- ✅ 使用 Chrome 官方 API
- ✅ 开源代码，可审计

## 技术支持

需要帮助？

1. 查看 [扩展 README](./README.md)
2. 查看 [APOS 主文档](../README.md)
3. 提交 [GitHub Issue](https://github.com/your-repo/apos/issues)

---

**安装完成！开始使用 APOS Extension 🚀**
