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
- **⚙️ Flexible Configuration**: Server behavior configurable via `server.yaml`, path specifiable at launch.

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
npm run setup # This creates default config/server.yaml and .env if they don't exist

# Build the project
npm run build
```

### Server Configuration (`config/server.yaml`)

The server's behavior is primarily controlled by a `server.yaml` file, typically located in the `config/` directory. Customize it for your needs:

```yaml
# Example config/server.yaml
security:
  allowedCommands:
    - 'ls'
    - 'cat'
    - 'grep'
  safezones:
    - '.' # Relative to where the server is run, or its configured workingDirectory
    - '/path/to/your/projects'
  # ... other settings
database:
  path: './data/context.db' # Relative paths are resolved from server's working directory
# ... other settings
```

### Claude Desktop Integration

Add this server to your `claude_desktop_config.json`. This tells Claude Desktop how to launch your MCP server.

**`claude_desktop_config.json` example:**

```json
{
  "mcpServers": {
    "context-server": {
      "command": "node",
      "args": ["/absolute/path/to/mcp-context-server/dist/index.js"],
      "env": {
        "MCP_LOG_LEVEL": "info",
        "MCP_SERVER_CONFIG_PATH": "/absolute/path/to/mcp-context-server/config/server.yaml"
      }
    }
  }
}
```

**Key paths to update:**

- `args`: The absolute path to the built `dist/index.js` of _this_ MCP server project.
- `MCP_SERVER_CONFIG_PATH` (in `env`): The absolute path to the `server.yaml` (or equivalent JSON/YML config file) that _this_ MCP server should use.

**Configuration file locations for `claude_desktop_config.json`:**

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

Ensure you restart Claude Desktop after making changes to `claude_desktop_config.json`.

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
- `security_diagnostics` - Test and diagnose security configurations.
- `database_health` - Monitor database, manage backups.

### Workspace Management

- `create_workspace`, `list_workspaces`, `switch_workspace`, `sync_workspace`, etc.

## 📚 Usage Examples

### Store and Retrieve Context

```
Store some project information:
- Key: "my_project"
- Value: {"name": "Web App", "version": "1.0.0", "tech": ["React", "Node.js"]}

Then retrieve it later:
Can you get the context for "my_project"?
```

### Secure Command Execution

(Ensure commands are in `allowedCommands` in your `server.yaml`)

```
Run safe commands within configured safe zones:
- List files: "ls -la"
- Check git status: "git status"
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

# Health check (validates basic setup)
npm run health-check

# Generate Claude Desktop config snippet
npm run claude-config
```

## 🔧 Configuration UI

Access the configuration dashboard at `http://localhost:3001` when running `npm run config` (or if you start it manually). This UI helps manage `claude_desktop_config.json` integration and parts of `server.yaml`.

## 🏛️ Architecture

The server follows clean architecture principles:

```
src/
├── core/           # Business logic and interfaces
├── application/    # Use cases and services
├── infrastructure/ # External integrations
└── presentation/   # MCP protocol interface
```

## 🔒 Security

- **Command Whitelisting**: Only approved commands (from `server.yaml`) can be executed.
- **Path Validation**: File operations restricted to `safezones` (from `server.yaml`), respecting `restrictedZones` and `blockedPathPatterns`.
- **Input Sanitization**: All inputs validated and sanitized.
- **User Consent**: For potentially risky operations, a UI prompt can appear.

## 🤝 Contributing

Contributions are welcome! Please read our [Contributing Guide](CONTRIBUTING.md).

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file.

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Anthropic](https://www.anthropic.com/)

## 📞 Support

- 📖 [Documentation](./INSTALLATION.md), [Claude Desktop Config](./CLAUDE_DESKTOP_CONFIG.md)
- 🐛 [Issue Tracker](https://github.com/yourusername/mcp-context-server/issues)
- 💬 [Discussions](https://github.com/yourusername/mcp-context-server/discussions)

---

**Made with ❤️ for the Claude Desktop community**
