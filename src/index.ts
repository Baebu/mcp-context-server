import 'reflect-metadata';
import { MCPContextServer } from './presentation/server.js';
import { container } from './infrastructure/di/container.js';
import { loadConfig } from './infrastructure/config/config-loader.js';
import { logger } from './utils/logger.js';

async function main() {
  try {
    // Load configuration
    const config = await loadConfig();

    // Initialize DI container
    container.bind('Config').toConstantValue(config);

    // Create and start server
    const server = new MCPContextServer(container, config);
    await server.start();

    // Handle graceful shutdown
    process.on('SIGTERM', async () => {
      logger.info('Received SIGTERM, shutting down gracefully...');
      await server.shutdown();
      process.exit(0);
    });

    process.on('SIGINT', async () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      await server.shutdown();
      process.exit(0);
    });
  } catch (error) {
    logger.fatal({ error }, 'Failed to start MCP Context Server');
    process.exit(1);
  }
}

main();
