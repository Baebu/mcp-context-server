#!/usr/bin/env node

/**
 * Configuration UI Runner
 * 
 * Runs the comprehensive MCP Context Server configuration interface
 * for managing Claude Desktop integration and server security settings.
 */

import 'reflect-metadata';
import { Container } from 'inversify';
import { UIServer } from '../src/presentation/ui-server.js';
import { loadConfig } from '../src/infrastructure/config/config-loader.js';
import { logger } from '../src/utils/logger.js';

async function startConfigUI() {
  try {
    console.log('🚀 Starting MCP Context Server Configuration UI...\n');

    // Load server configuration (for current settings)
    let config;
    try {
      config = await loadConfig();
    } catch (error) {
      // If config loading fails, use defaults
      logger.warn('Using default configuration for UI server');
      config = {
        server: { name: 'mcp-context-server', version: '1.0.0' },
        security: {
          allowedCommands: ['ls', 'cat', 'grep', 'find', 'echo'],
          safezones: ['.', '/tmp'],
          maxExecutionTime: 30000,
          maxFileSize: 10485760
        },
        database: { path: './data/context.db', backupInterval: 60 },
        logging: { level: 'info', pretty: true },
        performance: { maxConcurrency: 10, queueSize: 1000 }
      };
    }

    // Create a minimal container for the UI server
    const container = new Container();
    container.bind('Config').toConstantValue(config);

    // Start the UI server
    const uiServer = new UIServer(container, config, 3001);
    uiServer.start();

    // Handle graceful shutdown
    const shutdown = () => {
      console.log('\n�� Shutting down configuration UI...');
      uiServer.stop();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    console.log('📋 Configuration Interface Features:');
    console.log('   🔗 Claude Desktop Integration');
    console.log('   🔒 Security Settings Management');
    console.log('   📁 Safe Zone Configuration');
    console.log('   ⚙️  Server Settings');
    console.log('   🧪 Configuration Testing');
    console.log('\n💡 Keep this running while you configure your settings');
    console.log('   Press Ctrl+C to stop the configuration UI\n');

  } catch (error) {
    console.error('❌ Failed to start configuration UI:', error);
    process.exit(1);
  }
}

startConfigUI();
