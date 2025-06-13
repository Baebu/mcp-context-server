// Security Configuration Diagnostic Tool
// File: src/tools/security-diagnostics.tool.ts

import { injectable } from 'inversify';
import { z } from 'zod';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { ISecurityValidator } from '@core/interfaces/security.interface.js';

const securityDiagnosticsSchema = z.object({
  action: z
    .enum([
      'info', 'test-path', 'test-command', 'list-safe-zones', 'list-restricted-zones', 'suggest-config',
      'expand-safe-zone', 'auto-discover', 'add-with-wildcards', 'refresh-zones', 'get-hierarchy', 
      'validate-access', 'reinitialize-enhanced', 'test-multiple-paths'
    ])
    .describe('Diagnostic action to perform'),
  path: z.string().optional().describe('Path to test (for test-path action)'),
  command: z.string().optional().describe('Command to test (for test-command action)'),
  args: z.array(z.string()).optional().default([]).describe('Command arguments (for test-command action)'),
  safeZonePath: z.string().optional().describe('Safe zone path for expansion, discovery, or validation actions'),
  testPaths: z.array(z.string()).optional().describe('Array of paths to test for access (used with test-multiple-paths action)')
});

// No longer need ExtendedSecurityValidator cast due to interface update
// interface ExtendedSecurityValidator extends ISecurityValidator {
//   getSecurityInfo?(): SecurityInfo;
//   testPathAccess?(path: string): Promise<PathTestResult>;
// }

interface SafeZoneDetails {
  original: string;
  resolved: string;
  exists: boolean;
  isDirectory: boolean;
  accessible: boolean;
  error?: string;
}

interface RestrictedZoneDetails {
  original: string;
  resolved?: string;
  type: 'glob-pattern' | 'direct-path' | 'error';
  exists?: boolean;
  description?: string;
  error?: string;
}

interface SecurityDiagnosticResult {
  action: string;
  timestamp: string;
  serverInfo: {
    platform: string;
    workingDirectory: string;
    homeDirectory: string;
  };
  securityConfig?: {
    safeZones: string[];
    restrictedZones: string[];
    safeZoneMode: string;
    allowedCommands: string[] | 'all';
    blockedPatterns: number;
  };
  pathTest?: {
    inputPath: string;
    resolvedPath: string;
    allowed: boolean;
    reason: string;
    matchedSafeZone?: string;
    matchedRestrictedZone?: string;
    suggestions?: string[];
  };
  commandTest?: {
    command: string;
    args: string[];
    allowed: boolean;
    reason?: string;
    suggestions?: string[];
  };
  suggestions?: string[];
  warnings?: string[];
  safeZoneDetails?: SafeZoneDetails[];
  restrictedZoneDetails?: RestrictedZoneDetails[];
  exampleConfiguration?: Record<string, unknown>;
  configurationTips?: string[];
}

@injectable()
export class SecurityDiagnosticsTool implements IMCPTool {
  name = 'security_diagnostics';
  description = 'Diagnose and test security configuration, safe zones, and restricted zones';
  schema = securityDiagnosticsSchema;

  async execute(params: z.infer<typeof securityDiagnosticsSchema>, context: ToolContext): Promise<ToolResult> {
    const securityValidator = context.container.get<ISecurityValidator>('SecurityValidator');

    const result: SecurityDiagnosticResult = {
      action: params.action,
      timestamp: new Date().toISOString(),
      serverInfo: {
        platform: os.platform(),
        workingDirectory: process.cwd(),
        homeDirectory: os.homedir()
      }
    };

    try {
      switch (params.action) {
        case 'info':
          await this.getSecurityInfo(result, securityValidator, context);
          break;

        case 'test-path':
          if (!params.path) {
            throw new Error('Path parameter is required for test-path action');
          }
          await this.testPathAccess(result, params.path, securityValidator);
          break;

        case 'test-command':
          if (!params.command) {
            throw new Error('Command parameter is required for test-command action');
          }
          await this.testCommandAccess(result, params.command, params.args || [], securityValidator);
          break;

        case 'list-safe-zones':
          await this.listSafeZones(result, securityValidator);
          break;

        case 'list-restricted-zones':
          await this.listRestrictedZones(result, securityValidator);
          break;

        case 'suggest-config':
          await this.suggestConfiguration(result, context);
          break;

        // Enhanced security actions
        case 'expand-safe-zone':
          if (!params.safeZonePath) {
            throw new Error('safeZonePath is required for expand-safe-zone action');
          }
          await this.expandSafeZone(result, params.safeZonePath, securityValidator);
          break;

        case 'auto-discover':
          if (!params.safeZonePath) {
            throw new Error('safeZonePath is required for auto-discover action');
          }
          await this.autoDiscoverSubdirectories(result, params.safeZonePath, securityValidator);
          break;

        case 'add-with-wildcards':
          if (!params.safeZonePath) {
            throw new Error('safeZonePath is required for add-with-wildcards action');
          }
          await this.addSafeZoneWithWildcards(result, params.safeZonePath, securityValidator);
          break;

        case 'refresh-zones':
          await this.refreshSafeZones(result, securityValidator);
          break;

        case 'get-hierarchy':
          await this.getSafeZoneHierarchy(result, securityValidator);
          break;

        case 'validate-access':
          if (!params.safeZonePath) {
            throw new Error('safeZonePath is required for validate-access action');
          }
          await this.validateSafeZoneAccess(result, params.safeZonePath, securityValidator);
          break;

        case 'reinitialize-enhanced':
          await this.reinitializeEnhanced(result, securityValidator);
          break;

        case 'test-multiple-paths':
          if (!params.testPaths || params.testPaths.length === 0) {
            throw new Error('testPaths array is required for test-multiple-paths action');
          }
          await this.testMultiplePaths(result, params.testPaths, securityValidator);
          break;

        default:
          throw new Error(`Unknown diagnostic action: ${params.action}`);
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
      context.logger.error({ error, params }, 'Security diagnostics failed');
      throw error;
    }
  }

  private async getSecurityInfo(
    result: SecurityDiagnosticResult,
    securityValidator: ISecurityValidator,
    context: ToolContext
  ): Promise<void> {
    const securityInfo = securityValidator.getSecurityInfo?.() || {
      safeZones: ['Information not available from validator'],
      restrictedZones: ['Information not available from validator'],
      safeZoneMode: 'unknown',
      blockedPatterns: 0
    };

    result.securityConfig = {
      safeZones: securityInfo.safeZones,
      restrictedZones: securityInfo.restrictedZones,
      safeZoneMode: securityInfo.safeZoneMode,
      allowedCommands: context.config.security.allowedCommands,
      blockedPatterns: securityInfo.blockedPatterns
    };

    result.suggestions = [
      '🔍 Use "test-path" action to test specific file/directory access',
      '🔍 Use "test-command" action to test command execution',
      '📋 Use "list-safe-zones" to see all allowed directories',
      '🚫 Use "list-restricted-zones" to see all blocked areas',
      '⚙️  Use "suggest-config" for configuration recommendations'
    ];

    result.warnings = [];
    if (Array.isArray(result.securityConfig.allowedCommands) && result.securityConfig.allowedCommands.includes('all')) {
      result.warnings.push('⚠️  All commands are allowed - this is dangerous for production');
    }
    if (result.securityConfig.safeZones.includes('/') || result.securityConfig.safeZones.includes('C:\\')) {
      result.warnings.push('⚠️  Root directory is in safe zones - this allows access to entire filesystem');
    }
    if (result.securityConfig.safeZones.length > 20) {
      result.warnings.push('ℹ️  Many safe zones configured - consider consolidating for better security');
    }
  }

  private async testPathAccess(
    result: SecurityDiagnosticResult,
    inputPath: string,
    securityValidator: ISecurityValidator
  ): Promise<void> {
    let pathTestResultData: {
      allowed: boolean;
      reason: string;
      resolvedPath: string;
      inputPath?: string;
      matchedSafeZone?: string;
      matchedRestrictedZone?: string;
    };

    if (securityValidator.testPathAccess) {
      pathTestResultData = await securityValidator.testPathAccess(inputPath);
    } else {
      // Fallback to basic validation if testPathAccess is not implemented
      try {
        const resolvedPath = await securityValidator.validatePath(inputPath); // This will throw on failure
        pathTestResultData = {
          allowed: true,
          reason: 'Path validation succeeded (using validatePath)',
          resolvedPath,
          inputPath
        };
      } catch (error) {
        pathTestResultData = {
          allowed: false,
          reason: error instanceof Error ? error.message : 'Path validation failed (using validatePath)',
          resolvedPath: path.resolve(inputPath), // Best guess for resolvedPath on error
          inputPath
        };
      }
    }

    result.pathTest = {
      inputPath: pathTestResultData.inputPath || inputPath,
      resolvedPath: pathTestResultData.resolvedPath,
      allowed: pathTestResultData.allowed,
      reason: pathTestResultData.reason,
      matchedSafeZone: pathTestResultData.matchedSafeZone,
      matchedRestrictedZone: pathTestResultData.matchedRestrictedZone,
      suggestions: []
    };

    // Generate suggestions based on result
    const currentSafeZoneMode = securityValidator.getSecurityInfo?.().safeZoneMode || 'unknown';
    if (!pathTestResultData.allowed) {
      let detailedReason = pathTestResultData.reason;
      if (pathTestResultData.matchedRestrictedZone) {
        detailedReason = `Path denied because it matches restricted zone: '${pathTestResultData.matchedRestrictedZone}'. Restricted zones override safe zones.`;
      } else if (pathTestResultData.reason.includes('blocked pattern')) {
        // The reason already includes "Path matches blocked pattern: ..."
      } else if (!pathTestResultData.matchedSafeZone) {
        detailedReason = `Path denied because it is not within any configured or auto-expanded safe zone. Current safe zone mode: ${currentSafeZoneMode}.`;
      }

      result.pathTest.reason = detailedReason; // Update reason with more detail
      result.pathTest.suggestions = [
        `Ensure the path '${pathTestResultData.resolvedPath}' or one of its parent directories is in your 'safezones' configuration.`,
        `Verify it's not part of a 'restrictedZones' entry (check defaults and your config). Restricted zones are evaluated first.`,
        `Verify it doesn't match any 'blockedPathPatterns' (check defaults and your config). These are also checked before safe zones.`,
        'Check file system permissions for the path to ensure the server process can access it.',
        `Current safe zone mode is '${currentSafeZoneMode}'. If 'strict', only exact matches for safe zones are allowed (not subdirectories).`
      ];
      if (pathTestResultData.matchedRestrictedZone) {
        result.pathTest.suggestions.push(
          `To allow, consider removing or refining the restricted zone pattern: '${pathTestResultData.matchedRestrictedZone}' in your configuration.`
        );
      }
    } else {
      result.pathTest.suggestions = [
        '✅ Path access is allowed.',
        `Path is within safe zone: '${pathTestResultData.matchedSafeZone}'.`,
        'Ensure the file/directory actually exists and has correct permissions for the server process to perform the intended operation (read/write/list).'
      ];
    }
  }

  private async testCommandAccess(
    result: SecurityDiagnosticResult,
    command: string,
    args: string[],
    securityValidator: ISecurityValidator
  ): Promise<void> {
    result.commandTest = {
      command,
      args,
      allowed: false,
      suggestions: []
    };

    try {
      await securityValidator.validateCommand(command, args);
      result.commandTest.allowed = true;
      result.commandTest.reason = 'Command validation succeeded';
      result.commandTest.suggestions = [
        '✅ Command execution is allowed.',
        '💡 Test with different arguments if needed.',
        '💡 Be aware of argument pattern restrictions defined in `unsafeArgumentPatterns`.'
      ];
    } catch (error) {
      result.commandTest.allowed = false;
      result.commandTest.reason = error instanceof Error ? error.message : 'Command validation failed';
      result.commandTest.suggestions = [
        "💡 Add the command to 'allowedCommands' in your server configuration if it's safe and necessary.",
        "💡 Check if arguments contain patterns matching 'unsafeArgumentPatterns' or default dangerous patterns.",
        '💡 Review command-specific restrictions (e.g., for shell injection, dangerous cmdlets).',
        '💡 Consider if this command is truly necessary for your intended use case with Claude.'
      ];
    }
  }

  private async listSafeZones(result: SecurityDiagnosticResult, securityValidator: ISecurityValidator): Promise<void> {
    const securityInfo = securityValidator.getSecurityInfo?.() || {
      safeZones: ['Information not available from validator'],
      safeZoneMode: 'unknown'
    };

    const expandedSafeZones: SafeZoneDetails[] = [];
    for (const zone of securityInfo.safeZones) {
      // zone is string here
      try {
        const resolvedZone = path.resolve(zone);
        const exists = await fs
          .access(resolvedZone)
          .then(() => true)
          .catch(() => false);
        const stats = exists ? await fs.stat(resolvedZone).catch(() => null) : null;

        expandedSafeZones.push({
          original: zone,
          resolved: resolvedZone,
          exists,
          isDirectory: stats?.isDirectory() || false,
          accessible: exists && (stats?.isDirectory() || false) // Simplified, actual accessibility depends on permissions
        });
      } catch (error) {
        expandedSafeZones.push({
          original: zone,
          resolved: 'Error resolving path',
          exists: false,
          isDirectory: false,
          accessible: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    // To provide more context, we also get the full security config as known by the validator.
    const fullSecurityInfo = securityValidator.getSecurityInfo?.();

    result.securityConfig = {
      safeZones: securityInfo.safeZones,
      restrictedZones: fullSecurityInfo?.restrictedZones || [],
      safeZoneMode: securityInfo.safeZoneMode,
      allowedCommands: [], // Not the focus here
      blockedPatterns: fullSecurityInfo?.blockedPatterns || 0
    };

    result.safeZoneDetails = expandedSafeZones;

    result.suggestions = [
      `📁 Current safe zone mode: ${securityInfo.safeZoneMode}.`,
      securityInfo.safeZoneMode === 'recursive'
        ? '✅ Subdirectories of existing safe zones are generally allowed (unless blocked by restricted zones/patterns).'
        : "⚠️  Only exact safe zone directories are allowed (strict mode). Subdirectories won't be covered unless explicitly listed or mode is 'recursive'.",
      '💡 Test specific paths using the "test-path" action to see effective permissions.',
      '💡 Non-existent or inaccessible directories in safe zones might not provide expected coverage.',
      "💡 Remember that 'restrictedZones' and 'blockedPathPatterns' can override safe zones."
    ];
  }

  private async listRestrictedZones(
    result: SecurityDiagnosticResult,
    securityValidator: ISecurityValidator
  ): Promise<void> {
    const securityInfo = securityValidator.getSecurityInfo?.() || {
      restrictedZones: ['Information not available from validator']
    };

    const expandedRestrictedZones: RestrictedZoneDetails[] = [];
    for (const zone of securityInfo.restrictedZones) {
      // zone is string here
      try {
        if (zone.includes('*')) {
          expandedRestrictedZones.push({
            original: zone,
            type: 'glob-pattern',
            description:
              'Matches files/directories using glob-like patterns. `**` matches across directories, `*` within a directory segment.'
          });
        } else {
          const resolvedZone = path.resolve(zone);
          const exists = await fs
            .access(resolvedZone)
            .then(() => true)
            .catch(() => false);

          expandedRestrictedZones.push({
            original: zone,
            resolved: resolvedZone,
            type: 'direct-path',
            exists
          });
        }
      } catch (error) {
        expandedRestrictedZones.push({
          original: zone,
          type: 'error',
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    const fullSecurityInfo = securityValidator.getSecurityInfo?.();
    result.securityConfig = {
      safeZones: fullSecurityInfo?.safeZones || [],
      restrictedZones: securityInfo.restrictedZones,
      safeZoneMode: fullSecurityInfo?.safeZoneMode || 'unknown',
      allowedCommands: [], // Not the focus
      blockedPatterns: fullSecurityInfo?.blockedPatterns || 0
    };

    result.restrictedZoneDetails = expandedRestrictedZones;

    result.suggestions = [
      '🚫 Restricted zones take precedence and block access even if a path is within a safe zone.',
      '🌟 Glob patterns (like `**/.ssh`) can match deeply nested paths.',
      '💡 Test specific paths you expect to be blocked using the "test-path" action to verify.',
      '💡 Review the default restricted zones added by the server for common sensitive areas.',
      "💡 If a restricted zone is too broad, consider refining it or removing it from your 'server.yaml' if it's user-defined."
    ];
  }

  private async suggestConfiguration(result: SecurityDiagnosticResult, context: ToolContext): Promise<void> {
    const suggestions = [];
    const warnings = [];
    const serverConfigSecurity = context.config.security;

    const cwd = process.cwd();
    const isCwdSafe = serverConfigSecurity.safezones.some(
      (
        zone: string // Explicitly type zone
      ) =>
        path.resolve(zone) === cwd ||
        (serverConfigSecurity.safeZoneMode === 'permissive' && cwd.startsWith(path.resolve(zone) + path.sep))
    );

    if (!isCwdSafe) {
      suggestions.push(
        "💡 Add current working directory ('.') to safe zones for general operations relative to server start."
      );
    }

    const commonDevDirs = [
      path.join(os.homedir(), 'Documents'),
      path.join(os.homedir(), 'Desktop'),
      path.join(os.homedir(), 'projects'),
      path.join(os.homedir(), 'workspace'),
      path.join(os.homedir(), 'dev')
    ];

    for (const dir of commonDevDirs) {
      try {
        const exists = await fs
          .access(dir)
          .then(() => true)
          .catch(() => false);
        if (exists) {
          const isDirSafe = serverConfigSecurity.safezones.some(
            (
              zone: string // Explicitly type zone
            ) =>
              path.resolve(zone) === path.resolve(dir) ||
              (serverConfigSecurity.safeZoneMode === 'permissive' &&
                path.resolve(dir).startsWith(path.resolve(zone) + path.sep))
          );
          if (!isDirSafe) {
            suggestions.push(
              `💡 Consider adding common development directory: "${dir}" to safe zones if you work there frequently.`
            );
          }
        }
      } catch {
        /* Ignore errors */
      }
    }

    if (
      Array.isArray(serverConfigSecurity.allowedCommands)
        ? serverConfigSecurity.allowedCommands.includes('all')
        : serverConfigSecurity.allowedCommands === 'all'
    ) {
      warnings.push(
        '⚠️  Security Risk: `allowedCommands` is set to "all". This is highly discouraged for production. Specify an explicit list of commands.'
      );
      suggestions.push(
        '💡 Best Practice: Replace "all" with a specific list of commands like ["ls", "cat", "grep", "find", "echo", "git status"].'
      );
    }

    if (serverConfigSecurity.safeZoneMode === 'strict') {
      suggestions.push(
        "💡 Consider using 'recursive' safe zone mode (default) for easier access to subdirectories within your projects, unless strict control is required."
      );
    }

    if (
      !serverConfigSecurity.restrictedZones ||
      serverConfigSecurity.restrictedZones.length === (securityDiagnosticsSchema.shape.action.options?.length || 0)
    ) {
      // Crude check if only defaults are present
      suggestions.push(
        "💡 Add specific 'restrictedZones' to protect sensitive areas (e.g., '**/secrets/**', '**/*.backup.key'). The server adds many defaults for system paths, but project-specific ones are good too."
      );
    }

    if (!serverConfigSecurity.blockedPathPatterns || serverConfigSecurity.blockedPathPatterns.length < 3) {
      // Arbitrary small number to suggest more
      suggestions.push(
        "💡 Augment 'blockedPathPatterns' with patterns specific to your environment, e.g., '.*\\\\.log\\\\.gz$' if you don't want archive logs touched."
      );
    }

    const exampleConfig = {
      security: {
        safeZoneMode: 'recursive',
        autoExpandSafezones: true, // Often useful for development
        safezones: ['.', '~/projects', '~/Documents/ClaudeProjects', '/tmp/claude_work'],
        restrictedZones: ['**/.git/hooks', '**/.env', '**/node_modules/.bin', '**/*.db-journal'], // Project-specific examples
        allowedCommands: ['ls -la', 'git status', 'cat package.json', 'grep "TODO" src', 'echo "Test"'], // Examples with args
        unsafeArgumentPatterns: ['^--(?!help|version)', ';', '&&', '\\|\\|'], // Stricter argument patterns
        blockedPathPatterns: ['^\\/dev\\/', '^\\/proc\\/'] // Example patterns
      }
    };

    result.suggestions = suggestions;
    result.warnings = warnings;
    result.exampleConfiguration = exampleConfig;
    result.configurationTips = [
      '🔧 Start with the "standard" or "developer" security presets and customize from there.',
      "🔧 Use 'recursive' mode for `safeZoneMode` unless you have specific reasons for 'strict' control.",
      "🔧 Regularly review and test your 'restrictedZones' and 'blockedPathPatterns' to ensure they are effective and not overly restrictive.",
      "🔧 Test your configuration changes thoroughly using the 'test-path' and 'test-command' actions of this tool.",
      '🔧 Keep `autoExpandSafezones: true` for convenience in development, but consider setting to `false` and explicitly listing all zones for production for tighter control.'
    ];
  }

  // Enhanced Security Methods (merged from enhanced-security-diagnostics.tool.ts)
  private async expandSafeZone(
    result: SecurityDiagnosticResult,
    safeZonePath: string,
    securityValidator: ISecurityValidator
  ): Promise<void> {
    if (typeof (securityValidator as any).expandSafeZoneRecursively === 'function') {
      (securityValidator as any).expandSafeZoneRecursively(safeZonePath);

      const hierarchy = typeof (securityValidator as any).getSafeZoneHierarchy === 'function' 
        ? (securityValidator as any).getSafeZoneHierarchy() 
        : null;

      Object.assign(result, {
        success: true,
        safeZonePath,
        message: 'Safe zone expanded with recursive wildcard patterns',
        hierarchy,
        suggestions: [
          '✅ Safe zone has been expanded with wildcard patterns for subdirectory access',
          '📁 All subdirectories within the safe zone should now be accessible',
          '🔍 Use validate-access action to verify subdirectory accessibility'
        ]
      });
    } else {
      throw new Error('Enhanced safe zone expansion not supported by current SecurityValidator');
    }
  }

  private async autoDiscoverSubdirectories(
    result: SecurityDiagnosticResult,
    safeZonePath: string,
    securityValidator: ISecurityValidator
  ): Promise<void> {
    if (typeof (securityValidator as any).autoDiscoverSubdirectories === 'function') {
      const discoveredPaths = await (securityValidator as any).autoDiscoverSubdirectories(safeZonePath);

      Object.assign(result, {
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
      });
    } else {
      throw new Error('Auto-discovery not supported by current SecurityValidator');
    }
  }

  private async addSafeZoneWithWildcards(
    result: SecurityDiagnosticResult,
    safeZonePath: string,
    securityValidator: ISecurityValidator
  ): Promise<void> {
    if (typeof (securityValidator as any).addSafeZoneWithWildcards === 'function') {
      (securityValidator as any).addSafeZoneWithWildcards(safeZonePath);

      Object.assign(result, {
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
      });
    } else {
      throw new Error('Wildcard safe zone addition not supported by current SecurityValidator');
    }
  }

  private async refreshSafeZones(
    result: SecurityDiagnosticResult,
    securityValidator: ISecurityValidator
  ): Promise<void> {
    if (typeof (securityValidator as any).refreshSafeZonesWithAutoExpansion === 'function') {
      await (securityValidator as any).refreshSafeZonesWithAutoExpansion();

      const hierarchy = typeof (securityValidator as any).getSafeZoneHierarchy === 'function' 
        ? (securityValidator as any).getSafeZoneHierarchy() 
        : null;

      Object.assign(result, {
        success: true,
        message: 'Safe zones refreshed with auto-expansion',
        hierarchy,
        suggestions: [
          '✅ All safe zones have been refreshed and expanded',
          '📁 Auto-discovery applied to all configured safe zones',
          '🔄 Security patterns are now up to date'
        ]
      });
    } else {
      throw new Error('Enhanced safe zone refresh not supported by current SecurityValidator');
    }
  }

  private async getSafeZoneHierarchy(
    result: SecurityDiagnosticResult,
    securityValidator: ISecurityValidator
  ): Promise<void> {
    if (typeof (securityValidator as any).getSafeZoneHierarchy === 'function') {
      const hierarchy = (securityValidator as any).getSafeZoneHierarchy();

      Object.assign(result, {
        success: true,
        hierarchy,
        analysis: {
          hasWildcardPatterns: hierarchy.wildcardPatterns?.length > 0,
          expansionRatio: hierarchy.totalZones / (hierarchy.configuredZones?.length || 1),
          hasRestrictedOverrides: hierarchy.restrictedOverrides?.length > 0
        },
        suggestions: [
          `📊 Total zones: ${hierarchy.totalZones || 0}`,
          `🔧 Configured zones: ${hierarchy.configuredZones?.length || 0}`,
          `🌟 Wildcard patterns: ${hierarchy.wildcardPatterns?.length || 0}`,
          hierarchy.restrictedOverrides?.length > 0
            ? '⚠️ Some safe zones have restricted overrides'
            : '✅ No conflicting restrictions found'
        ]
      });
    } else {
      // Fallback to basic security info
      const basicInfo = securityValidator.getSecurityInfo?.() || {};
      Object.assign(result, {
        success: true,
        basicInfo,
        message: 'Enhanced hierarchy not available, showing basic security info',
        suggestions: [
          '📊 Basic security information retrieved',
          '⚠️ Enhanced hierarchy features not available',
          '🔄 Consider updating SecurityValidator for full features'
        ]
      });
    }
  }

  private async validateSafeZoneAccess(
    result: SecurityDiagnosticResult,
    safeZonePath: string,
    securityValidator: ISecurityValidator
  ): Promise<void> {
    if (typeof (securityValidator as any).validateSafeZoneAccess === 'function') {
      const validation = await (securityValidator as any).validateSafeZoneAccess(safeZonePath);

      const accessRate = validation.totalChecked > 0
        ? validation.subdirectories.filter((s: any) => s.accessible).length / validation.totalChecked
        : 0;

      Object.assign(result, {
        success: true,
        safeZonePath,
        validation,
        accessRate: Math.round(accessRate * 100),
        summary: {
          totalChecked: validation.totalChecked,
          accessible: validation.subdirectories.filter((s: any) => s.accessible).length,
          denied: validation.subdirectories.filter((s: any) => !s.accessible).length
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
      });
    } else {
      throw new Error('Safe zone access validation not supported by current SecurityValidator');
    }
  }

  private async reinitializeEnhanced(
    result: SecurityDiagnosticResult,
    securityValidator: ISecurityValidator
  ): Promise<void> {
    if (typeof (securityValidator as any).reinitializeZonesWithExpansion === 'function') {
      await (securityValidator as any).reinitializeZonesWithExpansion();

      const hierarchy = typeof (securityValidator as any).getSafeZoneHierarchy === 'function' 
        ? (securityValidator as any).getSafeZoneHierarchy() 
        : null;

      Object.assign(result, {
        success: true,
        message: 'Security zones reinitialized with enhanced features',
        hierarchy,
        suggestions: [
          '✅ Security zones reinitialized with enhanced expansion',
          '🔄 All safe zone patterns have been refreshed',
          '📁 Maximum subdirectory access should now be available'
        ]
      });
    } else {
      throw new Error('Enhanced reinitialization not supported by current SecurityValidator');
    }
  }

  private async testMultiplePaths(
    result: SecurityDiagnosticResult,
    testPaths: string[],
    securityValidator: ISecurityValidator
  ): Promise<void> {
    const pathResults = [];

    for (const testPath of testPaths) {
      try {
        const testResult = await (securityValidator as any).testPathAccess?.(testPath);
        pathResults.push({
          path: testPath,
          allowed: testResult?.allowed || false,
          reason: testResult?.reason || 'No test result available',
          resolvedPath: testResult?.resolvedPath || testPath,
          matchedSafeZone: testResult?.matchedSafeZone,
          matchedRestrictedZone: testResult?.matchedRestrictedZone
        });
      } catch (error) {
        pathResults.push({
          path: testPath,
          allowed: false,
          reason: error instanceof Error ? error.message : 'Unknown error',
          error: true
        });
      }
    }

    const allowedCount = pathResults.filter(r => r.allowed).length;
    const deniedCount = pathResults.filter(r => !r.allowed).length;

    Object.assign(result, {
      success: true,
      totalTested: testPaths.length,
      results: pathResults,
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
    });
  }
}
