// Complete Configuration Management Server
// File: src/presentation/ui-server.ts

import { createServer } from 'http';
import type { Server } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import { readFileSync, promises as fs } from 'fs';
import { join, resolve, dirname } from 'path';
import { homedir, platform } from 'os';
import * as yaml from 'yaml';
// import type { Container } from 'inversify'; // No longer needed here
import type { ServerConfig } from '../infrastructure/config/types.js';
import { logger } from '../utils/logger.js';
import { configSchema } from '../infrastructure/config/config-loader.js';

interface ClaudeDesktopServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface ClaudeDesktopConfig {
  mcpServers?: Record<string, ClaudeDesktopServerEntry>;
}

interface CompleteServerConfig extends ServerConfig {}

// Helper function to get Claude Desktop config path
function getClaudeDesktopConfigPathInternal(): string {
  const currentPlatform = platform();
  const home = homedir();
  switch (currentPlatform) {
    case 'win32':
      return join(process.env.APPDATA || join(home, 'AppData', 'Roaming'), 'Claude', 'claude_desktop_config.json');
    case 'darwin':
      return join(home, 'Library', 'Application Support', 'Claude', 'claude_desktop_config.json');
    default: // Linux and other Unix-like
      return join(home, '.config', 'claude', 'claude_desktop_config.json');
  }
}

export class UIServer {
  private server: Server | null = null;
  private serverConfigPath: string;
  private projectRoot: string;

  constructor(
    // Container removed as it's not used by UIServer directly
    // private container: Container,
    _initialConfig: ServerConfig,
    private port: number = 3001
  ) {
    // Determine project root relative to this file's location
    // Assumes this file is in src/presentation/ and project root is two levels up.
    // Using import.meta.url requires Node.js to be in ESM mode for this file.
    let currentFilePath = '';
    try {
      currentFilePath = dirname(decodeURI(new URL(import.meta.url).pathname));
    } catch (e) {
      // Fallback for environments where import.meta.url might not behave as expected
      // or if running in a context where it's not available (e.g. certain bundlers/transpilers without proper config)
      currentFilePath = __dirname;
      logger.warn('Using __dirname as fallback for UIServer path resolution. Ensure ESM context if issues arise.');
    }
    this.projectRoot = resolve(currentFilePath, '..', '..');
    this.serverConfigPath = join(this.projectRoot, 'config', 'server.yaml');
    logger.debug({ configPath: this.serverConfigPath, projectRoot: this.projectRoot }, 'UI Server initialized');
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
        const uiPath = join(this.projectRoot, 'ui', 'config-ui.html');
        try {
          const html = readFileSync(uiPath, 'utf8');
          res.writeHead(200);
          res.end(html);
        } catch (error) {
          logger.error({ error, uiPath }, 'Failed to read UI file');
          res.writeHead(404);
          res.end(
            'Configuration UI not found. Please ensure config-ui.html is in the ui/ directory relative to project root.'
          );
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
            const serverDetails = JSON.parse(body) as {
              serverName: string;
              serverExecutablePath: string;
              logLevel: string;
            };
            const result = await this.updateAndSaveClaudeDesktopConfig(serverDetails);
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

      if (url.pathname === '/api/claude-config/remove' && req.method === 'POST') {
        // New endpoint for removal
        let body = '';
        req.on('data', chunk => {
          body += chunk.toString();
        });
        req.on('end', async () => {
          try {
            const { serverName } = JSON.parse(body);
            if (!serverName) throw new Error('serverName is required for removal.');
            const result = await this.removeServerFromClaudeDesktopConfig(serverName);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error) {
            logger.error({ error }, 'Claude config remove server error');
            res.writeHead(500);
            res.end(
              JSON.stringify({
                success: false,
                error: error instanceof Error ? error.message : 'Server removal failed'
              })
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
    return {
      platform: currentPlatform,
      platformName: this.getPlatformDisplayName(currentPlatform),
      claudeConfigPath: getClaudeDesktopConfigPathInternal(),
      home,
      serverConfigPath: this.serverConfigPath,
      projectRoot: this.projectRoot
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
    const claudeConfigPath = getClaudeDesktopConfigPathInternal();
    try {
      await fs.access(claudeConfigPath);
      const configContent = await fs.readFile(claudeConfigPath, 'utf8');
      const configData = JSON.parse(configContent) as ClaudeDesktopConfig;
      return { exists: true, config: configData };
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') {
        return { exists: false, config: { mcpServers: {} } };
      }
      logger.error({ error, path: claudeConfigPath }, 'Failed to read Claude Desktop config');
      return { exists: false, error: error instanceof Error ? error.message : 'Unknown error reading Claude config' };
    }
  }

  private async updateAndSaveClaudeDesktopConfig(serverDetails: {
    serverName: string;
    serverExecutablePath: string;
    logLevel: string;
  }): Promise<{ success: boolean; config?: ClaudeDesktopConfig; error?: string }> {
    const claudeConfigPath = getClaudeDesktopConfigPathInternal();
    try {
      let currentConfigData: ClaudeDesktopConfig;
      try {
        const configContent = await fs.readFile(claudeConfigPath, 'utf8');
        currentConfigData = JSON.parse(configContent);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          currentConfigData = { mcpServers: {} };
        } else {
          throw error;
        }
      }

      if (!currentConfigData.mcpServers) {
        currentConfigData.mcpServers = {};
      }

      const defaultMcpServerConfigPath = resolve(this.projectRoot, 'config', 'server.yaml');

      currentConfigData.mcpServers[serverDetails.serverName] = {
        command: 'node',
        args: [serverDetails.serverExecutablePath],
        env: {
          MCP_LOG_LEVEL: serverDetails.logLevel,
          MCP_SERVER_CONFIG_PATH: defaultMcpServerConfigPath
        }
      };

      const configDir = dirname(claudeConfigPath);
      await fs.mkdir(configDir, { recursive: true });
      await fs.writeFile(claudeConfigPath, JSON.stringify(currentConfigData, null, 2), 'utf8');
      logger.info(
        { path: claudeConfigPath, serverName: serverDetails.serverName },
        'Claude Desktop configuration updated and saved'
      );
      return { success: true, config: currentConfigData };
    } catch (error) {
      logger.error({ error, path: claudeConfigPath }, 'Failed to update and save Claude Desktop config');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error during save' };
    }
  }

  private async removeServerFromClaudeDesktopConfig(
    serverName: string
  ): Promise<{ success: boolean; config?: ClaudeDesktopConfig; error?: string }> {
    const claudeConfigPath = getClaudeDesktopConfigPathInternal();
    try {
      let currentConfigData: ClaudeDesktopConfig;
      try {
        const configContent = await fs.readFile(claudeConfigPath, 'utf8');
        currentConfigData = JSON.parse(configContent);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
          logger.warn(
            { path: claudeConfigPath, serverName },
            "Tried to remove server, but Claude config file doesn't exist."
          );
          return { success: true, config: { mcpServers: {} } };
        }
        throw error;
      }

      if (currentConfigData.mcpServers && currentConfigData.mcpServers[serverName]) {
        delete currentConfigData.mcpServers[serverName];
        const configDir = dirname(claudeConfigPath);
        await fs.mkdir(configDir, { recursive: true });
        await fs.writeFile(claudeConfigPath, JSON.stringify(currentConfigData, null, 2), 'utf8');
        logger.info({ path: claudeConfigPath, serverName }, 'Server removed from Claude Desktop configuration');
        return { success: true, config: currentConfigData };
      } else {
        logger.warn(
          { path: claudeConfigPath, serverName },
          'Server to remove not found in Claude Desktop configuration.'
        );
        return { success: true, config: currentConfigData };
      }
    } catch (error) {
      logger.error({ error, path: claudeConfigPath, serverName }, 'Failed to remove server from Claude Desktop config');
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error during server removal' };
    }
  }

  private async getServerConfig(): Promise<{ exists: boolean; config?: CompleteServerConfig; error?: string }> {
    try {
      await fs.access(this.serverConfigPath);
      const configContent = await fs.readFile(this.serverConfigPath, 'utf8');
      const configData = yaml.parse(configContent) as CompleteServerConfig;

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
      const currentConfigData = currentResult.config || (configSchema.getProperties() as CompleteServerConfig);

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
      const currentDir = this.projectRoot;
      const possiblePaths = [
        join(currentDir, 'dist', 'index.js'),
        join(currentDir, 'build', 'index.js'),
        join(currentDir, 'lib', 'index.js')
      ];
      for (const p of possiblePaths) {
        try {
          await fs.access(p);
          const content = await fs.readFile(p, 'utf8');
          if (content.includes('MCPContextServer') || content.includes('@modelcontextprotocol/sdk')) {
            return { found: true, path: resolve(p) };
          }
        } catch {
          /* Path doesn't exist or not our server, continue */
        }
      }
      return {
        found: false,
        error: 'Could not find built server (e.g., dist/index.js). Please run "npm run build" first.'
      };
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
        warnings.push('Server configuration file (e.g., config/server.yaml) not found - using defaults.');
      }
      const serverConfigData = serverConfigResult.config;

      const claudeConfigResult = await this.getClaudeDesktopConfig();
      if (!claudeConfigResult.exists) {
        warnings.push(`Claude Desktop configuration file (${this.getPlatformInfo().claudeConfigPath}) not found.`);
      } else if (
        claudeConfigResult.config &&
        (!claudeConfigResult.config.mcpServers || Object.keys(claudeConfigResult.config.mcpServers).length === 0)
      ) {
        warnings.push('Claude Desktop configuration found, but no MCP servers are defined in it.');
      }

      const pathTest = await this.autoDetectServerPath();
      if (!pathTest.found) {
        errors.push(
          'Server executable (e.g., dist/index.js) not found. Please build the server first (`npm run build`).'
        );
      }
      if (serverConfigData?.database?.path) {
        const dbDir = dirname(serverConfigData.database.path);
        try {
          await fs.access(dbDir);
        } catch {
          try {
            await fs.mkdir(dbDir, { recursive: true });
            warnings.push(`Created database directory: ${dbDir}`);
          } catch (mkdirError) {
            errors.push(
              `Cannot access or create database directory: ${dbDir}. Error: ${mkdirError instanceof Error ? mkdirError.message : String(mkdirError)}`
            );
          }
        }
      }
      if (serverConfigData?.security?.safezones) {
        for (const safezone of serverConfigData.security.safezones) {
          try {
            await fs.access(resolve(this.projectRoot, safezone));
          } catch {
            warnings.push(
              `Configured safezone directory not accessible from project root: ${safezone} (resolved to ${resolve(this.projectRoot, safezone)})`
            );
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
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: platform(),
      configUI: {
        version: '2.2.0',
        features: [
          'claude-desktop-config-read-write',
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
