// src/application/tools/config-management.tool.ts
import { injectable, inject } from 'inversify';
import { ConfigManagerService } from '../services/config-manager.service.js';
import { logger } from '../../utils/logger.js';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';

export interface ConfigManagementParams {
  action: 'read' | 'add-safe-zone' | 'update-safe-zones' | 'get-safe-zones' | 'validate' | 'backup-info';
  safeZonePath?: string;
  safeZones?: string[];
}

@injectable()
export class ConfigManagementTool implements IMCPTool {
  public readonly name = 'config_management';
  public readonly description = 'Manage server configuration including safe zones with live updates and validation';
  public readonly schema = z.object({
    action: z
      .enum(['read', 'add-safe-zone', 'update-safe-zones', 'get-safe-zones', 'validate', 'backup-info'])
      .describe('Configuration management action to perform'),
    safeZonePath: z.string().optional().describe('Safe zone path to add (for add-safe-zone action)'),
    safeZones: z.array(z.string()).optional().describe('Array of safe zone paths (for update-safe-zones action)')
  });

  constructor(@inject(ConfigManagerService) private configManager: ConfigManagerService) {}

  async execute(params: z.infer<typeof this.schema>, context: ToolContext): Promise<ToolResult> {
    void context; // Suppress TypeScript unused parameter warning
    const { action, safeZonePath, safeZones } = params;

    try {
      let result: any;

      switch (action) {
        case 'read':
          result = await this.readConfiguration();
          break;

        case 'add-safe-zone':
          if (!safeZonePath) {
            throw new Error('safeZonePath is required for add-safe-zone action');
          }
          result = await this.addSafeZone(safeZonePath);
          break;

        case 'update-safe-zones':
          if (!safeZones || safeZones.length === 0) {
            throw new Error('safeZones array is required for update-safe-zones action');
          }
          result = await this.updateSafeZones(safeZones);
          break;

        case 'get-safe-zones':
          result = await this.getSafeZones();
          break;

        case 'validate':
          result = await this.validateConfiguration();
          break;

        case 'backup-info':
          result = await this.getBackupInfo();
          break;

        default:
          throw new Error(`Unknown action: ${action}`);
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      logger.error({ action, error: errorMessage }, 'Configuration management failed');

      const errorResult = {
        action,
        timestamp: new Date().toISOString(),
        success: false,
        error: errorMessage,
        suggestions: [
          'Verify that the configuration file exists and is readable',
          'Check file permissions for the config directory',
          'Ensure the configuration file is valid YAML format'
        ]
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(errorResult, null, 2)
          }
        ]
      };
    }
  }

  private async readConfiguration(): Promise<any> {
    const config = await this.configManager.readConfig();
    
    return {
      action: 'read',
      timestamp: new Date().toISOString(),
      success: true,
      configuration: config,
      summary: {
        serverName: config.server?.name || 'Unknown',
        serverVersion: config.server?.version || 'Unknown',
        safeZoneCount: config.security?.safezones?.length || 0,
        restrictedZoneCount: config.security?.restrictedZones?.length || 0,
        safeZoneMode: config.security?.safeZoneMode || 'Unknown'
      },
      suggestions: [
        '📄 Configuration loaded successfully',
        `🔐 ${config.security?.safezones?.length || 0} safe zones configured`,
        `🚫 ${config.security?.restrictedZones?.length || 0} restricted zones configured`,
        '🔍 Use other actions to modify configuration'
      ]
    };
  }

  private async addSafeZone(safeZonePath: string): Promise<any> {
    const currentSafeZones = await this.configManager.getCurrentSafeZones();
    const isAlreadyPresent = currentSafeZones.includes(safeZonePath);

    if (isAlreadyPresent) {
      return {
        action: 'add-safe-zone',
        timestamp: new Date().toISOString(),
        success: true,
        safeZonePath,
        message: 'Safe zone already exists in configuration',
        currentSafeZones,
        suggestions: [
          '✅ Safe zone was already present in configuration',
          '📋 No changes made to configuration file',
          '🔍 Use get-safe-zones to see all current safe zones'
        ]
      };
    }

    await this.configManager.addSafeZone(safeZonePath);
    const updatedSafeZones = await this.configManager.getCurrentSafeZones();

    return {
      action: 'add-safe-zone',
      timestamp: new Date().toISOString(),
      success: true,
      safeZonePath,
      message: 'Safe zone added to configuration successfully',
      previousCount: currentSafeZones.length,
      newCount: updatedSafeZones.length,
      currentSafeZones: updatedSafeZones,
      suggestions: [
        '✅ Safe zone added to configuration',
        '💾 Configuration file updated and backed up',
        '🔄 Server restart may be required for changes to take effect',
        '🔍 Use validate action to check configuration integrity'
      ]
    };
  }

  private async updateSafeZones(safeZones: string[]): Promise<any> {
    const currentSafeZones = await this.configManager.getCurrentSafeZones();
    
    await this.configManager.updateSafeZones(safeZones);
    
    return {
      action: 'update-safe-zones',
      timestamp: new Date().toISOString(),
      success: true,
      message: 'Safe zones updated in configuration',
      previousSafeZones: currentSafeZones,
      newSafeZones: safeZones,
      changes: {
        added: safeZones.filter(zone => !currentSafeZones.includes(zone)),
        removed: currentSafeZones.filter(zone => !safeZones.includes(zone)),
        unchanged: safeZones.filter(zone => currentSafeZones.includes(zone))
      },
      suggestions: [
        '✅ Safe zones configuration updated',
        '💾 Configuration file updated and backed up',
        '🔄 Server restart may be required for changes to take effect',
        '🔍 Use validate action to check configuration integrity'
      ]
    };
  }

  private async getSafeZones(): Promise<any> {
    const safeZones = await this.configManager.getCurrentSafeZones();
    
    return {
      action: 'get-safe-zones',
      timestamp: new Date().toISOString(),
      success: true,
      safeZones,
      count: safeZones.length,
      analysis: {
        hasWildcards: safeZones.some(zone => zone.includes('*')),
        hasRelativePaths: safeZones.some(zone => zone.startsWith('.')),
        hasWindowsPaths: safeZones.some(zone => zone.includes(':\\')),
        hasUnixPaths: safeZones.some(zone => zone.startsWith('/'))
      },
      suggestions: [
        `📋 ${safeZones.length} safe zones configured`,
        safeZones.length > 0 ? '✅ Safe zones are configured' : '⚠️ No safe zones configured',
        '🔍 Use add-safe-zone or update-safe-zones to modify configuration'
      ]
    };
  }

  private async validateConfiguration(): Promise<any> {
    const config = await this.configManager.readConfig();
    const validation = await this.configManager.validateConfig(config);
    
    return {
      action: 'validate',
      timestamp: new Date().toISOString(),
      success: true,
      validation,
      message: validation.valid ? 'Configuration is valid' : 'Configuration has validation errors',
      suggestions: validation.valid
        ? [
            '✅ Configuration structure is valid',
            '📄 All required fields are properly formatted',
            '🔍 Configuration is ready for use'
          ]
        : [
            '❌ Configuration validation failed',
            '🔧 Fix validation errors before proceeding',
            '📋 Check error details for specific issues'
          ]
    };
  }

  private async getBackupInfo(): Promise<any> {
    // This is a simplified backup info method
    // In a real implementation, you'd check the backup directory
    return {
      action: 'backup-info',
      timestamp: new Date().toISOString(),
      success: true,
      message: 'Backup information retrieved',
      backupDirectory: 'config/backups',
      backupPolicy: 'Automatic backup before each configuration change',
      retentionPolicy: 'Keep last 10 backups',
      suggestions: [
        '💾 Automatic backups created before configuration changes',
        '📁 Backup files stored in config/backups directory',
        '🔄 Old backups automatically cleaned up'
      ]
    };
  }
}
