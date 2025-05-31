# MCP Context Server

A high-performance Model Context Protocol (MCP) server optimized for maximizing productivity in Claude chats through efficient context management and powerful tool capabilities.

## Features

- **File Operations**: Efficient file reading/writing with streaming support for large files
- **Command Execution**: Secure command execution with whitelisting and timeout management
- **Database Operations**: SQLite-based context storage with advanced querying capabilities
- **Smart Path Management**: Intelligent context bundling for efficient information retrieval
- **Security First**: Path validation, command whitelisting, and rate limiting
- **Performance Optimized**: Streaming operations, connection pooling, and efficient caching

## Installation

```bash
npm install
npm run build
```

## Configuration

Create a `config/server.yaml` file:

```yaml
server:
  name: my-mcp-server
  version: 1.0.0

security:
  allowedCommands:
    - ls
    - cat
    - grep
    - find
  safezones:
    - /home/user/projects
    - /tmp

database:
  path: ./data/context.db
  backupInterval: 60

logging:
  level: info
  pretty: true

performance:
  maxConcurrency: 10
  queueSize: 1000
```

## Usage with Claude Desktop

Add to your Claude Desktop configuration:

```json
{
  "mcpServers": {
    "context-server": {
      "command": "node",
      "args": ["/path/to/mcp-context-server/dist/index.js"],
      "env": {
        "MCP_LOG_LEVEL": "info"
      }
    }
  }
}
```

## Available Tools

### File Operations

- `read_file`: Read file contents with automatic truncation
- `write_file`: Write content to files with directory creation
- `list_directory`: List directory contents with metadata

### Command Execution

- `execute_command`: Execute system commands with security validation

### Context Storage

- `store_context`: Store context items for later retrieval
- `get_context`: Retrieve stored context items
- `query_context`: Query context items with filters

### Smart Paths

- `create_smart_path`: Create intelligent context bundles
- `execute_smart_path`: Execute smart paths for efficient retrieval

## Development

```bash
# Run in development mode
npm run dev

# Run tests
npm test

# Check security
npm run security-check
```

## Architecture

The server follows clean architecture principles:

- **Core**: Business logic and entities (dependency-free)
- **Application**: Use cases and orchestration
- **Infrastructure**: External integrations and adapters
- **Presentation**: MCP protocol interface

## Security

- Command whitelisting prevents arbitrary command execution
- Path validation ensures file operations stay within safe zones
- Rate limiting prevents resource exhaustion
- Input validation using Zod schemas

## Performance

- Streaming file operations handle large files efficiently
- SQLite with WAL mode for optimal database performance
- Connection pooling for external resources
- Concurrent request handling with backpressure management

## License

MIT

## Conclusion

This implementation provides a comprehensive, production-ready MCP server that maximizes context efficiency and productivity in Claude chats. The architecture follows clean code principles, implements robust security measures, and optimizes for performance while maintaining flexibility for future enhancements.

Key features that make this server context-efficient:

1. **Smart Path Management**: Bundles related context intelligently
2. **Efficient File Operations**: Streaming and truncation for large files
3. **Fast Database Operations**: Optimized SQLite with proper indexing
4. **Security First**: Comprehensive validation and sandboxing
5. **Performance Optimized**: Minimal overhead, efficient resource usage
6. **Clean Architecture**: Easy to extend and maintain

The server is designed to pack maximum productivity into Claude chats by providing powerful tools while maintaining safety, performance, and reliability.
