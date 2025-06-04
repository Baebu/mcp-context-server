// security.types.ts - Supporting types for security system
// Place this in: src/types/security.types.ts

/**
 * Safe Zone security modes
 * FIXES: Consistent enum definition across all files
 */
export enum SafeZoneMode {
  STRICT = 'strict',
  PERMISSIVE = 'permissive',
  AUDIT = 'audit',
  RECURSIVE = 'recursive'
}

/**
 * Security configuration interface
 */
export interface SecurityConfig {
  safeZoneMode: SafeZoneMode;
  allowedPaths: string[];
  maxFileSize: number;
  enableAuditLog: boolean;
  sessionTimeout: number;
  maxSessions: number;
}

/**
 * Path validation result
 */
export interface PathValidationResult {
  isValid: boolean;
  resolvedPath: string;
  reason?: string;
  safeZone?: string;
}

/**
 * Security audit entry
 */
export interface SecurityAuditEntry {
  timestamp: number;
  action: string;
  path: string;
  userId?: string;
  sessionId?: string;
  result: 'allowed' | 'denied' | 'warning';
  reason?: string;
}

/**
 * Session information
 */
export interface SessionInfo {
  sessionId: string;
  userId: string;
  createdAt: number;
  lastActivity: number;
  permissions: string[];
  isActive: boolean;
}

/**
 * Authentication result
 */
export interface AuthResult {
  isValid: boolean;
  userId?: string;
  sessionId?: string;
  permissions?: string[];
  reason?: string;
}

/**
 * Security statistics
 */
export interface SecurityStats {
  activeSessions: number;
  auditLogSize: number;
  safeZoneMode: SafeZoneMode;
  allowedDirectories: number;
  last24hEvents: {
    total: number;
    allowed: number;
    denied: number;
    warnings: number;
  };
}

/**
 * Security error class
 */
export class SecurityError extends Error {
  constructor(
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'SecurityError';
  }
}

/**
 * Path traversal error class
 */
export class PathTraversalError extends SecurityError {
  constructor(path: string) {
    super(`Path traversal attempt detected: ${path}`, 'PATH_TRAVERSAL');
  }
}

/**
 * Safe zone violation error class
 */
export class SafeZoneViolationError extends SecurityError {
  constructor(path: string, mode: SafeZoneMode) {
    super(`Safe zone violation: ${path} (mode: ${mode})`, 'SAFE_ZONE_VIOLATION');
  }
}

/**
 * Session error class
 */
export class SessionError extends SecurityError {
  constructor(message: string) {
    super(message, 'SESSION_ERROR');
  }
}

/**
 * File security check result
 */
export interface FileSecurityCheck {
  isSecure: boolean;
  size: number;
  maxSize: number;
  path: string;
  checksum?: string;
  reason?: string;
}

/**
 * Request authentication context
 */
export interface AuthContext {
  userId?: string;
  sessionId?: string;
  permissions: string[];
  isAuthenticated: boolean;
  token?: string;
}

/**
 * Security policy configuration
 */
export interface SecurityPolicy {
  fileAccess: {
    maxSize: number;
    allowedExtensions?: string[];
    deniedExtensions?: string[];
    scanForMalware?: boolean;
  };
  sessionManagement: {
    timeout: number;
    maxSessions: number;
    requireReauth: boolean;
  };
  audit: {
    enabled: boolean;
    level: 'minimal' | 'standard' | 'verbose';
    retention: number; // days
  };
  rateLimiting: {
    enabled: boolean;
    maxRequestsPerMinute: number;
    maxRequestsPerHour: number;
  };
}

/**
 * Security event types for audit logging
 */
export type SecurityEventType =
  | 'authentication'
  | 'authorization'
  | 'path_validation'
  | 'file_access'
  | 'session_created'
  | 'session_expired'
  | 'session_revoked'
  | 'safe_zone_warning'
  | 'safe_zone_audit'
  | 'config_updated'
  | 'security_violation'
  | 'rate_limit_exceeded';

/**
 * Security event data
 */
export interface SecurityEvent {
  type: SecurityEventType;
  timestamp: number;
  userId?: string;
  sessionId?: string;
  resource: string;
  action: string;
  result: 'success' | 'failure' | 'warning';
  metadata?: Record<string, any>;
  clientInfo?: {
    ip?: string;
    userAgent?: string;
    origin?: string;
  };
}

/**
 * Security middleware configuration
 */
export interface SecurityMiddlewareConfig extends SecurityConfig {
  cors: {
    enabled: boolean;
    origins: string[];
    methods: string[];
    headers: string[];
  };
  headers: {
    contentSecurityPolicy?: string;
    frameOptions?: string;
    xssProtection?: string;
  };
}

// Re-export the main enum for convenience
export { SafeZoneMode as SecurityMode };

// Type guards
export function isSecurityError(error: unknown): error is SecurityError {
  return error instanceof SecurityError;
}

export function isValidSafeZoneMode(mode: string): mode is SafeZoneMode {
  return Object.values(SafeZoneMode).includes(mode as SafeZoneMode);
}

export function isValidSecurityEventType(type: string): type is SecurityEventType {
  const validTypes: SecurityEventType[] = [
    'authentication',
    'authorization',
    'path_validation',
    'file_access',
    'session_created',
    'session_expired',
    'session_revoked',
    'safe_zone_warning',
    'safe_zone_audit',
    'config_updated',
    'security_violation',
    'rate_limit_exceeded'
  ];
  return validTypes.includes(type as SecurityEventType);
}
