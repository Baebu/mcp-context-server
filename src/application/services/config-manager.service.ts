// src/application/services/config-manager.service.ts
import { injectable } from 'inversify';
import * as fs from 'fs/promises';
import * as yaml from 'yaml';
import * as path from 'path';
import { logger } from '../../utils/logger.js';

export interface ServerConfig {
  security?: {
    safezones?: string[];
    restrictedZones?: string[];
    safeZoneMode?: string;
    [key: string]: any;
  };
  [key: string]: any;
}

@injectable()
export class ConfigManagerService {
  private configPath: string;
  private backupDir: string;

  constructor() {
    // Default to server.yaml in config directory
    this.configPath = path.resolve(process.cwd(), 'config', 'server.yaml');
    this.backupDir = path.resolve(process.cwd(), 'config', 'backups');
  }

  /**
   * Read the current server configuration
   */
  async readConfig(): Promise<ServerConfig> {
    try {
      const configContent = await fs.readFile(this.configPath, 'utf8');
      const config = yaml.parse(configContent) as ServerConfig;
      
      logger.debug({ configPath: this.configPath }, 'Configuration loaded');
      return config || {};
    } catch (error) {
      logger.error({ error, configPath: this.configPath }, 'Failed to read configuration');
      throw new Error(`Failed to read configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Write configuration to file with backup
   */
  async writeConfig(config: ServerConfig): Promise<void> {
    try {
      // Create backup first
      await this.createBackup();
      
      // Convert config to YAML
      const yamlContent = yaml.stringify(config, {
        indent: 2,
        lineWidth: 120
      });
      
      // Write to file
      await fs.writeFile(this.configPath, yamlContent, 'utf8');
      
      logger.info({ configPath: this.configPath }, 'Configuration updated successfully');
    } catch (error) {
      logger.error({ error, configPath: this.configPath }, 'Failed to write configuration');
      throw new Error(`Failed to write configuration: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  /**
   * Update safe zones in configuration
   */
  async updateSafeZones(newSafeZones: string[]): Promise<void> {
    try {
      const config = await this.readConfig();
      
      // Ensure security section exists
      if (!config.security) {
        config.security = {};
      }
      
      // Update safezones
      config.security.safezones = [...new Set(newSafeZones)]; // Remove duplicates
      
      // Write updated config
      await this.writeConfig(config);
      
      logger.info({ 
        newSafeZones, 
        totalCount: newSafeZones.length 
      }, 'Safe zones updated in configuration');
      
    } catch (error) {
      logger.error({ error, newSafeZones }, 'Failed to update safe zones in configuration');
      throw error;
    }
  }

  /**
   * Add a new safe zone to configuration
   */
  async addSafeZone(safeZonePath: string): Promise<void> {
    try {
      const config = await this.readConfig();
      
      // Ensure security section exists
      if (!config.security) {
        config.security = {};
      }
      
      // Initialize safezones if not exists
      if (!Array.isArray(config.security.safezones)) {
        config.security.safezones = [];
      }
      
      // Add new safe zone if not already present
      if (!config.security.safezones.includes(safeZonePath)) {
        config.security.safezones.push(safeZonePath);
        
        // Write updated config
        await this.writeConfig(config);
        
        logger.info({ safeZonePath }, 'Safe zone added to configuration');
      } else {
        logger.debug({ safeZonePath }, 'Safe zone already exists in configuration');
      }
      
    } catch (error) {
      logger.error({ error, safeZonePath }, 'Failed to add safe zone to configuration');
      throw error;
    }
  }

  /**
   * Get current safe zones from configuration
   */
  async getCurrentSafeZones(): Promise<string[]> {
    try {
      const config = await this.readConfig();
      return config.security?.safezones || [];
    } catch (error) {
      logger.error({ error }, 'Failed to get current safe zones');
      return [];
    }
  }

  /**
   * Create a backup of the current configuration
   */
  private async createBackup(): Promise<void> {
    try {
      // Ensure backup directory exists
      await fs.mkdir(this.backupDir, { recursive: true });
      
      // Create timestamped backup filename
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupFilename = `server-config-backup-${timestamp}.yaml`;
      const backupPath = path.join(this.backupDir, backupFilename);
      
      // Copy current config to backup
      await fs.copyFile(this.configPath, backupPath);
      
      logger.debug({ backupPath }, 'Configuration backup created');
      
      // Clean up old backups (keep last 10)
      await this.cleanupOldBackups();
      
    } catch (error) {
      logger.warn({ error }, 'Failed to create configuration backup');
      // Don't throw - backup failure shouldn't prevent config updates
    }
  }

  /**
   * Clean up old backup files
   */
  private async cleanupOldBackups(): Promise<void> {
    try {
      const files = await fs.readdir(this.backupDir);
      const backupFiles = files
        .filter(file => file.startsWith('server-config-backup-') && file.endsWith('.yaml'))
        .map(file => ({
          name: file,
          path: path.join(this.backupDir, file)
        }))
        .sort((a, b) => b.name.localeCompare(a.name)); // Sort by name descending (newest first)
      
      // Keep only the 10 most recent backups
      if (backupFiles.length > 10) {
        const filesToDelete = backupFiles.slice(10);
        for (const file of filesToDelete) {
          await fs.unlink(file.path);
          logger.debug({ deletedBackup: file.name }, 'Old backup file deleted');
        }
      }
    } catch (error) {
      logger.warn({ error }, 'Failed to cleanup old backup files');
    }
  }

  /**
   * Validate configuration structure
   */
  async validateConfig(config: ServerConfig): Promise<{ valid: boolean; errors: string[] }> {
    const errors: string[] = [];
    
    try {
      // Basic structure validation
      if (typeof config !== 'object' || config === null) {
        errors.push('Configuration must be an object');
        return { valid: false, errors };
      }
      
      // Validate security section if present
      if (config.security) {
        if (typeof config.security !== 'object') {
          errors.push('security section must be an object');
        } else {
          // Validate safezones
          if (config.security.safezones && !Array.isArray(config.security.safezones)) {
            errors.push('security.safezones must be an array');
          }
          
          // Validate restrictedZones
          if (config.security.restrictedZones && !Array.isArray(config.security.restrictedZones)) {
            errors.push('security.restrictedZones must be an array');
          }
        }
      }
      
      return {
        valid: errors.length === 0,
        errors
      };
      
    } catch (error) {
      errors.push(`Validation error: ${error instanceof Error ? error.message : 'Unknown error'}`);
      return { valid: false, errors };
    }
  }
}
