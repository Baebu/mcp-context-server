// Configuration Integration Fix
// File: src/infrastructure/config/loader.ts

import { promises as fs } from 'fs';
import { parse as parseYaml } from 'yaml';
import { serverConfigSchema, configSchema, type ServerConfig } from './schema.js'; // Added configSchema import
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
      return this.loadedConfig;
    }

    try {
      // Determine config file path
      const configFile = configPath || process.env.CONFIG_PATH || './config/server.yaml';

      logger.info(`Loading configuration from: ${configFile}`);

      // Load raw configuration
      const rawConfig = await this.loadFromFile(configFile);

      // Merge with environment variables
      const configWithEnv = this.mergeEnvironmentVariables(rawConfig);

      // Validate against comprehensive schema
      this.loadedConfig = serverConfigSchema.parse(configWithEnv);

      logger.info('✅ Configuration loaded and validated successfully');

      // Fixed logger.debug call with proper typing
      const configSummary = {
        features: Object.keys(this.loadedConfig.features || {}).filter(
          // Added null check for features
          key => this.loadedConfig!.features![key as keyof typeof this.loadedConfig.features]
        ),
        pluginsEnabled: this.loadedConfig.plugins?.enabled?.length || 0, // Added null check
        securityPaths: this.loadedConfig.security?.allowedPaths?.length || 0 // Added null check
      };

      logger.debug({ message: 'Configuration details:', details: JSON.stringify(configSummary, null, 2) });

      return this.loadedConfig;
    } catch (error) {
      logger.error({
        message: '❌ Configuration loading failed:',
        error: error instanceof Error ? error.message : String(error)
      });

      // Return default configuration with all parameters properly defined
      logger.warn('🔄 Using default configuration with all features enabled');

      // Use Zod schema's parse with an empty object to get all defaults
      this.loadedConfig = serverConfigSchema.parse({
        // Explicitly enable all features for development
        // These will be merged with Zod defaults if features schema has defaults
        features: {
          fastmcpIntegration: true,
          semanticMemory: true,
          vectorStorage: true,
          enhancedSecurity: true,
          memoryOptimization: true,
          pluginSystem: true,
          advancedBackup: true,
          realTimeMonitoring: true,
          sessionManagement: true,
          auditLogging: true
        },
        development: {
          // Ensure development block is present for defaults
          enabled: true,
          debugMode: process.env.NODE_ENV === 'development'
        }
      });

      return this.loadedConfig;
    }
  }

  private async loadFromFile(filePath: string): Promise<any> {
    try {
      const configContent = await fs.readFile(filePath, 'utf-8');

      if (filePath.endsWith('.yaml') || filePath.endsWith('.yml')) {
        return parseYaml(configContent);
      } else if (filePath.endsWith('.json')) {
        return JSON.parse(configContent);
      } else {
        throw new Error(`Unsupported config file format: ${filePath}`);
      }
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        logger.warn(`Configuration file not found: ${filePath}`);
        return {};
      }
      throw error;
    }
  }

  private mergeEnvironmentVariables(config: any): any {
    // Map environment variables to config structure
    const envMappings: Record<string, string> = {
      NODE_ENV: 'development.enabled',
      DEBUG: 'development.debugMode',
      DB_PATH: 'database.path',
      SERVER_PORT: 'server.port',
      SERVER_HOST: 'server.host',
      MAX_MEMORY_MB: 'memory.maxMemoryMB',
      SEMANTIC_SEARCH_ENABLED: 'semanticSearch.enabled', // Ensure this path exists in schema
      PLUGINS_ENABLED: 'plugins.autoDiscover', // Ensure this path exists in schema
      BACKUP_ENABLED: 'backup.enabled', // Ensure this path exists in schema
      MONITORING_ENABLED: 'monitoring.enabled' // Ensure this path exists in schema
    };

    const result = { ...config };

    for (const [envVar, configPath] of Object.entries(envMappings)) {
      const envValue = process.env[envVar];
      if (envValue !== undefined) {
        this.setNestedProperty(result, configPath, this.parseEnvValue(envValue));
      }
    }

    return result;
  }

  private setNestedProperty(obj: any, path: string, value: any): void {
    const keys = path.split('.');
    const lastKey = keys.pop()!;

    let current = obj;
    for (const key of keys) {
      if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
        // Ensure intermediate paths are objects
        current[key] = {};
      }
      current = current[key];
    }
    if (current && typeof current === 'object') {
      // Ensure current is an object before setting property
      current[lastKey] = value;
    }
  }

  private parseEnvValue(value: string): any {
    // Parse environment variable values
    if (value.toLowerCase() === 'true') return true;
    if (value.toLowerCase() === 'false') return false;
    if (/^\d+$/.test(value)) return parseInt(value, 10);
    if (/^\d+\.\d+$/.test(value)) return parseFloat(value);
    return value;
  }

  // Get current configuration
  getCurrentConfig(): ServerConfig | null {
    return this.loadedConfig;
  }

  // Reload configuration
  async reloadConfiguration(configPath?: string): Promise<ServerConfig> {
    this.loadedConfig = null;
    return this.loadConfiguration(configPath);
  }
}

// Export singleton instance
export const configLoader = ConfigurationLoader.getInstance();

// Export configSchema for compatibility
export { configSchema };

// Helper function for backward compatibility
export async function loadConfig(configPath?: string): Promise<ServerConfig> {
  return configLoader.loadConfiguration(configPath);
}
