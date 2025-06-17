# Contributing to Context Savvy MCP

_Want to help make AI assistance better for everyone? You're in the right place!_

Thank you for considering contributing to Context Savvy MCP! Whether you're fixing a bug, adding a feature, improving documentation, or just kicking the tires, your help is genuinely appreciated.

## 🤝 The Real Talk

This project started as a personal tool to solve my own frustrations with AI context limits. If you're here, you probably share some of those same frustrations. The good news? You can help make it better for everyone.

**What kind of help we need:**

- 🐛 **Bug hunters**: Find the edge cases I missed
- ✨ **Feature builders**: Add tools that solve real problems
- 📚 **Documentation writers**: Make setup easier for newcomers
- 🧪 **Testers**: Try it with different setups and workloads
- 🎨 **UX improvers**: Make the developer experience smoother
- 🔍 **Code reviewers**: Catch mistakes and suggest better patterns

**No contribution is too small.** Typo fixes, clarifying comments, reporting bugs – it all matters.

## 🚀 Getting Started (The Fast Track)

### Prerequisites

- Node.js 18+ (check with `node --version`)
- npm 8+ (or your favorite package manager)
- Git (obviously)
- A code editor (VS Code is nice, but use what you love)
- **Optional but helpful**: Experience with Claude Desktop and MCP

### Development Setup

**The one-liner approach:**

```bash
git clone https://github.com/yourusername/context-savvy-mcp.git
cd context-savvy-mcp
npm install && npm run build && npm test
```

**The step-by-step approach:**

1. **Fork and Clone**

   ```bash
   # Fork on GitHub first, then:
   git clone https://github.com/yourusername/context-savvy-mcp.git
   cd context-savvy-mcp
   ```

2. **Install Dependencies**

   ```bash
   npm install
   # Or if you prefer:
   # pnpm install
   # yarn install
   ```

3. **Build and Test**

   ```bash
   npm run build    # Compile TypeScript
   npm test         # Run the test suite
   npm run lint     # Check code style
   ```

4. **Start Development**
   ```bash
   npm run dev      # Start with file watching
   ```

**Stuck?** The `npm run health-check` command will tell you if everything's set up correctly.

## 🎯 Project Philosophy

Before diving into code, here's how we think about this project:

**Performance First**: Every feature should make Claude faster or more efficient, not slower.

**Security By Default**: This handles file operations and command execution. We're paranoid about security, and that's a good thing.

**Simple to Use**: The barrier to entry should be as low as possible. If you need to read a manual to use a basic feature, we failed.

**Real-World Focused**: Features should solve actual problems, not theoretical ones.

## 🏗️ Architecture Overview

We use clean architecture principles (maybe a bit overkill, but it keeps things organized):

```
src/
├── core/              # Pure business logic
│   └── interfaces/    # TypeScript contracts
├── application/       # Use cases and orchestration
│   ├── services/      # Business logic services
│   ├── tools/         # MCP tools (the main functionality)
│   └── resources/     # MCP resources and prompts
├── infrastructure/    # External world interactions
│   ├── adapters/      # Database, filesystem, etc.
│   ├── config/        # Configuration handling
│   └── di/           # Dependency injection setup
├── presentation/      # MCP protocol interface
└── utils/            # Shared utilities
```

**The golden rule**: Dependencies flow inward. Core never depends on infrastructure.

## 💻 Development Workflow

### Code Quality

We're pretty strict about code quality, but the tools make it easy:

```bash
# Format code (do this often)
npm run format

# Check for issues
npm run lint
npm run type-check

# Fix what can be auto-fixed
npm run lint:fix
```

### Making Changes

**For small fixes:**

1. Create a branch: `git checkout -b fix/describe-the-fix`
2. Make your changes
3. Test: `npm test`
4. Commit: `git commit -m "fix: describe what you fixed"`
5. Push and create a PR

**For new features:**

1. Open an issue first to discuss the approach
2. Create a branch: `git checkout -b feature/describe-the-feature`
3. Build incrementally with tests
4. Update documentation
5. Create a PR with a good description

### Commit Messages

We use [Conventional Commits](https://conventionalcommits.org/) because they make generating changelogs easier:

```
feat: add new file compression tool
fix: resolve path traversal in file operations
docs: improve setup instructions
refactor: simplify database connection logic
test: add tests for edge cases
chore: update dependencies
```

## 🛠️ Adding New Features

### Creating a New MCP Tool

This is probably the most common type of contribution. Here's the pattern:

```typescript
// src/application/tools/my-awesome-tool.tool.ts
import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';

const myAwesomeToolSchema = z.object({
  input: z.string().describe('What you want to process'),
  options: z
    .object({
      verbose: z.boolean().default(false).describe('Enable detailed output')
    })
    .optional()
});

@injectable()
export class MyAwesomeTool implements IMCPTool {
  name = 'my_awesome_tool';
  description = 'Does something awesome with your input';
  schema = myAwesomeToolSchema;

  async execute(params: z.infer<typeof myAwesomeToolSchema>, context: ToolContext): Promise<ToolResult> {
    const { input, options = {} } = params;

    try {
      // Your tool logic here
      const result = await this.doSomethingAwesome(input, options);

      return {
        content: [
          {
            type: 'text',
            text: `Processed "${input}" successfully: ${result}`
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'MyAwesomeTool failed');
      throw new Error(`Failed to process: ${error.message}`);
    }
  }

  private async doSomethingAwesome(input: string, options: any): Promise<string> {
    // Implementation details
    return `Processed: ${input}`;
  }
}
```

**Then register it:**

```typescript
// In src/infrastructure/di/container-initializer.ts
import { MyAwesomeTool } from '../../application/tools/my-awesome-tool.tool.js';

// Add to the initializeTools method:
toolRegistry.register(new MyAwesomeTool());
```

**And test it:**

```typescript
// tests/unit/tools/my-awesome-tool.test.ts
import { MyAwesomeTool } from '../../../src/application/tools/my-awesome-tool.tool.js';

describe('MyAwesomeTool', () => {
  let tool: MyAwesomeTool;

  beforeEach(() => {
    tool = new MyAwesomeTool();
  });

  it('should process input successfully', async () => {
    const result = await tool.execute({ input: 'test data' }, mockContext);

    expect(result.content[0].text).toContain('Processed "test data" successfully');
  });

  it('should handle errors gracefully', async () => {
    // Test error scenarios
  });
});
```

### Security Considerations

**If your tool touches the filesystem or executes commands, be extra careful:**

1. **Validate all paths** using the security service
2. **Sanitize inputs** thoroughly
3. **Use the command whitelist** for any execution
4. **Log security events** appropriately
5. **Test with malicious inputs**

```typescript
// Example: Safe file operations
const safePath = await this.securityService.validatePath(userPath);
if (!safePath) {
  throw new Error('Path is not in allowed safe zones');
}
```

## 🧪 Testing

We aim for good test coverage, especially for security-critical code:

```bash
# Run all tests
npm test

# Run with coverage
npm run test:coverage

# Run in watch mode (great for development)
npm run test:watch
```

**Test categories:**

- **Unit tests**: Individual components
- **Integration tests**: MCP protocol interactions
- **Security tests**: Validation and sanitization
- **Performance tests**: Critical paths

**Writing good tests:**

```typescript
describe('WhenTestingMyTool', () => {
  // Use descriptive test names
  it('should handle valid input correctly', async () => {
    // Arrange, Act, Assert pattern
  });

  it('should reject invalid paths with clear error', async () => {
    // Test error scenarios
  });

  it('should log security events when suspicious activity detected', async () => {
    // Security test
  });
});
```

## 📚 Documentation

**Code documentation:**

- Use JSDoc for public APIs
- Include examples for complex functions
- Explain _why_, not just _what_
- Document security implications

**User documentation:**

- Update README for user-facing changes
- Add examples to tool descriptions
- Update configuration docs
- Include troubleshooting tips

## 🔄 Pull Request Process

### Before You Submit

**Checklist:**

- [ ] Tests pass (`npm test`)
- [ ] Code is formatted (`npm run format`)
- [ ] No linting errors (`npm run lint`)
- [ ] TypeScript compiles (`npm run type-check`)
- [ ] Documentation updated
- [ ] Commit messages follow convention

### PR Description Template

```markdown
## What this PR does

Brief description of the change and why it's needed.

## How to test

Steps to verify the change works.

## Screenshots/Examples

If relevant, show the change in action.

## Checklist

- [ ] Tests added/updated
- [ ] Documentation updated
- [ ] Breaking changes documented
- [ ] Security considerations addressed
```

### Review Process

1. **Automated checks** run first (CI/CD)
2. **Code review** by maintainers
3. **Testing** in development environment
4. **Merge** when approved

**Be patient** – good reviews take time, and we want to maintain quality.

## 🐛 Reporting Issues

### For Bugs

**Use the issue template and include:**

1. **Clear description** of what went wrong
2. **Steps to reproduce** the issue
3. **Environment details** (OS, Node version, etc.)
4. **Expected vs actual behavior**
5. **Log output** (if available)
6. **Configuration** (sanitized)

### For Security Issues

**🚨 Don't create public issues for security vulnerabilities.**

Email security@[domain] or use GitHub's private vulnerability reporting.

### For Feature Requests

1. **Check existing issues** first
2. **Explain the use case** clearly
3. **Describe the solution** you envision
4. **Consider alternatives** and trade-offs
5. **Be open to discussion**

## 💡 Ideas and Discussions

Have an idea but not sure how to implement it? Start a [discussion](https://github.com/yourusername/context-savvy-mcp/discussions)!

**Good discussion topics:**

- Architecture improvements
- New tool ideas
- Performance optimizations
- Integration patterns
- User experience improvements

## 🎉 Recognition

Contributors are recognized in:

- Release notes for significant changes
- CONTRIBUTORS.md file
- GitHub contributors list
- Special mentions for major contributions

## 📞 Getting Help

**Stuck? Here's where to get help:**

- 💬 **GitHub Discussions**: Best for questions and ideas
- 🐛 **Issues**: For bugs and feature requests
- 📖 **Documentation**: Check README and wiki first
- 💻 **Code**: Look at existing tools for patterns

**Response time**: I try to respond within 24-48 hours, but sometimes life happens. Be patient!

## 🌟 Final Thoughts

This project exists because traditional AI conversations are frustrating – context gets lost, work gets forgotten, and productivity suffers. Your contributions help solve real problems for real developers.

Whether you fix a typo, add a feature, or just provide feedback, you're making AI assistance better for everyone. **Thank you for that.**

Now go build something awesome! 🚀

---

_Questions? Suggestions for improving this doc? Open an issue or discussion!_
