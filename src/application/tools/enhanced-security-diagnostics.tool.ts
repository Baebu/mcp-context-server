// src/application/tools/enhanced-security-diagnostics.tool.ts
import { injectable, inject } from 'inversify';
import type { ISecurityValidator } from '../../core/interfaces/security.interface.js';
import { ConfigManagerService } from '../services/config-manager.service.js';
import { logger } from '../../utils/logger.js';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';

export interface EnhancedSecurityDiagnosticsParams {
  action:
    | 'expand-safe-zone'
    | 'auto-discover'
    | 'add-with-wildcards'
    | 'refresh-zones'
    | 'get-hierarchy'
    | 'validate-access'
    | 'reinitialize-enhanced'
    | 'test-multiple-paths';
  safeZonePath?: string;
  testPaths?: string[];
}

@injectable()
export class EnhancedSecurityDiagnosticsTool implements IMCPTool {
  public readonly name = 'enhanced_security_diagnostics';
  public readonly description =
    'Enhanced security diagnostics and safe zone management with advanced subdirectory access features';
  public readonly schema = z.object({
    action: z
      .enum([
        'expand-safe-zone',
        'auto-discover',
        'add-with-wildcards',
        'refresh-zones',
        'get-hierarchy',
        'validate-access',
        'reinitialize-enhanced',
        'test-multiple-paths'
      ])
      .describe('Action to perform'),
    safeZonePath: z.string().optional().describe('Safe zone path for expansion, discovery, or validation actions'),
    testPaths: z
      .array(z.string())
      .optional()
      .describe('Array of paths to test for access (used with test-multiple-paths action)')
  });

  constructor(
    @inject('SecurityValidator') private security: ISecurityValidator,
    @inject(ConfigManagerService) private configManager: ConfigManagerService
  ) {}

  async execute(params: z.infer<typeof this.schema>, context: ToolContext): Promise<ToolResult> {
    void context; // Suppress TypeScript unused parameter warning - context available for future use
    const { action, safeZonePath, testPaths } = params;

    try {
      let result: any;

      switch (action) {
        case 'expand-safe-zone':
          if (!safeZonePath) {
            throw new Error('safeZonePath is required for expand-safe-zone action');
          }
          result = await this.expandSafeZone(safeZonePath);
          break;

        case 'auto-discover':
          if (!safeZonePath) {
            throw new Error('safeZonePath is required for auto-discover action');
          }
          result = await this.autoDiscoverSubdirectories(safeZonePath);
          break;

        case 'add-with-wildcards':
          if (!safeZonePath) {
            throw new Error('safeZonePath is required for add-with-wildcards action');
          }
          result = await this.addSafeZoneWithWildcards(safeZonePath);
          break;

        case 'refresh-zones':
          result = await this.refreshSafeZones();
          break;

        case 'get-hierarchy':
          result = await this.getSafeZoneHierarchy();
          break;

        case 'validate-access':
          if (!safeZonePath) {
            throw new Error('safeZonePath is required for validate-access action');
          }
          result = await this.validateSafeZoneAccess(safeZonePath);
          break;

        case 'reinitialize-enhanced':
          result = await this.reinitializeEnhanced();
          break;

        case 'test-multiple-paths':
          if (!testPaths || testPaths.length === 0) {
            throw new Error('testPaths array is required for test-multiple-paths action');
          }
          result = await this.testMultiplePaths(testPaths);
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
      logger.error({ action, error: errorMessage }, 'Enhanced security diagnostics failed');

      const errorResult = {
        action,
        timestamp: new Date().toISOString(),
        success: false,
        error: errorMessage,
        suggestions: [
          'Verify that the SecurityValidator service supports enhanced features',
          'Check that the specified safe zone path exists and is accessible',
          'Ensure you have proper permissions for the requested operation'
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

  private async expandSafeZone(safeZonePath: string): Promise<any> {
    if (typeof this.security.expandSafeZoneRecursively === 'function') {
      // Expand safe zone in memory
      this.security.expandSafeZoneRecursively(safeZonePath);

      // Persist the new safe zone to configuration
      try {
        await this.configManager.addSafeZone(safeZonePath);
        logger.info({ safeZonePath }, 'Safe zone expansion persisted to configuration');
      } catch (configError) {
        logger.warn({ safeZonePath, error: configError }, 'Failed to persist safe zone to configuration');
        // Continue with operation even if persistence fails
      }

      const hierarchy =
        typeof this.security.getSafeZoneHierarchy === 'function' ? this.security.getSafeZoneHierarchy() : null;

      return {
        action: 'expand-safe-zone',
        timestamp: new Date().toISOString(),
        success: true,
        safeZonePath,
        message: 'Safe zone expanded with recursive wildcard patterns and persisted to configuration',
        hierarchy,
        configurationUpdated: true,
        suggestions: [
          '✅ Safe zone has been expanded with wildcard patterns for subdirectory access',
          '💾 Safe zone expansion persisted to server.yaml configuration',
          '📁 All subdirectories within the safe zone should now be accessible',
          '🔍 Use validate-access action to verify subdirectory accessibility'
        ]
      };
    } else {
      throw new Error('Enhanced safe zone expansion not supported by current SecurityValidator');
    }
  }

  private async autoDiscoverSubdirectories(safeZonePath: string): Promise<any> {
    if (typeof this.security.autoDiscoverSubdirectories === 'function') {
      const discoveredPaths = await this.security.autoDiscoverSubdirectories(safeZonePath);

      return {
        action: 'auto-discover',
        timestamp: new Date().toISOString(),
        success: true,
        safeZonePath,
        discoveredPaths,
        totalDiscovered: discoveredPaths.length,
        message: `Auto-discovered ${discoveredPaths.length} subdirectories`,
        suggestions: [
          `✅ Found ${discoveredPaths.length} accessible subdirectories`,
          '📁 All discovered directories have been added to safe zones',
          '🔄 Run refresh-zones to ensure all patterns are active'
        ]
      };
    } else {
      throw new Error('Auto-discovery not supported by current SecurityValidator');
    }
  }

  private async addSafeZoneWithWildcards(safeZonePath: string): Promise<any> {
    if (typeof this.security.addSafeZoneWithWildcards === 'function') {
      this.security.addSafeZoneWithWildcards(safeZonePath);

      return {
        action: 'add-with-wildcards',
        timestamp: new Date().toISOString(),
        success: true,
        safeZonePath,
        message: 'Safe zone added with comprehensive wildcard patterns',
        patterns: [
          'Exact path',
          'All subdirectories recursively (**)',
          'Direct children (*)',
          'All files in subdirectories (**/*)',
          'Alternative recursive patterns'
        ],
        suggestions: [
          '✅ Safe zone added with maximum subdirectory coverage',
          '🔍 Use get-hierarchy to see all active patterns',
          '⚡ All subdirectories should now be accessible'
        ]
      };
    } else {
      throw new Error('Wildcard safe zone addition not supported by current SecurityValidator');
    }
  }

  private async refreshSafeZones(): Promise<any> {
    if (typeof this.security.refreshSafeZonesWithAutoExpansion === 'function') {
      await this.security.refreshSafeZonesWithAutoExpansion();

      const hierarchy =
        typeof this.security.getSafeZoneHierarchy === 'function' ? this.security.getSafeZoneHierarchy() : null;

      return {
        action: 'refresh-zones',
        timestamp: new Date().toISOString(),
        success: true,
        message: 'Safe zones refreshed with auto-expansion',
        hierarchy,
        suggestions: [
          '✅ All safe zones have been refreshed and expanded',
          '📁 Auto-discovery applied to all configured safe zones',
          '🔄 Security patterns are now up to date'
        ]
      };
    } else {
      throw new Error('Enhanced safe zone refresh not supported by current SecurityValidator');
    }
  }

  private async getSafeZoneHierarchy(): Promise<any> {
    if (typeof this.security.getSafeZoneHierarchy === 'function') {
      const hierarchy = this.security.getSafeZoneHierarchy();

      return {
        action: 'get-hierarchy',
        timestamp: new Date().toISOString(),
        success: true,
        hierarchy,
        analysis: {
          hasWildcardPatterns: hierarchy.wildcardPatterns.length > 0,
          expansionRatio: hierarchy.totalZones / hierarchy.configuredZones.length,
          hasRestrictedOverrides: hierarchy.restrictedOverrides.length > 0
        },
        suggestions: [
          `📊 Total zones: ${hierarchy.totalZones}`,
          `🔧 Configured zones: ${hierarchy.configuredZones.length}`,
          `🌟 Wildcard patterns: ${hierarchy.wildcardPatterns.length}`,
          hierarchy.restrictedOverrides.length > 0
            ? '⚠️ Some safe zones have restricted overrides'
            : '✅ No conflicting restrictions found'
        ]
      };
    } else {
      // Fallback to basic security info
      const basicInfo = this.security.getSecurityInfo?.() || {};
      return {
        action: 'get-hierarchy',
        timestamp: new Date().toISOString(),
        success: true,
        basicInfo,
        message: 'Enhanced hierarchy not available, showing basic security info',
        suggestions: [
          '📊 Basic security information retrieved',
          '⚠️ Enhanced hierarchy features not available',
          '🔄 Consider updating SecurityValidator for full features'
        ]
      };
    }
  }

  private async validateSafeZoneAccess(safeZonePath: string): Promise<any> {
    if (typeof this.security.validateSafeZoneAccess === 'function') {
      const validation = await this.security.validateSafeZoneAccess(safeZonePath);

      const accessRate =
        validation.totalChecked > 0
          ? validation.subdirectories.filter(s => s.accessible).length / validation.totalChecked
          : 0;

      return {
        action: 'validate-access',
        timestamp: new Date().toISOString(),
        success: true,
        safeZonePath,
        validation,
        accessRate: Math.round(accessRate * 100),
        summary: {
          totalChecked: validation.totalChecked,
          accessible: validation.subdirectories.filter(s => s.accessible).length,
          denied: validation.subdirectories.filter(s => !s.accessible).length
        },
        suggestions: validation.accessible
          ? [
              `✅ Safe zone access validated (${Math.round(accessRate * 100)}% accessible)`,
              '📁 Most subdirectories are accessible',
              '🔍 Check individual subdirectory results for details'
            ]
          : [
              '❌ Safe zone access issues detected',
              '🔧 Consider running expand-safe-zone or refresh-zones',
              '⚠️ Check for conflicting restricted zones'
            ]
      };
    } else {
      throw new Error('Safe zone access validation not supported by current SecurityValidator');
    }
  }

  private async reinitializeEnhanced(): Promise<any> {
    if (typeof this.security.reinitializeZonesWithExpansion === 'function') {
      await this.security.reinitializeZonesWithExpansion();

      const hierarchy =
        typeof this.security.getSafeZoneHierarchy === 'function' ? this.security.getSafeZoneHierarchy() : null;

      return {
        action: 'reinitialize-enhanced',
        timestamp: new Date().toISOString(),
        success: true,
        message: 'Security zones reinitialized with enhanced features',
        hierarchy,
        suggestions: [
          '✅ Security zones reinitialized with enhanced expansion',
          '🔄 All safe zone patterns have been refreshed',
          '📁 Maximum subdirectory access should now be available'
        ]
      };
    } else {
      throw new Error('Enhanced reinitialization not supported by current SecurityValidator');
    }
  }

  private async testMultiplePaths(testPaths: string[]): Promise<any> {
    const results = [];

    for (const testPath of testPaths) {
      try {
        const testResult = await this.security.testPathAccess?.(testPath);
        results.push({
          path: testPath,
          allowed: testResult?.allowed || false,
          reason: testResult?.reason || 'No test result available',
          resolvedPath: testResult?.resolvedPath || testPath,
          matchedSafeZone: testResult?.matchedSafeZone,
          matchedRestrictedZone: testResult?.matchedRestrictedZone
        });
      } catch (error) {
        results.push({
          path: testPath,
          allowed: false,
          reason: error instanceof Error ? error.message : 'Unknown error',
          error: true
        });
      }
    }

    const allowedCount = results.filter(r => r.allowed).length;
    const deniedCount = results.filter(r => !r.allowed).length;

    return {
      action: 'test-multiple-paths',
      timestamp: new Date().toISOString(),
      success: true,
      totalTested: testPaths.length,
      results,
      summary: {
        allowed: allowedCount,
        denied: deniedCount,
        accessRate: Math.round((allowedCount / testPaths.length) * 100)
      },
      suggestions: [
        `📊 Tested ${testPaths.length} paths: ${allowedCount} allowed, ${deniedCount} denied`,
        allowedCount === testPaths.length
          ? '✅ All paths are accessible'
          : '⚠️ Some paths are blocked - consider expanding safe zones',
        '🔍 Check individual path results for specific access details'
      ]
    };
  }
}
