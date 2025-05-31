// Enhanced Security Validator with Hierarchical Safe Zones and Restricted Zones
// File: src/application/services/security-validator.service.ts

import { injectable, inject } from 'inversify';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import type { ISecurityValidator } from '../../core/interfaces/security.interface.js';
import { logger } from '../../utils/logger.js';
import type { ServerConfig } from '../../infrastructure/config/types.js';

interface PathValidationResult {
  allowed: boolean;
  reason: string;
  resolvedPath: string;
  matchedSafeZone?: string;
  matchedRestrictedZone?: string;
}

@injectable()
export class SecurityValidator implements ISecurityValidator {
  private allowedCommands: Set<string>;
  private safeZones: string[];
  private restrictedZones: string[];
  private resolvedSafeZones: string[];
  private resolvedRestrictedZones: string[];
  private dangerousPatterns: RegExp[];
  private unsafeArgumentContentPatterns: RegExp[];
  private blockedPathPatterns: RegExp[];
  private safeZoneMode: 'strict' | 'recursive';

  // Common system directories that should be restricted by default
  private readonly DEFAULT_RESTRICTED_ZONES = [
    // Windows system directories
    'C:\\Windows\\System32',
    'C:\\Windows\\SysWOW64',
    'C:\\Program Files\\WindowsApps',
    'C:\\ProgramData\\Microsoft\\Windows\\Start Menu',
    // Unix/Linux system directories
    '/bin',
    '/boot',
    '/dev',
    '/etc/passwd',
    '/etc/shadow',
    '/etc/sudoers*',
    '/lib',
    '/proc',
    '/root',
    '/sbin',
    '/sys',
    '/usr/bin',
    '/usr/sbin',
    '/var/log/auth*',
    '/var/log/secure*',
    // macOS system directories
    '/System',
    '/Library/Keychains',
    '/private/etc',
    '/private/var/root',
    // Cross-platform sensitive areas
    '**/.ssh',
    '**/.gnupg',
    '**/AppData/Roaming/Microsoft/Credentials',
    '**/Library/Keychains',
    '**/.aws/credentials',
    '**/.docker/config.json',
    '**/id_rsa*',
    '**/id_ed25519*',
    '**/*.pem',
    '**/*.key',
    '**/*.p12',
    '**/*.pfx'
  ];

  constructor(@inject('Config') private config: ServerConfig) {
    this.allowedCommands = new Set(
      Array.isArray(this.config.security.allowedCommands) ? this.config.security.allowedCommands : []
    );

    // Initialize safe zones
    this.safeZones = this.config.security.safezones || ['.'];
    this.resolvedSafeZones = this.safeZones.map(zone => this.resolvePath(zone));

    // Initialize restricted zones (merge defaults with config)
    const configRestrictedZones = this.config.security.restrictedZones || [];
    this.restrictedZones = [...this.DEFAULT_RESTRICTED_ZONES, ...configRestrictedZones];
    this.resolvedRestrictedZones = this.restrictedZones.map(zone => this.resolvePath(zone));

    // Safe zone mode (default to recursive for better UX)
    this.safeZoneMode = this.config.security.safeZoneMode || 'recursive';

    // Initialize path patterns
    this.blockedPathPatterns = (this.config.security.blockedPathPatterns || []).map(pattern => {
      try {
        return new RegExp(pattern, 'i');
      } catch (e) {
        logger.error({ pattern, error: e }, 'Invalid blocked path pattern');
        return new RegExp('INVALID_PATTERN_PLACEHOLDER');
      }
    });

    // Initialize dangerous command patterns
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

    // Initialize unsafe argument patterns
    this.unsafeArgumentContentPatterns = (this.config.security.unsafeArgumentPatterns || []).map(patternStr => {
      try {
        return new RegExp(patternStr, 'i');
      } catch (e) {
        logger.error({ pattern: patternStr, error: e }, 'Invalid regex pattern in unsafeArgumentPatterns config');
        return new RegExp('INVALID_REGEX_PLACEHOLDER');
      }
    });

    logger.info(
      {
        safeZones: this.resolvedSafeZones.length,
        restrictedZones: this.resolvedRestrictedZones.length,
        safeZoneMode: this.safeZoneMode,
        blockedPatterns: this.blockedPathPatterns.length
      },
      'Security validator initialized'
    );
  }

  async validatePath(inputPath: string): Promise<string> {
    const result = await this.validatePathDetailed(inputPath);

    if (!result.allowed) {
      this.logSecurityEvent({
        type: 'path_denied',
        path: inputPath,
        details: result.reason,
        severity: 'high'
      });
      throw new Error(`Path access denied: ${inputPath} - ${result.reason}`);
    }

    return result.resolvedPath;
  }

  async validatePathDetailed(inputPath: string): Promise<PathValidationResult> {
    const resolvedPath = this.resolvePath(inputPath);
    let canonicalPath: string;

    try {
      canonicalPath = await fs.realpath(resolvedPath);
    } catch (error) {
      // If path doesn't exist, use resolved path for validation
      canonicalPath = resolvedPath;
      if (
        typeof error === 'object' &&
        error !== null &&
        'code' in error &&
        (error as { code: string }).code !== 'ENOENT'
      ) {
        logger.warn({ path: inputPath, resolvedPath, error }, 'realpath failed, using resolved path for validation');
      }
    }

    // Check blocked path patterns first
    for (const pattern of this.blockedPathPatterns) {
      if (pattern.test(canonicalPath) || pattern.test(inputPath)) {
        return {
          allowed: false,
          reason: `Path matches blocked pattern: ${pattern.source}`,
          resolvedPath: canonicalPath
        };
      }
    }

    // Check restricted zones (these override safe zones)
    const restrictedMatch = this.checkRestrictedZones(canonicalPath);
    if (restrictedMatch) {
      return {
        allowed: false,
        reason: `Path is in restricted zone: ${restrictedMatch}`,
        resolvedPath: canonicalPath,
        matchedRestrictedZone: restrictedMatch
      };
    }

    // Check safe zones
    const safeZoneMatch = this.checkSafeZones(canonicalPath);
    if (safeZoneMatch) {
      return {
        allowed: true,
        reason: `Path is in safe zone: ${safeZoneMatch}`,
        resolvedPath: canonicalPath,
        matchedSafeZone: safeZoneMatch
      };
    }

    return {
      allowed: false,
      reason: `Path is outside all configured safe zones`,
      resolvedPath: canonicalPath
    };
  }

  isPathInSafeZone(testPath: string): boolean {
    const resolvedPath = this.resolvePath(testPath);

    // Check restricted zones first
    if (this.checkRestrictedZones(resolvedPath)) {
      return false;
    }

    // Check safe zones
    return !!this.checkSafeZones(resolvedPath);
  }

  private checkSafeZones(testPath: string): string | null {
    const resolvedTestPath = this.resolvePath(testPath);

    for (let i = 0; i < this.resolvedSafeZones.length; i++) {
      const safeZone = this.resolvedSafeZones[i];
      const originalSafeZone = this.safeZones[i];

      // Ensure we have valid values (arrays should be parallel)
      if (!safeZone || !originalSafeZone) {
        logger.warn({ index: i, safeZone, originalSafeZone }, 'Invalid safe zone configuration at index');
        continue;
      }

      if (this.safeZoneMode === 'recursive') {
        // Allow access to safe zone and all its subdirectories
        if (this.isPathWithinDirectory(resolvedTestPath, safeZone)) {
          return originalSafeZone;
        }
      } else {
        // Strict mode - exact match only
        if (resolvedTestPath === safeZone) {
          return originalSafeZone;
        }
      }
    }

    return null;
  }

  private checkRestrictedZones(testPath: string): string | null {
    const resolvedTestPath = this.resolvePath(testPath);

    for (let i = 0; i < this.resolvedRestrictedZones.length; i++) {
      const restrictedZone = this.resolvedRestrictedZones[i];
      const originalRestrictedZone = this.restrictedZones[i];

      // Ensure we have valid values (arrays should be parallel)
      if (!restrictedZone || !originalRestrictedZone) {
        logger.warn(
          { index: i, restrictedZone, originalRestrictedZone },
          'Invalid restricted zone configuration at index'
        );
        continue;
      }

      // Support glob patterns in restricted zones
      if (originalRestrictedZone.includes('*')) {
        if (this.matchesGlobPattern(resolvedTestPath, originalRestrictedZone)) {
          return originalRestrictedZone;
        }
      } else {
        // Check if path is within or matches restricted zone
        if (this.isPathWithinDirectory(resolvedTestPath, restrictedZone) || resolvedTestPath === restrictedZone) {
          return originalRestrictedZone;
        }
      }
    }

    return null;
  }

  private isPathWithinDirectory(testPath: string, parentDir: string): boolean {
    const resolvedTestPath = this.resolvePath(testPath);
    const resolvedParentDir = this.resolvePath(parentDir);

    // Exact match
    if (resolvedTestPath === resolvedParentDir) {
      return true;
    }

    // Check if testPath is a subdirectory of parentDir
    const relativePath = path.relative(resolvedParentDir, resolvedTestPath);
    return !relativePath.startsWith('..') && !path.isAbsolute(relativePath);
  }

  private matchesGlobPattern(testPath: string, pattern: string): boolean {
    // Simple glob pattern matching for ** and *
    // Convert glob pattern to regex
    const regexPattern = pattern
      .replace(/\*\*/g, '.*') // ** matches any path
      .replace(/\*/g, '[^/\\\\]*') // * matches any filename
      .replace(/\./g, '\\.'); // Escape dots

    // Make it case-insensitive on Windows
    const flags = os.platform() === 'win32' ? 'i' : '';

    try {
      const regex = new RegExp(regexPattern, flags);
      return regex.test(testPath);
    } catch (e) {
      logger.warn({ pattern, error: e }, 'Invalid glob pattern, treating as literal string');
      return testPath.includes(pattern);
    }
  }

  private resolvePath(inputPath: string): string {
    // Handle tilde expansion
    if (inputPath.startsWith('~/')) {
      return path.resolve(os.homedir(), inputPath.slice(2));
    }
    if (inputPath === '~') {
      return os.homedir();
    }

    return path.resolve(inputPath);
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
        this.logSecurityEvent({
          type: 'pattern_detected',
          pattern: pattern.source,
          command: fullCommand,
          details: 'Blocked dangerous command pattern',
          severity: 'high'
        });
        throw new Error(`Potentially dangerous command blocked: ${pattern.source}`);
      }
    }

    // Shell-specific validations
    await this.validateShellSpecific(command, args);
    this.validateArguments(args);

    logger.debug({ command, args }, 'Command validated successfully');
  }

  sanitizeInput(input: string): string {
    return input
      .replace(/[<>:"'|?*]/g, '')
      .replace(/\p{Cc}/gu, '')
      .replace(/\.\.+[/\\]?/g, '')
      .trim();
  }

  // New method to get security info for debugging
  getSecurityInfo(): {
    safeZones: string[];
    restrictedZones: string[];
    safeZoneMode: string;
    blockedPatterns: number;
  } {
    return {
      safeZones: this.safeZones,
      restrictedZones: this.restrictedZones,
      safeZoneMode: this.safeZoneMode,
      blockedPatterns: this.blockedPathPatterns.length
    };
  }

  // New method to test path access without throwing
  async testPathAccess(inputPath: string): Promise<PathValidationResult> {
    return this.validatePathDetailed(inputPath);
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
  }

  private validateArguments(args: string[]): void {
    for (const arg of args) {
      // Path traversal check
      if (arg.includes('../') || arg.includes('..\\')) {
        this.logSecurityEvent({
          type: 'pattern_detected',
          pattern: 'path_traversal_argument',
          details: `Argument: ${arg}`,
          severity: 'high'
        });
        throw new Error('Path traversal attempts in arguments are blocked');
      }

      // Null byte check
      if (arg.includes('\0')) {
        this.logSecurityEvent({
          type: 'pattern_detected',
          pattern: 'null_byte_argument',
          details: `Argument: ${arg}`,
          severity: 'high'
        });
        throw new Error('Null bytes in arguments are not allowed');
      }

      // Length check
      if (arg.length > 4096) {
        this.logSecurityEvent({
          type: 'pattern_detected',
          pattern: 'long_argument',
          details: `Argument length: ${arg.length}`,
          severity: 'medium'
        });
        throw new Error('Argument too long (max 4096 chars)');
      }

      // Shell metacharacter checks
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

      // Custom unsafe argument patterns
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
