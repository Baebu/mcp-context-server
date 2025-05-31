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
  private unsafeArgumentContentPatterns: RegExp[];

  constructor(@inject('Config') private config: ServerConfig) {
    this.allowedCommands = new Set(
      Array.isArray(this.config.security.allowedCommands) ? this.config.security.allowedCommands : []
    );
    this.safeZones = this.config.security.safezones.map((zone: string) => path.resolve(zone));

    this.dangerousPatterns = [
      /rm\s+-rf/i,
      /del\s+\/s/i,
      /format\s+c:/i,
      /sudo\s+/i,
      /passwd/i,
      /chmod\s+(?:[0-7]{3,4}|u\+rwx|g\+rwx|o\+rwx|a\+rwx|\+x)/i,
      /dd\s+if=/i,
      /fdisk|mkfs|parted/i,
      /\.\.\//,
      /\$\(.*\)/,
      /`.*`/,
      /;\s*(?:rm|mv|cp|dd|mkfs|shutdown|reboot|halt)/i,
      /\|\s*(?:sh|bash|zsh|csh|ksh|powershell|pwsh|cmd)\s*$/i,
      />\s*\/dev\/(?:null|random|zero|sda|hda|tty|pts)/i,
      /<\s*\/dev\/(?:random|zero|sda|hda|tty|pts)/i,
      /(?:curl|wget)\s+.*\s*\|\s*(?:sh|bash|zsh|csh|ksh|powershell|pwsh)/i
    ];

    // Load unsafe argument patterns from config
    this.unsafeArgumentContentPatterns = (this.config.security.unsafeArgumentPatterns || []).map(patternStr => {
      try {
        return new RegExp(patternStr, 'i'); // Add 'i' for case-insensitivity, or make configurable
      } catch (e) {
        logger.error({ pattern: patternStr, error: e }, 'Invalid regex pattern in unsafeArgumentPatterns config');
        return new RegExp('THIS_IS_AN_INVALID_REGEX_PLACEHOLDER_THAT_WILL_NOT_MATCH_ANYTHING'); // Fallback
      }
    });
  }

  async validatePath(inputPath: string): Promise<string> {
    const resolvedPath = path.resolve(inputPath);
    let canonicalPath;
    try {
      canonicalPath = await fs.realpath(resolvedPath);
    } catch (error) {
      canonicalPath = resolvedPath;
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code !== 'ENOENT'
      ) {
        logger.warn({ path: inputPath, resolvedPath, error }, 'realpath failed, using resolved path for validation.');
      }
    }

    if (!this.isPathInSafeZone(canonicalPath)) {
      this.logSecurityEvent({
        type: 'path_denied',
        path: inputPath,
        details: `Resolved to ${canonicalPath}`,
        severity: 'high'
      });
      throw new Error(`Path access denied: ${inputPath} (resolved to ${canonicalPath} which is outside safe zones)`);
    }

    return canonicalPath;
  }

  async validateCommand(command: string, args: string[]): Promise<void> {
    const fullCommand = `${command} ${args.join(' ')}`;

    if (this.allowedCommands.has('all')) {
      logger.warn({ command: fullCommand }, 'SECURITY_RISK: All commands are currently allowed in configuration.');
    } else if (!this.allowedCommands.has(command)) {
      this.logSecurityEvent({ type: 'command_blocked', command, details: 'Not in whitelist', severity: 'high' });
      throw new Error(`Command not allowed: ${command}`);
    }

    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(fullCommand)) {
        this.logSecurityEvent({
          type: 'pattern_detected',
          pattern: pattern.source,
          command: fullCommand,
          severity: 'high'
        });
        throw new Error(`Potentially dangerous command pattern blocked: ${pattern.source} in command "${command}"`);
      }
    }

    await this.validateShellSpecific(command, args);
    this.validateArguments(args);

    logger.debug({ command, args }, 'Command validated');
  }

  isPathInSafeZone(testPath: string): boolean {
    const resolvedPath = path.resolve(testPath);
    return this.safeZones.some(zone => {
      const absoluteZone = path.resolve(zone);
      if (resolvedPath === absoluteZone) {
        return true;
      }
      return resolvedPath.startsWith(absoluteZone + path.sep);
    });
  }

  sanitizeInput(input: string): string {
    return input
      .replace(/[<>:"'|?*]/g, '')
      .replace(/\p{Cc}/gu, '')
      .replace(/\.\.+[/\\]?/g, '')
      .trim();
  }

  private async validateShellSpecific(command: string, args: string[]): Promise<void> {
    const argsString = args.join(' ');
    const lowerCommand = command.toLowerCase();

    if (lowerCommand.includes('powershell') || lowerCommand === 'pwsh') {
      const blockedCmdlets = [
        'Invoke-Expression',
        'iex',
        'Invoke-Command',
        'icm',
        'Start-Process',
        'start',
        'Remove-Item',
        'rm',
        'del',
        'Set-ExecutionPolicy',
        'Add-Type',
        'Invoke-RestMethod',
        'irm',
        'Invoke-WebRequest',
        'iwr',
        'wget',
        'curl',
        'New-Object System.Net.WebClient',
        /(DownloadString|DownloadFile)\s*\(.*\)/i,
        /-EncodedCommand|-enc\s+\S+/i
      ];

      for (const cmdlet of blockedCmdlets) {
        const pattern =
          typeof cmdlet === 'string' ? new RegExp(`(?:^|\\s|[-/;])${cmdlet}(?:$|\\s|[-/;])`, 'i') : cmdlet;
        if (pattern.test(argsString) || pattern.test(command)) {
          this.logSecurityEvent({
            type: 'pattern_detected',
            pattern: pattern.source,
            command: `${command} ${argsString}`,
            details: 'Blocked PowerShell cmdlet/feature',
            severity: 'high'
          });
          throw new Error(`Blocked PowerShell cmdlet/feature: ${pattern.source}`);
        }
      }
    }

    if (['bash', 'sh', 'zsh', 'ksh', 'csh'].includes(lowerCommand)) {
      const blockedFeatures = ['eval', 'exec', 'source', /\.\s/, /\$\(\(|\$\[/];
      for (const feature of blockedFeatures) {
        const pattern = typeof feature === 'string' ? new RegExp(`(?:^|\\s)${feature}(?:$|\\s)`, 'i') : feature;
        if (pattern.test(argsString)) {
          this.logSecurityEvent({
            type: 'pattern_detected',
            pattern: pattern.source,
            command: `${command} ${argsString}`,
            details: 'Blocked shell feature',
            severity: 'high'
          });
          throw new Error(`Blocked shell feature: ${pattern.source}`);
        }
      }
    }

    if (lowerCommand.includes('cmd') || lowerCommand === 'cmd.exe') {
      const blockedFeatures = [
        'start',
        'call',
        /for\s+\/f/i,
        'powershell',
        'wscript',
        'cscript',
        'reg add',
        'reg delete'
      ];
      for (const feature of blockedFeatures) {
        const pattern = typeof feature === 'string' ? new RegExp(`(?:^|\\s)${feature}(?:$|\\s)`, 'i') : feature;
        if (pattern.test(argsString)) {
          this.logSecurityEvent({
            type: 'pattern_detected',
            pattern: pattern.source,
            command: `${command} ${argsString}`,
            details: 'Blocked CMD feature',
            severity: 'high'
          });
          throw new Error(`Blocked CMD feature: ${pattern.source}`);
        }
      }
    }

    if (lowerCommand === 'wsl' || lowerCommand === 'wsl.exe') {
      if (
        argsString.includes('/mnt/c/Windows/System32') ||
        argsString.match(/\bcmd\.exe\b/i) ||
        argsString.match(/\bpowershell\.exe\b/i)
      ) {
        this.logSecurityEvent({
          type: 'pattern_detected',
          pattern: 'wsl_windows_escape',
          command: `${command} ${argsString}`,
          details: 'WSL escape to Windows system blocked',
          severity: 'high'
        });
        throw new Error('WSL access to Windows system directories or shells blocked');
      }
    }
  }

  private validateArguments(args: string[]): void {
    for (const arg of args) {
      if (arg.includes('../') || arg.includes('..\\')) {
        this.logSecurityEvent({
          type: 'pattern_detected',
          pattern: 'path_traversal_argument',
          details: `Argument: ${arg}`,
          severity: 'high'
        });
        throw new Error('Path traversal attempts in arguments are blocked');
      }

      if (arg.includes('\0')) {
        this.logSecurityEvent({
          type: 'pattern_detected',
          pattern: 'null_byte_argument',
          details: `Argument: ${arg}`,
          severity: 'high'
        });
        throw new Error('Null bytes in arguments are not allowed');
      }

      if (arg.length > 4096) {
        this.logSecurityEvent({
          type: 'pattern_detected',
          pattern: 'long_argument',
          details: `Argument length: ${arg.length}`,
          severity: 'medium'
        });
        throw new Error('Argument too long (max 4096 chars)');
      }

      const shellMetaCharPatterns = [
        { pattern: /&&/, name: 'command_chaining_&&' },
        { pattern: /\|\|/, name: 'command_chaining_||' },
        { pattern: /;/, name: 'command_separator_;' },
        { pattern: /\|(?![|=])/, name: 'pipe_|' },
        { pattern: />/, name: 'redirect_>' },
        { pattern: /</, name: 'redirect_<' }
      ];

      for (const { pattern, name } of shellMetaCharPatterns) {
        if (pattern.test(arg)) {
          this.logSecurityEvent({
            type: 'pattern_detected',
            pattern: name,
            details: `Argument: ${arg}`,
            severity: 'high'
          });
          throw new Error(`Potentially dangerous shell metacharacter '${pattern.source}' in argument: ${arg}`);
        }
      }

      // Use the patterns loaded from config
      for (const pattern of this.unsafeArgumentContentPatterns) {
        if (pattern.test(arg)) {
          this.logSecurityEvent({
            type: 'pattern_detected',
            pattern: pattern.source,
            details: `Argument: ${arg}`,
            severity: 'high'
          });
          throw new Error(`Unsafe argument content detected (pattern: ${pattern.source}): ${arg}`);
        }
      }
    }
  }

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
        securityEvent: {
          type: event.type,
          command: event.command,
          path: event.path,
          pattern: event.pattern,
          severity: event.severity,
          details: event.details,
          timestamp: new Date().toISOString()
        }
      },
      `SECURITY_EVENT (${event.severity.toUpperCase()}): ${event.type}. ${event.details || ''}`
    );
  }
}
