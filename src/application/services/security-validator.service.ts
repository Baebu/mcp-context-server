// Enhanced version of your existing security validator with shell-specific validations
// File: src/application/services/security-validator.service.ts

import { injectable, inject } from 'inversify';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import type { ISecurityValidator } from '../../core/interfaces/security.interface.js';
import { logger } from '../../utils/logger.js';
import type { ServerConfig } from '../../infrastructure/config/types.js';

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
      />\s*\/dev\//i, // Writing to device files
      /curl.*\|\s*sh/i, // Curl pipe to shell
      /wget.*\|\s*bash/i // Wget pipe to bash
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

  async validateCommand(command: string, args: string[]): Promise<void> {
    if (this.allowedCommands.has('all')) {
      logger.warn('All commands allowed - this is dangerous for production');
      // Still run additional security checks even if all commands are allowed
    } else if (!this.allowedCommands.has(command)) {
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

    // Additional argument validation
    this.validateArguments(args);

    logger.debug({ command, args }, 'Command validated');
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

  private async validateShellSpecific(command: string, args: string[]): Promise<void> {
    const argsString = args.join(' ');

    // PowerShell specific validations
    if (command.toLowerCase().includes('powershell') || command.toLowerCase() === 'pwsh') {
      const blockedCmdlets = [
        'Invoke-Expression',
        'Invoke-Command',
        'Start-Process',
        'Remove-Item',
        'Set-ExecutionPolicy',
        'Add-Type',
        'Invoke-RestMethod',
        'Invoke-WebRequest',
        'New-Object System.Net.WebClient',
        'DownloadString',
        'DownloadFile'
      ];

      for (const cmdlet of blockedCmdlets) {
        if (argsString.toLowerCase().includes(cmdlet.toLowerCase())) {
          throw new Error(`Blocked PowerShell cmdlet: ${cmdlet}`);
        }
      }

      // Block PowerShell encoded commands
      if (argsString.includes('-EncodedCommand') || argsString.includes('-enc')) {
        throw new Error('Encoded PowerShell commands are not allowed');
      }
    }

    // Bash/sh specific validations
    if (['bash', 'sh', 'zsh'].includes(command)) {
      const blockedFeatures = [
        'eval',
        'exec',
        'source',
        '$((', // Arithmetic expansion
        '$[', // Old arithmetic expansion
        '<(', // Process substitution
        '>(' // Process substitution
      ];

      for (const feature of blockedFeatures) {
        if (argsString.includes(feature)) {
          throw new Error(`Blocked shell feature: ${feature}`);
        }
      }
    }

    // CMD specific validations
    if (command.toLowerCase().includes('cmd')) {
      const blockedFeatures = ['start', 'call', 'for /f', 'powershell', 'wscript', 'cscript'];

      for (const feature of blockedFeatures) {
        if (argsString.toLowerCase().includes(feature)) {
          throw new Error(`Blocked CMD feature: ${feature}`);
        }
      }
    }

    // WSL specific validations
    if (command === 'wsl' || command === 'wsl.exe') {
      // Prevent escaping to Windows from WSL
      if (
        argsString.includes('/mnt/c/Windows/System32') ||
        argsString.includes('cmd.exe') ||
        argsString.includes('powershell.exe')
      ) {
        throw new Error('WSL access to Windows system directories blocked');
      }
    }
  }

  private validateArguments(args: string[]): void {
    for (const arg of args) {
      // Check for path traversal in arguments
      if (arg.includes('../') || arg.includes('..\\')) {
        throw new Error('Path traversal attempts in arguments are blocked');
      }

      // Check for null bytes (used in some exploits)
      if (arg.includes('\0')) {
        throw new Error('Null bytes in arguments are not allowed');
      }

      // Check for extremely long arguments (potential buffer overflow)
      if (arg.length > 4096) {
        throw new Error('Argument too long');
      }

      // Check for common injection patterns
      const injectionPatterns = [
        /&&/, // Command chaining
        /\|\|/, // OR command chaining
        /;/, // Command separator
        /\|/, // Pipe
        />/, // Redirect
        /</ // Input redirect
      ];

      for (const pattern of injectionPatterns) {
        if (pattern.test(arg)) {
          logger.warn({ arg, pattern: pattern.source }, 'Potentially dangerous argument pattern detected');
          // Note: Not throwing error here as these might be legitimate in some contexts
          // Consider making this configurable based on security level
        }
      }
    }
  }

  // Additional method for runtime security monitoring
  public logSecurityEvent(event: {
    type: 'command_blocked' | 'path_denied' | 'pattern_detected';
    command?: string;
    path?: string;
    pattern?: string;
    severity: 'low' | 'medium' | 'high';
    details?: string;
  }): void {
    logger.warn(
      {
        securityEvent: event,
        timestamp: new Date().toISOString()
      },
      `Security event: ${event.type}`
    );

    // In a production system, you might want to:
    // - Send alerts for high severity events
    // - Log to a security monitoring system
    // - Implement rate limiting for repeated violations
  }
}
