// Replace src/infrastructure/config/config-loader.ts with this improved version

import convict from 'convict';
import { promises as fs } from 'node:fs';
import * as yaml from 'yaml';
import path from 'node:path';
import { logger } from '../../utils/logger.js';
import type { ServerConfig } from './types.js';

export const configSchema = convict({
  server: {
    name: {
      doc: 'The name of the MCP server',
      format: String,
      default: 'context-efficient-mcp-server',
      env: 'MCP_SERVER_NAME'
    },
    version: {
      doc: 'Server version',
      format: String,
      default: '1.0.0',
      env: 'MCP_SERVER_VERSION'
    }
  },
  security: {
    allowedCommands: {
      doc: 'List of allowed commands or "all"',
      format: Array,
      default: ['ls', 'cat', 'grep', 'find', 'echo'],
      env: 'MCP_ALLOWED_COMMANDS'
    },
    safezones: {
      doc: 'Allowed directories for file operations',
      format: Array,
      default: [process.cwd()],
      env: 'MCP_SAFEZONES'
    },
    maxExecutionTime: {
      doc: 'Maximum command execution time in ms',
      format: Number,
      default: 30000,
      env: 'MCP_MAX_EXECUTION_TIME'
    },
    maxFileSize: {
      doc: 'Maximum file size for operations in bytes',
      format: Number,
      default: 10485760, // 10MB
      env: 'MCP_MAX_FILE_SIZE'
    }
  },
  database: {
    path: {
      doc: 'Path to SQLite database file',
      format: String,
      default: './data/context.db',
      env: 'MCP_DATABASE_PATH'
    },
    backupInterval: {
      doc: 'Backup interval in minutes (0 to disable)',
      format: Number,
      default: 60,
      env: 'MCP_BACKUP_INTERVAL'
    }
  },
  logging: {
    level: {
      doc: 'Logging level',
      format: ['trace', 'debug', 'info', 'warn', 'error', 'fatal'],
      default: 'info',
      env: 'MCP_LOG_LEVEL'
    },
    pretty: {
      doc: 'Enable pretty logging',
      format: Boolean,
      default: process.env.NODE_ENV === 'development',
      env: 'MCP_LOG_PRETTY'
    }
  },
  performance: {
    maxConcurrency: {
      doc: 'Maximum concurrent operations',
      format: Number,
      default: 10,
      env: 'MCP_MAX_CONCURRENCY'
    },
    queueSize: {
      doc: 'Maximum queue size for operations',
      format: Number,
      default: 1000,
      env: 'MCP_QUEUE_SIZE'
    }
  }
});

export async function loadConfig(): Promise<ServerConfig> {
  try {
    logger.info('Loading configuration...');

    // Try to load config from multiple sources in order of preference
    const configPaths = [
      './config/server.yaml',
      './config/server.yml',
      './config/server.json',
      './mcp-config.yaml',
      './mcp-config.json'
    ];

    let configLoaded = false;
    let loadedFrom = '';

    for (const configPath of configPaths) {
      try {
        logger.debug(`Attempting to load config from: ${configPath}`);

        // Check if file exists
        await fs.access(configPath);

        const ext = path.extname(configPath).toLowerCase();
        const content = await fs.readFile(configPath, 'utf-8');

        logger.debug(`Config file content length: ${content.length} characters`);

        let parsed: unknown;

        if (ext === '.yaml' || ext === '.yml') {
          try {
            parsed = yaml.parse(content);
            logger.debug('YAML parsing successful');
          } catch (yamlError) {
            logger.error({ yamlError, configPath }, 'YAML parsing failed');
            throw new Error(
              `YAML parsing error in ${configPath}: ${yamlError instanceof Error ? yamlError.message : 'Unknown YAML error'}`
            );
          }
        } else if (ext === '.json') {
          try {
            parsed = JSON.parse(content);
            logger.debug('JSON parsing successful');
          } catch (jsonError) {
            logger.error({ jsonError, configPath }, 'JSON parsing failed');
            throw new Error(
              `JSON parsing error in ${configPath}: ${jsonError instanceof Error ? jsonError.message : 'Unknown JSON error'}`
            );
          }
        } else {
          logger.warn(`Unsupported config file extension: ${ext}`);
          continue;
        }

        if (parsed && typeof parsed === 'object') {
          logger.debug('Loading parsed config into schema...');
          configSchema.load(parsed);
          configLoaded = true;
          loadedFrom = configPath;
          logger.info({ path: configPath }, 'Configuration loaded successfully');
          break;
        } else {
          logger.warn(`Config file ${configPath} did not contain a valid object`);
        }
      } catch (error) {
        if ((error as { code?: string }).code === 'ENOENT') {
          logger.debug(`Config file not found: ${configPath}`);
          continue;
        } else {
          logger.error({ error, configPath }, `Error loading config from ${configPath}`);
          throw error;
        }
      }
    }

    if (!configLoaded) {
      logger.warn('No configuration file found, using defaults');
    }

    // Validate configuration
    try {
      logger.debug('Validating configuration schema...');
      configSchema.validate({ allowed: 'strict' });
      logger.debug('Configuration validation successful');
    } catch (validationError) {
      logger.error({ validationError }, 'Configuration validation failed');
      throw new Error(
        `Configuration validation error: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`
      );
    }

    const finalConfig = configSchema.getProperties() as ServerConfig;

    logger.info(
      {
        loadedFrom: loadedFrom || 'defaults',
        serverName: finalConfig.server.name,
        allowedCommands: Array.isArray(finalConfig.security.allowedCommands)
          ? finalConfig.security.allowedCommands.length
          : 'all',
        safezones: finalConfig.security.safezones.length,
        logLevel: finalConfig.logging.level
      },
      'Configuration loaded and validated'
    );

    return finalConfig;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown configuration error';
    const errorStack = error instanceof Error ? error.stack : undefined;

    logger.error(
      {
        error: errorMessage,
        stack: errorStack,
        cwd: process.cwd(),
        nodeVersion: process.version
      },
      'Failed to load configuration'
    );

    throw new Error(`Configuration loading failed: ${errorMessage}`);
  }
}
