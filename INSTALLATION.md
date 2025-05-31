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
git clone <repository-url> # Replace <repository-url> with the actual URL
cd mcp-context-server

# Run the setup script (recommended)
# This installs dependencies, builds the project, and creates default config files.
# On Unix-like systems:
chmod +x scripts/setup.sh
./scripts/setup.sh
# On Windows (or if the above fails, run manually):
# npm install
# npm run build
# node scripts/setup.js # (If setup.js is preferred over shell script)
```

If `scripts/setup.sh` or `scripts/setup.js` are not present or you prefer manual steps:

```bash
# Install dependencies
npm install

# Create data directory (if not created by server on first run)
mkdir -p data

# Copy example configuration files (if they don't exist)
cp -n config/server.example.yaml config/server.yaml
cp -n .env.example .env

# Build the project
npm run build
```

### 2. Configure the Server (`config/server.yaml`)

The primary configuration for the MCP Context Server itself is done in `config/server.yaml` (or a similar file if you choose to name it differently and specify its path later). Edit this file to customize settings:

```yaml
# Example: config/server.yaml
server:
  name: 'mcp-context-server-custom'
  version: '1.0.1'
  workingDirectory: '/path/to/your/projects' # Optional: if set, server operates from here

security:
  allowedCommands:
    - 'ls -la' # You can include common arguments
    - 'cat'
    - 'grep'
    - 'find .' # Example: restrict find to current dir
    - 'git status'
  safezones:
    - '.' # Relative to server's workingDirectory
    - '/path/to/your/main_project_folder'
    - '~/another_project_area' # Tilde expansion is supported
  restrictedZones: # These override safezones
    - '**/.env*' # Block access to any .env files
    - '**/node_modules/**'
  autoExpandSafezones: true # true is convenient, false gives more control
  safeZoneMode: 'recursive' # 'recursive' or 'strict'
  # ... other security settings

database:
  path: './data/context_prod.db' # Path relative to workingDirectory or absolute
  backupInterval: 30 # minutes

logging:
  level: 'debug' # For more verbose logs during setup
  pretty: true
# ... other settings
```

**Note:** Paths in `safezones` and `database.path` can be absolute or relative. Relative paths are resolved based on the server's `workingDirectory` (if set in `server.yaml`) or the directory from which the server is launched.

### 3. Test the Server (Optional but Recommended)

```bash
# Run tests
npm test

# Start in development mode to test (uses config/server.yaml by default)
npm run dev
```

You should see output like:

```
[INFO] Starting MCP Context Server...
[INFO] Configuration loaded successfully from ./config/server.yaml
...
[INFO] MCP Context Server started successfully
```

Press Ctrl+C to stop the test run.

### 4. Configure Claude Desktop (`claude_desktop_config.json`)

This step tells Claude Desktop how to launch *your* MCP Context Server.

#### Find Your Claude Desktop Configuration File

- **macOS**: `~/Library/Application Support/Claude/claude_desktop_config.json`
- **Windows**: `%APPDATA%\Claude\claude_desktop_config.json`
- **Linux**: `~/.config/claude/claude_desktop_config.json`

#### Add Server Configuration to `claude_desktop_config.json`

Create or edit the file with this content. **Crucially, update the paths to be absolute and correct for your system.**

```json
{
  "mcpServers": {
    "context-server": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/mcp-context-server/dist/index.js"],
      "env": {
        "MCP_LOG_LEVEL": "info",
        "MCP_SERVER_CONFIG_PATH": "/ABSOLUTE/PATH/TO/mcp-context-server/config/server.yaml"
      }
    }
    // You can add other MCP servers here if you have them
  }
}
```

**⚠️ Important Path Details**:

- **`args`**: The array's last element must be the **absolute path** to the `dist/index.js` file within your cloned `mcp-context-server` project directory (after you've run `npm run build`).
- **`MCP_SERVER_CONFIG_PATH` (in `env`)**: This must be the **absolute path** to the `server.yaml` (or `server.json`, etc.) file that you configured in Step 2. This tells the MCP server which configuration file *it* should use when it starts.

#### How to Get Your Absolute Paths

In your `mcp-context-server` project directory, run:

```bash
# For the server executable path (args):
pwd # Copy this output, then append /dist/index.js

# For the server config file path (MCP_SERVER_CONFIG_PATH):
pwd # Copy this output, then append /config/server.yaml (or your actual config file name)
```

### 5. Start and Verify

1. **Save `claude_desktop_config.json`**.
2. **Restart Claude Desktop completely** (quit and reopen the application).
3. **Start a new conversation** in Claude Desktop.
4. **Test the connection** by asking Claude to use a tool. For example, if `ls` is in your `allowedCommands` and `.` is a safe zone (or your project dir is):

    ```
    Can you list the files in the current directory?
    ```

    Or, to test reading a specific file (if `cat` is allowed and the file is in a safe zone):

    ```
    Can you read the package.json file from my project?
    ```

If working correctly, Claude will use your MCP Context Server to execute these requests, respecting the security settings defined in your `server.yaml` (as pointed to by `MCP_SERVER_CONFIG_PATH`).

## Available Tools

(Refer to README.md for a list of tools)

## Troubleshooting

(Refer to README.md and `CLAUDE_DESKTOP_CONFIG.md` for troubleshooting)

Key things to check if it's not working:

- **Absolute Paths**: Double-check all paths in `claude_desktop_config.json` are absolute and correct.
- **`MCP_SERVER_CONFIG_PATH`**: Ensure this environment variable in `claude_desktop_config.json` correctly points to your *actual* `server.yaml` (or equivalent) and that the MCP server process has permissions to read it.
- **Server Logs**: Check the MCP Context Server's own logs. When Claude Desktop starts it, these logs might go to Claude Desktop's internal logs or to a place configured by your `server.yaml`'s logging settings. If running `npm run dev`, logs are in your terminal.
- **Safe Zones & Allowed Commands**: Ensure the operations you're trying are permitted by your `server.yaml` configuration. Use the `security_diagnostics` tool if unsure.

## Development

(Refer to README.md)

## Security Notes

(Refer to README.md)
The `MCP_SERVER_CONFIG_PATH` environment variable now gives you explicit control over which server configuration file is loaded. Manage this file securely.
