# Claude Desktop Configuration

To use this MCP Context Server with Claude Desktop, you need to add it to your Claude Desktop configuration.

## Configuration Location

### macOS

~/Library/Application Support/Claude/claude_desktop_config.json

### Windows

%APPDATA%\Claude\claude_desktop_config.json

### Linux

~/.config/claude/claude_desktop_config.json

## Configuration Content

Add the following to your `claude_desktop_config.json` file. **Replace the paths with the correct absolute paths for your system.**

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

## Important Notes

1. **Replace paths**:

   - Change `/absolute/path/to/mcp-context-server/dist/index.js` to the actual absolute path where you cloned this repository and built the project (specifically, the `dist/index.js` file).
   - Change `/absolute/path/to/mcp-context-server/config/server.yaml` to the actual absolute path of your server's configuration file (e.g., `server.yaml`). This file tells the MCP server itself how to behave (security settings, database path, etc.).

2. **Build first**: Make sure you've built the project with `npm run build` before adding to Claude Desktop.

3. **Node.js version**: Ensure you have Node.js 18.0.0 or higher installed.

4. **Restart Claude Desktop**: After adding or modifying the configuration, restart Claude Desktop completely.

5. **Server Configuration File**: Ensure the file specified by `MCP_SERVER_CONFIG_PATH` (e.g., `server.yaml`) exists and is correctly formatted. If it's missing, the server might use defaults or fail to start as expected.

## Example Full Configuration

If you have other MCP servers, your configuration might look like this:

{
"mcpServers": {
"context-server": {
"command": "node",
"args": ["/Users/yourname/projects/mcp-context-server/dist/index.js"],
"env": {
"MCP_LOG_LEVEL": "info",
"MCP_SERVER_CONFIG_PATH": "/Users/yourname/projects/mcp-context-server/config/server.yaml"
}
},
"other-server": {
"command": "node",
"args": ["/path/to/other-server/index.js"]
}
}
}

## Verification

After configuration:

1. Restart Claude Desktop
2. Start a new conversation
3. Try using one of the tools like: "Can you list the files in the current directory?"
4. Claude should be able to access the MCP tools provided by this server, respecting the settings from your `server.yaml` (or equivalent file specified by `MCP_SERVER_CONFIG_PATH`).

## Troubleshooting

- Check Claude Desktop logs for connection errors.
- Verify all paths in `claude_desktop_config.json` are absolute and correct.
- Ensure the server builds successfully with `npm run build`.
- Make sure Node.js is in your system PATH.
- Verify that the `MCP_SERVER_CONFIG_PATH` points to a valid `server.yaml` (or `.json`) file and that the server process has read access to it.
- Check the MCP Context Server's own logs (stdout/stderr where it's launched from, or as configured in its `server.yaml`) for errors related to configuration loading.
