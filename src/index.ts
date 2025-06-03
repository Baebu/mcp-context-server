// src/index.ts - Updated shutdown to include consent UI
import 'reflect-metadata';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import { MCPContextServer } from './presentation/server.js';
import { container } from './infrastructure/di/container.js';
import { ContainerInitializer } from './infrastructure/di/container-initializer.js';
import { loadConfig } from './infrastructure/config/loader.js';
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
  // Setup global error handlers ASAP
  process.on('uncaughtException', error => {
    console.error('FATAL UNCAUGHT EXCEPTION:', error.message, error.stack); // Log to console immediately
    logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
    process.exit(1); // Exit after logging
  });

  process.on('unhandledRejection', (reason, promise) => {
    const errorReason = reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason;
    console.error('FATAL UNHANDLED REJECTION:', errorReason, 'Promise:', promise); // Log to console immediately
    logger.fatal({ reason: errorReason, promise }, 'Unhandled rejection');
    process.exit(1); // Exit after logging
  });

  try {
    // Load configuration
    const config = await loadConfig();

    // Ensure data directory exists (using the now absolute config.database.path)
    await ensureDataDirectory(config.database.path);

    // Initialize DI container
    container.bind('Config').toConstantValue(config);

    // Initialize all tools, resources, and prompts
    // This also starts the ConsentUIBridge
    await ContainerInitializer.initialize(container);

    // Create and start server
    const server = new MCPContextServer(container, config);
    await server.start(); // This connects to stdio and registers MCP handlers

    // Handle graceful shutdown
    const shutdown = async () => {
      logger.info('Shutting down gracefully...');

      // Stop consent UI
      try {
        const consentUIBridge = container.get(ConsentUIBridge);
        consentUIBridge.stop();
      } catch (err) {
        logger.error({ error: err }, 'Error stopping ConsentUIBridge during shutdown');
      }

      try {
        await server.shutdown();
      } catch (err) {
        logger.error({ error: err }, 'Error shutting down MCPContextServer during shutdown');
      }

      // Close database connection
      try {
        const db = container.get('DatabaseHandler') as { close(): void };
        db.close();
      } catch (err) {
        logger.error({ error: err }, 'Error closing database during shutdown');
      }

      logger.info('Graceful shutdown complete.');
      process.exit(0);
    };

    process.on('SIGTERM', shutdown);
    process.on('SIGINT', shutdown);
  } catch (error) {
    const err = error instanceof Error ? { message: error.message, stack: error.stack } : { message: String(error) };
    console.error('FATAL ERROR DURING STARTUP:', err.message, err.stack); // Log to console immediately
    logger.fatal({ error: err }, 'Failed to start MCP Context Server');
    process.exit(1);
  }
}

main();
