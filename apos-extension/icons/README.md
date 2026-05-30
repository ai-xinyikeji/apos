# APOS Extension Icons

本目录包含 Chrome 扩展所需的图标文件。

## 所需图标

- `icon16.png` - 16x16 像素（工具栏小图标）
- `icon48.png` - 48x48 像素（扩展管理页面）
- `icon128.png` - 128x128 像素（Chrome Web Store）

## 设计规范

### 颜色方案
- 主色：`#4f46e5` (Indigo 600)
- 辅色：`#7c3aed` (Purple 600)
- 背景：深色或透明

### 设计元素
- 简洁的 AI/机器人图标
- 或使用 "APOS" 字母标识
- 圆角矩形背景（可选）

## 创建图标

### 方式 1: 使用在线工具

1. 访问 https://www.favicon-generator.org/
2. 上传 SVG 或 PNG 图片
3. 生成多个尺寸
4. 下载并重命名

### 方式 2: 使用 Figma/Sketch

1. 创建 128x128 画布
2. 设计图标
3. 导出为 PNG（128x128, 48x48, 16x16）

### 方式 3: 使用 ImageMagick

```bash
# 从 SVG 生成多个尺寸
convert icon.svg -resize 16x16 icon16.png
convert icon.svg -resize 48x48 icon48.png
convert icon.svg -resize 128x128 icon128.png
```

## 临时占位符

在开发阶段，可以使用纯色占位符：

```bash
# 创建简单的占位符（需要 ImageMagick）
convert -size 16x16 xc:#4f46e5 icon16.png
convert -size 48x48 xc:#4f46e5 icon48.png
convert -size 128x128 xc:#4f46e5 icon128.png
```

或使用 Emoji：

```bash
# 使用 Emoji 作为图标（需要支持 Emoji 的字体）
convert -size 128x128 xc:white -font "Apple-Color-Emoji" \
  -pointsize 100 -fill black -gravity center \
  -annotate +0+0 "🤖" icon128.png
```

## 图标示例

### 简单设计

```
┌─────────────┐
│             │
│   🤖 APOS   │
│             │
└─────────────┘
```

### 专业设计

- 使用渐变背景
- 添加阴影效果
- 圆角处理
- 高对比度

## 注意事项

- 确保图标在深色和浅色背景下都清晰可见
- 避免过于复杂的细节（16x16 时会模糊）
- 保持品牌一致性
- 使用 PNG 格式（支持透明度）

## 当前状态

⚠️ **图标文件缺失** - 请添加以下文件：
- [ ] icon16.png
- [ ] icon48.png
- [ ] icon128.png

添加图标后，扩展将正常显示图标。
