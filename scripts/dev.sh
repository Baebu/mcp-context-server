#!/bin/bash

# Development script for MCP Context Server

set -e

echo "🚀 Starting MCP Context Server in development mode..."

# Ensure data directory exists
mkdir -p data

# Check if config exists
if [ ! -f "config/server.yaml" ] && [ ! -f "config/server.json" ]; then
    echo "⚠️  No configuration file found. Creating from example..."
    cp config/server.example.yaml config/server.yaml
    echo "📝 Edit config/server.yaml to customize settings"
fi

# Install dependencies if needed
if [ ! -d "node_modules" ]; then
    echo "📦 Installing dependencies..."
    npm install
fi

# Start in development mode with file watching
npm run dev