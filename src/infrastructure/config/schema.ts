// config/schema.ts - Fix for line 385 unused parameter
// This is the specific fix for the unused parameter error

import { z } from 'zod';
import { SafeZoneMode } from './types.js';

// Nested Schemas
const serverDetailsSchema = z
  .object({
    name: z.string().default('context-savy-server'),
    version: z.string().default('2.0.0'),
    port: z.number().min(1).max(65535).default(3000),
    host: z.string().default('localhost'),
    transport: z.enum(['stdio', 'http', 'websocket']).default('stdio'),
    workingDirectory: z.string().optional(),
    fastmcp: z
      .object({
        enabled: z.boolean().default(true),
        sessionTimeout: z.number().default(86400000),
        progressReporting: z.boolean().default(true),
        authentication: z.boolean().default(true)
      })
      .default({})
  })
  .default({});

export const securityConfigSchema = z
  .object({
    safeZoneMode: z.nativeEnum(SafeZoneMode).default(SafeZoneMode.RECURSIVE),
    allowedPaths: z.array(z.string()).default(['./data', './examples']),
    maxFileSize: z
      .number()
      .positive()
      .default(10 * 1024 * 1024),
    enableAuditLog: z.boolean().default(true),
    sessionTimeout: z
      .number()
      .positive()
      .default(24 * 60 * 60 * 1000),
    maxSessions: z.number().positive().default(100),
    allowedCommands: z.union([z.array(z.string()), z.literal('all')]).default(['echo', 'ls', 'cat']),
    restrictedZones: z.array(z.string()).default([]),
    safezones: z.array(z.string()).default(['.']),
    maxExecutionTime: z.number().default(900000),
    unsafeArgumentPatterns: z.array(z.string()).default([]),
    autoExpandSafezones: z.boolean().default(true),
    blockedPathPatterns: z.array(z.string()).default([]),
    processKillGracePeriodMs: z.number().default(5000),
    maxConcurrentProcesses: z.number().default(5),
    maxProcessMemoryMB: z.number().default(512),
    maxProcessCpuPercent: z.number().default(80),
    defaultTimeoutMs: z.number().default(30000),
    maxTimeoutMs: z.number().default(300000),
    cleanupIntervalMs: z.number().default(60000),
    resourceCheckIntervalMs: z.number().default(5000),
    enableProcessMonitoring: z.boolean().default(true)
  })
  .default({
    safeZoneMode: SafeZoneMode.RECURSIVE,
    allowedPaths: ['./data', './examples'],
    maxFileSize: 10 * 1024 * 1024,
    enableAuditLog: true,
    sessionTimeout: 24 * 60 * 60 * 1000,
    maxSessions: 100,
    allowedCommands: ['echo', 'ls', 'cat'],
    restrictedZones: [],
    safezones: ['.'],
    maxExecutionTime: 900000,
    unsafeArgumentPatterns: [],
    autoExpandSafezones: true,
    blockedPathPatterns: [],
    processKillGracePeriodMs: 5000,
    maxConcurrentProcesses: 5,
    maxProcessMemoryMB: 512,
    maxProcessCpuPercent: 80,
    defaultTimeoutMs: 30000,
    maxTimeoutMs: 300000,
    cleanupIntervalMs: 60000,
    resourceCheckIntervalMs: 5000,
    enableProcessMonitoring: true
  });

const databaseConfigSchema = z
  .object({
    path: z.string().default('./data/context.db'),
    poolSize: z.number().positive().default(5),
    walMode: z.boolean().default(true),
    busyTimeout: z.number().default(30000),
    cacheSize: z.number().default(64000),
    backupInterval: z.number().default(60),
    vacuum: z
      .object({
        enabled: z.boolean().default(true),
        schedule: z.string().default('0 2 * * *'),
        threshold: z.number().default(0.3)
      })
      .default({ enabled: true, schedule: '0 2 * * *', threshold: 0.3 }), // Ensure sub-object defaults
    vectorStorage: z
      .object({
        enabled: z.boolean().default(true),
        embeddingDimensions: z.number().default(384),
        similarityThreshold: z.number().default(0.7)
      })
      .default({ enabled: true, embeddingDimensions: 384, similarityThreshold: 0.7 }) // Ensure sub-object defaults
  })
  .default({});

const memoryConfigSchema = z
  .object({
    maxContextTokens: z.number().positive().default(8192),
    maxMemoryMB: z.number().positive().default(512),
    cacheSize: z.number().positive().default(1000),
    gcInterval: z.number().positive().default(30000),
    optimizer: z
      .object({
        enabled: z.boolean().default(true),
        gcThreshold: z.number().default(0.85),
        monitoringInterval: z.number().default(30000),
        chunkSize: z.number().default(1024)
      })
      .default({ enabled: true, gcThreshold: 0.85, monitoringInterval: 30000, chunkSize: 1024 }), // Ensure sub-object defaults
    embeddingCache: z
      .object({
        maxSize: z.number().default(1000),
        ttl: z.number().default(3600000)
      })
      .default({ maxSize: 1000, ttl: 3600000 }), // Ensure sub-object defaults
    relevanceCache: z
      .object({
        maxSize: z.number().default(2000),
        ttl: z.number().default(1800000)
      })
      .default({ maxSize: 2000, ttl: 1800000 }) // Ensure sub-object defaults
  })
  .default({});

const pluginsConfigSchema = z
  .object({
    directory: z.string().default('./plugins'),
    autoDiscover: z.boolean().default(true),
    sandbox: z.boolean().default(true),
    maxPlugins: z.number().positive().default(50),
    enabled: z.array(z.string()).default([]),
    disabled: z.array(z.string()).default([]),
    maxLoadTime: z.number().default(5000),
    security: z
      .object({
        allowNetworkAccess: z.boolean().default(false),
        allowFileSystemAccess: z.boolean().default(false),
        allowProcessExecution: z.boolean().default(false)
      })
      .default({ allowNetworkAccess: false, allowFileSystemAccess: false, allowProcessExecution: false }) // Ensure sub-object defaults
  })
  .default({});

const developmentConfigSchema = z
  .object({
    enabled: z.boolean().default(false),
    debugMode: z.boolean().default(false),
    enableDebugLogs: z.boolean().default(false),
    enableProfiler: z.boolean().default(false),
    hotReload: z.boolean().default(false),
    mockServices: z.boolean().default(false),
    testData: z
      .object({
        enabled: z.boolean().default(false),
        seedDatabase: z.boolean().default(false)
      })
      .default({ enabled: false, seedDatabase: false }), // Ensure sub-object defaults
    profiling: z
      .object({
        enabled: z.boolean().default(false),
        samplingRate: z.number().default(0.1)
      })
      .default({ enabled: false, samplingRate: 0.1 }) // Ensure sub-object defaults
  })
  .default({});

const loggingConfigSchema = z
  .object({
    level: z.string().default('info'),
    pretty: z.boolean().default(true),
    file: z
      .object({
        enabled: z.boolean().default(true),
        path: z.string().default('./logs/server.log'),
        maxSize: z.number().default(10485760),
        maxFiles: z.number().default(5),
        rotateDaily: z.boolean().default(true)
      })
      .default({ enabled: true, path: './logs/server.log', maxSize: 10485760, maxFiles: 5, rotateDaily: true }), // Ensure sub-object defaults
    audit: z
      .object({
        enabled: z.boolean().default(true),
        path: z.string().default('./logs/audit.log'),
        maxSize: z.number().default(5242880),
        maxFiles: z.number().default(10)
      })
      .default({ enabled: true, path: './logs/audit.log', maxSize: 5242880, maxFiles: 10 }) // Ensure sub-object defaults
  })
  .default({});

const performanceConfigSchema = z
  .object({
    maxConcurrency: z.number().default(10),
    queueSize: z.number().default(1000),
    timeouts: z
      .object({
        default: z.number().default(30000),
        fileOperations: z.number().default(60000),
        databaseOperations: z.number().default(30000),
        semanticSearch: z.number().default(45000)
      })
      .default({ default: 30000, fileOperations: 60000, databaseOperations: 30000, semanticSearch: 45000 }), // Ensure sub-object defaults
    rateLimiting: z
      .object({
        enabled: z.boolean().default(true),
        windowMs: z.number().default(60000),
        maxRequests: z.number().default(1000)
      })
      .default({ enabled: true, windowMs: 60000, maxRequests: 1000 }) // Ensure sub-object defaults
  })
  .default({});

const featuresSchema = z
  .object({
    fastmcpIntegration: z.boolean().default(true),
    semanticMemory: z.boolean().default(true),
    vectorStorage: z.boolean().default(true),
    enhancedSecurity: z.boolean().default(true),
    memoryOptimization: z.boolean().default(true),
    pluginSystem: z.boolean().default(false),
    advancedBackup: z.boolean().default(true),
    realTimeMonitoring: z.boolean().default(true),
    sessionManagement: z.boolean().default(true),
    auditLogging: z.boolean().default(true)
  })
  .default({});

const consentConfigSchema = z
  .object({
    alwaysAllow: z.array(z.string()).default([]),
    alwaysDeny: z.array(z.string()).default([]),
    requireConsent: z.array(z.string()).default([]),
    policy: z.any().optional(),
    settings: z.any().optional()
  })
  .default({});

const uiConfigSchema = z
  .object({
    consentPort: z.number().default(3003)
  })
  .default({});

const semanticSearchConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    provider: z.string().default('tensorflow'),
    model: z.string().default('universal-sentence-encoder'),
    batchSize: z.number().default(32),
    maxQueryLength: z.number().default(500),
    relevanceScoring: z
      .object({
        semanticWeight: z.number().default(0.4),
        recencyWeight: z.number().default(0.3),
        typeWeight: z.number().default(0.2),
        accessWeight: z.number().default(0.1)
      })
      .default({ semanticWeight: 0.4, recencyWeight: 0.3, typeWeight: 0.2, accessWeight: 0.1 }) // Ensure sub-object defaults
  })
  .default({});

const backupConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    directory: z.string().default('./backups'),
    maxVersions: z.number().default(10),
    compression: z.boolean().default(true),
    schedule: z
      .object({
        auto: z.string().default('0 */4 * * *'),
        cleanup: z.string().default('0 1 * * 0')
      })
      .default({ auto: '0 */4 * * *', cleanup: '0 1 * * 0' }), // Ensure sub-object defaults
    types: z
      .object({
        emergency: z
          .object({ maxCount: z.number().default(5), retention: z.number().default(2592000000) })
          .default({ maxCount: 5, retention: 2592000000 }), // Ensure sub-object defaults
        manual: z
          .object({ maxCount: z.number().default(20), retention: z.number().default(7776000000) })
          .default({ maxCount: 20, retention: 7776000000 }), // Ensure sub-object defaults
        auto: z
          .object({ maxCount: z.number().default(48), retention: z.number().default(1209600000) })
          .default({ maxCount: 48, retention: 1209600000 }) // Ensure sub-object defaults
      })
      .default({})
  })
  .default({});

const monitoringConfigSchema = z
  .object({
    enabled: z.boolean().default(true),
    healthCheck: z
      .object({
        interval: z.number().default(60000),
        endpoints: z.array(z.string()).default(['database', 'memory', 'filesystem', 'security'])
      })
      .default({ interval: 60000, endpoints: ['database', 'memory', 'filesystem', 'security'] }), // Ensure sub-object defaults
    metrics: z
      .object({
        enabled: z.boolean().default(true),
        collectInterval: z.number().default(30000),
        retention: z.number().default(86400000)
      })
      .default({ enabled: true, collectInterval: 30000, retention: 86400000 }), // Ensure sub-object defaults
    alerts: z
      .object({
        enabled: z.boolean().default(true),
        thresholds: z
          .object({
            memoryUsage: z.number().default(0.9),
            diskUsage: z.number().default(0.95),
            errorRate: z.number().default(0.1),
            responseTime: z.number().default(5000)
          })
          .default({ memoryUsage: 0.9, diskUsage: 0.95, errorRate: 0.1, responseTime: 5000 }) // Ensure sub-object defaults
      })
      .default({})
  })
  .default({});

// Main server configuration schema
export const serverConfigSchema = z.object({
  server: serverDetailsSchema,
  security: securityConfigSchema,
  database: databaseConfigSchema,
  memory: memoryConfigSchema,
  plugins: pluginsConfigSchema,
  development: developmentConfigSchema.optional(),
  logging: loggingConfigSchema,
  performance: performanceConfigSchema,
  features: featuresSchema,
  consent: consentConfigSchema.optional(),
  ui: uiConfigSchema.optional(),
  semanticSearch: semanticSearchConfigSchema.optional(),
  backup: backupConfigSchema.optional(),
  monitoring: monitoringConfigSchema.optional()
});

// Type inference from schemas
export type SecurityConfig = z.infer<typeof securityConfigSchema>;
export type ServerConfig = z.infer<typeof serverConfigSchema>;

// Export the main schema also as configSchema for backward compatibility
export const configSchema = serverConfigSchema;

// Configuration validation function
export function validateConfig(config: unknown): ServerConfig {
  return serverConfigSchema.parse(config);
}

// Partial configuration validation (for updates)
export function validatePartialConfig(config: unknown): Partial<ServerConfig> {
  return serverConfigSchema.partial().parse(config);
}

// Security-specific validation
export function validateSecurityConfig(config: unknown): SecurityConfig {
  return securityConfigSchema.parse(config);
}

export function getConfigDefaults(_configType?: string): ServerConfig {
  const baseDefaults = serverConfigSchema.parse({});
  return baseDefaults;
}

export function mergeConfigs(base: ServerConfig, override: Partial<ServerConfig>): ServerConfig {
  const rawMerged = {
    ...base,
    ...override,
    server: { ...base.server, ...override.server },
    security: { ...base.security, ...override.security },
    database: { ...base.database, ...override.database },
    memory: { ...base.memory, ...override.memory },
    plugins: { ...base.plugins, ...override.plugins },
    development: { ...base.development, ...override.development },
    logging: { ...base.logging, ...override.logging },
    performance: { ...base.performance, ...override.performance },
    features: { ...base.features, ...override.features },
    consent: { ...base.consent, ...override.consent },
    ui: { ...base.ui, ...override.ui },
    semanticSearch: { ...base.semanticSearch, ...override.semanticSearch },
    backup: { ...base.backup, ...override.backup },
    monitoring: { ...base.monitoring, ...override.monitoring }
  };

  return validateConfig(rawMerged);
}

export const ENV_MAPPINGS = {
  PORT: 'server.port',
  HOST: 'server.host',
  TRANSPORT: 'server.transport',
  DB_PATH: 'database.path',
  SAFE_ZONE_MODE: 'security.safeZoneMode',
  MAX_FILE_SIZE: 'security.maxFileSize',
  SESSION_TIMEOUT: 'security.sessionTimeout',
  ENABLE_AUDIT: 'security.enableAuditLog',
  MAX_MEMORY_MB: 'memory.maxMemoryMB',
  CACHE_SIZE: 'memory.cacheSize',
  PLUGIN_DIR: 'plugins.directory',
  DEBUG_LOGS: 'development.enableDebugLogs'
} as const;

export function applyEnvToConfig(config: ServerConfig): ServerConfig {
  const envConfig = { ...config };

  Object.entries(ENV_MAPPINGS).forEach(([envKey, configPath]) => {
    const envValue = process.env[envKey];
    if (envValue !== undefined) {
      setNestedProperty(envConfig, configPath, parseEnvValue(envValue));
    }
  });

  return validateConfig(envConfig);
}

function setNestedProperty(obj: any, path: string, value: any): void {
  if (!path) return; // Guard against empty path

  const keys = path.split('.');
  let current = obj;

  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i];
    if (!key) continue; // Should not happen with valid paths
    if (!(key in current) || typeof current[key] !== 'object' || current[key] === null) {
      current[key] = {};
    }
    current = current[key];
  }

  const lastKey = keys[keys.length - 1];
  if (lastKey && current && typeof current === 'object') {
    // Ensure lastKey is valid and current is an object
    current[lastKey] = value;
  }
}

function parseEnvValue(value: string): any {
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;
  const num = Number(value);
  if (!isNaN(num)) return num;
  return value;
}

export function validateConfigWithErrors(config: unknown): {
  success: boolean;
  config?: ServerConfig;
  errors?: string[];
} {
  try {
    const validConfig = validateConfig(config);
    return { success: true, config: validConfig };
  } catch (error) {
    if (error instanceof z.ZodError) {
      const errors = error.errors.map(err => `${err.path.join('.')}: ${err.message}`);
      return { success: false, errors };
    }
    return {
      success: false,
      errors: [error instanceof Error ? error.message : 'Unknown validation error']
    };
  }
}
