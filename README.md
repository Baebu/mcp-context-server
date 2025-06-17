# Context Savvy MCP

> **Hey there!** 👋 This is a bunch of code for an MCP server tThe `quick-setup` script will:

- Check your Node.js version
- Create necessary directories
- Copy example configuration
- Build the project
- Run tests
- Show you exactly what to add to your Claude configse pretty often. It may be a bunch of junk, or it may have promise - honestly, for the most part, I know it works somewhat at least. I'd love some help and possibly some insight on where to go from here!

A high-performance Model Context Protocol (MCP) server that tries to maximize productivity in Claude Desktop through intelligent context management, secure command execution, and efficient file operations. Built with way too much coffee and stubborn determination.

[![Node.js Version](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org/)
[![TypeScript](https://img.shields.io/badge/typescript-5.3+-blue.svg)](https://www.typescriptlang.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![PRs Welcome](https://img.shields.io/badge/PRs-welcome-brightgreen.svg)](http://makeapullrequest.com)

## ✨ Features

- **🔒 Security First**: Command whitelisting, path validation, and comprehensive security measures
- **📁 Smart File Operations**: Efficient file reading/writing with automatic truncation for large files
- **💾 Context Management**: SQLite-based storage with advanced querying and smart path bundling
- **⚡ High Performance**: Streaming operations, connection pooling, and efficient resource management
- **🛠️ Command Execution**: Secure system command execution with timeout and validation
- **📊 Monitoring**: Built-in metrics and performance monitoring
- **🎯 Clean Architecture**: Modular design following dependency injection principles
- **⚙️ Flexible Configuration**: Server behavior configurable via `server.yaml`, path specifiable at launch
- **🤖 Task Management**: Enhanced task creation, tracking, and management with semantic search
- **🔄 Autonomous Behaviors**: Background monitoring, auto-compression, and maintenance

## 🤔 Current Status & Help Wanted

**What works well:**

- Basic MCP server functionality with Claude Desktop
- File operations and command execution
- Context storage and retrieval
- Task management system
- Most of the tools I use daily

**What might be janky:**

- The autonomous monitoring system (new feature, needs testing)
- Some of the more complex task workflows
- Error handling in edge cases
- Performance with very large projects

**Where I could use help:**

- Code review and optimization suggestions
- Testing with different environments and use cases
- Documentation improvements
- Security audit of the command execution
- Ideas for new features or better UX
- General "is this actually useful to anyone else?" feedback

**What I'm wondering about:**

- Should this be split into multiple smaller MCP servers?
- Is the autonomous behavior stuff too complicated/unnecessary?
- Are there better patterns for the clean architecture setup?
- How can we make setup easier for new users?

If any of this resonates with you or you have thoughts, I'd love to hear them! Open an issue, start a discussion, or submit a PR.

## 🚀 Quick Start

### Prerequisites

- Node.js 18.0.0 or higher
- npm 8.0.0 or higher
- Claude Desktop (latest version)

### Installation

```bash
# Clone the repository
git clone https://github.com/yourusername/context-savvy-mcp.git
cd context-savvy-mcp

# Install dependencies
npm install

# Quick setup (recommended for first-time users)
npm run quick-setup

# OR manual setup
npm run setup # This creates default config/server.yaml and .env if they don't exist
npm run build
```

The `quick-setup` script will:

- Check your Node.js version
- Create necessary directories
- Copy example configuration
- Build the project
- Run tests
- Show you exactly what to add to your Claude config

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
      "args": ["/absolute/path/to/context-savvy-mcp/dist/index.js"],
      "env": {
        "MCP_LOG_LEVEL": "info",
        "MCP_SERVER_CONFIG_PATH": "/absolute/path/to/context-savvy-mcp/config/server.yaml"
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
- `content_edit_file` - Find and replace content in a file using text or regex patterns
- `search_files` - Search for text or patterns across multiple files in a directory tree
- `find_files` - Find files by name or pattern in a directory tree

### Command Execution

- `execute_command` - Run system commands with security validation

### Context Management

- `store_context` - Store information with automatic semantic embedding and tag extraction
- `get_context` - Retrieve stored context items by exact key

### Smart Paths

- `create_smart_path` - Create reusable context bundles
- `execute_smart_path` - Execute smart paths for efficient retrieval
- `list_smart_paths` - List all available smart paths

### System Health & Monitoring

- `get_system_health` - Get comprehensive system health metrics and diagnostics
- `get_project_overview` - Get comprehensive overview and analysis of a project directory
- `security_diagnostics` - Test and diagnose security configurations (includes enhanced features)
- `manage_processes` - Manage system processes with limits, monitoring, and cleanup

### File Management & Backup

- `parse_file` - Parse JSON, YAML, and CSV files
- `list_backups` - List recent file backups
- `backup_stats` - Get statistics about file backups
- `restore_backup` - Restore a file from a specific backup
- `view_backup` - View the contents of a backup file
- `cleanup_backups` - Clean up old backups according to retention policy

### Workspace Management

- `create_workspace`, `list_workspaces`, `switch_workspace`, `sync_workspace`, etc.

### Semantic Search & Context

- `semantic_search_context` - Search context using natural language queries or traditional filters
- `find_related_context` - Find context items semantically related to a given key
- `create_context_relationship` - Create a semantic relationship between two context items
- `update_missing_embeddings` - Generate embeddings for context items that don't have them

## 🚀 Getting Started with a Project

The MCP Context Server is designed to help you work efficiently with projects. Here's the recommended workflow:

### 1. Create a Workspace

```
First, create a workspace for your project:
- Use `create_workspace` with your project directory
- This will automatically track files and manage context
```

### 2. Get Project Overview

```
Get a comprehensive overview of your project:
- Use `get_project_overview` to analyze structure, technologies, and metrics
- This provides insights about file types, dependencies, and recommendations
```

### 3. Store Project Context

```
Store important project information:
- Use `store_context` to save key insights, decisions, and documentation
- Context is automatically enhanced with semantic embeddings for better searchability
```

### 4. Monitor System Health

```
Keep track of system performance:
- Use `get_system_health` to monitor server, database, workspace, and semantic search health
- Get actionable recommendations for optimization
```

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

### Content-based File Editing

```
Use the content_edit_file tool to replace a function name:

- Path: "src/utils/helper.ts"
- Find: "oldFunctionName"
- Replace: "newFunctionName"
- All Occurrences: true
- Preview: true (to see changes before applying)
```

### Project Analysis

```
Get comprehensive project insights:

- Use `get_project_overview` to analyze your project structure
- Includes file statistics, technology detection, and actionable recommendations
- Automatically detects project type and provides relevant suggestions
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

**Want to help out?** Awesome! Here's how to get started:

### Quick Start for Contributors

```bash
# Fork the repo on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/context-savvy-mcp.git
cd context-savvy-mcp

# Install dependencies
npm install

# Run tests to make sure everything works
npm test

# Build and type-check
npm run build
npm run type-check

# Start development mode
npm run dev
```

### What to work on

Check out the [issues](https://github.com/yourusername/context-savvy-mcp/issues) or look at the "Help Wanted" section above. Some good starting points:

- 🐛 Fix bugs or edge cases
- 📝 Improve documentation
- ✨ Add new MCP tools
- 🔍 Test with different setups
- 💡 Suggest architectural improvements

### Development Notes

- The code uses clean architecture patterns (might be overkill, but it's what we have)
- TypeScript is strictly enforced
- Tests are with Jest
- Please add tests for new features
- ESLint and Prettier are configured (mostly)

For more detailed contribution guidelines, see [CONTRIBUTING.md](CONTRIBUTING.md).

## 📄 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file.

## 🙏 Acknowledgments

- [Model Context Protocol](https://modelcontextprotocol.io/)
- [Anthropic](https://www.anthropic.com/)

## 📞 Support

- 📖 [Documentation](./INSTALLATION.md), [Claude Desktop Config](./CLAUDE_DESKTOP_CONFIG.md)
- 🐛 [Issue Tracker](https://github.com/yourusername/context-savvy-mcp/issues)
- 💬 [Discussions](https://github.com/yourusername/context-savvy-mcp/discussions)

---

**Made with ❤️ for the Claude Desktop community**
