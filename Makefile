.PHONY: help install setup build dev start test clean health-check claude-config lint format

# Default target
help:
	@echo "MCP Context Server - Available Commands:"
	@echo ""
	@echo "  setup          - Complete setup (install, build, create config)"
	@echo "  install        - Install dependencies"
	@echo "  build          - Build the project"
	@echo "  dev            - Start in development mode"
	@echo "  start          - Start in production mode"
	@echo "  test           - Run tests"
	@echo "  health-check   - Check server health and configuration"
	@echo "  claude-config  - Show Claude Desktop configuration instructions"
	@echo "  lint           - Run linter"
	@echo "  format         - Format code"
	@echo "  clean          - Clean build artifacts"
	@echo ""

# Complete setup
setup: install build config
	@echo "✅ Setup complete!"
	@echo "📖 Next: Configure Claude Desktop (run 'make claude-config')"

# Install dependencies
install:
	@echo "📦 Installing dependencies..."
	npm install

# Create configuration files
config:
	@mkdir -p data
	@if [ ! -f config/server.yaml ]; then \
		cp config/server.example.yaml config/server.yaml; \
		echo "📝 Created config/server.yaml"; \
	fi
	@if [ ! -f .env ]; then \
		cp .env.example .env; \
		echo "📝 Created .env"; \
	fi

# Build project
build:
	@echo "🔨 Building project..."
	npm run build

# Development mode
dev:
	@echo "🚀 Starting development server..."
	npm run dev

# Production mode
start: build
	@echo "🚀 Starting production server..."
	npm start

# Run tests
test:
	@echo "🧪 Running tests..."
	npm test

# Health check
health-check:
	@echo "🏥 Running health check..."
	@echo "📋 Checking Node.js version..."
	@node --version
	@echo "📋 Checking project structure..."
	@ls -la config/ | grep -E "(server\.(yaml|json)|server\.example\.yaml)" || echo "❌ Missing config files"
	@ls -la dist/ | grep index.js || echo "❌ Project not built - run 'make build'"
	@ls -la data/ || echo "❌ Missing data directory - run 'make setup'"
	@echo "📋 Checking dependencies..."
	@npm list --depth=0 > /dev/null 2>&1 && echo "✅ Dependencies OK" || echo "❌ Dependencies issue - run 'make install'"

# Show Claude Desktop configuration
claude-config:
	@echo "Claude Desktop Configuration:"
	@echo ""
	@echo "Add this to your claude_desktop_config.json:"
	@echo '{'
	@echo '  "mcpServers": {'
	@echo '    "context-server": {'
	@echo '      "command": "node",'
	@echo '      "args": ["$(PWD)/dist/index.js"],'
	@echo '      "env": {'
	@echo '        "MCP_LOG_LEVEL": "info",'
	@echo '        "MCP_SERVER_CONFIG_PATH": "$(PWD)/config/server.yaml"'
	@echo '      }'
	@echo '    }'
	@echo '  }'
	@echo '}'
	@echo ""
	@echo "Config file locations:"
	@echo "  macOS: ~/Library/Application Support/Claude/claude_desktop_config.json"
	@echo "  Windows: %APPDATA%\\Claude\\claude_desktop_config.json"
	@echo "  Linux: ~/.config/claude/claude_desktop_config.json"
	@echo ""
	@echo "Note: Ensure MCP_SERVER_CONFIG_PATH points to your actual server configuration file."

# Linting
lint:
	@echo "🔍 Running linter..."
	npm run lint

# Format code
format:
	@echo "✨ Formatting code..."
	npm run format

# Clean build artifacts
clean:
	@echo "🧹 Cleaning build artifacts..."
	rm -rf dist/
	rm -rf coverage/
	rm -rf node_modules/.cache/
