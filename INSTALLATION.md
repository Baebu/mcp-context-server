# MCP Context Server - Complete Installation Guide

This guide will walk you through setting up the MCP Context Server for use with Claude Desktop.

## Prerequisites

- **Node.js**: Version 18.0.0 or higher
- **npm**: Version 8.0.0 or higher
- **Claude Desktop**: Latest version installed

## Installation Steps

### 1. Clone and Setup

```bash
# Clone the repository
git clone <repository-url>
cd mcp-context-server

# Run the setup script (recommended)
chmod +x setup.sh
./setup.sh
```

Or manually:

```bash
# Install dependencies
npm install

# Create data directory
mkdir -p data

# Copy configuration files
cp config/server.example.yaml config/server.yaml
cp .env.example .env

# Build the project
npm run build
```

### 2. Configure the Server

Edit `config/server.yaml` to customize settings:

```yaml
security:
  allowedCommands:
    - 'ls'
    - 'cat'
    - 'grep'
    - 'find'
    - 'git'
    # Add more commands as needed
  safezones:
    - '.'
    - '/path/to/your/projects'
    # Add more safe directories
```

### 3. Test the Server

```bash
# Run tests
npm test

# Start in development mode to test
npm run dev
```

You should see output like:

```
[INFO] Starting MCP Context Server...
[INFO] Container initialization complete
[INFO] MCP Context Server started successfully
```

Press Ctrl+C to stop the test run.

### 4. Configure Claude Desktop

#### Find Your Configuration File

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

#### Add Server Configuration

Create or edit the file with this content:

```json
{
  "mcpServers": {
    "context-server": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcp-context-server/dist/index.js"],
      "env": {
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

**⚠️ Important**:

- Replace `/ABSOLUTE/PATH/TO/mcp-context-server/` with your actual project path
- Use the full absolute path, not relative paths like `~/` or `./`

#### Get Your Absolute Path

```bash
# Run this in your project directory
pwd
# Copy the output and add /dist/index.js to the end
```

### 5. Start and Verify

1. **Restart Claude Desktop completely** (quit and reopen)
2. **Start a new conversation**
3. **Test the connection** by asking Claude to use a tool:

```
Can you list the files in the current directory?
```

or

```
Can you read the package.json file?
```

If working correctly, Claude will be able to execute these requests using the MCP server.

## Available Tools

Once configured, Claude will have access to these tools:

### File Operations

- `read_file` - Read file contents with truncation for large files
- `write_file` - Write content to files
- `list_directory` - List directory contents with metadata

### Command Execution

- `execute_command` - Run system commands (within security constraints)

### Context Management

- `store_context` - Store information for later retrieval
- `get_context` - Retrieve stored context
- `query_context` - Search stored context with filters

### Smart Paths

- `create_smart_path` - Create reusable context bundles
- `execute_smart_path` - Execute smart path for efficient retrieval

### File Processing

- `parse_file` - Parse JSON, YAML, and CSV files

### System Information

- `get_metrics` - Get server performance metrics

## Troubleshooting

### Server Won't Start

```bash
# Check Node.js version
node --version

# Reinstall dependencies
rm -rf node_modules package-lock.json
npm install

# Rebuild
npm run build
```

### Claude Desktop Not Connecting

1. Verify the absolute path in your config
2. Check that `dist/index.js` exists and is built
3. Restart Claude Desktop completely
4. Check Claude Desktop logs (if available)

### Permission Errors

1. Verify your safezones in `config/server.yaml`
2. Check file permissions on your project directory
3. Ensure the data directory is writable

### Commands Not Allowed

1. Add required commands to `allowedCommands` in config
2. Or set `allowedCommands: 'all'` for development (not recommended for production)

## Development

```bash
# Development mode with file watching
npm run dev

# Run tests
npm test

# Check code formatting
npm run format:check

# Fix formatting
npm run format
```

## Security Notes

- The server includes security validation for all operations
- Commands are whitelisted by default
- File operations are restricted to configured safe zones
- All inputs are sanitized and validated

Review `config/server.yaml` security settings before use in production environments.

## Support

If you encounter issues:

1. Check the troubleshooting section above
2. Verify all prerequisites are met
3. Ensure all configuration files are properly set up
4. Check the server logs for error messages
