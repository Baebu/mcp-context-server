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
import { configSchema } from '../infrastructure/config/config-loader.js';

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

interface CompleteServerConfig extends ServerConfig {}

export class UIServer {
  private server: Server | null = null;
  private serverConfigPath: string;

  constructor(
    private container: Container, // container is used
    _initialConfig: ServerConfig, // Mark as unused or remove if not needed for future ref
    private port: number = 3001
  ) {
    this.serverConfigPath = join(process.cwd(), 'config', 'server.yaml');
    // The _initialConfig was passed but not stored on `this` for later use by UIServer itself.
    // It's primarily used by the calling script (scripts/config-ui.ts) to bind to the container.
    logger.debug({ configPath: this.serverConfigPath }, 'UI Server initialized');
  }

  start(): void {
    this.server = createServer((req, res) => {
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
      if (url.pathname === '/api/platform-info' && req.method === 'GET') {
        const platformInfo = this.getPlatformInfo();
        res.writeHead(200);
        res.end(JSON.stringify(platformInfo));
        return;
      }

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
              JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Config save failed' })
            );
          }
        });
        return;
      }

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
            const newConfigPartial = JSON.parse(body) as Partial<CompleteServerConfig>;
            const result = await this.saveServerConfig(newConfigPartial);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error: unknown) {
            logger.error({ error }, 'Server config save error');
            res.writeHead(500);
            res.end(
              JSON.stringify({ success: false, error: error instanceof Error ? error.message : 'Config save failed' })
            );
          }
        });
        return;
      }

      if (url.pathname === '/api/auto-detect-path' && req.method === 'GET') {
        const pathResult = await this.autoDetectServerPath();
        res.writeHead(200);
        res.end(JSON.stringify(pathResult));
        return;
      }

      if (url.pathname === '/api/test-config' && req.method === 'POST') {
        const testResult = await this.testConfiguration();
        res.writeHead(200);
        res.end(JSON.stringify(testResult));
        return;
      }

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
      res.end(JSON.stringify({ error: error instanceof Error ? error.message : 'API error' }));
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
      default:
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

  private getPlatformDisplayName(platformStr: string): string {
    switch (platformStr) {
      case 'win32':
        return 'Windows';
      case 'darwin':
        return 'macOS';
      case 'linux':
        return 'Linux';
      default:
        return platformStr;
    }
  }

  private async getClaudeDesktopConfig(): Promise<{ exists: boolean; config?: ClaudeDesktopConfig; error?: string }> {
    const platformInfo = this.getPlatformInfo();
    try {
      await fs.access(platformInfo.configPath);
      const configContent = await fs.readFile(platformInfo.configPath, 'utf8');
      const configData = JSON.parse(configContent) as ClaudeDesktopConfig; // Renamed to avoid conflict
      return { exists: true, config: configData };
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        return { exists: false, config: { mcpServers: {} } };
      }
      logger.error({ error, path: platformInfo.configPath }, 'Failed to read Claude Desktop config');
      return { exists: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async saveClaudeDesktopConfig(
    configData: ClaudeDesktopConfig
  ): Promise<{ success: boolean; error?: string }> {
    // Renamed to avoid conflict
    const platformInfo = this.getPlatformInfo();
    try {
      const configDir = dirname(platformInfo.configPath);
      await fs.mkdir(configDir, { recursive: true });
      const configContent = JSON.stringify(configData, null, 2);
      await fs.writeFile(platformInfo.configPath, configContent, 'utf8');
      logger.info({ path: platformInfo.configPath }, 'Claude Desktop configuration saved');
      return { success: true };
    } catch (error) {
      logger.error({ error, path: platformInfo.configPath }, 'Failed to save Claude Desktop config');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async getServerConfig(): Promise<{ exists: boolean; config?: CompleteServerConfig; error?: string }> {
    try {
      await fs.access(this.serverConfigPath);
      const configContent = await fs.readFile(this.serverConfigPath, 'utf8');
      const configData = yaml.parse(configContent) as CompleteServerConfig; // Renamed

      if (!configData.security.unsafeArgumentPatterns) {
        configData.security.unsafeArgumentPatterns = configSchema.get('security.unsafeArgumentPatterns') as string[];
      }

      return { exists: true, config: configData };
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        const defaults = configSchema.getProperties() as CompleteServerConfig;
        return { exists: false, config: defaults };
      }
      logger.error({ error, path: this.serverConfigPath }, 'Failed to read server config');
      return { exists: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  private async saveServerConfig(
    newConfigPartial: Partial<CompleteServerConfig>
  ): Promise<{ success: boolean; error?: string }> {
    try {
      const currentResult = await this.getServerConfig();
      const currentConfigData = currentResult.config || (configSchema.getProperties() as CompleteServerConfig); // Renamed

      const mergedConfig: CompleteServerConfig = {
        ...currentConfigData,
        ...newConfigPartial,
        server: { ...currentConfigData.server, ...newConfigPartial.server },
        security: { ...currentConfigData.security, ...newConfigPartial.security },
        database: { ...currentConfigData.database, ...newConfigPartial.database },
        logging: { ...currentConfigData.logging, ...newConfigPartial.logging },
        performance: { ...currentConfigData.performance, ...newConfigPartial.performance }
      };

      if (newConfigPartial.security && newConfigPartial.security.unsafeArgumentPatterns === undefined) {
        mergedConfig.security.unsafeArgumentPatterns =
          currentConfigData.security.unsafeArgumentPatterns ||
          (configSchema.get('security.unsafeArgumentPatterns') as string[]);
      } else if (newConfigPartial.security && !Array.isArray(newConfigPartial.security.unsafeArgumentPatterns)) {
        mergedConfig.security.unsafeArgumentPatterns = configSchema.get('security.unsafeArgumentPatterns') as string[];
      }

      const configDir = dirname(this.serverConfigPath);
      await fs.mkdir(configDir, { recursive: true });
      const configContent = yaml.stringify(mergedConfig);
      await fs.writeFile(this.serverConfigPath, configContent, 'utf8');
      logger.info({ path: this.serverConfigPath }, 'Server configuration saved');
      return { success: true };
    } catch (error) {
      logger.error({ error, path: this.serverConfigPath }, 'Failed to save server config');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
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
      for (const p of possiblePaths) {
        try {
          await fs.access(p);
          const content = await fs.readFile(p, 'utf8');
          if (content.includes('MCP') || content.includes('context') || content.includes('server')) {
            return { found: true, path: resolve(p) };
          }
        } catch {
          /* Path doesn't exist or not our server, continue */
        }
      }
      return { found: false, error: 'Could not find built server. Please run "npm run build" first.' };
    } catch (error) {
      return { found: false, error: error instanceof Error ? error.message : 'Auto-detection failed' };
    }
  }

  private async testConfiguration(): Promise<{ success: boolean; errors?: string[]; warnings?: string[] }> {
    const errors: string[] = [];
    const warnings: string[] = [];
    try {
      const serverConfigResult = await this.getServerConfig();
      if (!serverConfigResult.exists) {
        warnings.push('Server configuration file not found - using defaults');
      }
      const serverConfigData = serverConfigResult.config; // Renamed

      const claudeConfigResult = await this.getClaudeDesktopConfig(); // Renamed
      if (!claudeConfigResult.exists) {
        warnings.push('Claude Desktop configuration not found');
      }
      const pathTest = await this.autoDetectServerPath();
      if (!pathTest.found) {
        errors.push('Server executable not found - please build the server first');
      }
      if (serverConfigData?.database?.path) {
        const dbDir = dirname(resolve(serverConfigData.database.path));
        try {
          await fs.access(dbDir);
        } catch {
          try {
            await fs.mkdir(dbDir, { recursive: true });
            warnings.push(`Created database directory: ${dbDir}`);
          } catch {
            errors.push(`Cannot access or create database directory: ${dbDir}`);
          }
        }
      }
      if (serverConfigData?.security?.safezones) {
        for (const safezone of serverConfigData.security.safezones) {
          try {
            await fs.access(resolve(safezone));
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
      return { success: false, errors: [error instanceof Error ? error.message : 'Configuration test failed'] };
    }
  }

  private async getServerMetrics(): Promise<Record<string, unknown>> {
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
        version: '2.1.0',
        features: [
          'claude-desktop-config',
          'server-security-config',
          'command-management',
          'safezone-management',
          'unsafe-argument-pattern-management',
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
