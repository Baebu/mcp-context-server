// Configuration Integration Fix
// File: src/infrastructure/config/loader.ts

import { promises as fs } from 'fs';
import { parse as parseYaml } from 'yaml';
import path from 'node:path'; // Import path
import { serverConfigSchema, configSchema, type ServerConfig } from './schema.js';
import { logger } from '../../utils/logger.js';

export class ConfigurationLoader {
  private static instance: ConfigurationLoader;
  private loadedConfig: ServerConfig | null = null;

  static getInstance(): ConfigurationLoader {
    if (!ConfigurationLoader.instance) {
      ConfigurationLoader.instance = new ConfigurationLoader();
    }
    return ConfigurationLoader.instance;
  }

  async loadConfiguration(configPath?: string): Promise<ServerConfig> {
    if (this.loadedConfig) {
      // If already loaded and no specific new path is given, return cached.
      // If a specific configPath is given, force reload.
      if (!configPath) {
        return this.loadedConfig;
      }
      logger.info('[ConfigLoader] Forcing reload due to explicit configPath argument.');
      this.loadedConfig = null; // Reset for forced reload
    }

    logger.info('[ConfigLoader] Attempting to load configuration...');
    logger.debug(
      {
        message: '[ConfigLoader] Environment Variables Check:',
        MCP_SERVER_CONFIG_PATH_ENV: process.env.MCP_SERVER_CONFIG_PATH,
        CONFIG_PATH_ENV: process.env.CONFIG_PATH,
        CWD_at_load_time: process.cwd()
      },
      '[ConfigLoader] Environment State'
    );

    try {
      const mcpConfigPath = process.env.MCP_SERVER_CONFIG_PATH;
      const generalConfigPath = process.env.CONFIG_PATH;
      const defaultConfigPath = './config/server.yaml'; // Relative to CWD

      let configFile: string;
      let source: string;
      let attemptedPrimaryLoad = false;

      if (configPath) {
        configFile = configPath;
        source = 'direct argument';
        attemptedPrimaryLoad = true;
      } else if (mcpConfigPath) {
        configFile = mcpConfigPath;
        source = 'MCP_SERVER_CONFIG_PATH';
        attemptedPrimaryLoad = true;
      } else if (generalConfigPath) {
        configFile = generalConfigPath;
        source = 'CONFIG_PATH';
        attemptedPrimaryLoad = true;
      } else {
        configFile = defaultConfigPath;
        source = 'default path';
      }

      logger.info(`[ConfigLoader] Using configuration source: ${source}, initial path: "${configFile}"`);

      // Resolve the path to an absolute path for clarity in logs and consistent loading
      // If configFile is already absolute, path.resolve will correctly handle it.
      // If it's relative, it will be resolved against process.cwd().
      const absoluteConfigFile = path.resolve(configFile);
      logger.info(
        `[ConfigLoader] Attempting to load resolved absolute configuration from: "${absoluteConfigFile}" (CWD for resolution was: "${process.cwd()}")`
      );

      let rawConfig = await this.loadFromFile(absoluteConfigFile);

      if (
        Object.keys(rawConfig).length === 0 &&
        attemptedPrimaryLoad &&
        configFile !== path.resolve(defaultConfigPath)
      ) {
        logger.warn(
          `[ConfigLoader] Loaded empty configuration from "${absoluteConfigFile}" (source: ${source}). This might indicate the file was not found or is empty. Attempting fallback to default path.`
        );
        const absoluteDefaultConfigFile = path.resolve(defaultConfigPath); // Default is relative to CWD
        logger.info(
          `[ConfigLoader] Falling back to default config path: "${absoluteDefaultConfigFile}" (CWD: "${process.cwd()}")`
        );
        const defaultRawConfig = await this.loadFromFile(absoluteDefaultConfigFile);
        if (Object.keys(defaultRawConfig).length > 0) {
          logger.info(
            `[ConfigLoader] Successfully loaded from default path "${absoluteDefaultConfigFile}" after primary attempt failed.`
          );
          rawConfig = defaultRawConfig; // Use default config content
          source = 'default path (fallback)';
        } else {
          logger.warn(
            `[ConfigLoader] Default config path "${absoluteDefaultConfigFile}" also yielded empty/no config. Proceeding with Zod defaults.`
          );
        }
      } else if (Object.keys(rawConfig).length === 0) {
        logger.warn(
          `[ConfigLoader] Loaded empty configuration from "${absoluteConfigFile}" (source: ${source}). Will proceed with Zod defaults.`
        );
      }

      const configWithEnv = this.mergeEnvironmentVariables(rawConfig);
      const parsedConfig = serverConfigSchema.parse(configWithEnv);
      this.loadedConfig = parsedConfig;

      if (Object.keys(rawConfig).length === 0 && source !== 'direct argument') {
        logger.warn(
          '[ConfigLoader] Parsed configuration is effectively all defaults. This usually means the config file specified (or defaulted to) was not found or was empty.'
        );
      } else {
        logger.info('[ConfigLoader] ✅ Configuration loaded and validated successfully.');
      }

      const configSummary = {
        sourceFileUsed: absoluteConfigFile, // Log the actual file path it attempted for the final successful (or empty) load
        sourceType: source,
        serverName: this.loadedConfig.server?.name,
        workingDirectoryConfig: this.loadedConfig.server?.workingDirectory,
        safezonesConfig: this.loadedConfig.security?.safezones,
        dbPathConfig: this.loadedConfig.database?.path
      };

      logger.debug({
        message: '[ConfigLoader] Loaded Configuration Summary:',
        details: JSON.stringify(configSummary, null, 2)
      });

      // Log working directory intention
      if (this.loadedConfig.server?.workingDirectory) {
        const targetWorkingDirectory = path.resolve(this.loadedConfig.server.workingDirectory); // Resolve if relative
        logger.info(
          `[ConfigLoader] Configuration specifies workingDirectory: "${targetWorkingDirectory}". The server should chdir to this path upon startup if possible.`
        );
      } else {
        logger.info(
          `[ConfigLoader] No workingDirectory specified in configuration. Server will use CWD at launch: "${process.cwd()}".`
        );
      }

      return this.loadedConfig;
    } catch (error) {
      logger.error({
        message: '[ConfigLoader] ❌ Configuration loading failed catastrophically:',
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });

      logger.warn('[ConfigLoader] 🔄 Using Zod default configuration due to error during loading/parsing.');
      this.loadedConfig = serverConfigSchema.parse({}); // Fallback to Zod defaults
      logger.debug({
        message: '[ConfigLoader] Applied Zod Defaults after error:',
        details: JSON.stringify(this.loadedConfig, null, 2)
      });

      return this.loadedConfig;
    }
  }

  private async loadFromFile(filePath: string): Promise<any> {
    // filePath is now absolute
    try {
      logger.debug(`[ConfigLoader] Reading file: "${filePath}"`);
      const configContent = await fs.readFile(filePath, 'utf-8');
      logger.debug(`[ConfigLoader] Successfully read file: "${filePath}" (length: ${configContent.length})`);

      if (configContent.trim() === '') {
        logger.warn(`[ConfigLoader] Config file "${filePath}" is empty.`);
        return {};
      }

      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        return parseYaml(configContent);
      } else if (filePath.endsWith('.json')) {
        return JSON.parse(configContent);
      } else {
        logger.error(`[ConfigLoader] Unsupported config file format: ${filePath}`);
        throw new Error(`Unsupported config file format: ${filePath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn(`[ConfigLoader] Configuration file not found at: "${filePath}"`);
        return {}; // Return empty object if file not found
      }
      logger.error({ error, filePath }, `[ConfigLoader] Error reading or parsing config file: "${filePath}"`);
      // Do not re-throw ENOENT as we want to fall back to defaults.
      // Re-throw other errors (like parsing errors for an existing file).
      throw error;
    }
  }

  private mergeEnvironmentVariables(config: any): any {
    const envMappings: Record<string, string> = {
      NODE_ENV: 'development.enabled',
      DEBUG: 'development.debugMode',
      DB_PATH: 'database.path',
      SERVER_PORT: 'server.port',
      SERVER_HOST: 'server.host',
      MAX_MEMORY_MB: 'memory.maxMemoryMB',
      SEMANTIC_SEARCH_ENABLED: 'semanticSearch.enabled',
      PLUGINS_ENABLED: 'plugins.autoDiscover',
      BACKUP_ENABLED: 'backup.enabled',
      MONITORING_ENABLED: 'monitoring.enabled'
    };

    const result = { ...config };

    for (const [envVar, configPath] of Object.entries(envMappings)) {
      const envValue = process.env[envVar];
      if (envValue !== undefined) {
        logger.debug(`[ConfigLoader] Applying env var ${envVar}="${envValue}" to config path "${configPath}"`);
        this.setNestedProperty(result, configPath, this.parseEnvValue(envValue));
      }
    }
    return result;
  }

  private setNestedProperty(obj: any, pathStr: string, value: any): void {
    const keys = pathStr.split('.');
    const lastKey = keys.pop()!;

    let current = obj;
    for (const key of keys) {
      if (typeof current[key] !== 'object' || current[key] === null) {
        current[key] = {};
      }
      current = current[key];
    }
    if (current && typeof current === 'object') {
      current[lastKey] = value;
    }
  }

  private parseEnvValue(value: string): any {
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    if (/^\d+$/.test(value) && !isNaN(parseInt(value, 10))) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value) && !isNaN(parseFloat(value))) return parseFloat(value);
    return value;
  }

  getCurrentConfig(): ServerConfig | null {
    return this.loadedConfig;
  }

  async reloadConfiguration(configPath?: string): Promise<ServerConfig> {
    logger.info(`[ConfigLoader] Reloading configuration. Explicit path: ${configPath || 'none'}`);
    this.loadedConfig = null; // Force reload
    return this.loadConfiguration(configPath);
  }
}

export const configLoader = ConfigurationLoader.getInstance();
export { configSchema };

export async function loadConfig(configPath?: string): Promise<ServerConfig> {
  return configLoader.loadConfiguration(configPath);
}
