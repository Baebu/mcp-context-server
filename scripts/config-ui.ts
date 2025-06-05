#!/usr/bin/env node

/**
 * Standalone Configuration UI Runner
 *
 * Runs a lightweight HTTP server to manage MCP Context Server configuration files
 * (server.yaml and Claude Desktop integration) without starting the main MCP server.
 */

import { createServer, IncomingMessage, ServerResponse } from 'http';
import { promises as fs, readFileSync } from 'fs';
import { join, resolve, dirname } from 'path';
import { homedir, platform as osPlatform } from 'os';
import * as yaml from 'yaml'; // Import the yaml library
import { URL } from 'url';
import { fileURLToPath } from 'node:url';

// Assuming logger and configSchema are accessible relative to this script's new context
// Adjust paths if necessary, or ensure they are self-contained or easily portable.
// For simplicity, we'll re-import minimal logger and schema logic if they were complex.
// However, for this project, they are likely okay to import directly.
import { logger } from '../src/utils/logger.js'; // Adjust path as needed
import { configSchema, ServerConfig } from '../src/infrastructure/config/schema.js'; // Adjust path
import { SafeZoneMode } from '../src/infrastructure/config/types.js'; // Adjust path

const PORT = 3001;
const MB = 1024 * 1024; // Define MB for convenience

// --- Path Setup ---
let SCRIPT_DIR = '';
try {
  SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
} catch (e) {
  SCRIPT_DIR = __dirname; // Fallback for environments where import.meta.url might not work as expected
  logger.warn(
    { error: e },
    'Failed to use import.meta.url for SCRIPT_DIR. Falling back to __dirname. This might be unreliable.'
  );
}
const PROJECT_ROOT = resolve(SCRIPT_DIR, '..');
const SERVER_CONFIG_YAML_PATH = join(PROJECT_ROOT, 'config', 'server.yaml');
const UI_HTML_PATH = join(PROJECT_ROOT, 'ui', 'config-ui.html');
const DIST_INDEX_JS_PATH = join(PROJECT_ROOT, 'dist', 'index.js');

interface ClaudeDesktopServerEntry {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

interface ClaudeDesktopConfig {
  mcpServers?: Record<string, ClaudeDesktopServerEntry>;
}

// --- Helper Functions ---
function getClaudeDesktopConfigPath(): string {
  const currentPlatform = osPlatform();
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

function getPlatformDisplayName(platformStr: string): string {
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

async function readJsonFile<T>(filePath: string, defaultVal: T): Promise<{ exists: boolean; data: T; error?: string }> {
  try {
    await fs.access(filePath);
    const content = await fs.readFile(filePath, 'utf8');
    return { exists: true, data: JSON.parse(content) as T };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { exists: false, data: defaultVal };
    }
    logger.error({ error, path: filePath }, `Failed to read JSON file ${filePath}`);
    return { exists: false, data: defaultVal, error: error instanceof Error ? error.message : String(error) };
  }
}

async function writeJsonFile<T>(filePath: string, data: T): Promise<{ success: boolean; error?: string }> {
  try {
    const fileDir = dirname(filePath);
    await fs.mkdir(fileDir, { recursive: true });
    await fs.writeFile(filePath, JSON.stringify(data, null, 2), 'utf8');
    logger.info({ path: filePath }, `JSON file saved: ${filePath}`);
    return { success: true };
  } catch (error) {
    logger.error({ error, path: filePath }, `Failed to write JSON file ${filePath}`);
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

const getDefaultServerConfig = (): ServerConfig => {
  try {
    return configSchema.parse({});
  } catch (e) {
    logger.error({ error: e }, 'Failed to parse default config with Zod, returning hardcoded minimum.');
    // Fallback to a minimal structure if Zod parsing fails (should ideally not happen with an empty object)
    return {
      server: {
        name: 'mcp-context-server',
        version: '2.0.0',
        port: 3000,
        host: 'localhost',
        transport: 'stdio',
        workingDirectory: PROJECT_ROOT,
        fastmcp: { enabled: true, sessionTimeout: 86400000, progressReporting: true, authentication: true }
      },
      security: {
        safeZoneMode: SafeZoneMode.RECURSIVE,
        allowedPaths: [],
        maxFileSize: 10 * MB,
        enableAuditLog: false,
        sessionTimeout: 0,
        maxSessions: 0,
        allowedCommands: [],
        restrictedZones: [],
        safezones: ['.'],
        maxExecutionTime: 30000,
        unsafeArgumentPatterns: [],
        autoExpandSafezones: true,
        blockedPathPatterns: [],
        processKillGracePeriodMs: 5000,
        maxConcurrentProcesses: 5,
        maxProcessMemoryMB: 512,
        maxProcessCpuPercent: 80,
        defaultTimeoutMs: 30000,
        maxTimeoutMs: 300000,
        cleanupIntervalMs: 60000,
        resourceCheckIntervalMs: 5000,
        enableProcessMonitoring: true
      },
      database: {
        path: './data/context.db',
        poolSize: 1,
        walMode: true,
        busyTimeout: 5000,
        cacheSize: 1000,
        backupInterval: 0,
        vacuum: { enabled: false, schedule: '', threshold: 0 },
        vectorStorage: { enabled: false, embeddingDimensions: 384, similarityThreshold: 0.7 }
      },
      logging: {
        level: 'info',
        pretty: true,
        file: { enabled: false, path: '', maxSize: 0, maxFiles: 0, rotateDaily: false },
        audit: { enabled: false, path: '', maxSize: 0, maxFiles: 0 }
      },
      performance: {
        maxConcurrency: 5,
        queueSize: 100,
        timeouts: { default: 30000, fileOperations: 30000, databaseOperations: 30000, semanticSearch: 30000 },
        rateLimiting: { enabled: false, windowMs: 0, maxRequests: 0 }
      },
      memory: {
        maxContextTokens: 1024,
        maxMemoryMB: 256,
        cacheSize: 100,
        gcInterval: 60000,
        optimizer: { enabled: false, gcThreshold: 0, monitoringInterval: 0, chunkSize: 0 },
        embeddingCache: { maxSize: 0, ttl: 0 },
        relevanceCache: { maxSize: 0, ttl: 0 }
      },
      plugins: {
        directory: '',
        autoDiscover: false,
        sandbox: false,
        maxPlugins: 0,
        enabled: [],
        disabled: [],
        maxLoadTime: 0,
        security: { allowNetworkAccess: false, allowFileSystemAccess: false, allowProcessExecution: false }
      },
      features: {
        fastmcpIntegration: false,
        semanticMemory: false,
        vectorStorage: false,
        enhancedSecurity: false,
        memoryOptimization: false,
        pluginSystem: false,
        advancedBackup: false,
        realTimeMonitoring: false,
        sessionManagement: false,
        auditLogging: false
      }
      // No consent or ui sections
    } as ServerConfig; // Cast as ServerConfig, ensure all required fields are present
  }
};

async function readServerConfigFile(): Promise<{ exists: boolean; config?: ServerConfig; error?: string }> {
  try {
    await fs.access(SERVER_CONFIG_YAML_PATH);
    const content = await fs.readFile(SERVER_CONFIG_YAML_PATH, 'utf8');
    const configData = yaml.parse(content) as ServerConfig;
    // Ensure security.unsafeArgumentPatterns exists and is an array
    if (configData.security && typeof configData.security.unsafeArgumentPatterns === 'undefined') {
      configData.security.unsafeArgumentPatterns = [];
    }
    return { exists: true, config: configData };
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
      return { exists: false, config: getDefaultServerConfig() };
    }
    logger.error({ error, path: SERVER_CONFIG_YAML_PATH }, 'Failed to read server config YAML');
    return {
      exists: false,
      config: getDefaultServerConfig(),
      error: error instanceof Error ? error.message : String(error)
    };
  }
}

async function writeServerConfigFile(
  newConfigPartial: Partial<ServerConfig>
): Promise<{ success: boolean; error?: string }> {
  try {
    const current = await readServerConfigFile();
    const currentConfigData = current.config || getDefaultServerConfig();

    const rawMerged = {
      ...currentConfigData,
      ...newConfigPartial,
      server: { ...currentConfigData.server, ...newConfigPartial.server },
      security: { ...currentConfigData.security, ...newConfigPartial.security },
      database: { ...currentConfigData.database, ...newConfigPartial.database },
      logging: { ...currentConfigData.logging, ...newConfigPartial.logging },
      performance: { ...currentConfigData.performance, ...newConfigPartial.performance },
      features: { ...(currentConfigData.features || {}), ...(newConfigPartial.features || {}) },
      memory: { ...currentConfigData.memory, ...newConfigPartial.memory },
      plugins: { ...currentConfigData.plugins, ...newConfigPartial.plugins },
      development: { ...currentConfigData.development, ...newConfigPartial.development },
      semanticSearch: { ...currentConfigData.semanticSearch, ...newConfigPartial.semanticSearch },
      backup: { ...currentConfigData.backup, ...newConfigPartial.backup },
      monitoring: { ...currentConfigData.monitoring, ...newConfigPartial.monitoring }
    };

    if (rawMerged.security && rawMerged.security.unsafeArgumentPatterns === undefined) {
      rawMerged.security.unsafeArgumentPatterns = currentConfigData.security?.unsafeArgumentPatterns || [];
    } else if (rawMerged.security && !Array.isArray(rawMerged.security.unsafeArgumentPatterns)) {
      rawMerged.security.unsafeArgumentPatterns = [];
    }

    const validatedConfig = configSchema.parse(rawMerged);
    const yamlContent = yaml.stringify(validatedConfig, { indent: 2 }); // Use yaml.stringify

    const configDir = dirname(SERVER_CONFIG_YAML_PATH);
    await fs.mkdir(configDir, { recursive: true });
    await fs.writeFile(SERVER_CONFIG_YAML_PATH, yamlContent, 'utf8');
    logger.info({ path: SERVER_CONFIG_YAML_PATH }, 'Server YAML configuration saved');
    return { success: true };
  } catch (error) {
    logger.error({ error, path: SERVER_CONFIG_YAML_PATH }, 'Failed to save server YAML config');
    return { success: false, error: error instanceof Error ? error.message : String(error) };
  }
}

// --- HTTP Server Logic ---
const server = createServer(async (req: IncomingMessage, res: ServerResponse) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204); // No Content for OPTIONS
    res.end();
    return;
  }

  if (!req.url) {
    res.writeHead(400);
    res.end('Bad Request: URL is missing.');
    return;
  }

  const parsedUrl = new URL(req.url, `http://${req.headers.host || `localhost:${PORT}`}`);

  try {
    if (parsedUrl.pathname === '/' || parsedUrl.pathname === '/ui' || parsedUrl.pathname === '/config') {
      try {
        const html = readFileSync(UI_HTML_PATH, 'utf8');
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(html);
      } catch (error) {
        logger.error({ error, uiPath: UI_HTML_PATH }, 'Failed to read UI HTML file');
        res.writeHead(500);
        res.end('Error loading UI. Check server logs.');
      }
      return;
    }

    // API Endpoints
    if (parsedUrl.pathname.startsWith('/api/')) {
      res.setHeader('Content-Type', 'application/json');
      let reqBody = '';
      req.on('data', chunk => {
        reqBody += chunk.toString();
      });
      await new Promise(resolve => req.on('end', resolve)); // Wait for body

      if (parsedUrl.pathname === '/api/platform-info' && req.method === 'GET') {
        res.writeHead(200).end(
          JSON.stringify({
            platform: osPlatform(),
            platformName: getPlatformDisplayName(osPlatform()),
            claudeConfigPath: getClaudeDesktopConfigPath(),
            home: homedir(),
            serverConfigPath: SERVER_CONFIG_YAML_PATH,
            projectRoot: PROJECT_ROOT
          })
        );
      } else if (parsedUrl.pathname === '/api/claude-config' && req.method === 'GET') {
        const result = await readJsonFile<ClaudeDesktopConfig>(getClaudeDesktopConfigPath(), { mcpServers: {} });
        res.writeHead(200).end(JSON.stringify({ exists: result.exists, config: result.data, error: result.error }));
      } else if (parsedUrl.pathname === '/api/claude-config' && req.method === 'POST') {
        const { serverName, serverExecutablePath, logLevel } = JSON.parse(reqBody) as {
          serverName: string;
          serverExecutablePath: string;
          logLevel: string;
        };
        const claudeConfig = await readJsonFile<ClaudeDesktopConfig>(getClaudeDesktopConfigPath(), { mcpServers: {} });
        const currentData = claudeConfig.data;
        if (!currentData.mcpServers) currentData.mcpServers = {};
        currentData.mcpServers[serverName] = {
          command: 'node',
          args: [serverExecutablePath],
          env: { MCP_LOG_LEVEL: logLevel, MCP_SERVER_CONFIG_PATH: SERVER_CONFIG_YAML_PATH }
        };
        const saveResult = await writeJsonFile(getClaudeDesktopConfigPath(), currentData);
        res.writeHead(saveResult.success ? 200 : 500).end(JSON.stringify({ ...saveResult, config: currentData }));
      } else if (parsedUrl.pathname === '/api/claude-config/remove' && req.method === 'POST') {
        const { serverName } = JSON.parse(reqBody) as { serverName: string };
        const claudeConfig = await readJsonFile<ClaudeDesktopConfig>(getClaudeDesktopConfigPath(), { mcpServers: {} });
        const currentData = claudeConfig.data;
        let removed = false;
        if (currentData.mcpServers && currentData.mcpServers[serverName]) {
          delete currentData.mcpServers[serverName];
          removed = true;
        }
        const saveResult = await writeJsonFile(getClaudeDesktopConfigPath(), currentData);
        res
          .writeHead(saveResult.success ? 200 : 500)
          .end(JSON.stringify({ ...saveResult, config: currentData, removed }));
      } else if (parsedUrl.pathname === '/api/server-config' && req.method === 'GET') {
        const result = await readServerConfigFile();
        res.writeHead(200).end(JSON.stringify(result));
      } else if (parsedUrl.pathname === '/api/server-config' && req.method === 'POST') {
        const newConfigPartial = JSON.parse(reqBody) as Partial<ServerConfig>;
        const result = await writeServerConfigFile(newConfigPartial);
        res.writeHead(result.success ? 200 : 500).end(JSON.stringify(result));
      } else if (parsedUrl.pathname === '/api/auto-detect-path' && req.method === 'GET') {
        try {
          await fs.access(DIST_INDEX_JS_PATH);
          res.writeHead(200).end(JSON.stringify({ found: true, path: DIST_INDEX_JS_PATH }));
        } catch {
          res
            .writeHead(200)
            .end(JSON.stringify({ found: false, error: 'dist/index.js not found. Run npm run build.' }));
        }
      } else if (parsedUrl.pathname === '/api/test-config' && req.method === 'POST') {
        // Basic test: can we read server.yaml and claude_desktop_config.json?
        const serverConfigRead = await readServerConfigFile();
        const claudeConfigRead = await readJsonFile(getClaudeDesktopConfigPath(), {});
        const errors: string[] = [];
        if (serverConfigRead.error) errors.push(`Server Config Error: ${serverConfigRead.error}`);
        if (claudeConfigRead.error) errors.push(`Claude Desktop Config Error: ${claudeConfigRead.error}`);
        res
          .writeHead(200)
          .end(
            JSON.stringify({ success: errors.length === 0, errors: errors.length ? errors : undefined, warnings: [] })
          );
      } else if (parsedUrl.pathname === '/api/metrics' && req.method === 'GET') {
        res.writeHead(200).end(
          JSON.stringify({
            uptime: process.uptime(),
            memoryUsage: process.memoryUsage(),
            timestamp: new Date().toISOString(),
            nodeVersion: process.version,
            platform: osPlatform(),
            configUI: { version: '2.2.1-standalone' }
          })
        );
      } else {
        res.writeHead(404).end(JSON.stringify({ error: 'API Endpoint Not Found' }));
      }
      return;
    }

    res.writeHead(404).end('Not Found');
  } catch (error) {
    logger.error({ error, url: req.url }, 'Request handling error');
    res.writeHead(500).end(JSON.stringify({ error: 'Internal Server Error' }));
  }
});

server.listen(PORT, () => {
  logger.info(`🚀 Standalone MCP Configuration UI available at http://localhost:${PORT}`);
  logger.info('   This UI edits config files directly and does not start the main MCP server.');
  logger.info('   Press Ctrl+C to stop the configuration UI.');
});

process.on('SIGINT', () => {
  logger.info('Shutting down configuration UI server...');
  server.close(() => {
    process.exit(0);
  });
});
