// Security Configuration Diagnostic Tool
// File: src/tools/security-diagnostics.tool.ts

import { injectable } from 'inversify';
import { z } from 'zod';
import path from 'node:path';
import os from 'node:os';
import { promises as fs } from 'node:fs';
import type { IMCPTool, ToolContext, ToolResult } from '@core/interfaces/tool-registry.interface.js';
import type { ISecurityValidator } from '@core/interfaces/security.interface.js';

const securityDiagnosticsSchema = z.object({
  action: z
    .enum(['info', 'test-path', 'test-command', 'list-safe-zones', 'list-restricted-zones', 'suggest-config'])
    .describe('Diagnostic action to perform'),
  path: z.string().optional().describe('Path to test (for test-path action)'),
  command: z.string().optional().describe('Command to test (for test-command action)'),
  args: z.array(z.string()).optional().default([]).describe('Command arguments (for test-command action)')
});

interface SecurityInfo {
  safeZones: string[];
  restrictedZones: string[];
  safeZoneMode: string;
  blockedPatterns: number;
}

interface PathTestResult {
  allowed: boolean;
  reason: string;
  resolvedPath: string;
  inputPath: string;
  matchedSafeZone?: string;
  matchedRestrictedZone?: string;
}

interface ExtendedSecurityValidator extends ISecurityValidator {
  getSecurityInfo?(): SecurityInfo;
  testPathAccess?(path: string): Promise<PathTestResult>;
}

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
    const securityValidator = context.container.get('SecurityValidator') as ExtendedSecurityValidator;

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
    securityValidator: ExtendedSecurityValidator,
    context: ToolContext
  ): Promise<void> {
    // Get security configuration info
    const securityInfo = securityValidator.getSecurityInfo?.() || {
      safeZones: ['Information not available'],
      restrictedZones: ['Information not available'],
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

    // Generate general suggestions
    result.suggestions = [
      '🔍 Use "test-path" action to test specific file/directory access',
      '🔍 Use "test-command" action to test command execution',
      '📋 Use "list-safe-zones" to see all allowed directories',
      '🚫 Use "list-restricted-zones" to see all blocked areas',
      '⚙️  Use "suggest-config" for configuration recommendations'
    ];

    // Add warnings based on configuration
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
    securityValidator: ExtendedSecurityValidator
  ): Promise<void> {
    let pathResult: PathTestResult;

    // Use the detailed validation method if available
    if (securityValidator.testPathAccess) {
      pathResult = await securityValidator.testPathAccess(inputPath);
    } else {
      // Fallback to basic validation
      try {
        const resolvedPath = await securityValidator.validatePath(inputPath);
        pathResult = {
          allowed: true,
          reason: 'Path validation succeeded',
          resolvedPath,
          inputPath
        };
      } catch (error) {
        pathResult = {
          allowed: false,
          reason: error instanceof Error ? error.message : 'Path validation failed',
          resolvedPath: path.resolve(inputPath),
          inputPath
        };
      }
    }

    result.pathTest = {
      inputPath: pathResult.inputPath || inputPath,
      resolvedPath: pathResult.resolvedPath,
      allowed: pathResult.allowed,
      reason: pathResult.reason,
      matchedSafeZone: pathResult.matchedSafeZone,
      matchedRestrictedZone: pathResult.matchedRestrictedZone,
      suggestions: []
    };

    // Generate suggestions based on result
    if (!pathResult.allowed) {
      result.pathTest.suggestions = [
        '💡 Add the parent directory to safe zones in your configuration',
        '💡 Check if the path is in a restricted zone that needs to be removed',
        '💡 Ensure the path exists and is accessible',
        "💡 Try testing the parent directory to see if it's allowed"
      ];
    } else {
      result.pathTest.suggestions = [
        '✅ Path access is allowed',
        '💡 Test specific files within this directory if needed',
        '💡 Check if subdirectories are also accessible (depends on safeZoneMode)'
      ];
    }
  }

  private async testCommandAccess(
    result: SecurityDiagnosticResult,
    command: string,
    args: string[],
    securityValidator: ExtendedSecurityValidator
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
        '✅ Command execution is allowed',
        '💡 Test with different arguments if needed',
        '💡 Be aware of argument pattern restrictions'
      ];
    } catch (error) {
      result.commandTest.allowed = false;
      result.commandTest.reason = error instanceof Error ? error.message : 'Command validation failed';
      result.commandTest.suggestions = [
        '💡 Add the command to allowedCommands in your configuration',
        '💡 Check if arguments contain unsafe patterns',
        '💡 Review command-specific restrictions (shell injection, etc.)',
        '💡 Consider if this command is necessary for your use case'
      ];
    }
  }

  private async listSafeZones(
    result: SecurityDiagnosticResult,
    securityValidator: ExtendedSecurityValidator
  ): Promise<void> {
    const securityInfo = securityValidator.getSecurityInfo?.() || {
      safeZones: ['Information not available'],
      safeZoneMode: 'unknown'
    };

    const expandedSafeZones: SafeZoneDetails[] = [];
    for (const zone of securityInfo.safeZones) {
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
          accessible: exists && (stats?.isDirectory() || false)
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

    result.securityConfig = {
      safeZones: securityInfo.safeZones,
      restrictedZones: [],
      safeZoneMode: securityInfo.safeZoneMode,
      allowedCommands: [],
      blockedPatterns: 0
    };

    result.safeZoneDetails = expandedSafeZones;

    result.suggestions = [
      `📁 Safe zone mode: ${securityInfo.safeZoneMode}`,
      securityInfo.safeZoneMode === 'recursive'
        ? '✅ Subdirectories of safe zones are automatically allowed'
        : '⚠️  Only exact safe zone directories are allowed (strict mode)',
      '💡 Test specific paths using the "test-path" action',
      '💡 Non-existent directories in safe zones may cause issues'
    ];
  }

  private async listRestrictedZones(
    result: SecurityDiagnosticResult,
    securityValidator: ExtendedSecurityValidator
  ): Promise<void> {
    const securityInfo = securityValidator.getSecurityInfo?.() || {
      restrictedZones: ['Information not available']
    };

    const expandedRestrictedZones: RestrictedZoneDetails[] = [];
    for (const zone of securityInfo.restrictedZones) {
      try {
        // Handle glob patterns differently
        if (zone.includes('*')) {
          expandedRestrictedZones.push({
            original: zone,
            type: 'glob-pattern',
            description: 'Matches files/directories using glob patterns'
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

    result.securityConfig = {
      safeZones: [],
      restrictedZones: securityInfo.restrictedZones,
      safeZoneMode: 'unknown',
      allowedCommands: [],
      blockedPatterns: 0
    };

    result.restrictedZoneDetails = expandedRestrictedZones;

    result.suggestions = [
      '🚫 Restricted zones override safe zones for security',
      '🌟 Glob patterns (**) match anywhere in the filesystem',
      "💡 Test specific paths to see if they're blocked",
      '💡 Remove restricted zones that are too broad for your use case'
    ];
  }

  private async suggestConfiguration(result: SecurityDiagnosticResult, context: ToolContext): Promise<void> {
    const suggestions = [];
    const warnings = [];

    // Analyze current working directory
    const cwd = process.cwd();
    const cwdSafe = context.config.security.safezones.some(
      zone => path.resolve(zone) === cwd || cwd.startsWith(path.resolve(zone))
    );

    if (!cwdSafe) {
      suggestions.push('💡 Add current working directory to safe zones: "."');
    }

    // Check for common development directories
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
          const inSafeZones = context.config.security.safezones.some(
            zone => path.resolve(zone) === dir || dir.startsWith(path.resolve(zone))
          );
          if (!inSafeZones) {
            suggestions.push(`💡 Consider adding development directory: "${dir}"`);
          }
        }
      } catch {
        // Ignore errors
      }
    }

    // Security recommendations
    if (context.config.security.allowedCommands === 'all') {
      warnings.push('⚠️  Consider limiting allowed commands instead of allowing "all"');
      suggestions.push('💡 Replace "all" with specific commands: ["ls", "cat", "grep", "find", "echo"]');
    }

    if (!context.config.security.safeZoneMode || context.config.security.safeZoneMode === 'strict') {
      suggestions.push('💡 Consider using "recursive" safe zone mode for easier development');
    }

    if (!context.config.security.restrictedZones || context.config.security.restrictedZones.length === 0) {
      suggestions.push('💡 Add restricted zones to protect sensitive areas like "**/.ssh" and "**/.env*"');
    }

    // Generate example configuration
    const exampleConfig = {
      security: {
        safeZoneMode: 'recursive',
        autoExpandSafezones: true,
        safezones: ['.', '~/Documents', '~/Desktop', '/tmp'],
        restrictedZones: ['**/.ssh/**', '**/.env*', '**/secrets/**', '**/*.key', '**/*.pem'],
        allowedCommands: ['ls', 'cat', 'grep', 'find', 'echo', 'pwd', 'whoami']
      }
    };

    result.suggestions = suggestions;
    result.warnings = warnings;
    result.exampleConfiguration = exampleConfig;
    result.configurationTips = [
      '🔧 Start with restrictive settings and gradually open up as needed',
      '🔧 Use "recursive" mode for easier access to project subdirectories',
      '🔧 Always include restricted zones for sensitive files',
      '🔧 Test your configuration with the diagnostic tools',
      '🔧 Review security logs regularly for blocked access attempts'
    ];
  }
}
