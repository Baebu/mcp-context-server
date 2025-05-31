// Enhanced Configuration Loader with Hierarchical Safe Zones
// File: src/infrastructure/config/config-loader.ts

import convict from 'convict';
import { promises as fs } from 'node:fs';
import * as yaml from 'yaml';
import path from 'node:path';
import os from 'node:os';
import { logger } from '../../utils/logger.js';
import type { ServerConfig } from './types.js';

// Helper function to get common development directories
function getCommonDevDirectories(): string[] {
  const home = os.homedir();
  const platform = os.platform();
  const commonDirs = [
    process.cwd(), // Current working directory
    path.join(home, 'Documents'),
    path.join(home, 'Desktop'),
    path.join(home, 'Downloads'),
    '/tmp',
    path.join(os.tmpdir())
  ];

  // Add platform-specific directories
  if (platform === 'win32') {
    commonDirs.push(
      path.join(home, 'AppData', 'Local', 'Temp'),
      'C:\\temp',
      'C:\\tmp',
      path.join(home, 'Projects'),
      path.join(home, 'Source')
    );
  } else {
    commonDirs.push(
      '/var/tmp',
      path.join(home, '.cache'),
      path.join(home, 'tmp'),
      path.join(home, 'projects'),
      path.join(home, 'workspace'),
      path.join(home, 'dev')
    );
  }

  // Filter to only existing directories
  return commonDirs.filter(dir => {
    try {
      return require('fs').existsSync(dir);
    } catch {
      return false;
    }
  });
}

// Get platform-specific restricted zones (sensitive system areas)
function getPlatformRestrictedZones(): string[] {
  const platform = os.platform();
  const restrictedZones: string[] = [];

  if (platform === 'win32') {
    restrictedZones.push(
      'C:\\Windows\\System32',
      'C:\\Windows\\SysWOW64',
      'C:\\Program Files\\WindowsApps',
      'C:\\ProgramData\\Microsoft\\Windows\\Start Menu',
      '**/AppData/Roaming/Microsoft/Credentials',
      '**/AppData/Roaming/Microsoft/Crypto'
    );
  } else {
    restrictedZones.push(
      '/bin',
      '/boot',
      '/dev',
      '/etc/passwd',
      '/etc/shadow',
      '/etc/sudoers*',
      '/lib',
      '/proc',
      '/root',
      '/sbin',
      '/sys',
      '/usr/bin',
      '/usr/sbin',
      '/var/log/auth*',
      '/var/log/secure*'
    );

    if (platform === 'darwin') {
      restrictedZones.push('/System', '/Library/Keychains', '/private/etc', '/private/var/root');
    }
  }

  // Add cross-platform sensitive patterns
  restrictedZones.push(
    '**/.ssh',
    '**/.gnupg',
    '**/Library/Keychains',
    '**/.aws/credentials',
    '**/.docker/config.json',
    '**/id_rsa*',
    '**/id_ed25519*',
    '**/*.pem',
    '**/*.key',
    '**/*.p12',
    '**/*.pfx'
  );

  return restrictedZones;
}

const allToolNames = [
  'read_file',
  'write_file',
  'list_directory',
  'execute_command',
  'store_context',
  'get_context',
  'query_context',
  'create_smart_path',
  'execute_smart_path',
  'list_smart_paths',
  'create_workspace',
  'list_workspaces',
  'switch_workspace',
  'sync_workspace',
  'track_file',
  'get_workspace_stats',
  'delete_workspace',
  'export_workspace_template',
  'parse_file',
  'get_metrics',
  'security_diagnostics',
  'database_health'
];

const commonOsCommands = [
  'ls',
  'cat',
  'grep',
  'find',
  'echo',
  'pwd',
  'whoami',
  'dir',
  'type',
  'where',
  'git',
  'npm',
  'node',
  'python',
  'python3'
];

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
    },
    workingDirectory: {
      doc: 'Override working directory for the server',
      format: String,
      default: process.cwd(),
      env: 'MCP_WORKING_DIRECTORY'
    }
  },
  security: {
    allowedCommands: {
      doc: 'List of allowed commands or "all"',
      format: Array,
      default: [...new Set([...commonOsCommands, ...allToolNames])], // Default to OS commands + all tools
      env: 'MCP_ALLOWED_COMMANDS'
    },
    safezones: {
      doc: 'Allowed directories for file operations (recursive by default)',
      format: Array,
      default: [process.cwd()], // Will be expanded later if autoExpandSafezones is true
      env: 'MCP_SAFEZONES'
    },
    restrictedZones: {
      doc: 'Directories to block even if they are within safe zones',
      format: Array,
      default: [], // Will be populated with platform defaults
      env: 'MCP_RESTRICTED_ZONES'
    },
    autoExpandSafezones: {
      doc: 'Automatically include common development directories in safe zones',
      format: Boolean,
      default: true,
      env: 'MCP_AUTO_EXPAND_SAFEZONES'
    },
    safeZoneMode: {
      doc: 'How to handle subdirectories of safe zones',
      format: ['strict', 'recursive'],
      default: 'recursive', // Allow subdirectories by default
      env: 'MCP_SAFE_ZONE_MODE'
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
    },
    unsafeArgumentPatterns: {
      doc: 'Regex patterns to block in command arguments',
      format: Array,
      default: [
        '\\$\\(|`|\\$\\{.*\\}', // Command substitution
        '(?:^|\\s)(?:-|--)(?:exec|execute|command|eval|source|run|call|start|invoke|delegate)(?:$|\\s|=)', // Execution flags
        '^(?:http|ftp)s?:\\/\\/' // Standalone URLs as arguments
      ],
      env: 'MCP_UNSAFE_ARGUMENT_PATTERNS'
    },
    blockedPathPatterns: {
      doc: 'Regex patterns for paths to always block',
      format: Array,
      default: [
        '\\.\\.([\\\\/]|\\.)+', // Path traversal attempts
        '[\\\\/](etc|bin|sbin|boot|sys|proc|dev|root)[\\\\/]', // System directories
        '\\.(ssh|gnupg)[\\\\/]', // Security directories
        '\\.(pem|key|p12|pfx)$', // Security files
        'credentials?$' // Credential files
      ],
      env: 'MCP_BLOCKED_PATH_PATTERNS'
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

    const explicitConfigPath = process.env.MCP_SERVER_CONFIG_PATH;
    let configLoaded = false;
    let loadedFrom = '';

    if (explicitConfigPath) {
      logger.info({ path: explicitConfigPath }, 'Attempting to load configuration from MCP_SERVER_CONFIG_PATH.');
      try {
        await fs.access(explicitConfigPath);
        const ext = path.extname(explicitConfigPath).toLowerCase();
        const content = await fs.readFile(explicitConfigPath, 'utf-8');
        let parsed: unknown;
        if (ext === '.yaml' || ext === '.yml') {
          parsed = yaml.parse(content);
        } else if (ext === '.json') {
          parsed = JSON.parse(content);
        } else {
          throw new Error(`Unsupported file extension for explicit config path: ${ext}. Use .yaml or .json.`);
        }

        if (parsed && typeof parsed === 'object') {
          configSchema.load(parsed);
          configLoaded = true;
          loadedFrom = explicitConfigPath;
          logger.info({ path: explicitConfigPath }, 'Configuration loaded successfully from explicit path.');
        } else {
          throw new Error(`Configuration file at ${explicitConfigPath} did not contain a valid object.`);
        }
      } catch (error) {
        logger.error(
          { error, path: explicitConfigPath },
          `Failed to load configuration from explicit path MCP_SERVER_CONFIG_PATH. Server will not start with invalid explicit path.`
        );
        throw error; // Rethrow if explicit path is provided but fails
      }
    } else {
      logger.info('MCP_SERVER_CONFIG_PATH not set. Searching default locations...');
      const defaultSearchPaths = [
        './config/server.yaml',
        './config/server.yml',
        './config/server.json',
        './mcp-config.yaml',
        './mcp-config.json'
      ];

      for (const configPath of defaultSearchPaths) {
        try {
          logger.debug(`Attempting to load config from: ${configPath}`);
          await fs.access(configPath);
          const ext = path.extname(configPath).toLowerCase();
          const content = await fs.readFile(configPath, 'utf-8');
          let parsed: unknown;
          if (ext === '.yaml' || ext === '.yml') {
            parsed = yaml.parse(content);
          } else if (ext === '.json') {
            parsed = JSON.parse(content);
          } else {
            logger.warn(`Unsupported config file extension: ${ext} at ${configPath}`);
            continue;
          }

          if (parsed && typeof parsed === 'object') {
            configSchema.load(parsed);
            configLoaded = true;
            loadedFrom = configPath;
            logger.info({ path: configPath }, 'Configuration loaded successfully from default location.');
            break;
          } else {
            logger.warn(`Config file ${configPath} did not contain a valid object.`);
          }
        } catch (error) {
          if ((error as { code?: string }).code === 'ENOENT') {
            logger.debug(`Config file not found: ${configPath}`);
          } else {
            logger.error({ error, configPath }, `Error loading config from ${configPath}`);
            // Don't rethrow here, allow fallback to defaults if all default paths fail
          }
        }
      }
    }

    if (!configLoaded && !explicitConfigPath) {
      logger.warn(
        'No configuration file found in default locations, using built-in defaults and environment variables.'
      );
    }

    try {
      configSchema.validate({ allowed: 'strict' });
    } catch (validationError) {
      logger.error({ validationError }, 'Configuration validation failed');
      throw new Error(
        `Configuration validation error: ${validationError instanceof Error ? validationError.message : 'Unknown validation error'}`
      );
    }

    const finalConfig = configSchema.getProperties() as ServerConfig;

    if (finalConfig.server.workingDirectory && finalConfig.server.workingDirectory !== process.cwd()) {
      try {
        process.chdir(finalConfig.server.workingDirectory);
        logger.info(
          {
            newCwd: finalConfig.server.workingDirectory
          },
          'Changed working directory as per configuration.'
        );
      } catch (error) {
        logger.warn(
          {
            error,
            requestedDirectory: finalConfig.server.workingDirectory
          },
          'Failed to change working directory, continuing with current directory.'
        );
        finalConfig.server.workingDirectory = process.cwd(); // Reflect actual CWD
      }
    } else {
      finalConfig.server.workingDirectory = process.cwd(); // Ensure it's set
    }

    const platformRestrictedZones = getPlatformRestrictedZones();
    const configRestrictedZones = finalConfig.security.restrictedZones || [];
    finalConfig.security.restrictedZones = [...new Set([...platformRestrictedZones, ...configRestrictedZones])]; // Use Set to avoid duplicates

    if (finalConfig.security.autoExpandSafezones) {
      const commonDirs = getCommonDevDirectories();
      const existingSafezones = new Set(finalConfig.security.safezones.map(zone => path.resolve(process.cwd(), zone)));

      for (const dir of commonDirs) {
        const resolvedDir = path.resolve(process.cwd(), dir);
        if (!existingSafezones.has(resolvedDir)) {
          finalConfig.security.safezones.push(dir); // Add relative or absolute as it was
          existingSafezones.add(resolvedDir);
        }
      }
      logger.info(
        {
          finalSafeZoneCount: finalConfig.security.safezones.length
        },
        'Auto-expanded safe zones.'
      );
    }

    // Resolve database path relative to the *final* working directory
    if (!path.isAbsolute(finalConfig.database.path)) {
      finalConfig.database.path = path.resolve(finalConfig.server.workingDirectory, finalConfig.database.path);
    }

    logger.info(
      {
        loadedFrom: loadedFrom || (explicitConfigPath ? 'MCP_SERVER_CONFIG_PATH (failed)' : 'defaults/env-vars'),
        workingDirectory: finalConfig.server.workingDirectory,
        serverName: finalConfig.server.name,
        security: {
          allowedCommandsCount: Array.isArray(finalConfig.security.allowedCommands)
            ? finalConfig.security.allowedCommands.length
            : finalConfig.security.allowedCommands,
          safeZonesCount: finalConfig.security.safezones.length,
          restrictedZonesCount: finalConfig.security.restrictedZones.length,
          safeZoneMode: finalConfig.security.safeZoneMode,
          autoExpandSafezones: finalConfig.security.autoExpandSafezones,
          unsafeArgumentPatternsCount: (finalConfig.security.unsafeArgumentPatterns || []).length,
          blockedPathPatternsCount: (finalConfig.security.blockedPathPatterns || []).length
        },
        logLevel: finalConfig.logging.level,
        databasePath: finalConfig.database.path
      },
      'Final configuration loaded and validated.'
    );

    return finalConfig;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown configuration error';
    logger.error(
      {
        error: errorMessage,
        stack: error instanceof Error ? error.stack : undefined,
        cwd: process.cwd()
      },
      'Fatal error during configuration loading.'
    );
    throw new Error(`Configuration loading failed: ${errorMessage}`);
  }
}
