# Claude Desktop Configuration

To use this MCP Context Server with Claude Desktop, you need to add it to your Claude Desktop configuration.

## Configuration Location

### macOS

```
~/Library/Application Support/Claude/claude_desktop_config.json
```

### Windows

```
%APPDATA%\Claude\claude_desktop_config.json
```

### Linux

```
~/.config/claude/claude_desktop_config.json
```

## Configuration Content

Add the following to your `claude_desktop_config.json` file:

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

## Important Notes

1. **Replace the path**: Change `/absolute/path/to/mcp-context-server/` to the actual absolute path where you cloned this repository.

2. **Build first**: Make sure you've built the project with `npm run build` before adding to Claude Desktop.

3. **Node.js version**: Ensure you have Node.js 18.0.0 or higher installed.

4. **Restart Claude Desktop**: After adding the configuration, restart Claude Desktop completely.

## Example Full Configuration

If you have other MCP servers, your configuration might look like this:

```json
{
  "mcpServers": {
    "context-server": {
      "command": "node",
      "args": ["/Users/yourname/projects/mcp-context-server/dist/index.js"],
      "env": {
        "MCP_LOG_LEVEL": "info"
      }
    },
    "other-server": {
      "command": "node",
      "args": ["/path/to/other-server/index.js"]
    }
  }
}
```

## Verification

After configuration:

1. Restart Claude Desktop
2. Start a new conversation
3. Try using one of the tools like: "Can you list the files in the current directory?"
4. Claude should be able to access the MCP tools provided by this server

## Troubleshooting

- Check Claude Desktop logs for connection errors
- Verify the path is absolute and correct
- Ensure the server builds successfully with `npm run build`
- Make sure Node.js is in your system PATH
