# Contributing to APOS

First off, thank you for considering contributing to APOS! It's people like you that make APOS such a great tool.

## 📋 Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [How Can I Contribute?](#how-can-i-contribute)
- [Development Process](#development-process)
- [Style Guidelines](#style-guidelines)
- [Commit Messages](#commit-messages)
- [Pull Request Process](#pull-request-process)

## Code of Conduct

This project and everyone participating in it is governed by our [Code of Conduct](CODE_OF_CONDUCT.md). By participating, you are expected to uphold this code.

## Getting Started

### Prerequisites

- Node.js 20+ and npm
- Git
- Basic knowledge of TypeScript/React
- Familiarity with Next.js is helpful

### Setting Up Development Environment

1. **Fork the repository** on GitHub

2. **Clone your fork**:
```bash
git clone https://github.com/YOUR_USERNAME/apos.git
cd apos
```

3. **Add upstream remote**:
```bash
git remote add upstream https://github.com/ai-xinyikeji/apos.git
```

4. **Install dependencies**:
```bash
npm install
```

5. **Initialize database**:
```bash
npm run db:push
```

6. **Create `.env.local`** (see `.env.example`)

7. **Start development server**:
```bash
npm run dev
```

## How Can I Contribute?

### 🐛 Reporting Bugs

Before creating bug reports, please check the issue list as you might find out that you don't need to create one. When you are creating a bug report, please include as many details as possible:

- **Use a clear and descriptive title**
- **Describe the exact steps to reproduce the problem**
- **Provide specific examples**
- **Describe the behavior you observed and what you expected**
- **Include screenshots if relevant**
- **Include your environment details** (OS, Node version, etc.)

### 💡 Suggesting Enhancements

Enhancement suggestions are tracked as GitHub issues. When creating an enhancement suggestion, please include:

- **Use a clear and descriptive title**
- **Provide a detailed description of the suggested enhancement**
- **Explain why this enhancement would be useful**
- **List some examples of how it would be used**

### 🔧 Your First Code Contribution

Unsure where to begin? You can start by looking through these issues:

- **Good First Issue** - issues that should only require a few lines of code
- **Help Wanted** - issues that are a bit more involved

### 📝 Improving Documentation

Documentation improvements are always welcome! This includes:

- Fixing typos or grammatical errors
- Adding examples or clarifications
- Translating documentation
- Creating tutorials or guides

## Development Process

### Branch Naming Convention

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation changes
- `refactor/description` - Code refactoring
- `test/description` - Adding or updating tests

### Development Workflow

1. **Create a branch**:
```bash
git checkout -b feature/amazing-feature
```

2. **Make your changes** following our style guidelines

3. **Write or update tests** for your changes

4. **Run tests**:
```bash
npm test
npm run type-check
npm run lint
```

5. **Commit your changes** following our commit message guidelines

6. **Push to your fork**:
```bash
git push origin feature/amazing-feature
```

7. **Create a Pull Request** from your fork to our `main` branch

### Keep Your Fork Updated

```bash
git fetch upstream
git checkout main
git merge upstream/main
```

## Style Guidelines

### TypeScript Style Guide

We follow standard TypeScript best practices:

- **Use TypeScript**: No plain JavaScript in `src/`
- **Type everything**: Avoid `any`, use proper types
- **Use interfaces** for object shapes
- **Use enums** for constant values
- **Prefer const** over let when possible
- **Use async/await** over promises chains

**Example**:
```typescript
// ✅ Good
interface UserData {
  id: number;
  name: string;
  email: string;
}

async function fetchUser(id: number): Promise<UserData> {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}

// ❌ Bad
async function fetchUser(id: any) {
  const response = await fetch(`/api/users/${id}`);
  return response.json();
}
```

### React/Next.js Style Guide

- **Use functional components** with hooks
- **Use server components** by default (Next.js 14+)
- **Add 'use client'** only when necessary
- **Extract reusable logic** into custom hooks
- **Use shadcn/ui** components when available
- **Follow component structure**:

```typescript
'use client'; // Only if needed

import { useState } from 'react';
import { Button } from '@/components/ui/button';

interface MyComponentProps {
  title: string;
  onAction: () => void;
}

export function MyComponent({ title, onAction }: MyComponentProps) {
  const [loading, setLoading] = useState(false);
  
  // Handler functions
  const handleClick = async () => {
    setLoading(true);
    await onAction();
    setLoading(false);
  };
  
  // Render
  return (
    <div>
      <h1>{title}</h1>
      <Button onClick={handleClick} disabled={loading}>
        {loading ? 'Loading...' : 'Click Me'}
      </Button>
    </div>
  );
}
```

### File Naming

- **Components**: PascalCase (e.g., `MyComponent.tsx`)
- **Utilities**: camelCase (e.g., `formatDate.ts`)
- **Constants**: UPPER_SNAKE_CASE (e.g., `API_ENDPOINTS.ts`)
- **Types**: PascalCase with `.types.ts` suffix

### Code Organization

```
src/
├── app/              # Next.js pages
├── components/       # React components
│   ├── ui/          # shadcn/ui components
│   └── features/    # Feature-specific components
├── lib/             # Core libraries
├── agents/          # AI Agents
├── types/           # TypeScript types
└── utils/           # Utility functions
```

## Commit Messages

We follow the [Conventional Commits](https://www.conventionalcommits.org/) specification:

### Format

```
<type>(<scope>): <subject>

<body>

<footer>
```

### Types

- **feat**: A new feature
- **fix**: A bug fix
- **docs**: Documentation only changes
- **style**: Changes that don't affect code meaning (formatting, etc.)
- **refactor**: Code change that neither fixes a bug nor adds a feature
- **perf**: Performance improvement
- **test**: Adding or updating tests
- **chore**: Changes to build process or auxiliary tools

### Examples

```bash
# Feature
feat(agents): add context compression to ProtoBuilder

Implements AST-based compression for TypeScript files
with automatic fallback to LLM-based compression.

Closes #123

# Bug fix
fix(api): resolve 404 error in signal collection

The SignalCollector was not using the unified callLLM
method, causing 404 errors when the primary model failed.

Fixes #456

# Documentation
docs(readme): add installation instructions for Windows

Added Windows-specific setup steps and troubleshooting
guide for common issues.
```

### Best Practices

- Use present tense ("add feature" not "added feature")
- Use imperative mood ("move cursor to..." not "moves cursor to...")
- Limit first line to 72 characters
- Reference issues and pull requests after first line
- Provide detailed explanation in body for complex changes

## Pull Request Process

### Before Submitting

1. ✅ **Update documentation** if needed
2. ✅ **Add tests** for new features
3. ✅ **Run all tests** and ensure they pass
4. ✅ **Run linter** and fix any issues
5. ✅ **Update CHANGELOG.md** (if applicable)
6. ✅ **Rebase on latest main** branch

### PR Description Template

```markdown
## Description
Brief description of what this PR does

## Type of Change
- [ ] Bug fix (non-breaking change which fixes an issue)
- [ ] New feature (non-breaking change which adds functionality)
- [ ] Breaking change (fix or feature that would cause existing functionality to not work as expected)
- [ ] Documentation update

## How Has This Been Tested?
Describe the tests you ran

## Checklist
- [ ] My code follows the style guidelines
- [ ] I have performed a self-review
- [ ] I have commented my code where necessary
- [ ] I have updated the documentation
- [ ] My changes generate no new warnings
- [ ] I have added tests that prove my fix/feature works
- [ ] New and existing unit tests pass locally

## Screenshots (if applicable)
Add screenshots to help explain your changes

## Related Issues
Closes #(issue number)
```

### Review Process

1. **At least one approval** required from maintainers
2. **All CI checks must pass**
3. **No merge conflicts** with main branch
4. **Code quality** standards met
5. **Tests coverage** maintained or improved

### After PR is Merged

1. **Delete your branch** (both local and remote)
2. **Update your local main** branch
3. **Close related issues** if not automatically closed

## Testing Guidelines

### Unit Tests

- Write tests for all new features
- Test edge cases and error conditions
- Use descriptive test names
- Follow AAA pattern (Arrange, Act, Assert)

```typescript
describe('ProtoBuilder Agent', () => {
  it('should compress context when size exceeds threshold', async () => {
    // Arrange
    const agent = new ProtoBuilderAgent();
    const largeContext = 'x'.repeat(10000);
    
    // Act
    const result = await agent.compressContext(largeContext);
    
    // Assert
    expect(result.length).toBeLessThan(largeContext.length);
    expect(result).toContain('compressed');
  });
});
```

### Integration Tests

- Test complete workflows
- Test API endpoints
- Test database operations
- Test agent interactions

## Questions?

Feel free to:
- Open an issue with the `question` label
- Start a discussion in GitHub Discussions
- Reach out to maintainers

## Recognition

Contributors will be:
- Listed in CONTRIBUTORS.md
- Acknowledged in release notes
- Invited to become maintainers (for significant contributions)

## License

By contributing, you agree that your contributions will be licensed under the MIT License.

---

Thank you for contributing to APOS! 🎉
