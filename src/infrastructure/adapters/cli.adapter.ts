// Enhanced CLI Adapter with better shell detection and security
import { spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import { injectable, inject } from 'inversify';
import type { ICLIHandler, CommandResult, CommandOptions } from '@core/interfaces/cli.interface.js';
import type { ISecurityValidator } from '@core/interfaces/security.interface.js';
import { logger } from '../../utils/logger.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ServerConfig, SecurityConfig as AppSecurityConfig } from '../../infrastructure/config/schema.js'; // Use AppSecurityConfig
import os from 'node:os';

interface ShellInfo {
  command: string;
  args: string[];
  env?: Record<string, string>;
}

@injectable()
export class CLIAdapter implements ICLIHandler {
  constructor(@inject('SecurityValidator') private security: ISecurityValidator) {}

  async execute(params: { command: string; args: string[]; options?: CommandOptions }): Promise<CommandResult> {
    // Enhanced security validation
    await this.security.validateCommand(params.command, params.args);

    if (params.options?.cwd) {
      await this.security.validatePath(params.options.cwd);
    }

    const startTime = Date.now();
    const shellInfo = this.getShellInfo(params.options?.shell);

    return new Promise((resolve, reject) => {
      const spawnOptions: SpawnOptions = {
        cwd: params.options?.cwd,
        env: {
          ...process.env,
          ...params.options?.env,
          ...shellInfo.env
        },
        timeout: params.options?.timeout || 30000,
        windowsHide: true,
        // Enhanced security: disable shell interpretation by default
        shell: false
      };

      // Construct command based on shell type
      const { command, args } = this.buildCommand(params.command, params.args, shellInfo);

      logger.debug(
        {
          originalCommand: params.command,
          finalCommand: command,
          args,
          shell: params.options?.shell
        },
        'Executing command'
      );

      const child = spawn(command, args, spawnOptions);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', data => {
        stdout += data.toString();
      });

      child.stderr?.on('data', data => {
        stderr += data.toString();
      });

      child.on('close', (code, signal) => {
        const executionTime = Date.now() - startTime;

        const result: CommandResult = {
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0,
          signal,
          executionTime
        };

        logger.debug(
          {
            command: params.command,
            exitCode: code,
            executionTime,
            stdoutLength: stdout.length,
            stderrLength: stderr.length
          },
          'Command completed'
        );

        resolve(result);
      });

      child.on('error', error => {
        logger.error({ error, command: params.command }, 'Command execution failed');
        reject(error);
      });

      // Enhanced timeout handling
      const timeoutId = setTimeout(() => {
        child.kill('SIGTERM');
        setTimeout(() => {
          if (!child.killed) {
            child.kill('SIGKILL');
          }
        }, 5000); // Grace period before SIGKILL
      }, params.options?.timeout || 30000);

      child.on('close', () => clearTimeout(timeoutId));
    });
  }

  private getShellInfo(shellType?: 'default' | 'powershell' | 'bash' | 'cmd' | 'wsl'): ShellInfo {
    const platform = os.platform();

    switch (shellType) {
      case 'powershell':
        return {
          command: platform === 'win32' ? 'powershell.exe' : 'pwsh',
          args: ['-NoProfile', '-NonInteractive', '-Command'],
          env: { PSExecutionPolicyPreference: 'Bypass' }
        };

      case 'cmd':
        return {
          command: 'cmd.exe',
          args: ['/c']
        };

      case 'bash':
        return {
          command: 'bash',
          args: ['-c']
        };

      case 'wsl':
        return {
          command: 'wsl.exe',
          args: ['--']
        };

      default:
        // Platform-appropriate default
        if (platform === 'win32') {
          return {
            command: 'cmd.exe',
            args: ['/c']
          };
        } else {
          return {
            command: 'sh',
            args: ['-c']
          };
        }
    }
  }

  private buildCommand(command: string, args: string[], shellInfo: ShellInfo): { command: string; args: string[] } {
    // For shell-based execution, combine command and args
    if (shellInfo.args.includes('-c') || shellInfo.args.includes('/c') || shellInfo.args.includes('--')) {
      const fullCommand = args.length > 0 ? `${command} ${args.join(' ')}` : command;
      return {
        command: shellInfo.command,
        args: [...shellInfo.args, fullCommand]
      };
    }

    // Direct execution
    return {
      command,
      args
    };
  }

  async validateCommand(command: string): Promise<boolean> {
    try {
      await this.security.validateCommand(command, []);
      return true;
    } catch {
      return false;
    }
  }
}

// Enhanced Security Validator with shell-specific rules
@injectable()
export class SecurityValidator implements ISecurityValidator {
  private allowedCommands: Set<string>;
  private safeZones: string[];
  private dangerousPatterns: RegExp[];
  private securitySettings: AppSecurityConfig; // Use the imported SecurityConfig type

  constructor(@inject('Config') config: ServerConfig) {
    // Inject full ServerConfig
    this.securitySettings = config.security; // Store only the security part
    this.allowedCommands = new Set(
      Array.isArray(this.securitySettings.allowedCommands) ? this.securitySettings.allowedCommands : []
    );
    this.safeZones = this.securitySettings.safezones.map((zone: string) => path.resolve(zone));

    // Enhanced dangerous pattern detection
    this.dangerousPatterns = [
      /rm\s+-rf/i,
      /del\s+\/s/i,
      /format\s+c:/i,
      /sudo\s+/i,
      /passwd/i,
      /chmod\s+777/i,
      /dd\s+if=/i,
      /fdisk/i,
      /\.\.\/.*\/\.\./, // Path traversal
      /\$\(.*\)/, // Command substitution
      /`.*`/, // Backtick execution
      /;\s*rm/i, // Command chaining with rm
      /\|\s*sh/i, // Piping to shell
      />\s*\/dev\//i // Writing to device files
    ];
    // Add patterns from config if they exist
    if (this.securitySettings.unsafeArgumentPatterns) {
      this.securitySettings.unsafeArgumentPatterns.forEach(p => {
        try {
          this.dangerousPatterns.push(new RegExp(p, 'i'));
        } catch (e) {
          logger.warn({ pattern: p, error: e }, 'Invalid regex pattern in unsafeArgumentPatterns from config');
        }
      });
    }
  }

  async validatePath(inputPath: string): Promise<string> {
    const resolvedPath = path.resolve(inputPath);
    const canonicalPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);

    if (!this.isPathInSafeZone(canonicalPath)) {
      throw new Error(`Path access denied: ${inputPath} is not within configured safe zones.`);
    }
    // Check against blockedPathPatterns
    if (
      this.securitySettings.blockedPathPatterns &&
      this.securitySettings.blockedPathPatterns.some(pattern => new RegExp(pattern).test(canonicalPath))
    ) {
      throw new Error(`Path access denied: ${inputPath} matches a blocked pattern.`);
    }

    return canonicalPath;
  }

  isPathInSafeZone(testPath: string): boolean {
    const resolvedPath = path.resolve(testPath);
    // Check restricted zones first
    if (
      this.securitySettings.restrictedZones &&
      this.securitySettings.restrictedZones.some(zone => resolvedPath.startsWith(path.resolve(zone)))
    ) {
      return false;
    }
    // Check safe zones
    return this.safeZones.some(zone => {
      if (this.securitySettings.safeZoneMode === 'recursive') {
        return resolvedPath.startsWith(zone);
      }
      return resolvedPath === zone;
    });
  }

  sanitizeInput(input: string): string {
    return input
      .replace(/[<>:"'|?*]/g, '')
      .replace(/\.\./g, '')
      .trim();
  }

  async validateCommand(command: string, args: string[]): Promise<void> {
    if (this.securitySettings.allowedCommands === 'all') {
      logger.warn('All commands allowed - this is dangerous for production');
      return;
    }

    if (!this.allowedCommands.has(command)) {
      throw new Error(`Command not allowed: ${command}`);
    }

    const fullCommand = `${command} ${args.join(' ')}`;

    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(fullCommand)) {
        throw new Error(`Potentially dangerous command blocked: ${command}`);
      }
    }
    await this.validateShellSpecific(command, args);
    logger.debug({ command, args }, 'Command validated successfully');
  }

  private async validateShellSpecific(command: string, args: string[]): Promise<void> {
    if (command.toLowerCase().includes('powershell')) {
      const blockedCmdlets = [
        'Invoke-Expression',
        'Invoke-Command',
        'Start-Process',
        'Remove-Item',
        'Set-ExecutionPolicy'
      ];
      const argsString = args.join(' ');
      for (const cmdlet of blockedCmdlets) {
        if (argsString.includes(cmdlet)) throw new Error(`Blocked PowerShell cmdlet: ${cmdlet}`);
      }
    }

    if (['bash', 'sh', 'zsh'].includes(command)) {
      const blockedFeatures = ['eval', 'exec', 'source', '$((', '$['];
      const argsString = args.join(' ');
      for (const feature of blockedFeatures) {
        if (argsString.includes(feature)) throw new Error(`Blocked shell feature: ${feature}`);
      }
    }
  }
  // Implementation for getSecurityInfo
  getSecurityInfo(): { safeZones: string[]; restrictedZones: string[]; safeZoneMode: string; blockedPatterns: number } {
    return {
      safeZones: this.securitySettings.safezones,
      restrictedZones: this.securitySettings.restrictedZones,
      safeZoneMode: this.securitySettings.safeZoneMode,
      blockedPatterns: this.securitySettings.blockedPathPatterns.length
    };
  }

  // Implementation for testPathAccess
  async testPathAccess(inputPath: string): Promise<{
    allowed: boolean;
    reason: string;
    resolvedPath: string;
    inputPath?: string | undefined;
    matchedSafeZone?: string | undefined;
    matchedRestrictedZone?: string | undefined;
  }> {
    try {
      const resolvedPath = await this.validatePath(inputPath); // This will throw if not allowed
      const matchedSafeZone = this.safeZones.find(zone => resolvedPath.startsWith(zone));
      return {
        allowed: true,
        reason: 'Path is within a safe zone and not restricted.',
        resolvedPath,
        inputPath,
        matchedSafeZone
      };
    } catch (error) {
      const resolvedPathAttempt = path.resolve(inputPath);
      const matchedRestrictedZone = this.securitySettings.restrictedZones.find(zone =>
        resolvedPathAttempt.startsWith(path.resolve(zone))
      );
      return {
        allowed: false,
        reason: error instanceof Error ? error.message : 'Path access denied for an unknown reason.',
        resolvedPath: resolvedPathAttempt,
        inputPath,
        matchedRestrictedZone
      };
    }
  }
}
