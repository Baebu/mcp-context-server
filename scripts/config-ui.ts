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
import { configSchema } from '../src/infrastructure/config/schema.js';
import { loadConfig } from '../src/infrastructure/config/loader.js';
import { logger } from '../src/utils/logger.js';
import type { ServerConfig } from '../src/infrastructure/config/schema.js';

async function startConfigUI() {
  try {
    console.log('🚀 Starting MCP Context Server Configuration UI...\n');

    let config: ServerConfig;
    try {
      config = await loadConfig();
    } catch (error) {
      logger.warn('Using default configuration for UI server as loadConfig failed.');
      config = configSchema.parse({});
    }

    const container = new Container();
    container.bind('Config').toConstantValue(config);

    const uiServer = new UIServer(config);
    uiServer.start();

    const shutdown = () => {
      console.log('\n🔌 Shutting down configuration UI...');
      uiServer.stop();
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    console.log('📋 Configuration Interface Features:');
    console.log('   🔗 Claude Desktop Integration');
    console.log('   🔒 Security Settings Management (Commands, Safezones, Unsafe Arguments)');
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
