// src/application/services/security-validator.service.ts
import { injectable, inject } from 'inversify';
import { promises as fs } from 'fs';
import path from 'node:path';
import crypto from 'node:crypto';
import os from 'node:os';
import type { ServerConfig } from '../../infrastructure/config/schema.js';
import type { ISecurityValidator } from '../../core/interfaces/security.interface.js';
import { logger } from '../../utils/logger.js';
import { SafeZoneMode } from '../../infrastructure/config/types.js';

// Security configuration interface
export interface SecurityConfig {
  safeZoneMode: SafeZoneMode;
  allowedPaths: string[];
  maxFileSize: number;
  enableAuditLog: boolean;
  sessionTimeout: number;
  maxSessions: number;
  allowedCommands: string[] | 'all';
  restrictedZones: string[];
  safezones: string[];
  maxExecutionTime: number;
  unsafeArgumentPatterns: string[];
  autoExpandSafezones: boolean;
  blockedPathPatterns: string[];
  processKillGracePeriodMs: number;
  maxConcurrentProcesses: number;
  maxProcessMemoryMB: number;
  maxProcessCpuPercent: number;
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
  cleanupIntervalMs: number;
  resourceCheckIntervalMs: number;
  enableProcessMonitoring: boolean;
}

// Path validation result
export interface PathValidationResult {
  isValid: boolean;
  resolvedPath: string;
  reason?: string;
  safeZone?: string;
}

// Security audit entry
export interface SecurityAuditEntry {
  timestamp: number;
  action: string;
  path: string;
  userId?: string;
  sessionId?: string;
  result: 'allowed' | 'denied' | 'warning';
  reason?: string;
}

// Session information
export interface SessionInfo {
  sessionId: string;
  userId: string;
  createdAt: number;
  lastActivity: number;
  permissions: string[];
  isActive: boolean;
}

// Authentication result
export interface AuthResult {
  isValid: boolean;
  userId?: string;
  sessionId?: string;
  permissions?: string[];
  reason?: string;
}

@injectable()
export class SecurityValidatorService implements ISecurityValidator {
  private allowedSafezoneDirectories: string[] = [];
  private resolvedRestrictedZones: string[] = [];
  private defaultSystemRestrictedZones: string[] = [];
  private sessionTokens: Map<string, SessionInfo> = new Map();
  private auditLog: SecurityAuditEntry[] = [];
  private config: SecurityConfig;
  private dangerousArgumentPatterns: RegExp[];

  constructor(@inject('Config') configFromDI: ServerConfig) {
    this.config = configFromDI.security;
    this.dangerousArgumentPatterns = (this.config.unsafeArgumentPatterns || []).map(p => new RegExp(p, 'i'));

    this.initializeDefaultSystemRestrictedZones();
    this.initializeConfiguredZones();
    this.startSessionCleanup();
  }

  private resolvePathWithTilde(filePath: string): string {
    if (filePath.startsWith('~/') || filePath === '~') {
      return path.join(os.homedir(), filePath.substring(filePath.startsWith('~/') ? 2 : 1));
    }
    return filePath;
  }

  private initializeDefaultSystemRestrictedZones(): void {
    const platform = os.platform();
    let zones = [
      '/etc',
      '/proc',
      '/sys',
      '/dev',
      '/boot',
      '/root', // Common Linux/macOS
      '/System',
      '/Library',
      '/private',
      '/usr/sbin', // macOS specific
      '/usr/bin',
      '/bin',
      '/sbin' // More common bin paths
    ];

    if (platform === 'win32') {
      const systemDrive = process.env.SystemDrive || 'C:';
      zones = zones.concat([
        `${systemDrive}\\Windows`,
        `${systemDrive}\\Program Files`,
        `${systemDrive}\\Program Files (x86)`
      ]);
    }
    this.defaultSystemRestrictedZones = [...new Set(zones.map(p => path.resolve(p).toLowerCase()))];
    logger.info(
      { count: this.defaultSystemRestrictedZones.length, zones: this.defaultSystemRestrictedZones },
      'Initialized default system restricted zones.'
    );
  }

  private initializeConfiguredZones(): void {
    this.allowedSafezoneDirectories = (this.config.safezones || []).map(p => {
      try {
        return path.resolve(this.resolvePathWithTilde(p));
      } catch (error) {
        logger.warn({ path: p, error }, `Failed to resolve safezone path: ${p}`);
        return p;
      }
    });
    logger.info(
      { count: this.allowedSafezoneDirectories.length, zones: this.allowedSafezoneDirectories },
      'Initialized configured safe zones.'
    );

    this.resolvedRestrictedZones = (this.config.restrictedZones || []).map(p => {
      try {
        if (p.includes('*')) return p; // Keep glob patterns
        return path.resolve(this.resolvePathWithTilde(p));
      } catch (error) {
        logger.warn({ path: p, error }, `Failed to resolve restricted zone path: ${p}`);
        return p;
      }
    });
    logger.info(
      { count: this.resolvedRestrictedZones.length, zones: this.resolvedRestrictedZones },
      'Initialized configured restricted zones.'
    );
  }

  async validatePath(inputPath: string, sessionId?: string): Promise<string> {
    const validationResult = await this._validatePathInternal(inputPath, sessionId);
    if (!validationResult.isValid) {
      throw new Error(validationResult.reason || 'Path validation failed');
    }
    return validationResult.resolvedPath;
  }

  private containsSuspiciousInputPatterns(inputPath: string): boolean {
    // Check for null bytes
    if (inputPath.includes('\0')) {
      logger.warn({ path: inputPath }, 'Path contains null byte.');
      return true;
    }
    // Check for sequences that are almost always malicious attempts at obfuscation or attack
    // %2e is '.', %2f is '/', %5c is '\'
    if (/%2e%2e(%2f|%5c)|%252e%252e(%252f|%255c)|\\.\\.(%2f|%5c)/i.test(inputPath)) {
      logger.warn({ path: inputPath }, 'Path contains encoded traversal sequences.');
      return true;
    }
    // Check for excessive relative path components that might suggest trying to break out many levels
    const relativeDepth = (inputPath.match(/(\.\.[\/\\])/g) || []).length;
    if (relativeDepth > 8) {
      // Adjusted threshold
      logger.warn({ path: inputPath, depth: relativeDepth }, 'Path contains excessive relative components.');
      return true;
    }
    // Check for characters that are problematic in paths or indicative of injection
    if (/[<>:"|?*\x00-\x1F\x7F]/.test(inputPath)) {
      // Added control characters
      logger.warn({ path: inputPath }, 'Path contains problematic characters.');
      return true;
    }
    return false;
  }

  private isPathRestricted(absolutePath: string): { restricted: boolean; reason?: string; matchedZone?: string } {
    const lowerAbsolutePath = absolutePath.toLowerCase();

    for (const restrictedZone of this.defaultSystemRestrictedZones) {
      // restrictedZone is already resolved and lowercased
      if (
        lowerAbsolutePath.startsWith(restrictedZone) &&
        (lowerAbsolutePath.length === restrictedZone.length || lowerAbsolutePath[restrictedZone.length] === path.sep)
      ) {
        return {
          restricted: true,
          reason: `Path is within a default system restricted zone: ${restrictedZone}`,
          matchedZone: restrictedZone
        };
      }
    }

    for (const restrictedZonePattern of this.resolvedRestrictedZones) {
      const lowerPattern = restrictedZonePattern.toLowerCase();
      if (lowerPattern.includes('*')) {
        const regexPattern =
          '^' +
          lowerPattern
            .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
            .replace(/\*\*/g, '.*')
            .replace(/\*/g, `[^${path.sep.replace('\\', '\\\\')}]*`) +
          '$';
        try {
          if (new RegExp(regexPattern, 'i').test(absolutePath)) {
            // Test against original case for regex, or ensure regex is case-insensitive
            return {
              restricted: true,
              reason: `Path matches configured restricted zone pattern: ${restrictedZonePattern}`,
              matchedZone: restrictedZonePattern
            };
          }
        } catch (e) {
          logger.warn({ pattern: restrictedZonePattern, error: e }, 'Invalid regex from restricted zone glob pattern');
        }
      } else {
        if (
          lowerAbsolutePath.startsWith(lowerPattern) &&
          (lowerAbsolutePath.length === lowerPattern.length || lowerAbsolutePath[lowerPattern.length] === path.sep)
        ) {
          return {
            restricted: true,
            reason: `Path is within a configured restricted zone: ${restrictedZonePattern}`,
            matchedZone: restrictedZonePattern
          };
        }
      }
    }

    if (this.config.blockedPathPatterns && this.config.blockedPathPatterns.length > 0) {
      for (const pattern of this.config.blockedPathPatterns) {
        try {
          if (new RegExp(pattern, 'i').test(absolutePath)) {
            return { restricted: true, reason: `Path matches blocked pattern: ${pattern}`, matchedZone: pattern };
          }
        } catch (e) {
          logger.warn({ pattern, error: e }, 'Invalid regex in blockedPathPatterns');
        }
      }
    }
    return { restricted: false };
  }

  private async _validatePathInternal(inputPath: string, sessionId?: string): Promise<PathValidationResult> {
    try {
      // Initial check for suspicious patterns in the raw input
      if (this.containsSuspiciousInputPatterns(inputPath)) {
        const result: PathValidationResult = {
          isValid: false,
          resolvedPath: path.resolve(this.resolvePathWithTilde(inputPath)), // Resolve for logging
          reason: 'Input path contains suspicious patterns (e.g., null bytes, encoded traversal, excessive ../).'
        };
        this.auditSecurityEvent({
          action: 'path_validation',
          path: inputPath,
          sessionId,
          result: 'denied',
          reason: result.reason
        });
        return result;
      }

      const resolvedInputPath = this.resolvePathWithTilde(inputPath);
      const absolutePath = path.resolve(resolvedInputPath);
      const safeZoneMode = this.config.safeZoneMode || SafeZoneMode.STRICT;

      const restrictionCheck = this.isPathRestricted(absolutePath);
      if (restrictionCheck.restricted) {
        const result: PathValidationResult = {
          isValid: false,
          resolvedPath: absolutePath,
          reason: restrictionCheck.reason
        };
        this.auditSecurityEvent({
          action: 'path_validation',
          path: inputPath,
          sessionId,
          result: 'denied',
          reason: result.reason
        });
        return result;
      }

      const safeZoneValidation = this.validateSafeZone(absolutePath, safeZoneMode);
      if (!safeZoneValidation.isValid) {
        this.auditSecurityEvent({
          action: 'path_validation',
          path: inputPath,
          sessionId,
          result: 'denied',
          reason: safeZoneValidation.reason
        });
        return safeZoneValidation;
      }

      try {
        const stats = await fs.stat(absolutePath);
        if (stats.isFile() && stats.size > this.config.maxFileSize) {
          const result: PathValidationResult = {
            isValid: false,
            resolvedPath: absolutePath,
            reason: `File too large: ${stats.size} bytes (max: ${this.config.maxFileSize})`
          };
          this.auditSecurityEvent({
            action: 'path_validation',
            path: inputPath,
            sessionId,
            result: 'denied',
            reason: result.reason
          });
          return result;
        }
      } catch (error) {
        // File not existing is fine for path validation itself.
      }

      this.auditSecurityEvent({ action: 'path_validation', path: inputPath, sessionId, result: 'allowed' });
      return { isValid: true, resolvedPath: absolutePath, safeZone: safeZoneValidation.safeZone };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error during path validation';
      this.auditSecurityEvent({ action: 'path_validation', path: inputPath, sessionId, result: 'denied', reason });
      return { isValid: false, resolvedPath: path.resolve(this.resolvePathWithTilde(inputPath)), reason };
    }
  }

  isPathInSafeZone(testPath: string): boolean {
    const resolvedPath = path.resolve(this.resolvePathWithTilde(testPath));
    if (this.isPathRestricted(resolvedPath).restricted) {
      return false;
    }
    return this.allowedSafezoneDirectories.some(zone => {
      const normalizedResolvedPath = resolvedPath.toLowerCase();
      const normalizedZone = zone.toLowerCase(); // zone is already resolved absolute
      if (this.config.safeZoneMode === SafeZoneMode.RECURSIVE) {
        return (
          normalizedResolvedPath.startsWith(normalizedZone) &&
          (normalizedResolvedPath.length === normalizedZone.length ||
            normalizedResolvedPath[normalizedZone.length] === path.sep)
        );
      }
      return normalizedResolvedPath === normalizedZone;
    });
  }

  sanitizeInput(input: string): string {
    return (
      input
        .replace(/[<>:"'|?*]/g, '')
        .replace(/\0/g, '')
        // Allow .. for now, as resolution and safe zone checks will handle it.
        // .replace(/(\.\.[/\\])/g, '')
        .trim()
    );
  }

  async validateCommand(command: string, args: string[]): Promise<void> {
    if (this.config.allowedCommands === 'all') {
      logger.warn({ command }, 'All commands are allowed by configuration. This is a security risk.');
      return;
    }
    if (!this.config.allowedCommands.includes(command)) {
      throw new Error(`Command not allowed: ${command}`);
    }

    const fullCommandString = `${command} ${args.join(' ')}`;
    for (const pattern of this.dangerousArgumentPatterns) {
      if (pattern.test(fullCommandString)) {
        throw new Error(`Potentially dangerous argument pattern detected in command: ${fullCommandString}`);
      }
    }
  }

  getSecurityInfo(): { safeZones: string[]; restrictedZones: string[]; safeZoneMode: string; blockedPatterns: number } {
    return {
      safeZones: this.config.safezones,
      restrictedZones: [...new Set([...this.defaultSystemRestrictedZones, ...this.resolvedRestrictedZones])], // Show effective restricted zones
      safeZoneMode: this.config.safeZoneMode,
      blockedPatterns: this.config.blockedPathPatterns.length
    };
  }

  async testPathAccess(inputPath: string): Promise<{
    allowed: boolean;
    reason: string;
    resolvedPath: string;
    inputPath?: string | undefined;
    matchedSafeZone?: string | undefined;
    matchedRestrictedZone?: string | undefined;
  }> {
    const validationResult = await this._validatePathInternal(inputPath);
    let matchedSafeZone: string | undefined;
    let matchedRestrictedZone: string | undefined;

    if (validationResult.isValid && validationResult.safeZone) {
      matchedSafeZone = validationResult.safeZone;
    }

    const restrictionCheck = this.isPathRestricted(validationResult.resolvedPath);
    if (restrictionCheck.restricted) {
      matchedRestrictedZone = restrictionCheck.matchedZone;
    }

    return {
      allowed: validationResult.isValid,
      reason: validationResult.reason || (validationResult.isValid ? 'Path is allowed.' : 'Path is not allowed.'),
      resolvedPath: validationResult.resolvedPath,
      inputPath: inputPath,
      matchedSafeZone: matchedSafeZone,
      matchedRestrictedZone: matchedRestrictedZone
    };
  }

  private validateSafeZone(absolutePath: string, mode: SafeZoneMode): PathValidationResult {
    const normalizedAbsolutePath = absolutePath.toLowerCase();
    const matchingSafeZone = this.allowedSafezoneDirectories.find(dir => {
      const normalizedDir = dir.toLowerCase(); // dir is already resolved absolute
      if (mode === SafeZoneMode.RECURSIVE) {
        return (
          normalizedAbsolutePath.startsWith(normalizedDir) &&
          (normalizedAbsolutePath.length === normalizedDir.length ||
            normalizedAbsolutePath[normalizedDir.length] === path.sep)
        );
      }
      return normalizedAbsolutePath === normalizedDir;
    });

    const isInSafeZone = !!matchingSafeZone;

    switch (mode) {
      case SafeZoneMode.STRICT:
        if (!isInSafeZone) {
          return {
            isValid: false,
            resolvedPath: absolutePath,
            reason: `Access denied: Path '${absolutePath}' not an exact match in configured safe zones (STRICT mode).`
          };
        }
        break;
      case SafeZoneMode.RECURSIVE:
        if (!isInSafeZone) {
          return {
            isValid: false,
            resolvedPath: absolutePath,
            reason: `Access denied: Path '${absolutePath}' not within any configured safe zone or their subdirectories (RECURSIVE mode).`
          };
        }
        break;
      case SafeZoneMode.PERMISSIVE:
        if (this.allowedSafezoneDirectories.length > 0 && !isInSafeZone) {
          this.auditSecurityEvent({
            action: 'safe_zone_warning',
            path: absolutePath,
            result: 'warning',
            reason: 'Path outside defined safe zones in PERMISSIVE mode (but not explicitly restricted).'
          });
          if (this.allowedSafezoneDirectories.length > 0) {
            // If safezones are defined, permissive still means it must be in one.
            return {
              isValid: false,
              resolvedPath: absolutePath,
              reason: 'Path outside defined safe zones in PERMISSIVE mode.'
            };
          }
        }
        break;
      case SafeZoneMode.AUDIT:
        this.auditSecurityEvent({
          action: 'safe_zone_audit',
          path: absolutePath,
          result: isInSafeZone ? 'allowed' : 'warning',
          reason: isInSafeZone ? `Within safe zone: ${matchingSafeZone}` : 'Outside defined safe zones (AUDIT mode)'
        });
        if (!isInSafeZone && this.allowedSafezoneDirectories.length > 0) {
          // Similar to permissive, if zones are defined, audit mode still implies denial for validation purposes.
          return {
            isValid: false,
            resolvedPath: absolutePath,
            reason: 'Path outside defined safe zones (AUDIT mode). Access would be logged as warning.'
          };
        }
        break;
      default:
        return {
          isValid: false,
          resolvedPath: absolutePath,
          reason: `Unknown safe zone mode: ${mode}`
        };
    }

    return {
      isValid: true,
      resolvedPath: absolutePath,
      safeZone: matchingSafeZone
    };
  }

  authenticate(request: any): AuthResult {
    try {
      const token = this.extractToken(request);
      if (!token) return { isValid: false, reason: 'Missing authentication token' };
      const sessionInfo = this.sessionTokens.get(token);
      if (!sessionInfo) return { isValid: false, reason: 'Invalid authentication token' };
      if (this.isSessionExpired(sessionInfo)) {
        this.sessionTokens.delete(token);
        return { isValid: false, reason: 'Session expired' };
      }
      sessionInfo.lastActivity = Date.now();
      this.auditSecurityEvent({
        action: 'authentication',
        path: 'session',
        userId: sessionInfo.userId,
        sessionId: sessionInfo.sessionId,
        result: 'allowed'
      });
      return {
        isValid: true,
        userId: sessionInfo.userId,
        sessionId: sessionInfo.sessionId,
        permissions: sessionInfo.permissions
      };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Authentication error';
      this.auditSecurityEvent({ action: 'authentication', path: 'session', result: 'denied', reason });
      return { isValid: false, reason: 'Authentication failed' };
    }
  }

  private extractToken(request: any): string | null {
    return (
      request.headers?.['x-api-key'] ||
      request.headers?.['authorization']?.replace('Bearer ', '') ||
      request.query?.token ||
      null
    );
  }

  private isSessionExpired(sessionInfo: SessionInfo): boolean {
    return Date.now() - sessionInfo.lastActivity > this.config.sessionTimeout;
  }

  generateSecureToken(): string {
    return crypto.randomBytes(32).toString('base64url');
  }

  createSession(userId: string, permissions: string[] = []): string {
    if (this.sessionTokens.size >= this.config.maxSessions) {
      this.cleanupExpiredSessions();
    }
    const token = this.generateSecureToken();
    const sessionId = crypto.randomUUID();
    const sessionInfo: SessionInfo = {
      sessionId,
      userId,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      permissions,
      isActive: true
    };
    this.sessionTokens.set(token, sessionInfo);
    this.auditSecurityEvent({ action: 'session_created', path: 'session', userId, sessionId, result: 'allowed' });
    return token;
  }

  revokeSession(token: string): boolean {
    const sessionInfo = this.sessionTokens.get(token);
    if (sessionInfo) {
      this.auditSecurityEvent({
        action: 'session_revoked',
        path: 'session',
        userId: sessionInfo.userId,
        sessionId: sessionInfo.sessionId,
        result: 'allowed'
      });
      return this.sessionTokens.delete(token);
    }
    return false;
  }

  getSessionInfo(token: string): SessionInfo | null {
    return this.sessionTokens.get(token) || null;
  }

  private auditSecurityEvent(entry: Omit<SecurityAuditEntry, 'timestamp'>): void {
    if (!this.config.enableAuditLog) return;
    const auditEntry: SecurityAuditEntry = { timestamp: Date.now(), ...entry };
    this.auditLog.push(auditEntry);
    if (this.auditLog.length > 10000) this.auditLog = this.auditLog.slice(-5000);
  }

  getAuditLog(limit: number = 100): SecurityAuditEntry[] {
    return this.auditLog.slice(-limit);
  }

  getSecurityStats(): any {
    const now = Date.now();
    const last24h = now - 24 * 60 * 60 * 1000;
    const recent = this.auditLog.filter(entry => entry.timestamp > last24h);
    return {
      activeSessions: this.sessionTokens.size,
      auditLogSize: this.auditLog.length,
      safeZoneMode: this.config.safeZoneMode,
      allowedDirectories: this.allowedSafezoneDirectories.length,
      last24hEvents: {
        total: recent.length,
        allowed: recent.filter(e => e.result === 'allowed').length,
        denied: recent.filter(e => e.result === 'denied').length,
        warnings: recent.filter(e => e.result === 'warning').length
      }
    };
  }

  private startSessionCleanup(): void {
    setInterval(
      () => {
        this.cleanupExpiredSessions();
      },
      60 * 60 * 1000
    );
  }

  private cleanupExpiredSessions(): void {
    let cleanedCount = 0;
    for (const [token, sessionInfo] of this.sessionTokens.entries()) {
      if (this.isSessionExpired(sessionInfo)) {
        this.sessionTokens.delete(token);
        cleanedCount++;
        this.auditSecurityEvent({
          action: 'session_expired',
          path: 'session',
          userId: sessionInfo.userId,
          sessionId: sessionInfo.sessionId,
          result: 'allowed'
        });
      }
    }
    if (cleanedCount > 0) console.log(`Cleaned up ${cleanedCount} expired sessions`);
  }

  updateConfig(newConfigPartial: Partial<SecurityConfig>): void {
    this.config = { ...this.config, ...newConfigPartial };
    if (newConfigPartial.safezones || newConfigPartial.restrictedZones) {
      this.initializeConfiguredZones();
    }
    if (newConfigPartial.unsafeArgumentPatterns) {
      this.dangerousArgumentPatterns = (this.config.unsafeArgumentPatterns || []).map(p => new RegExp(p, 'i'));
    }
    this.auditSecurityEvent({ action: 'config_updated', path: 'configuration', result: 'allowed' });
  }

  getConfig(): Readonly<SecurityConfig> {
    return { ...this.config };
  }
}
