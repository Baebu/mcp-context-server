// src/application/services/security-validator.service.ts
import { injectable, inject } from 'inversify';
import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'node:crypto';
import type { ServerConfig } from '../../infrastructure/config/schema.js';
import type { ISecurityValidator } from '../../core/interfaces/security.interface.js'; // Import ISecurityValidator
import { logger } from '../../utils/logger.js'; // Import logger

// Consistent SafeZoneMode enum - fixes the type mismatch
export enum SafeZoneMode {
  STRICT = 'strict',
  PERMISSIVE = 'permissive',
  AUDIT = 'audit',
  RECURSIVE = 'recursive'
}

// Security configuration interface (can be derived from Zod schema if preferred)
export interface SecurityConfig {
  safeZoneMode: SafeZoneMode;
  allowedPaths: string[];
  maxFileSize: number;
  enableAuditLog: boolean;
  sessionTimeout: number;
  maxSessions: number;
  // Add other fields from ServerConfig['security'] as needed by this service
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
  // Implement ISecurityValidator
  private allowedDirectories: string[] = [];
  private sessionTokens: Map<string, SessionInfo> = new Map();
  private auditLog: SecurityAuditEntry[] = [];
  private config: SecurityConfig;
  private dangerousPatterns: RegExp[];

  constructor(@inject('Config') configFromDI: ServerConfig) {
    this.config = configFromDI.security;
    this.dangerousPatterns = (this.config.unsafeArgumentPatterns || []).map(p => new RegExp(p, 'i'));

    this.initializeAllowedDirectories();
    this.startSessionCleanup();
  }

  private initializeAllowedDirectories(): void {
    this.allowedDirectories = this.config.safezones.map(p => {
      // Use safezones from config
      try {
        return path.resolve(p);
      } catch (error) {
        console.warn(`Failed to resolve path: ${p}`, error);
        return p;
      }
    });
  }

  async validatePath(inputPath: string, sessionId?: string): Promise<string> {
    // Return string as per interface
    const validationResult = await this._validatePathInternal(inputPath, sessionId);
    if (!validationResult.isValid) {
      throw new Error(validationResult.reason || 'Path validation failed');
    }
    return validationResult.resolvedPath;
  }

  private async _validatePathInternal(inputPath: string, sessionId?: string): Promise<PathValidationResult> {
    try {
      const absolutePath = path.resolve(inputPath);
      const safeZoneMode = this.config.safeZoneMode || SafeZoneMode.STRICT;

      if (this.containsPathTraversal(inputPath)) {
        const result: PathValidationResult = {
          isValid: false,
          resolvedPath: absolutePath,
          reason: 'Path traversal attempt detected'
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
        // File doesn't exist is okay for validation of the path itself
      }

      this.auditSecurityEvent({ action: 'path_validation', path: inputPath, sessionId, result: 'allowed' });
      return { isValid: true, resolvedPath: absolutePath, safeZone: safeZoneValidation.safeZone };
    } catch (error) {
      const reason = error instanceof Error ? error.message : 'Unknown error during path validation';
      this.auditSecurityEvent({ action: 'path_validation', path: inputPath, sessionId, result: 'denied', reason });
      return { isValid: false, resolvedPath: inputPath, reason };
    }
  }

  // Added implementation for isPathInSafeZone
  isPathInSafeZone(testPath: string): boolean {
    const resolvedPath = path.resolve(testPath);
    // Check against this.config.safezones which are resolved absolute paths
    return this.config.safezones.some(zone => {
      const resolvedSafeZone = path.resolve(zone); // Ensure zone is absolute for comparison
      if (this.config.safeZoneMode === SafeZoneMode.RECURSIVE) {
        return resolvedPath.startsWith(resolvedSafeZone);
      }
      return resolvedPath === resolvedSafeZone;
    });
  }

  // Added implementation for sanitizeInput
  sanitizeInput(input: string): string {
    // Basic sanitization: remove common shell metacharacters.
    // This is a starting point; real-world sanitization can be complex.
    return input.replace(/[;&|$`<>*?()#!\\\[\]{}]/g, '');
  }

  // Added implementation for validateCommand
  async validateCommand(command: string, args: string[]): Promise<void> {
    if (this.config.allowedCommands === 'all') {
      logger.warn({ command }, 'All commands are allowed by configuration. This is a security risk.');
      return;
    }
    if (!this.config.allowedCommands.includes(command)) {
      throw new Error(`Command not allowed: ${command}`);
    }

    const fullCommandString = `${command} ${args.join(' ')}`;
    for (const pattern of this.dangerousPatterns) {
      if (pattern.test(fullCommandString)) {
        throw new Error(`Potentially dangerous argument pattern detected in command: ${fullCommandString}`);
      }
    }
    // Potentially add more specific checks here based on command, args, or OS
  }

  // Added implementation for getSecurityInfo (optional in interface, but good to have)
  getSecurityInfo(): { safeZones: string[]; restrictedZones: string[]; safeZoneMode: string; blockedPatterns: number } {
    return {
      safeZones: this.config.safezones,
      restrictedZones: this.config.restrictedZones,
      safeZoneMode: this.config.safeZoneMode,
      blockedPatterns: this.config.blockedPathPatterns.length
    };
  }

  // Added implementation for testPathAccess (optional in interface)
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
    // This basic mock doesn't deeply check restricted zones, but a real one would.
    // For now, if it's not allowed and not a traversal, assume it's a zone issue.
    if (!validationResult.isValid && !validationResult.reason?.includes('traversal')) {
      // Heuristic: if not allowed and not traversal, could be restricted or not in safe zone
      // A more detailed check would iterate restrictedZones.
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
    const isInSafeZone = this.allowedDirectories.some(dir => {
      try {
        if (mode === SafeZoneMode.RECURSIVE) {
          return absolutePath.startsWith(dir);
        }
        return absolutePath === dir; // Strict or other modes
      } catch {
        return false;
      }
    });

    switch (mode) {
      case SafeZoneMode.STRICT:
        if (!isInSafeZone) {
          return {
            isValid: false,
            resolvedPath: absolutePath,
            reason: `Access denied: Path outside allowed directories in STRICT mode`
          };
        }
        break;
      case SafeZoneMode.RECURSIVE: // Explicitly handle recursive
        if (!isInSafeZone) {
          return {
            isValid: false,
            resolvedPath: absolutePath,
            reason: `Access denied: Path outside allowed directories or their subdirectories in RECURSIVE mode`
          };
        }
        break;
      case SafeZoneMode.PERMISSIVE:
        if (!isInSafeZone) {
          this.auditSecurityEvent({
            action: 'safe_zone_warning',
            path: absolutePath,
            result: 'warning',
            reason: 'Path outside safe zone in PERMISSIVE mode'
          });
        }
        break;

      case SafeZoneMode.AUDIT:
        this.auditSecurityEvent({
          action: 'safe_zone_audit',
          path: absolutePath,
          result: isInSafeZone ? 'allowed' : 'warning',
          reason: isInSafeZone ? 'Within safe zone' : 'Outside safe zone (AUDIT mode)'
        });
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
      safeZone: this.findMatchingSafeZone(absolutePath)
    };
  }

  private containsPathTraversal(inputPath: string): boolean {
    const normalizedPath = path.normalize(inputPath);
    const dangerousPatterns = [/\.\./, /~[\/\\]/, /^[\/\\]/, /%2e%2e/i, /\0/, /[<>:"|?*]/];
    return dangerousPatterns.some(pattern => pattern.test(normalizedPath));
  }

  private findMatchingSafeZone(absolutePath: string): string | undefined {
    return this.allowedDirectories.find(dir => absolutePath.startsWith(dir));
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
      allowedDirectories: this.allowedDirectories.length,
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
    // Parameter should be Partial<SecurityConfig>
    this.config = { ...this.config, ...newConfigPartial };
    if (newConfigPartial.allowedPaths) this.initializeAllowedDirectories(); // Re-init if allowedPaths change
    if (newConfigPartial.safezones) this.allowedDirectories = newConfigPartial.safezones.map(p => path.resolve(p)); // Re-init if safezones change

    this.auditSecurityEvent({ action: 'config_updated', path: 'configuration', result: 'allowed' });
  }

  getConfig(): Readonly<SecurityConfig> {
    return { ...this.config };
  }
}
