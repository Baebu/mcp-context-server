// Enhanced CLI Adapter with better shell detection and security
import { spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import { injectable, inject } from 'inversify';
import type { ICLIHandler, CommandResult, CommandOptions } from '@core/interfaces/cli.interface.js';
import type { ISecurityValidator } from '@core/interfaces/security.interface.js';
import { logger } from '../../utils/logger.js';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ServerConfig } from '../../infrastructure/config/types.js';
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

  constructor(@inject('Config') private config: ServerConfig) {
    this.allowedCommands = new Set(
      Array.isArray(this.config.security.allowedCommands) ? this.config.security.allowedCommands : []
    );
    this.safeZones = this.config.security.safezones.map((zone: string) => path.resolve(zone));

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
  }

  async validatePath(inputPath: string): Promise<string> {
    const resolvedPath = path.resolve(inputPath);
    const canonicalPath = await fs.realpath(resolvedPath).catch(() => resolvedPath);

    if (!this.isPathInSafeZone(canonicalPath)) {
      throw new Error(`Path access denied: ${inputPath}`);
    }

    return canonicalPath;
  }

  isPathInSafeZone(testPath: string): boolean {
    const resolvedPath = path.resolve(testPath);
    return this.safeZones.some(zone => resolvedPath.startsWith(zone));
  }

  sanitizeInput(input: string): string {
    return input
      .replace(/[<>:"'|?*]/g, '') // Remove potentially dangerous characters
      .replace(/\.\./g, '') // Remove directory traversal attempts
      .trim();
  }

  async validateCommand(command: string, args: string[]): Promise<void> {
    // Check if all commands are allowed
    if (this.allowedCommands.has('all')) {
      logger.warn('All commands allowed - this is dangerous for production');
      return;
    }

    // Validate base command
    if (!this.allowedCommands.has(command)) {
      throw new Error(`Command not allowed: ${command}`);
    }

    // Enhanced validation for dangerous patterns
    const fullCommand = `${command} ${args.join(' ')}`;

    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(fullCommand)) {
        throw new Error(`Potentially dangerous command blocked: ${command}`);
      }
    }

    // Shell-specific validations
    await this.validateShellSpecific(command, args);

    logger.debug({ command, args }, 'Command validated successfully');
  }

  private async validateShellSpecific(command: string, args: string[]): Promise<void> {
    // PowerShell specific validations
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
        if (argsString.includes(cmdlet)) {
          throw new Error(`Blocked PowerShell cmdlet: ${cmdlet}`);
        }
      }
    }

    // Bash/sh specific validations
    if (['bash', 'sh', 'zsh'].includes(command)) {
      const blockedFeatures = [
        'eval',
        'exec',
        'source',
        '$((', // Arithmetic expansion
        '$[' // Old arithmetic expansion
      ];

      const argsString = args.join(' ');
      for (const feature of blockedFeatures) {
        if (argsString.includes(feature)) {
          throw new Error(`Blocked shell feature: ${feature}`);
        }
      }
    }
  }
}
