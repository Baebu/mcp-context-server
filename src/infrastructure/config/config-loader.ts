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

// Helper function to get Claude Desktop config path
function getClaudeDesktopConfigDir(): string | null {
  const currentPlatform = os.platform(); // Corrected: os.platform()
  const home = os.homedir(); // Corrected: os.homedir()
  let configPath: string;
  switch (currentPlatform) {
    case 'win32':
      configPath = path.join(
        process.env.APPDATA || path.join(home, 'AppData', 'Roaming'),
        'Claude',
        'claude_desktop_config.json'
      ); // Corrected: path.join()
      break;
    case 'darwin':
      configPath = path.join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json'); // Corrected: path.join()
      break;
    default: // Linux and other Unix-like
      configPath = path.join(home, '.config', 'claude', 'claude_desktop_config.json'); // Corrected: path.join()
      break;
  }
  try {
    // Check if the directory exists
    const dir = path.dirname(configPath);
    require('fs').accessSync(dir); // Use sync access here as it's part of config loading
    return dir;
  } catch (e) {
    logger.debug({ error: e, path: configPath }, 'Claude Desktop config directory not accessible or does not exist.');
    return null;
  }
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
      default: [process.cwd()],
      env: 'MCP_SAFEZONES'
    },
    restrictedZones: {
      doc: 'Directories to block even if they are within safe zones',
      format: Array,
      default: [],
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
      default: 'recursive',
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
    let serverConfigDir: string | null = null;

    if (explicitConfigPath) {
      const resolvedExplicitPath = path.resolve(process.cwd(), explicitConfigPath); // Resolve relative to CWD if not absolute
      logger.info({ path: resolvedExplicitPath }, 'Attempting to load configuration from MCP_SERVER_CONFIG_PATH.');
      try {
        await fs.access(resolvedExplicitPath);
        const ext = path.extname(resolvedExplicitPath).toLowerCase();
        const content = await fs.readFile(resolvedExplicitPath, 'utf-8');
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
          loadedFrom = resolvedExplicitPath;
          serverConfigDir = path.dirname(resolvedExplicitPath);
          logger.info({ path: resolvedExplicitPath }, 'Configuration loaded successfully from explicit path.');
        } else {
          throw new Error(`Configuration file at ${resolvedExplicitPath} did not contain a valid object.`);
        }
      } catch (error) {
        logger.error(
          { error, path: resolvedExplicitPath },
          `Failed to load configuration from explicit path MCP_SERVER_CONFIG_PATH. Server will not start with invalid explicit path.`
        );
        throw error;
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

      for (const configPathItem of defaultSearchPaths) {
        // Renamed configPath to configPathItem to avoid conflict
        const resolvedDefaultPath = path.resolve(process.cwd(), configPathItem);
        try {
          logger.debug(`Attempting to load config from: ${resolvedDefaultPath}`);
          await fs.access(resolvedDefaultPath);
          const ext = path.extname(resolvedDefaultPath).toLowerCase();
          const content = await fs.readFile(resolvedDefaultPath, 'utf-8');
          let parsed: unknown;
          if (ext === '.yaml' || ext === '.yml') {
            parsed = yaml.parse(content);
          } else if (ext === '.json') {
            parsed = JSON.parse(content);
          } else {
            logger.warn(`Unsupported config file extension: ${ext} at ${resolvedDefaultPath}`);
            continue;
          }

          if (parsed && typeof parsed === 'object') {
            configSchema.load(parsed);
            configLoaded = true;
            loadedFrom = resolvedDefaultPath;
            serverConfigDir = path.dirname(resolvedDefaultPath);
            logger.info({ path: resolvedDefaultPath }, 'Configuration loaded successfully from default location.');
            break;
          } else {
            logger.warn(`Config file ${resolvedDefaultPath} did not contain a valid object.`);
          }
        } catch (error) {
          if ((error as { code?: string }).code === 'ENOENT') {
            logger.debug(`Config file not found: ${resolvedDefaultPath}`);
          } else {
            logger.error(
              { error, configPath: resolvedDefaultPath },
              `Error loading config from ${resolvedDefaultPath}`
            );
          }
        }
      }
    }

    if (!configLoaded && !explicitConfigPath) {
      logger.warn(
        'No configuration file found in default locations, using built-in defaults and environment variables.'
      );
      serverConfigDir = process.cwd();
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

    const requestedWorkingDirectory = finalConfig.server.workingDirectory;
    const initialCwd = process.cwd();
    if (requestedWorkingDirectory && path.resolve(initialCwd, requestedWorkingDirectory) !== initialCwd) {
      try {
        const newCwd = path.resolve(initialCwd, requestedWorkingDirectory);
        process.chdir(newCwd);
        finalConfig.server.workingDirectory = newCwd;
        logger.info({ oldCwd: initialCwd, newCwd }, 'Changed working directory as per configuration.');
      } catch (error) {
        logger.warn(
          {
            error,
            requestedDirectory: requestedWorkingDirectory,
            resolvedTo: path.resolve(initialCwd, requestedWorkingDirectory)
          },
          'Failed to change working directory, continuing with initial CWD.'
        );
        finalConfig.server.workingDirectory = initialCwd;
      }
    } else {
      finalConfig.server.workingDirectory = initialCwd;
    }

    const currentWorkingDirectory = finalConfig.server.workingDirectory!; // Guaranteed to be string by above logic

    if (serverConfigDir && !path.isAbsolute(serverConfigDir) && initialCwd !== currentWorkingDirectory) {
      serverConfigDir = path.resolve(
        currentWorkingDirectory,
        serverConfigDir.startsWith(initialCwd) ? path.relative(initialCwd, serverConfigDir) : serverConfigDir
      );
    } else if (serverConfigDir) {
      serverConfigDir = path.resolve(currentWorkingDirectory, serverConfigDir);
    }

    const platformRestrictedZones = getPlatformRestrictedZones();
    const configRestrictedZones = finalConfig.security.restrictedZones || [];
    finalConfig.security.restrictedZones = [...new Set([...platformRestrictedZones, ...configRestrictedZones])];

    const safezonesToAdd = new Set<string>();

    if (finalConfig.security.autoExpandSafezones) {
      const commonDirs = getCommonDevDirectories();
      commonDirs.forEach(dir => safezonesToAdd.add(path.resolve(currentWorkingDirectory, dir)));

      const claudeConfigDir = getClaudeDesktopConfigDir();
      if (claudeConfigDir) {
        safezonesToAdd.add(claudeConfigDir);
      }
    }
    if (serverConfigDir) {
      safezonesToAdd.add(serverConfigDir);
    }

    safezonesToAdd.add(initialCwd);
    safezonesToAdd.add(currentWorkingDirectory);

    const existingSafezonesResolved = new Set(
      finalConfig.security.safezones.map(zone => path.resolve(currentWorkingDirectory, zone))
    );

    safezonesToAdd.forEach(zonePathToAdd => {
      // Renamed zoneToAdd to zonePathToAdd for clarity
      const resolvedZone = path.resolve(zonePathToAdd); // zonePathToAdd is already absolute or resolved relative to CWD
      if (!existingSafezonesResolved.has(resolvedZone)) {
        // Store paths relative to the final working directory if possible, or absolute.
        const relativeOrAbsoluteZone = path.isAbsolute(zonePathToAdd)
          ? zonePathToAdd
          : path.relative(currentWorkingDirectory, resolvedZone) || '.';
        finalConfig.security.safezones.push(relativeOrAbsoluteZone);
        existingSafezonesResolved.add(resolvedZone);
      }
    });

    const uniqueResolvedSafezones = new Map<string, string>();
    finalConfig.security.safezones.forEach(z => {
      // z instead of zone
      const resolved = path.resolve(currentWorkingDirectory, z);
      if (!uniqueResolvedSafezones.has(resolved)) {
        uniqueResolvedSafezones.set(resolved, z);
      }
    });
    finalConfig.security.safezones = Array.from(uniqueResolvedSafezones.values());

    logger.info(
      {
        finalSafeZoneCount: finalConfig.security.safezones.length,
        restrictedZoneCount: finalConfig.security.restrictedZones.length
      },
      'Processed safe and restricted zones.'
    );

    if (!path.isAbsolute(finalConfig.database.path)) {
      finalConfig.database.path = path.resolve(currentWorkingDirectory, finalConfig.database.path);
    }

    logger.info(
      {
        loadedFrom:
          loadedFrom || (explicitConfigPath ? 'MCP_SERVER_CONFIG_PATH (failed or defaults used)' : 'defaults/env-vars'),
        workingDirectory: finalConfig.server.workingDirectory,
        serverName: finalConfig.server.name,
        security: {
          allowedCommandsCount: Array.isArray(finalConfig.security.allowedCommands)
            ? finalConfig.security.allowedCommands.length
            : finalConfig.security.allowedCommands,
          safeZones: finalConfig.security.safezones,
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
