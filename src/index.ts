// src/index.ts - Updated shutdown to include consent UI
import 'reflect-metadata';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { MCPContextServer } from './presentation/server.js';
import { container } from './infrastructure/di/container.js';
import { ContainerInitializer } from './infrastructure/di/container-initializer.js';
import { loadConfig } from './infrastructure/config/config-loader.js';
import { logger } from './utils/logger.js';
import { ConsentUIBridge } from './presentation/consent-ui-bridge.js';

async function ensureDataDirectory(dbPath: string): Promise<void> {
  const dataDir = path.dirname(dbPath);
  try {
    await fs.access(dataDir);
  } catch {
    await fs.mkdir(dataDir, { recursive: true });
    logger.info({ dataDir }, 'Created data directory');
  }
}

async function main() {
  try {
    // Load configuration
    const config = await loadConfig();

    // Ensure data directory exists
    await ensureDataDirectory(config.database.path);

    // Initialize DI container
    container.bind('Config').toConstantValue(config);

    // Initialize all tools, resources, and prompts
    await ContainerInitializer.initialize(container);

    // Create and start server
    const server = new MCPContextServer(container, config);
    await server.start();

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');

      // Stop consent UI
      const consentUIBridge = container.get(ConsentUIBridge);
      consentUIBridge.stop();

      await server.shutdown();

      // Close database connection
      const db = container.get('DatabaseHandler') as { close(): void };
      db.close();

      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);

    // Handle uncaught exceptions
    process.on('uncaughtException', error => {
      logger.fatal({ error }, 'Uncaught exception');
      process.exit(1);
    });

    process.on('unhandledRejection', (reason, promise) => {
      logger.fatal({ reason, promise }, 'Unhandled rejection');
      process.exit(1);
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start MCP Context Server');
    process.exit(1);
  }
}

main();
