export interface ServerConfig {
  server: {
    name: string;
    version: string;
    workingDirectory?: string;
  };
  ui?: {
    consentPort?: number;
  };
  security: {
    allowedCommands: string[] | 'all';
    safezones: string[];
    restrictedZones?: string[];
    maxExecutionTime: number;
    maxFileSize: number;
    unsafeArgumentPatterns?: string[];
    autoExpandSafezones?: boolean;
    safeZoneMode?: 'strict' | 'recursive';
    blockedPathPatterns?: string[];
    
    // Phase 1 Process Management Properties
    maxConcurrentProcesses?: number;
    maxProcessMemoryMB?: number;
    maxProcessCpuPercent?: number;
    defaultTimeoutMs?: number;
    maxTimeoutMs?: number;
    cleanupIntervalMs?: number;
    resourceCheckIntervalMs?: number;
    enableProcessMonitoring?: boolean;
    processKillGracePeriodMs?: number;
  };
  database: {
    path: string;
    backupInterval: number;
    
    // Phase 1 Database Properties
    enableWAL?: boolean;
    pragmas?: {
      synchronous?: string;
      cache_size?: number;
      temp_store?: string;
      mmap_size?: number;
    };
    backup?: {
      enabled?: boolean;
      interval?: string;
      maxBackups?: number;
      path?: string;
    };
    pool?: {
      min?: number;
      max?: number;
      acquireTimeoutMs?: number;
      idleTimeoutMs?: number;
    };
  };
  logging: {
    level: string;
    pretty: boolean;
    
    // Phase 1 Logging Properties
    format?: string;
    enableConsole?: boolean;
    enableFile?: boolean;
    logFile?: string;
    maxFileSize?: string;
    maxFiles?: number;
    enableRequestLogging?: boolean;
  };
  performance: {
    maxConcurrency: number;
    queueSize: number;
  };
  
  // Phase 1 Major Sections
  memory?: {
    maxContextSizeMB?: number;
    contextCacheSizeMB?: number;
    embeddingCacheSizeMB?: number;
    maxContextAge?: string;
    cleanupInterval?: string;
    enableCompression?: boolean;
    compressionLevel?: number;
  };
  
  semanticSearch?: {
    enabled?: boolean;
    provider?: 'openai' | 'local' | 'disabled';
    openai?: {
      model?: string;
      apiKey?: string;
      maxTokens?: number;
      batchSize?: number;
      rateLimitRpm?: number;
      timeout?: number;
    };
    local?: {
      modelPath?: string;
      device?: 'cpu' | 'cuda' | 'mps';
      batchSize?: number;
    };
    defaultSimilarityThreshold?: number;
    maxResults?: number;
    enableCaching?: boolean;
    cacheExpiry?: string;
  };
  
  context?: {
    maxContextsPerSession?: number;
    maxSessionAge?: string;
    enableAutoCleanup?: boolean;
    cleanupInterval?: string;
    enableVersioning?: boolean;
    maxVersionsPerContext?: number;
    enableRelationships?: boolean;
    maxRelationshipsPerContext?: number;
  };
  
  workspace?: {
    maxWorkspaces?: number;
    maxFilesPerWorkspace?: number;
    maxWorkspaceSize?: string;
    defaultSyncInterval?: string;
    enableAutoSync?: boolean;
    backupOnDelete?: boolean;
    maxBackupAge?: string;
  };
  
  smartPaths?: {
    enabled?: boolean;
    maxPaths?: number;
    maxStepsPerPath?: number;
    cacheResults?: boolean;
    cacheExpiry?: string;
  };
  
  consent?: {
    enabled?: boolean;
    defaultTimeout?: number;
    maxTimeout?: number;
    enableRiskAnalysis?: boolean;
    autoApproveThreshold?: number;
    autoRejectThreshold?: number;
    enablePlugins?: boolean;
    auditRetention?: number;
    enableSessionTracking?: boolean;
    trustLevelDecayRate?: number;
    alwaysAllow?: string[];
    alwaysDeny?: string[];
    requireConsent?: string[];
  };
  
  plugins?: {
    enabled?: boolean;
    directory?: string;
    autoDiscover?: boolean;
    enableSandbox?: boolean;
    maxPlugins?: number;
    pluginTimeout?: number;
    enableNPMInstall?: boolean;
    allowedDependencies?: string[];
  };
  
  monitoring?: {
    enabled?: boolean;
    metricsEndpoint?: string;
    healthEndpoint?: string;
    collectProcessMetrics?: boolean;
    collectMemoryMetrics?: boolean;
    collectDatabaseMetrics?: boolean;
    collectRequestMetrics?: boolean;
    retentionPeriod?: string;
    sampleInterval?: string;
    alerts?: {
      memoryUsagePercent?: number;
      cpuUsagePercent?: number;
      diskUsagePercent?: number;
      responseTimeMs?: number;
      errorRate?: number;
    };
  };
  
  rateLimiting?: {
    enabled?: boolean;
    windowMs?: number;
    maxRequests?: number;
    skipSuccessfulRequests?: boolean;
    skipFailedRequests?: boolean;
    operations?: {
      command_execute?: number;
      file_write?: number;
      file_delete?: number;
      database_write?: number;
    };
  };
  
  development?: {
    enableDebugMode?: boolean;
    enableTestingTools?: boolean;
    mockServices?: string[];
    bypassSecurity?: boolean;
    verboseLogging?: boolean;
    enableProfiler?: boolean;
  };
}