// Complete Configuration Schema with All Missing Properties
// File: src/infrastructure/config/schema.ts

import { z } from 'zod';

export const serverConfigSchema = z.object({
  // Core server configuration
  server: z
    .object({
      name: z.string().default('context-savy-server'),
      version: z.string().default('2.0.0'),
      port: z.number().default(3000),
      host: z.string().default('localhost'),
      transport: z.enum(['stdio', 'http', 'websocket']).default('stdio'),
      workingDirectory: z.string().default('./'), // MISSING PROPERTY

      // FastMCP integration
      fastmcp: z
        .object({
          enabled: z.boolean().default(true),
          sessionTimeout: z.number().default(30000),
          progressReporting: z.boolean().default(true),
          authentication: z.boolean().default(false)
        })
        .optional()
    })
    .default({}),

  // Database configuration with missing properties
  database: z
    .object({
      path: z.string().default('./data/context.db'),
      poolSize: z.number().default(5),
      walMode: z.boolean().default(true),
      cacheSize: z.number().default(64000),
      backupInterval: z.number().default(14400000), // MISSING: 4 hours in ms
      workingDirectory: z.string().default('./data'), // MISSING PROPERTY

      // Vacuum settings
      vacuum: z
        .object({
          enabled: z.boolean().default(true),
          schedule: z.string().default('daily'),
          threshold: z.number().default(0.3)
        })
        .optional(),

      // Vector storage
      vectorStorage: z
        .object({
          enabled: z.boolean().default(true),
          embeddingDimensions: z.number().default(384),
          similarityThreshold: z.number().default(0.7)
        })
        .optional()
    })
    .default({}),

  // Complete Security configuration with ALL missing properties
  security: z
    .object({
      allowedPaths: z.array(z.string()).default(['./data', './examples']),
      enableAuditLog: z.boolean().default(true),
      sessionTimeout: z.number().default(3600000),
      maxFileSize: z.number().default(10485760), // 10MB
      
      // MISSING: Command execution security
      allowedCommands: z.array(z.string()).default([
        'ls', 'cat', 'grep', 'find', 'head', 'tail', 'wc', 'sort', 'uniq'
      ]),
      
      // MISSING: Safe zones configuration
      safezones: z.array(z.string()).default(['./data', './examples', './config']),
      safeZoneMode: z.enum(['strict', 'permissive', 'audit']).default('strict'),
      
      // MISSING: Restricted zones
      restrictedZones: z.array(z.string()).default([
        '/etc', '/usr/bin', '/bin', '/boot', '/sys', '/proc'
      ]),
      
      // MISSING: Path validation patterns
      blockedPathPatterns: z.array(z.string()).default([
        '**/../**', '**/~/**', '**/.ssh/**', '**/passwd', '**/shadow'
      ]),
      
      // MISSING: Argument validation patterns
      unsafeArgumentPatterns: z.array(z.string()).default([
        ';.*', '\\|.*', '&&.*', '\\$\\(.*\\)', '`.*`', '<.*>', '>.*'
      ]),
      
      // MISSING: Process management limits
      maxConcurrentProcesses: z.number().default(5),
      maxProcessMemoryMB: z.number().default(256),
      maxProcessCpuPercent: z.number().default(80),
      defaultTimeoutMs: z.number().default(30000),
      maxTimeoutMs: z.number().default(300000),
      cleanupIntervalMs: z.number().default(60000),
      resourceCheckIntervalMs: z.number().default(5000),
      enableProcessMonitoring: z.boolean().default(true),
      processKillGracePeriodMs: z.number().default(5000)
    })
    .default({}),

  // Memory management
  memory: z
    .object({
      maxContextTokens: z.number().default(8192),
      maxMemoryMB: z.number().default(512),
      cacheSize: z.number().default(1000),

      // Memory optimizer
      optimizer: z
        .object({
          enabled: z.boolean().default(true),
          gcThreshold: z.number().default(0.9),
          monitoringInterval: z.number().default(30000),
          chunkSize: z.number().default(1024)
        })
        .optional(),

      // Embedding cache
      embeddingCache: z
        .object({
          maxSize: z.number().default(10000),
          ttl: z.number().default(3600000) // 1 hour
        })
        .optional(),

      // Relevance cache
      relevanceCache: z
        .object({
          maxSize: z.number().default(5000),
          ttl: z.number().default(1800000) // 30 minutes
        })
        .optional()
    })
    .default({}),

  // Semantic search configuration
  semanticSearch: z
    .object({
      enabled: z.boolean().default(true),
      provider: z.enum(['openai', 'local', 'lightweight']).default('lightweight'),
      model: z.string().default('lightweight-hash-384'),
      batchSize: z.number().default(50),
      maxQueryLength: z.number().default(1000),

      // Relevance scoring weights
      relevanceScoring: z
        .object({
          semanticWeight: z.number().default(0.4),
          recencyWeight: z.number().default(0.3),
          typeWeight: z.number().default(0.2),
          accessWeight: z.number().default(0.1)
        })
        .optional()
    })
    .default({}),

  // Plugin system configuration
  plugins: z
    .object({
      directory: z.string().default('./plugins'),
      autoDiscover: z.boolean().default(true),
      sandbox: z.boolean().default(true),
      enabled: z.array(z.string()).default([]),
      disabled: z.array(z.string()).default([]),
      maxLoadTime: z.number().default(30000),

      // Plugin security
      security: z
        .object({
          allowNetworkAccess: z.boolean().default(false),
          allowFileSystemAccess: z.boolean().default(false),
          allowProcessExecution: z.boolean().default(false)
        })
        .optional()
    })
    .default({}),

  // Backup configuration
  backup: z
    .object({
      enabled: z.boolean().default(true),
      directory: z.string().default('./data/backups'),
      maxVersions: z.number().default(10),
      compression: z.boolean().default(true),

      // Backup schedule
      schedule: z
        .object({
          auto: z.string().default('0 */4 * * *'), // Every 4 hours
          cleanup: z.string().default('0 2 * * 0') // Weekly cleanup
        })
        .optional(),

      // Backup types
      types: z
        .object({
          emergency: z
            .object({
              maxCount: z.number().default(5),
              retention: z.string().default('7d')
            })
            .optional(),
          manual: z
            .object({
              maxCount: z.number().default(20),
              retention: z.string().default('30d')
            })
            .optional(),
          auto: z
            .object({
              maxCount: z.number().default(50),
              retention: z.string().default('90d')
            })
            .optional()
        })
        .optional()
    })
    .default({}),

  // Logging configuration
  logging: z
    .object({
      level: z.enum(['error', 'warn', 'info', 'debug']).default('info'),

      // File logging
      file: z
        .object({
          enabled: z.boolean().default(true),
          path: z.string().default('./logs/server.log'),
          maxSize: z.string().default('10MB'),
          maxFiles: z.number().default(5),
          rotateDaily: z.boolean().default(true)
        })
        .optional(),

      // Audit logging
      audit: z
        .object({
          enabled: z.boolean().default(true),
          path: z.string().default('./logs/audit.log'),
          maxSize: z.string().default('50MB'),
          maxFiles: z.number().default(10)
        })
        .optional()
    })
    .default({}),

  // Performance configuration
  performance: z
    .object({
      // Timeouts
      timeouts: z
        .object({
          default: z.number().default(30000),
          fileOperations: z.number().default(60000),
          databaseOperations: z.number().default(10000),
          semanticSearch: z.number().default(45000)
        })
        .optional(),

      // Rate limiting
      rateLimiting: z
        .object({
          enabled: z.boolean().default(false),
          windowMs: z.number().default(900000), // 15 minutes
          maxRequests: z.number().default(100)
        })
        .optional()
    })
    .default({}),

  // Monitoring configuration
  monitoring: z
    .object({
      enabled: z.boolean().default(true),

      // Health checks
      healthCheck: z
        .object({
          interval: z.number().default(30000),
          endpoints: z.array(z.string()).default(['/health', '/status'])
        })
        .optional(),

      // Metrics collection
      metrics: z
        .object({
          enabled: z.boolean().default(true),
          collectInterval: z.number().default(60000),
          retention: z.string().default('24h')
        })
        .optional(),

      // Alerting
      alerts: z
        .object({
          enabled: z.boolean().default(false),
          thresholds: z
            .object({
              memoryUsage: z.number().default(0.9),
              diskUsage: z.number().default(0.85),
              errorRate: z.number().default(0.1),
              responseTime: z.number().default(5000)
            })
            .optional()
        })
        .optional()
    })
    .default({}),

  // Development configuration
  development: z
    .object({
      enabled: z.boolean().default(false),
      debugMode: z.boolean().default(false),
      mockServices: z.boolean().default(false),

      // Test data
      testData: z
        .object({
          enabled: z.boolean().default(false),
          seedDatabase: z.boolean().default(false)
        })
        .optional(),

      // Profiling
      profiling: z
        .object({
          enabled: z.boolean().default(false),
          samplingRate: z.number().default(0.1)
        })
        .optional()
    })
    .default({}),

  // Feature flags
  features: z
    .object({
      fastmcpIntegration: z.boolean().default(true),
      semanticMemory: z.boolean().default(true),
      vectorStorage: z.boolean().default(true),
      enhancedSecurity: z.boolean().default(true),
      memoryOptimization: z.boolean().default(true),
      pluginSystem: z.boolean().default(true),
      advancedBackup: z.boolean().default(true),
      realTimeMonitoring: z.boolean().default(true),
      sessionManagement: z.boolean().default(true),
      auditLogging: z.boolean().default(true)
    })
    .default({})
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;

// Configuration validation and loading
export function loadAndValidateConfig(configPath?: string): ServerConfig {
  try {
    // Load configuration from file or environment
    const rawConfig = loadConfigFromSource(configPath);

    // Validate against schema
    const validatedConfig = serverConfigSchema.parse(rawConfig);

    console.log('✅ Configuration validated successfully');
    return validatedConfig;
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Configuration validation failed:');
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
    } else {
      console.error('❌ Configuration loading failed:', error);
    }

    // Return default configuration as fallback
    console.log('🔄 Using default configuration');
    return serverConfigSchema.parse({});
  }
}

function loadConfigFromSource(configPath?: string): any {
  // Implementation would load from YAML file, environment variables, etc.
  // For now, return empty object to use all defaults
  return {};
}

// Export the schema for validation elsewhere
export { serverConfigSchema as configSchema };
