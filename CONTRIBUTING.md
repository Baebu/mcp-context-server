# Contributing to MCP Context Server

Thank you for your interest in contributing to MCP Context Server! This document provides guidelines and information for contributors.

## 🚀 Getting Started

### Prerequisites

- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Git
- A code editor (VS Code recommended)

### Development Setup

1. **Fork and Clone**

   ```bash
   git clone https://github.com/yourusername/mcp-context-server.git
   cd mcp-context-server
   ```

2. **Install Dependencies**

   ```bash
   npm install
   ```

3. **Setup Development Environment**

   ```bash
   npm run setup
   ```

4. **Build and Test**

   ```bash
   npm run build
   npm test
   ```

5. **Start Development Server**

   ```bash
   npm run dev
   ```

## 📋 Development Guidelines

### Code Style

We use Prettier and ESLint for consistent code formatting:

```bash
# Check formatting
npm run format:check

# Fix formatting
npm run format

# Lint code
npm run lint

# Fix linting issues
npm run lint:fix
```

### Project Structure

```
src/
├── core/              # Domain logic and interfaces
│   └── interfaces/    # TypeScript interfaces
├── application/       # Use cases and services
│   ├── services/      # Application services
│   ├── tools/         # MCP tools implementation
│   ├── resources/     # MCP resources
│   └── prompts/       # MCP prompts
├── infrastructure/    # External concerns
│   ├── adapters/      # External service adapters
│   ├── config/        # Configuration handling
│   └── di/           # Dependency injection setup
├── presentation/      # MCP server interface
└── utils/            # Shared utilities
```

### Coding Standards

1. **TypeScript**: Use strict TypeScript with proper typing
2. **Clean Architecture**: Follow the established layered architecture
3. **Dependency Injection**: Use Inversify for dependency management
4. **Error Handling**: Comprehensive error handling and logging
5. **Security**: Security-first approach for all operations
6. **Testing**: Write tests for new functionality

### Commit Convention

We follow [Conventional Commits](https://conventionalcommits.org/):

```
<type>[optional scope]: <description>

[optional body]

[optional footer(s)]
```

**Types:**

- `feat`: New feature
- `fix`: Bug fix
- `docs`: Documentation changes
- `style`: Code style changes
- `refactor`: Code refactoring
- `test`: Test changes
- `chore`: Build/tooling changes

**Examples:**

```
feat(tools): add file compression tool
fix(security): resolve path traversal vulnerability
docs: update installation instructions
```

## 🛠️ Adding New Features

### Adding a New MCP Tool

1. **Create the Tool**

   ```typescript
   // src/application/tools/my-new-tool.tool.ts
   import { injectable } from 'inversify';
   import { z } from 'zod';
   import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';

   const myToolSchema = z.object({
     param1: z.string().describe('Description of param1'),
     param2: z.number().optional().describe('Optional param2')
   });

   @injectable()
   export class MyNewTool implements IMCPTool {
     name = 'my_new_tool';
     description = 'Description of what this tool does';
     schema = myToolSchema;

     async execute(params: z.infer<typeof myToolSchema>, context: ToolContext): Promise<ToolResult> {
       try {
         // Implementation here
         return {
           content: [
             {
               type: 'text',
               text: 'Tool executed successfully'
             }
           ]
         };
       } catch (error) {
         context.logger.error({ error, params }, 'Tool execution failed');
         throw error;
       }
     }
   }
   ```

2. **Register the Tool**

   ```typescript
   // In src/infrastructure/di/container-initializer.ts
   import { MyNewTool } from '../../application/tools/my-new-tool.tool.js';

   // Add to initializeTools method
   toolRegistry.register(new MyNewTool());
   ```

3. **Add Tests**

   ```typescript
   // tests/unit/tools/my-new-tool.test.ts
   import { MyNewTool } from '../../../src/application/tools/my-new-tool.tool.js';
   // ... test implementation
   ```

### Adding Configuration Options

1. Update the schema in `src/infrastructure/config/config-loader.ts`
2. Update the TypeScript interface in `src/infrastructure/config/types.ts`
3. Update documentation and examples

## 🧪 Testing

### Running Tests

```bash
# Run all tests
npm test

# Run tests in watch mode
npm run test:watch

# Run tests with coverage
npm run test:coverage
```

### Writing Tests

- Unit tests for individual components
- Integration tests for MCP protocol interactions
- Security tests for validation logic
- Performance tests for critical paths

### Test Structure

```typescript
describe('ToolName', () => {
  let tool: ToolName;
  let mockDependency: jest.Mocked<DependencyType>;

  beforeEach(() => {
    // Setup
  });

  it('should handle normal case', async () => {
    // Test implementation
  });

  it('should handle error case', async () => {
    // Error test implementation
  });
});
```

## 🔒 Security Considerations

When contributing, especially to security-sensitive areas:

1. **Validate All Inputs**: Use Zod schemas for validation
2. **Path Security**: Always validate file paths
3. **Command Security**: Whitelist allowed commands
4. **Sanitize Data**: Clean user inputs
5. **Error Handling**: Don't leak sensitive information in errors
6. **Logging**: Log security events appropriately

## 📚 Documentation

### Code Documentation

- Use JSDoc comments for public APIs
- Include examples in complex functions
- Document security considerations
- Explain architectural decisions

### User Documentation

- Update README.md for user-facing changes
- Add examples for new tools
- Update configuration documentation
- Include troubleshooting guides

## 🔄 Pull Request Process

1. **Create Feature Branch**

   ```bash
   git checkout -b feature/my-new-feature
   ```

2. **Make Changes**

   - Follow coding standards
   - Add tests
   - Update documentation

3. **Test Changes**

   ```bash
   npm run build
   npm test
   npm run lint
   npm run type-check
   ```

4. **Commit Changes**

   ```bash
   git add .
   git commit -m "feat: add my new feature"
   ```

5. **Push and Create PR**

   ```bash
   git push origin feature/my-new-feature
   ```

### PR Requirements

- [ ] All tests pass
- [ ] Code is properly formatted
- [ ] Documentation is updated
- [ ] Security considerations addressed
- [ ] Breaking changes documented
- [ ] Commit messages follow convention

## 🐛 Reporting Bugs

### Security Issues

**Do not open public issues for security vulnerabilities.**

Email security issues to: [security@yourproject.com]

### Regular Issues

Use our issue template with:

1. **Description**: Clear description of the issue
2. **Reproduction**: Steps to reproduce
3. **Environment**: OS, Node.js version, etc.
4. **Expected vs Actual**: What should happen vs what happens
5. **Logs**: Relevant log outputs

## 💡 Feature Requests

1. Check existing issues and discussions
2. Provide clear use case and rationale
3. Consider implementation complexity
4. Be open to discussion and alternatives

## 📞 Getting Help

- 💬 [GitHub Discussions](https://github.com/yourusername/mcp-context-server/discussions)
- 🐛 [Issue Tracker](https://github.com/yourusername/mcp-context-server/issues)
- 📖 [Documentation](https://github.com/yourusername/mcp-context-server/wiki)

## 🙏 Recognition

Contributors will be recognized in:

- Release notes
- Contributors section
- Hall of fame for significant contributions

Thank you for contributing to MCP Context Server! 🎉
