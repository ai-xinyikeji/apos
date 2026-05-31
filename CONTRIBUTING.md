# 贡献指南

感谢您对 APOS 项目的关注！我们欢迎所有形式的贡献。

## 行为准则

参与本项目即表示您同意遵守我们的行为准则：

- 尊重所有贡献者
- 接受建设性批评
- 关注对社区最有利的事情
- 对其他社区成员表现出同理心

## 如何贡献

### 报告 Bug

如果您发现了 Bug，请创建一个 Issue 并包含：

1. **清晰的标题**: 简洁描述问题
2. **复现步骤**: 详细的步骤说明
3. **期望行为**: 您期望发生什么
4. **实际行为**: 实际发生了什么
5. **环境信息**: 
   - 操作系统
   - Node.js 版本
   - npm/pnpm 版本
6. **截图/日志**: 如果适用

**Bug 报告模板**:

```markdown
## Bug 描述
简洁清晰地描述 Bug

## 复现步骤
1. 访问 '...'
2. 点击 '...'
3. 滚动到 '...'
4. 看到错误

## 期望行为
清晰描述您期望发生什么

## 实际行为
清晰描述实际发生了什么

## 截图
如果适用，添加截图帮助解释问题

## 环境
- OS: [e.g. macOS 14.0]
- Node.js: [e.g. 20.10.0]
- Browser: [e.g. Chrome 120]

## 额外信息
添加任何其他相关信息
```

### 提出新功能

如果您有新功能的想法，请创建一个 Issue 并包含：

1. **功能描述**: 清晰描述功能
2. **使用场景**: 为什么需要这个功能
3. **建议实现**: 您认为如何实现（可选）
4. **替代方案**: 您考虑过的其他方案（可选）

**功能请求模板**:

```markdown
## 功能描述
清晰简洁地描述您想要的功能

## 问题背景
这个功能解决什么问题？

## 建议方案
描述您希望如何实现

## 替代方案
描述您考虑过的其他方案

## 额外信息
添加任何其他相关信息或截图
```

### 提交代码

#### 开发环境设置

1. **Fork 仓库**

```bash
# 在 GitHub 上点击 Fork 按钮
```

2. **克隆您的 Fork**

```bash
git clone https://github.com/YOUR_USERNAME/apos.git
cd apos
```

3. **添加上游仓库**

```bash
git remote add upstream https://github.com/ORIGINAL_OWNER/apos.git
```

4. **安装依赖**

```bash
npm install
```

5. **配置环境变量**

```bash
cp .env.example .env.local
# 编辑 .env.local 添加您的 API Keys
```

6. **初始化数据库**

```bash
npm run db:push
```

7. **启动开发服务器**

```bash
npm run dev
```

#### 开发流程

1. **创建分支**

```bash
git checkout -b feature/your-feature-name
# 或
git checkout -b fix/your-bug-fix
```

分支命名规范：
- `feature/` - 新功能
- `fix/` - Bug 修复
- `docs/` - 文档更新
- `refactor/` - 代码重构
- `test/` - 测试相关
- `chore/` - 构建/工具相关

2. **编写代码**

遵循项目的编码规范（见下文）

3. **测试您的更改**

```bash
# 运行 linter
npm run lint

# 构建项目
npm run build

# 手动测试功能
npm run dev
```

4. **提交更改**

```bash
git add .
git commit -m "feat: add user authentication"
```

提交信息规范（遵循 Conventional Commits）：

- `feat:` - 新功能
- `fix:` - Bug 修复
- `docs:` - 文档更新
- `style:` - 代码格式（不影响功能）
- `refactor:` - 代码重构
- `test:` - 测试相关
- `chore:` - 构建/工具相关
- `perf:` - 性能优化

示例：
```
feat: add RAG vector search for code reuse
fix: resolve compilation error in ProtoBuilder
docs: update API documentation for settings endpoint
refactor: extract LLM service to separate module
```

5. **推送到您的 Fork**

```bash
git push origin feature/your-feature-name
```

6. **创建 Pull Request**

- 访问 GitHub 上您的 Fork
- 点击 "New Pull Request"
- 填写 PR 描述（见下文模板）
- 提交 PR

#### Pull Request 模板

```markdown
## 变更类型
- [ ] Bug 修复
- [ ] 新功能
- [ ] 重大变更
- [ ] 文档更新

## 变更描述
清晰描述您的更改

## 相关 Issue
Closes #123

## 测试
描述您如何测试了这些更改

## 截图（如适用）
添加截图展示 UI 变更

## 检查清单
- [ ] 代码遵循项目编码规范
- [ ] 已运行 `npm run lint` 无错误
- [ ] 已运行 `npm run build` 成功
- [ ] 已手动测试所有更改
- [ ] 已更新相关文档
- [ ] 提交信息遵循规范
```

## 编码规范

### TypeScript/JavaScript

1. **使用 TypeScript**: 所有新代码必须使用 TypeScript
2. **类型安全**: 避免使用 `any`，优先使用具体类型
3. **命名规范**:
   - 变量/函数: `camelCase`
   - 类/接口: `PascalCase`
   - 常量: `UPPER_SNAKE_CASE`
   - 文件名: `kebab-case.ts` 或 `PascalCase.tsx`（组件）

4. **函数规范**:
   - 优先使用箭头函数
   - 函数应该简短且单一职责
   - 添加 JSDoc 注释（复杂函数）

```typescript
// ✅ 好的示例
interface UserData {
  id: number;
  name: string;
  email: string;
}

const fetchUser = async (userId: number): Promise<UserData> => {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
};

// ❌ 不好的示例
const fetchUser = async (userId: any) => {
  const response = await fetch(`/api/users/${userId}`);
  return response.json();
};
```

### React 组件

1. **函数组件**: 使用函数组件，不使用类组件
2. **Hooks**: 遵循 Hooks 规则
3. **Props 类型**: 明确定义 Props 接口
4. **Server/Client 组件**: 
   - 默认使用 Server Components
   - 仅在需要交互时使用 `'use client'`

```typescript
// ✅ 好的示例
interface ButtonProps {
  label: string;
  onClick: () => void;
  variant?: 'primary' | 'secondary';
}

export const Button = ({ label, onClick, variant = 'primary' }: ButtonProps) => {
  return (
    <button onClick={onClick} className={cn('btn', `btn-${variant}`)}>
      {label}
    </button>
  );
};

// ❌ 不好的示例
export const Button = (props: any) => {
  return <button onClick={props.onClick}>{props.label}</button>;
};
```

### CSS/Tailwind

1. **使用 Tailwind**: 优先使用 Tailwind 类
2. **组件变体**: 使用 CVA (Class Variance Authority)
3. **响应式**: 考虑移动端适配
4. **深色主题**: 使用 slate 色系

```typescript
// ✅ 好的示例
<div className="rounded-2xl border border-slate-800 bg-slate-900/20 p-6 hover:border-slate-700/50 transition-colors">
  <h3 className="text-slate-200 font-semibold">标题</h3>
</div>

// ❌ 不好的示例
<div style={{ borderRadius: '16px', border: '1px solid #1e293b' }}>
  <h3>标题</h3>
</div>
```

### 数据库

1. **使用 Drizzle ORM**: 不直接写 SQL
2. **类型安全**: 利用 Drizzle 的类型推断
3. **事务**: 复杂操作使用事务

```typescript
// ✅ 好的示例
const [prototype] = await db
  .select()
  .from(prototypes)
  .where(eq(prototypes.id, prototypeId));

// ❌ 不好的示例
const prototype = await db.run('SELECT * FROM prototypes WHERE id = ?', [prototypeId]);
```

### Git 提交

1. **原子提交**: 每个提交应该是一个逻辑单元
2. **清晰的消息**: 遵循 Conventional Commits
3. **避免大文件**: 不提交 node_modules、.env 等

## 项目结构

添加新功能时，请遵循现有的项目结构：

```
src/
├── agents/           # 添加新 Agent
├── app/
│   ├── api/          # 添加新 API 路由
│   └── [page]/       # 添加新页面
├── components/
│   └── ui/           # 添加新 UI 组件
└── lib/              # 添加新工具函数
```

## 测试

虽然当前项目没有测试，但我们鼓励添加测试：

1. **单元测试**: 测试独立函数和组件
2. **集成测试**: 测试 API 端点
3. **E2E 测试**: 测试完整用户流程

未来将添加测试框架（Jest + React Testing Library）。

## 文档

更新代码时，请同步更新文档：

- **README.md**: 功能概览和快速开始
- **ARCHITECTURE.md**: 架构设计
- **API.md**: API 端点
- **代码注释**: 复杂逻辑添加注释

## 发布流程

项目维护者负责发布新版本：

1. 更新版本号（`package.json`）
2. 更新 CHANGELOG.md
3. 创建 Git tag
4. 发布到 npm（如适用）

## 获取帮助

如果您有任何问题：

1. 查看现有 Issues
2. 阅读文档（README、ARCHITECTURE、API）
3. 创建新 Issue 提问

## 许可证

提交代码即表示您同意将代码以 MIT 许可证发布。

## 致谢

感谢所有贡献者！您的贡献让 APOS 变得更好。

---

**Happy Coding! 🚀**
