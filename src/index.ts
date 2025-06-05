// src/index.ts - Updated shutdown to remove consent UI
import 'reflect-metadata';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import process from 'node:process'; // Import process
import { MCPContextServer } from './presentation/server.js';
import { container } from './infrastructure/di/container.js';
import { ContainerInitializer } from './infrastructure/di/container-initializer.js';
import { loadConfig } from './infrastructure/config/loader.js'; // This now uses the enhanced loader
import { logger } from './utils/logger.js';
import type { ISecurityValidator } from './core/interfaces/security.interface.js'; // Import SecurityValidator interface

async function ensureDataDirectory(dbPath: string): Promise<void> {
  // dbPath is now expected to be absolute after CWD change and config update
  const dataDir = path.dirname(dbPath);
  try {
    await fs.access(dataDir);
  } catch {
    logger.info(`[Index] Data directory "${dataDir}" not found. Attempting to create.`);
    await fs.mkdir(dataDir, { recursive: true });
    logger.info({ dataDir }, '[Index] Created data directory');
  }
}

async function main() {
  process.on('uncaughtException', error => {
    console.error('FATAL UNCAUGHT EXCEPTION:', error.message, error.stack);
    logger.fatal({ error: error.message, stack: error.stack }, 'Uncaught exception');
    process.exit(1);
  });

  process.on('unhandledRejection', (reason, promise) => {
    const errorReason = reason instanceof Error ? { message: reason.message, stack: reason.stack } : reason;
    console.error('FATAL UNHANDLED REJECTION:', errorReason, 'Promise:', promise);
    logger.fatal({ reason: errorReason, promise }, 'Unhandled rejection');
    process.exit(1);
  });

  try {
    logger.info(`[Index] Initial CWD: ${process.cwd()}`);

    const config = await loadConfig(); // Uses the enhanced loader

    if (config.server?.workingDirectory) {
      // Resolve the target CWD. If it's already absolute, resolve does nothing.
      // If it's relative, it's resolved against the *initial* CWD.
      const targetCwd = path.resolve(config.server.workingDirectory);
      if (process.cwd().toLowerCase() !== targetCwd.toLowerCase()) {
        // Check to avoid redundant chdir
        logger.info(`[Index] Attempting to change CWD from "${process.cwd()}" to: "${targetCwd}" (from config)`);
        try {
          process.chdir(targetCwd);
          logger.info(`[Index] Successfully changed CWD to: ${process.cwd()}`);
        } catch (err) {
          logger.error(
            { error: err, targetCwd, currentCwd: process.cwd() },
            `[Index] CRITICAL: Failed to change CWD to "${targetCwd}". Server will continue with CWD: "${process.cwd()}". This WILL LIKELY AFFECT relative path resolution for database, logs, etc., if they were configured relatively!`
          );
          // Depending on strictness, you might want to throw here or exit.
          // For now, we log critically and continue, but this is a major issue if chdir fails.
        }
      } else {
        logger.info(`[Index] Target workingDirectory "${targetCwd}" is already the current CWD. No change needed.`);
      }
    } else {
      logger.info(`[Index] No workingDirectory specified in config. Using CWD: ${process.cwd()}`);
    }

    // Resolve database path *after* potential CWD change
    // If config.database.path is already absolute, path.resolve does nothing harmful.
    // If it's relative, it's now resolved against the *new* CWD.
    const resolvedDbPath = path.resolve(config.database.path);
    if (config.database.path !== resolvedDbPath) {
      logger.info(
        `[Index] Resolved database path from "${config.database.path}" to "${resolvedDbPath}" (relative to CWD: "${process.cwd()}").`
      );
      config.database.path = resolvedDbPath;
    }
    logger.info(`[Index] Final database path: ${config.database.path}`);
    await ensureDataDirectory(config.database.path);

    // Resolve log file paths *after* potential CWD change
    if (config.logging?.file?.enabled && config.logging.file.path) {
      const resolvedLogPath = path.resolve(config.logging.file.path);
      if (config.logging.file.path !== resolvedLogPath) {
        logger.info(`[Index] Resolved log file path from "${config.logging.file.path}" to "${resolvedLogPath}"`);
        config.logging.file.path = resolvedLogPath;
      }
      // Ensure log directory exists
      try {
        await fs.mkdir(path.dirname(resolvedLogPath), { recursive: true });
      } catch (logDirError) {
        logger.warn(
          { error: logDirError, path: path.dirname(resolvedLogPath) },
          '[Index] Could not create log directory. Logging to file might fail.'
        );
      }
    }
    if (config.logging?.audit?.enabled && config.logging.audit.path) {
      const resolvedAuditPath = path.resolve(config.logging.audit.path);
      if (config.logging.audit.path !== resolvedAuditPath) {
        logger.info(`[Index] Resolved audit log path from "${config.logging.audit.path}" to "${resolvedAuditPath}"`);
        config.logging.audit.path = resolvedAuditPath;
      }
      try {
        await fs.mkdir(path.dirname(resolvedAuditPath), { recursive: true });
      } catch (auditDirError) {
        logger.warn(
          { error: auditDirError, path: path.dirname(resolvedAuditPath) },
          '[Index] Could not create audit log directory. Logging to audit file might fail.'
        );
      }
    }

    container.bind('Config').toConstantValue(config);
    await ContainerInitializer.initialize(container);

    // After DI initialization and potential CWD change, reinitialize security zones
    try {
      const securityValidator = container.get<ISecurityValidator>('SecurityValidator');
      if (typeof securityValidator.reinitializeZones === 'function') {
        securityValidator.reinitializeZones();
      } else {
        logger.warn(
          '[Index] SecurityValidator does not have reinitializeZones method. Relative path security zones might not be correctly resolved after CWD change.'
        );
      }
    } catch (err) {
      logger.error(
        { error: err },
        '[Index] Failed to get or reinitialize SecurityValidator. Security zones might be misconfigured.'
      );
    }

    const server = new MCPContextServer(container, config);
    await server.start();

    const shutdown = async () => {
      logger.info('Shutting down gracefully...');
      try {
        await server.shutdown();
      } catch (err) {
        logger.error({ error: err }, 'Error shutting down MCPContextServer during shutdown');
      }
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
    console.error('FATAL ERROR DURING STARTUP:', err.message, err.stack);
    logger.fatal({ error: err }, 'Failed to start MCP Context Server');
    process.exit(1);
  }
}

main();
