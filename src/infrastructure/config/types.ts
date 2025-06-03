// Updated Configuration Types with Complete Schema Support
// File: src/infrastructure/config/types.ts

// Re-export the schema types
import { type ServerConfig, serverConfigSchema, loadAndValidateConfig, configSchema } from './schema.js';
export { type ServerConfig, serverConfigSchema, loadAndValidateConfig, configSchema };

// Enhanced type definitions for specific components
export interface DatabaseConfig {
  path: string;
  poolSize: number;
  walMode: boolean;
  cacheSize: number;
  backupInterval: number; // ADDED MISSING PROPERTY
  workingDirectory: string; // ADDED MISSING PROPERTY
  vacuum?: {
    enabled: boolean;
    schedule: string;
    threshold: number;
  };
  vectorStorage?: {
    enabled: boolean;
    embeddingDimensions: number;
    similarityThreshold: number;
  };
}

// Enhanced SecurityConfig with ALL missing properties
export interface SecurityConfig {
  allowedPaths: string[];
  enableAuditLog: boolean;
  sessionTimeout: number;
  maxFileSize: number;
  
  // Command execution security
  allowedCommands: string[];
  
  // Safe zones configuration
  safezones: string[];
  safeZoneMode: 'strict' | 'permissive' | 'audit';
  
  // Restricted zones
  restrictedZones: string[];
  
  // Path validation patterns
  blockedPathPatterns: string[];
  
  // Argument validation patterns
  unsafeArgumentPatterns: string[];
  
  // Process management limits
  maxConcurrentProcesses: number;
  maxProcessMemoryMB: number;
  maxProcessCpuPercent: number;
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
  cleanupIntervalMs: number;
  resourceCheckIntervalMs: number;
  enableProcessMonitoring: boolean;
  processKillGracePeriodMs: number;
}

export interface SemanticSearchConfig {
  enabled: boolean;
  provider: 'openai' | 'local' | 'lightweight';
  model: string;
  batchSize: number;
  maxQueryLength: number;
  relevanceScoring?: {
    semanticWeight: number;
    recencyWeight: number;
    typeWeight: number;
    accessWeight: number;
  };
}

export interface MemoryConfig {
  maxContextTokens: number;
  maxMemoryMB: number;
  cacheSize: number;
  optimizer?: {
    enabled: boolean;
    gcThreshold: number;
    monitoringInterval: number;
    chunkSize: number;
  };
  embeddingCache?: {
    maxSize: number;
    ttl: number;
  };
  relevanceCache?: {
    maxSize: number;
    ttl: number;
  };
}

export interface PluginConfig {
  directory: string;
  autoDiscover: boolean;
  sandbox: boolean;
  enabled: string[];
  disabled: string[];
  maxLoadTime: number;
  security?: {
    allowNetworkAccess: boolean;
    allowFileSystemAccess: boolean;
    allowProcessExecution: boolean;
  };
}

export interface BackupConfig {
  enabled: boolean;
  directory: string;
  maxVersions: number;
  compression: boolean;
  schedule?: {
    auto: string;
    cleanup: string;
  };
  types?: {
    emergency?: { maxCount: number; retention: string };
    manual?: { maxCount: number; retention: string };
    auto?: { maxCount: number; retention: string };
  };
}

export interface MonitoringConfig {
  enabled: boolean;
  healthCheck?: {
    interval: number;
    endpoints: string[];
  };
  metrics?: {
    enabled: boolean;
    collectInterval: number;
    retention: string;
  };
  alerts?: {
    enabled: boolean;
    thresholds?: {
      memoryUsage: number;
      diskUsage: number;
      errorRate: number;
      responseTime: number;
    };
  };
}

export interface PerformanceConfig {
  timeouts?: {
    default: number;
    fileOperations: number;
    databaseOperations: number;
    semanticSearch: number;
  };
  rateLimiting?: {
    enabled: boolean;
    windowMs: number;
    maxRequests: number;
  };
}

// Configuration validation helpers
export function validateDatabaseConfig(config: any): DatabaseConfig {
  return {
    path: config.path || './data/context.db',
    poolSize: config.poolSize || 5,
    walMode: config.walMode !== false,
    cacheSize: config.cacheSize || 64000,
    backupInterval: config.backupInterval || 14400000, // 4 hours
    workingDirectory: config.workingDirectory || './data',
    vacuum: config.vacuum,
    vectorStorage: config.vectorStorage
  };
}

export function validateSecurityConfig(config: any): SecurityConfig {
  return {
    allowedPaths: config.allowedPaths || ['./data', './examples'],
    enableAuditLog: config.enableAuditLog !== false,
    sessionTimeout: config.sessionTimeout || 3600000,
    maxFileSize: config.maxFileSize || 10485760,
    
    // Command execution security
    allowedCommands: config.allowedCommands || [
      'ls', 'cat', 'grep', 'find', 'head', 'tail', 'wc', 'sort', 'uniq'
    ],
    
    // Safe zones configuration
    safezones: config.safezones || ['./data', './examples', './config'],
    safeZoneMode: config.safeZoneMode || 'strict',
    
    // Restricted zones
    restrictedZones: config.restrictedZones || [
      '/etc', '/usr/bin', '/bin', '/boot', '/sys', '/proc'
    ],
    
    // Path validation patterns
    blockedPathPatterns: config.blockedPathPatterns || [
      '**/../**', '**/~/**', '**/.ssh/**', '**/passwd', '**/shadow'
    ],
    
    // Argument validation patterns
    unsafeArgumentPatterns: config.unsafeArgumentPatterns || [
      ';.*', '\\|.*', '&&.*', '\\$\\(.*\\)', '`.*`', '<.*>', '>.*'
    ],
    
    // Process management limits
    maxConcurrentProcesses: config.maxConcurrentProcesses || 5,
    maxProcessMemoryMB: config.maxProcessMemoryMB || 256,
    maxProcessCpuPercent: config.maxProcessCpuPercent || 80,
    defaultTimeoutMs: config.defaultTimeoutMs || 30000,
    maxTimeoutMs: config.maxTimeoutMs || 300000,
    cleanupIntervalMs: config.cleanupIntervalMs || 60000,
    resourceCheckIntervalMs: config.resourceCheckIntervalMs || 5000,
    enableProcessMonitoring: config.enableProcessMonitoring !== false,
    processKillGracePeriodMs: config.processKillGracePeriodMs || 5000
  };
}

// Feature flag helpers
export interface FeatureFlags {
  fastmcpIntegration: boolean;
  semanticMemory: boolean;
  vectorStorage: boolean;
  enhancedSecurity: boolean;
  memoryOptimization: boolean;
  pluginSystem: boolean;
  advancedBackup: boolean;
  realTimeMonitoring: boolean;
  sessionManagement: boolean;
  auditLogging: boolean;
}

export function isFeatureEnabled(features: FeatureFlags, feature: keyof FeatureFlags): boolean {
  return features[feature] === true;
}

// Configuration update helpers
export function mergeConfigs(base: Partial<ServerConfig>, override: Partial<ServerConfig>): ServerConfig {
  return serverConfigSchema.parse({
    ...base,
    ...override,
    // Deep merge nested objects
    server: { ...base.server, ...override.server },
    database: { ...base.database, ...override.database },
    security: { ...base.security, ...override.security },
    memory: { ...base.memory, ...override.memory },
    semanticSearch: { ...base.semanticSearch, ...override.semanticSearch },
    plugins: { ...base.plugins, ...override.plugins },
    backup: { ...base.backup, ...override.backup },
    monitoring: { ...base.monitoring, ...override.monitoring },
    performance: { ...base.performance, ...override.performance },
    development: { ...base.development, ...override.development },
    features: { ...base.features, ...override.features }
  });
}

// Security validation helpers
export function isPathAllowed(path: string, securityConfig: SecurityConfig): boolean {
  // Check if path is in safe zones
  const isInSafeZone = securityConfig.safezones.some(zone => 
    path.startsWith(zone)
  );
  
  // Check if path matches blocked patterns
  const isBlocked = securityConfig.blockedPathPatterns.some(pattern => {
    const regex = new RegExp(pattern.replace(/\*\*/g, '.*').replace(/\*/g, '[^/]*'));
    return regex.test(path);
  });
  
  return isInSafeZone && !isBlocked;
}

export function isCommandAllowed(command: string, securityConfig: SecurityConfig): boolean {
  return securityConfig.allowedCommands.includes(command);
}

export function hasUnsafeArguments(args: string[], securityConfig: SecurityConfig): boolean {
  const argString = args.join(' ');
  return securityConfig.unsafeArgumentPatterns.some(pattern => {
    const regex = new RegExp(pattern);
    return regex.test(argString);
  });
}
