# Getting Context Savvy MCP Up and Running

_From zero to superhuman AI assistant in about 10 minutes_

Ready to give Claude the memory and tools it deserves? This guide will get you set up without the usual installation headaches. Promise.

## 🔧 What You'll Need

Before we dive in, make sure you have:

- **Node.js 18+** (check with `node --version`)
- **npm 8+** (comes with Node)
- **Claude Desktop** (the latest version)
- **10 minutes** and a coffee ☕

**Don't have Node.js?** Grab it from [nodejs.org](https://nodejs.org) – get the LTS version.

## 🚀 The Fast Track (Recommended)

**Option 1: One-command setup**

```bash
# Clone, install, build, and configure in one go
git clone https://github.com/Baebu/context-savvy-mcp.git
cd context-savvy-mcp
npm run quick-setup
```

That's it! The `quick-setup` script handles everything and even tells you exactly what to add to Claude Desktop. Skip to step 4 if this worked.

**Option 2: Step by step** (if you like more control)

## 📝 Step-by-Step Setup

### Step 1: Get the Code

```bash
# Clone the repository
git clone https://github.com/Baebu/context-savvy-mcp.git
cd context-savvy-mcp

# Install dependencies
npm install

# Build the project
npm run build
```

### Step 2: Configure Your Server

The server needs to know what it's allowed to do and where it can do it. Edit `config/server.yaml`:

```yaml
# This is your security boundary - edit carefully!
security:
  allowedCommands:
    - 'ls' # List files
    - 'cat' # Read files
    - 'grep' # Search in files
    - 'git status' # Check git status
    - 'npm test' # Run tests
    # Add more commands you trust

  safezones:
    - '.' # Current directory
    - '/path/to/your/projects' # Your main project folder
    - '~/Documents/development' # Another project area
    # Add paths where file operations are allowed

# Database location (relative to project root)
database:
  path: './data/context.db'

# Logging (start with debug, change to info later)
logging:
  level: 'debug'
  pretty: true
```

**🔒 Security Notes:**

- Only add commands you trust completely
- Safe zones should only include directories you're okay with the server accessing
- When in doubt, start restrictive and add more permissions later

### Step 3: Test Everything Works

```bash
# Run tests to make sure everything's working
npm test

# Start in development mode
npm run dev
```

You should see something like:

```
[INFO] Starting Context Savvy MCP Server...
[INFO] Configuration loaded successfully
[INFO] Database initialized
[INFO] MCP Context Server ready! 🚀
```

If you see errors, check:

- Node.js version is 18+
- All dependencies installed (`npm install`)
- Configuration file is valid YAML

Hit `Ctrl+C` to stop the test.

### Step 4: Connect to Claude Desktop

Now for the magic – tell Claude Desktop about your new server.

#### Find Your Claude Config File

**macOS:** `~/Library/Application Support/Claude/claude_desktop_config.json`
**Windows:** `%APPDATA%\Claude\claude_desktop_config.json`  
**Linux:** `~/.config/claude/claude_desktop_config.json`

#### Add Your Server

Edit (or create) the file with this content:

```json
{
  "mcpServers": {
    "context-server": {
      "command": "node",
      "args": ["/ABSOLUTE/PATH/TO/context-savvy-mcp/dist/index.js"],
      "env": {
        "MCP_LOG_LEVEL": "info",
        "MCP_SERVER_CONFIG_PATH": "/ABSOLUTE/PATH/TO/context-savvy-mcp/config/server.yaml"
      }
    }
  }
}
```

**🚨 Critical:** You MUST use absolute paths. Here's how to get them:

```bash
# In your context-savvy-mcp directory:
pwd
# Copy that path, then:
# - For "args": add /dist/index.js to the end
# - For "MCP_SERVER_CONFIG_PATH": add /config/server.yaml to the end
```

**Example for macOS/Linux:**

```json
{
  "mcpServers": {
    "context-server": {
      "command": "node",
      "args": ["/Users/yourname/projects/context-savvy-mcp/dist/index.js"],
      "env": {
        "MCP_LOG_LEVEL": "info",
        "MCP_SERVER_CONFIG_PATH": "/Users/yourname/projects/context-savvy-mcp/config/server.yaml"
      }
    }
  }
}
```

#### Pro Tip: Use the Helper Script

```bash
# This generates the exact config for you
npm run claude-config
```

Copy the output directly into your `claude_desktop_config.json`.

### Step 5: The Moment of Truth

1. **Save** your Claude Desktop config file
2. **Quit Claude Desktop completely** (not just close the window)
3. **Restart Claude Desktop**
4. **Start a new conversation**

**Test it works:**

```
Hey Claude, can you list the files in my current directory?
```

If Claude responds with actual file listings, congratulations! 🎉 Your AI assistant now has superpowers.

**Try something more advanced:**

```
Can you help me understand the structure of this project by reading the package.json and README files?
```

## 🛠️ What You Just Unlocked

Your Claude Desktop can now:

**📁 File Operations**

- Read and write files
- Search across your entire codebase
- Navigate directory structures
- Parse JSON, YAML, CSV files

**⚙️ Command Execution**

- Run safe, whitelisted commands
- Execute tests and builds
- Check git status
- Anything else you explicitly allow

**🧠 Persistent Memory**

- Remember everything across conversations
- Store project context and decisions
- Build up knowledge about your codebase
- Search through conversation history

**🎯 Smart Features**

- Task management and tracking
- Automatic workspace organization
- Context-aware suggestions
- Pattern recognition and learning

## 🔧 Customization

Want to tailor it to your workflow? Here are some common configurations:

**For Web Developers:**

```yaml
security:
  allowedCommands:
    - 'npm run build'
    - 'npm test'
    - 'yarn dev'
    - 'git status'
    - 'git log --oneline -n 10'
    - 'docker ps'
  safezones:
    - '~/projects'
    - '~/work'
```

**For Python Developers:**

```yaml
security:
  allowedCommands:
    - 'python -m pytest'
    - 'pip list'
    - 'python --version'
    - 'black --check .'
    - 'mypy .'
  safezones:
    - '~/development'
    - '~/notebooks'
```

**For System Administrators:**

```yaml
security:
  allowedCommands:
    - 'systemctl status'
    - 'df -h'
    - 'ps aux'
    - 'netstat -tlnp'
    - 'tail -n 50'
  safezones:
    - '/var/log'
    - '~/scripts'
    - '/etc/nginx' # Be careful with system directories
```

## 🆘 Troubleshooting

### "Claude doesn't seem to be using the server"

**Check these in order:**

1. **Absolute paths in claude_desktop_config.json**

   ```bash
   # Make sure these files exist:
   ls -la /your/absolute/path/to/context-savvy-mcp/dist/index.js
   ls -la /your/absolute/path/to/context-savvy-mcp/config/server.yaml
   ```

2. **Claude Desktop was fully restarted**

   - Quit the app completely (not just close windows)
   - Restart it
   - Try in a new conversation

3. **Server builds successfully**
   ```bash
   npm run build
   # Should complete without errors
   ```

### "Permission denied" or "Path not allowed"

This means your security configuration is working! Check:

1. **Is the path in a safe zone?**

   ```yaml
   security:
     safezones:
       - '/path/to/your/project' # Make sure this matches where you're working
   ```

2. **Is the command allowed?**

   ```yaml
   security:
     allowedCommands:
       - 'ls' # Make sure the command you're trying is listed
   ```

3. **Use the diagnostics tool:**
   Ask Claude: "Can you run a security diagnostic to check what paths and commands are allowed?"

### "Database errors" or "SQLite issues"

```bash
# Check if data directory exists
ls -la data/

# If not, create it:
mkdir -p data

# Check permissions
ls -la data/context.db

# If corrupted, backup and recreate:
mv data/context.db data/context.db.backup
npm run dev  # Will create a fresh database
```

### Still stuck?

1. **Check the logs**

   ```bash
   npm run dev
   # Watch for error messages when Claude tries to connect
   ```

2. **Run a health check**

   ```bash
   npm run health-check
   ```

3. **Start minimal**

   - Use the default config
   - Add only basic commands like `ls` and `cat`
   - Add only your project directory to safe zones
   - Test, then expand gradually

4. **Ask for help**
   - [GitHub Issues](https://github.com/Baebu/context-savvy-mcp/issues)
   - [Discussions](https://github.com/Baebu/context-savvy-mcp/discussions)

## 🔒 Security Best Practices

**Start restrictive, expand carefully:**

- Begin with minimal commands and safe zones
- Add permissions only as you need them
- Test each addition carefully
- Never allow commands you don't understand

**Regular maintenance:**

- Review your allowed commands periodically
- Update safe zones as projects change
- Keep the server updated
- Monitor logs for unusual activity

**For shared systems:**

- Use separate user accounts
- Limit database access
- Be extra cautious with system directories
- Consider containerization

## 🎯 Next Steps

Now that you're set up:

1. **Try the advanced features**: Ask Claude about task management, workspace organization, and smart search
2. **Customize your config**: Add the commands and paths you use daily
3. **Explore the tools**: Use `get_system_health` and `get_project_overview` for insights
4. **Join the community**: Share your experience and help others

**Ready to unlock Claude's full potential?** You're all set! 🚀

---

_Having issues? Don't suffer in silence – open an issue or discussion. We're here to help!_
