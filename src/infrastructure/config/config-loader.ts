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
    // Try to load config from multiple sources
    const configPaths = [
      './config/server.toml',
      './config/server.yaml',
      './config/server.json',
      './mcp-config.toml',
      './mcp-config.yaml',
      './mcp-config.json'
    ];

    for (const configPath of configPaths) {
      try {
        const ext = path.extname(configPath);
        const content = await fs.readFile(configPath, 'utf-8');

        let parsed: unknown;
        switch (ext) {
          case '.toml':
            // Would need to import a TOML parser
            logger.warn('TOML config support not implemented');
            continue;
          case '.yaml':
          case '.yml':
            parsed = yaml.parse(content);
            break;
          case '.json':
            parsed = JSON.parse(content);
            break;
        }

        if (parsed) {
          configSchema.load(parsed);
          logger.info({ path: configPath }, 'Configuration loaded');
          break;
        }
      } catch (error) {
        // Continue to next config path
      }
    }

    // Validate configuration
    configSchema.validate({ allowed: 'strict' });

    return configSchema.getProperties() as ServerConfig;
  } catch (error) {
    logger.error({ error }, 'Failed to load configuration');
    throw error;
  }
}
