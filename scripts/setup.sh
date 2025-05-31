#!/bin/bash

# MCP Context Server Setup Script

set -e

echo "🚀 Setting up MCP Context Server..."

# Check Node.js version
echo "📋 Checking Node.js version..."
node_version=$(node --version | cut -d'v' -f2)
required_version="18.0.0"

if [ "$(printf '%s\n' "$required_version" "$node_version" | sort -V | head -n1)" != "$required_version" ]; then
    echo "❌ Node.js version $required_version or higher is required. Current version: $node_version"
    exit 1
fi

echo "✅ Node.js version check passed: $node_version"

# Install dependencies
echo "📦 Installing dependencies..."
npm install

# Create data directory
echo "📁 Creating data directory..."
mkdir -p data

# Create config file if it doesn't exist
if [ ! -f "config/server.yaml" ]; then
    echo "⚙️  Creating default configuration..."
    cp config/server.example.yaml config/server.yaml
    echo "📝 Configuration created at config/server.yaml"
    echo "💡 You can edit this file to customize settings"
fi

# Create environment file if it doesn't exist
if [ ! -f ".env" ]; then
    echo "🔧 Creating environment file..."
    cp .env.example .env
    echo "📝 Environment file created at .env"
fi

# Build the project
echo "🔨 Building project..."
npm run build

# Run tests
echo "🧪 Running tests..."
npm test

echo ""
echo "✅ Setup complete!"
echo ""
echo "📋 Next steps:"
echo "   1. Review and customize config/server.yaml if needed"
echo "   2. Add this server to your Claude Desktop configuration"
echo "   3. Restart Claude Desktop"
echo ""
echo "📖 See CLAUDE_DESKTOP_CONFIG.md for detailed integration instructions"
echo ""
echo "🚀 To start the server in development mode: npm run dev"
echo "🏗️  To start the server in production mode: npm start"
echo ""
echo "Current project path (use this in Claude Desktop config):"
echo "   $(pwd)/dist/index.js"
