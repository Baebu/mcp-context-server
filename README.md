# MCP Context Server

A high-performance Model Context Protocol (MCP) server that maximizes productivity in Claude Desktop through intelligent context management, secure command execution, and efficient file operations.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)

## ✨ Features

- **🔒 Security First**: Command whitelisting, path validation, and comprehensive security measures
- **📁 Smart File Operations**: Efficient file reading/writing with automatic truncation for large files
- **💾 Context Management**: SQLite-based storage with advanced querying and smart path bundling
- **⚡ High Performance**: Streaming operations, connection pooling, and efficient resource management
- **🛠️ Command Execution**: Secure system command execution with timeout and validation
- **📊 Monitoring**: Built-in metrics and performance monitoring
- **🎯 Clean Architecture**: Modular design following dependency injection principles

## 🚀 Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Claude Desktop (latest version)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/mcp-context-server.git
cd mcp-context-server

# Install dependencies and setup
npm install
npm run setup

# Build the project
npm run build
```

### Configuration

The server will create a default configuration at `config/server.yaml`. Customize it for your needs:

```yaml
security:
  allowedCommands:
    - 'ls'
    - 'cat'
    - 'grep'
    - 'find'
    - 'git'
  safezones:
    - '.'
    - '/path/to/your/projects'
  maxExecutionTime: 30000
  maxFileSize: 10485760

database:
  path: './data/context.db'
  backupInterval: 60

logging:
  level: 'info'
  pretty: true
```

### Claude Desktop Integration

Add this server to your `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "context-server": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-context-server/dist/index.js"],
      "env": {
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

**Configuration file locations:**

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

## 🛠️ Available Tools

### File Operations

- `read_file` - Read file contents with automatic truncation
- `write_file` - Write content to files with directory creation
- `list_directory` - List directory contents with metadata

### Command Execution

- `execute_command` - Run system commands with security validation

### Context Management

- `store_context` - Store information for later retrieval
- `get_context` - Retrieve stored context items
- `query_context` - Search contexts with flexible filters

### Smart Paths

- `create_smart_path` - Create reusable context bundles
- `execute_smart_path` - Execute smart paths for efficient retrieval
- `list_smart_paths` - List all available smart paths

### Utilities

- `parse_file` - Parse JSON, YAML, and CSV files
- `get_metrics` - Server performance metrics

## 📚 Usage Examples

### Store and Retrieve Context

```
Store some project information:
- Key: "my_project"
- Value: {"name": "Web App", "version": "1.0.0", "tech": ["React", "Node.js"]}

Then retrieve it later:
Can you get the context for "my_project"?
```

### Smart Path Bundles

```
Create a smart path that bundles related project contexts:
- Name: "project_bundle"
- Items: ["my_project", "dependencies", "config"]

Execute the bundle to get all related information at once.
```

### Secure Command Execution

```
Run safe commands within configured directories:
- List files: "ls -la"
- Check git status: "git status"
- Search content: "grep -r 'TODO' src/"
```

## 🏗️ Development

```bash
# Development mode with file watching
npm run dev

# Run tests
npm test

# Type checking
npm run type-check

# Linting and formatting
npm run lint
npm run format

# Health check
npm run health-check
```

## 🔧 Configuration UI

Access the configuration dashboard at `http://localhost:3001` when running in development mode for an interactive way to manage settings, test commands, and view metrics.

## 🏛️ Architecture

The server follows clean architecture principles:

```
src/
├── core/           # Business logic and interfaces
├── application/    # Use cases and services
├── infrastructure/ # External integrations
└── presentation/   # MCP protocol interface
```

Key architectural decisions:

- **Dependency Injection**: Using Inversify for loose coupling
- **Security by Design**: Multiple validation layers
- **Performance Optimized**: Streaming and efficient resource usage
- **Extensible**: Easy to add new tools and capabilities

## 🔒 Security

- **Command Whitelisting**: Only approved commands can be executed
- **Path Validation**: File operations restricted to safe zones
- **Input Sanitization**: All inputs validated and sanitized
- **Rate Limiting**: Protection against resource exhaustion
- **Audit Logging**: Comprehensive security event logging

## 📈 Performance

- **Streaming Operations**: Handle large files efficiently
- **SQLite Optimization**: WAL mode and proper indexing
- **Memory Management**: Careful resource allocation
- **Concurrent Processing**: Optimized for multiple operations

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md) for details on our code of conduct and development process.

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/) for the excellent specification
- [Anthropic](https://www.anthropic.com/) for Claude Desktop integration
- The TypeScript and Node.js communities for excellent tooling

## 📞 Support

- 📖 [Documentation](https://github.com/yourusername/mcp-context-server/wiki)
- 🐛 [Issue Tracker](https://github.com/yourusername/mcp-context-server/issues)
- 💬 [Discussions](https://github.com/yourusername/mcp-context-server/discussions)

---

**Made with ❤️ for the Claude Desktop community**
