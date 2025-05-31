// Complete Configuration Management Server
// File: src/presentation/ui-server.ts

import { createServer } from 'http';
import type { Server } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import { readFileSync, promises as fs } from 'fs';
import { join, resolve, dirname } from 'path';
import { homedir, platform } from 'os';
import * as yaml from 'yaml';
import type { Container } from 'inversify';
import type { ServerConfig } from '../infrastructure/config/types.js';
import { logger } from '../utils/logger.js';

interface ClaudeDesktopConfig {
  mcpServers?: Record<
    string,
    {
      command: string;
      args: string[];
      env?: Record<string, string>;
    }
  >;
}

interface SecurityConfig {
  allowedCommands: string[];
  safezones: string[];
  maxExecutionTime: number;
  maxFileSize: number;
}

interface DatabaseConfig {
  path: string;
  backupInterval: number;
}

interface LoggingConfig {
  level: string;
  pretty: boolean;
}

interface PerformanceConfig {
  maxConcurrency: number;
  queueSize: number;
}

interface CompleteServerConfig {
  server: {
    name: string;
    version: string;
  };
  security: SecurityConfig;
  database: DatabaseConfig;
  logging: LoggingConfig;
  performance: PerformanceConfig;
}

export class UIServer {
  private server: Server | null = null;
  private serverConfigPath: string;

  constructor(
    private container: Container,
    private config: ServerConfig,
    private port: number = 3001
  ) {
    this.serverConfigPath = join(process.cwd(), 'config', 'server.yaml');

    // Use the config parameter to set up initial state
    logger.debug({ configPath: this.serverConfigPath }, 'UI Server initialized with config');
  }

  start(): void {
    this.server = createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (!req.url) {
        res.writeHead(400);
        res.end('Bad Request');
        return;
      }

      const url = new URL(req.url, `http://localhost:${this.port}`);

      // Serve the UI
      if (url.pathname === '/' || url.pathname === '/ui' || url.pathname === '/config') {
        res.setHeader('Content-Type', 'text/html');
        const uiPath = join(process.cwd(), 'ui', 'config-ui.html');
        try {
          const html = readFileSync(uiPath, 'utf8');
          res.writeHead(200);
          res.end(html);
        } catch (error) {
          logger.error({ error }, 'Failed to read UI file');
          res.writeHead(404);
          res.end('Configuration UI not found. Please ensure config-ui.html is in the ui/ directory.');
        }
        return;
      }

      // API endpoints
      if (url.pathname.startsWith('/api/')) {
        this.handleAPI(req, res, url).catch((error: unknown) => {
          logger.error({ error }, 'API handler error');
          res.writeHead(500);
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          );
        });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    this.server.listen(this.port, () => {
      logger.info(`🌐 MCP Configuration Manager available at: http://localhost:${this.port}`);
      logger.info(`   Configure Claude Desktop integration and server security settings`);
    });
  }

  private async handleAPI(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    res.setHeader('Content-Type', 'application/json');

    try {
      // Platform and config path detection
      if (url.pathname === '/api/platform-info' && req.method === 'GET') {
        const platformInfo = this.getPlatformInfo();
        res.writeHead(200);
        res.end(JSON.stringify(platformInfo));
        return;
      }

      // Claude Desktop configuration endpoints
      if (url.pathname === '/api/claude-config' && req.method === 'GET') {
        const configResult = await this.getClaudeDesktopConfig();
        res.writeHead(200);
        res.end(JSON.stringify(configResult));
        return;
      }

      if (url.pathname === '/api/claude-config' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const newConfig = JSON.parse(body) as ClaudeDesktopConfig;
            const result = await this.saveClaudeDesktopConfig(newConfig);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error: unknown) {
            logger.error({ error }, 'Claude config save error');
            res.writeHead(500);
            res.end(
              JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Config save failed'
              })
            );
          }
        });
        return;
      }

      // Server configuration endpoints
      if (url.pathname === '/api/server-config' && req.method === 'GET') {
        const configResult = await this.getServerConfig();
        res.writeHead(200);
        res.end(JSON.stringify(configResult));
        return;
      }

      if (url.pathname === '/api/server-config' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const newConfig = JSON.parse(body) as Partial<CompleteServerConfig>;
            const result = await this.saveServerConfig(newConfig);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error: unknown) {
            logger.error({ error }, 'Server config save error');
            res.writeHead(500);
            res.end(
              JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Config save failed'
              })
            );
          }
        });
        return;
      }

      // Auto-detect server path
      if (url.pathname === '/api/auto-detect-path' && req.method === 'GET') {
        const pathResult = await this.autoDetectServerPath();
        res.writeHead(200);
        res.end(JSON.stringify(pathResult));
        return;
      }

      // Test configuration
      if (url.pathname === '/api/test-config' && req.method === 'POST') {
        const testResult = await this.testConfiguration();
        res.writeHead(200);
        res.end(JSON.stringify(testResult));
        return;
      }

      // Server metrics
      if (url.pathname === '/api/metrics' && req.method === 'GET') {
        const metrics = await this.getServerMetrics();
        res.writeHead(200);
        res.end(JSON.stringify(metrics));
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'API endpoint not found' }));
    } catch (error: unknown) {
      logger.error({ error }, 'API error');
      res.writeHead(500);
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'API error'
        })
      );
    }
  }

  private getPlatformInfo() {
    const currentPlatform = platform();
    const home = homedir();

    let configPath: string;

    switch (currentPlatform) {
      case 'win32':
        configPath = join(
          process.env.APPDATA || join(home, 'AppData', 'Roaming'),
          'Claude',
          'claude_desktop_config.json'
        );
        break;
      case 'darwin':
        configPath = join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
        break;
      default: // Linux and others
        configPath = join(home, '.config', 'claude', 'claude_desktop_config.json');
        break;
    }

    return {
      platform: currentPlatform,
      platformName: this.getPlatformDisplayName(currentPlatform),
      configPath,
      home,
      serverConfigPath: this.serverConfigPath
    };
  }

  private getPlatformDisplayName(platform: string): string {
    switch (platform) {
      case 'win32':
        return 'Windows';
      case 'darwin':
        return 'macOS';
      case 'linux':
        return 'Linux';
      default:
        return platform;
    }
  }

  private async getClaudeDesktopConfig(): Promise<{ exists: boolean; config?: ClaudeDesktopConfig; error?: string }> {
    const platformInfo = this.getPlatformInfo();

    try {
      // Check if config file exists
      await fs.access(platformInfo.configPath);

      // Read and parse the config
      const configContent = await fs.readFile(platformInfo.configPath, 'utf8');
      const config = JSON.parse(configContent) as ClaudeDesktopConfig;

      return {
        exists: true,
        config
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        return {
          exists: false,
          config: { mcpServers: {} }
        };
      } else {
        logger.error({ error, path: platformInfo.configPath }, 'Failed to read Claude Desktop config');
        return {
          exists: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  }

  private async saveClaudeDesktopConfig(config: ClaudeDesktopConfig): Promise<{ success: boolean; error?: string }> {
    const platformInfo = this.getPlatformInfo();

    try {
      // Ensure the directory exists
      const configDir = dirname(platformInfo.configPath);
      await fs.mkdir(configDir, { recursive: true });

      // Write the configuration
      const configContent = JSON.stringify(config, null, 2);
      await fs.writeFile(platformInfo.configPath, configContent, 'utf8');

      logger.info({ path: platformInfo.configPath }, 'Claude Desktop configuration saved');

      return { success: true };
    } catch (error) {
      logger.error({ error, path: platformInfo.configPath }, 'Failed to save Claude Desktop config');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async getServerConfig(): Promise<{ exists: boolean; config?: CompleteServerConfig; error?: string }> {
    try {
      // Check if config file exists
      await fs.access(this.serverConfigPath);

      // Read and parse the YAML config
      const configContent = await fs.readFile(this.serverConfigPath, 'utf8');
      const config = yaml.parse(configContent) as CompleteServerConfig;

      return {
        exists: true,
        config
      };
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        // Return default configuration
        const defaultConfig: CompleteServerConfig = {
          server: {
            name: this.config.server?.name || 'mcp-context-server',
            version: this.config.server?.version || '1.0.0'
          },
          security: {
            allowedCommands: Array.isArray(this.config.security?.allowedCommands)
              ? this.config.security.allowedCommands
              : ['ls', 'cat', 'grep', 'find', 'echo', 'pwd', 'whoami'],
            safezones: this.config.security?.safezones || ['.', '/tmp'],
            maxExecutionTime: this.config.security?.maxExecutionTime || 30000,
            maxFileSize: this.config.security?.maxFileSize || 10485760
          },
          database: {
            path: this.config.database?.path || './data/context.db',
            backupInterval: this.config.database?.backupInterval || 60
          },
          logging: {
            level: this.config.logging?.level || 'info',
            pretty: this.config.logging?.pretty !== false
          },
          performance: {
            maxConcurrency: this.config.performance?.maxConcurrency || 10,
            queueSize: this.config.performance?.queueSize || 1000
          }
        };

        return {
          exists: false,
          config: defaultConfig
        };
      } else {
        logger.error({ error, path: this.serverConfigPath }, 'Failed to read server config');
        return {
          exists: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        };
      }
    }
  }

  private async saveServerConfig(
    newConfig: Partial<CompleteServerConfig>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      // Get current config first
      const currentResult = await this.getServerConfig();
      const currentConfig = currentResult.config || ({} as CompleteServerConfig);

      // Merge configurations
      const mergedConfig: CompleteServerConfig = {
        server: {
          ...currentConfig.server,
          ...newConfig.server
        },
        security: {
          ...currentConfig.security,
          ...newConfig.security
        },
        database: {
          ...currentConfig.database,
          ...newConfig.database
        },
        logging: {
          ...currentConfig.logging,
          ...newConfig.logging
        },
        performance: {
          ...currentConfig.performance,
          ...newConfig.performance
        }
      };

      // Ensure the directory exists
      const configDir = dirname(this.serverConfigPath);
      await fs.mkdir(configDir, { recursive: true });

      // Write the configuration as YAML
      const configContent = yaml.stringify(mergedConfig);
      await fs.writeFile(this.serverConfigPath, configContent, 'utf8');

      logger.info({ path: this.serverConfigPath }, 'Server configuration saved');

      return { success: true };
    } catch (error) {
      logger.error({ error, path: this.serverConfigPath }, 'Failed to save server config');
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async autoDetectServerPath(): Promise<{ found: boolean; path?: string; error?: string }> {
    try {
      const currentDir = process.cwd();
      const possiblePaths = [
        join(currentDir, 'dist', 'index.js'),
        join(currentDir, 'build', 'index.js'),
        join(currentDir, 'lib', 'index.js')
      ];

      for (const path of possiblePaths) {
        try {
          await fs.access(path);
          // Verify it's actually our server by checking for key content
          const content = await fs.readFile(path, 'utf8');
          if (content.includes('MCP') || content.includes('context') || content.includes('server')) {
            return {
              found: true,
              path: resolve(path) // Return absolute path
            };
          }
        } catch {
          // Path doesn't exist, continue
        }
      }

      return {
        found: false,
        error: 'Could not find built server. Please run "npm run build" first.'
      };
    } catch (error) {
      return {
        found: false,
        error: error instanceof Error ? error.message : 'Auto-detection failed'
      };
    }
  }

  private async testConfiguration(): Promise<{ success: boolean; errors?: string[]; warnings?: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];

    try {
      // Test server config
      const serverConfig = await this.getServerConfig();
      if (!serverConfig.exists) {
        warnings.push('Server configuration file not found - using defaults');
      }

      // Test Claude Desktop config
      const claudeConfig = await this.getClaudeDesktopConfig();
      if (!claudeConfig.exists) {
        warnings.push('Claude Desktop configuration not found');
      }

      // Test server path
      const pathTest = await this.autoDetectServerPath();
      if (!pathTest.found) {
        errors.push('Server executable not found - please build the server first');
      }

      // Test database directory
      if (serverConfig.config?.database?.path) {
        const dbPath = serverConfig.config.database.path;
        const dbDir = dirname(resolve(dbPath));
        try {
          await fs.access(dbDir);
        } catch {
          try {
            await fs.mkdir(dbDir, { recursive: true });
            warnings.push(`Created database directory: ${dbDir}`);
          } catch (error) {
            errors.push(`Cannot access or create database directory: ${dbDir}`);
          }
        }
      }

      // Test safezones
      if (serverConfig.config?.security?.safezones) {
        for (const safezone of serverConfig.config.security.safezones) {
          try {
            const resolvedPath = resolve(safezone);
            await fs.access(resolvedPath);
          } catch {
            warnings.push(`Safezone directory not accessible: ${safezone}`);
          }
        }
      }

      return {
        success: errors.length === 0,
        errors: errors.length > 0 ? errors : undefined,
        warnings: warnings.length > 0 ? warnings : undefined
      };
    } catch (error) {
      return {
        success: false,
        errors: [error instanceof Error ? error.message : 'Configuration test failed']
      };
    }
  }

  private async getServerMetrics(): Promise<Record<string, unknown>> {
    // Use container to check if services are available
    const hasContainer = this.container !== null;

    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: platform(),
      containerServices: hasContainer,
      configUI: {
        version: '2.0.0',
        features: [
          'claude-desktop-config',
          'server-security-config',
          'command-management',
          'safezone-management',
          'auto-detection',
          'configuration-testing'
        ]
      }
    };
  }

  stop(): void {
    if (this.server) {
      this.server.close((error?: Error) => {
        if (error) {
          logger.error({ error }, 'Error closing UI server');
        } else {
          logger.info('Configuration UI server closed successfully');
        }
      });
      this.server = null;
    }
  }
}
