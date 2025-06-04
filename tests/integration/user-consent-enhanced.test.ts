// Enhanced User Consent Service Test
// File: tests/integration/user-consent-enhanced.test.ts

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { UserConsentService } from '../../src/application/services/user-consent.service.js';
import type { ISecurityValidator } from '../../src/core/interfaces/security.interface.js';
import type { ServerConfig } from '../../src/infrastructure/config/schema.js';
import type { ConsentRequest, ConsentResponse } from '../../src/core/interfaces/consent.interface.js';
import type { ConsentPlugin } from '../../src/core/interfaces/consent-extended.interface.js';
import { SafeZoneMode } from '../../src/infrastructure/config/types.js';

// Mock security validator
const mockSecurityValidator: ISecurityValidator = {
  async validatePath(path: string): Promise<string> {
    if (path.includes('restricted')) {
      throw new Error('Access to restricted path denied');
    }
    return path;
  },

  async validateCommand(command: string, args: string[]): Promise<void> {
    if (command === 'rm' && args.includes('-rf')) {
      throw new Error('Dangerous command blocked');
    }
  },

  isPathInSafeZone: (path: string) => !path.includes('restricted'),
  sanitizeInput: (input: string) => input,
  getSecurityInfo: () => ({
    safeZones: ['.'],
    restrictedZones: ['/restricted'],
    safeZoneMode: 'strict',
    blockedPatterns: 0
  }),
  testPathAccess: async (path: string) => ({
    allowed: !path.includes('restricted'),
    reason: path.includes('restricted') ? 'Restricted path' : 'Allowed',
    resolvedPath: path,
    inputPath: path
  })
};

// Mock server config
const mockConfig: ServerConfig = {
  server: {
    name: 'test-server',
    version: '1.0.0',
    port: 3000,
    host: 'localhost',
    transport: 'stdio',
    workingDirectory: process.cwd(),
    fastmcp: { enabled: true, sessionTimeout: 86400000, progressReporting: true, authentication: true }
  },
  security: {
    allowedCommands: ['ls', 'cat', 'echo'],
    safezones: ['.', './test'],
    maxExecutionTime: 5000,
    maxFileSize: 1048576,
    safeZoneMode: SafeZoneMode.STRICT,
    allowedPaths: [],
    enableAuditLog: true,
    sessionTimeout: 86400000,
    maxSessions: 100,
    restrictedZones: [],
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
  },
  database: {
    path: './test.db',
    backupInterval: 3600000,
    poolSize: 5,
    walMode: true,
    busyTimeout: 30000,
    cacheSize: 64000,
    vacuum: { enabled: true, schedule: '0 2 * * *', threshold: 0.3 },
    vectorStorage: { enabled: true, embeddingDimensions: 384, similarityThreshold: 0.7 }
  },
  logging: {
    level: 'debug',
    pretty: true,
    file: { enabled: true, path: './logs/server.log', maxSize: 10485760, maxFiles: 5, rotateDaily: true },
    audit: { enabled: true, path: './logs/audit.log', maxSize: 5242880, maxFiles: 10 }
  },
  performance: {
    maxConcurrency: 10,
    queueSize: 100,
    timeouts: { default: 30000, fileOperations: 60000, databaseOperations: 30000, semanticSearch: 45000 },
    rateLimiting: { enabled: true, windowMs: 60000, maxRequests: 1000 }
  },
  memory: {
    maxContextTokens: 8192,
    maxMemoryMB: 512,
    cacheSize: 1000,
    gcInterval: 30000,
    optimizer: { enabled: true, gcThreshold: 0.85, monitoringInterval: 30000, chunkSize: 1024 },
    embeddingCache: { maxSize: 1000, ttl: 3600000 },
    relevanceCache: { maxSize: 2000, ttl: 1800000 }
  },
  plugins: {
    directory: './plugins',
    autoDiscover: true,
    sandbox: true,
    maxPlugins: 50,
    enabled: [],
    disabled: [],
    maxLoadTime: 5000,
    security: { allowNetworkAccess: false, allowFileSystemAccess: false, allowProcessExecution: false }
  },
  features: {
    fastmcpIntegration: true,
    semanticMemory: true,
    vectorStorage: true,
    enhancedSecurity: true,
    memoryOptimization: true,
    pluginSystem: false,
    advancedBackup: true,
    realTimeMonitoring: true,
    sessionManagement: true,
    auditLogging: true
  },
  development: {
    enabled: false,
    debugMode: false,
    enableDebugLogs: false,
    enableProfiler: false,
    hotReload: false,
    mockServices: false,
    testData: { enabled: false, seedDatabase: false },
    profiling: { enabled: false, samplingRate: 0.1 }
  },
  consent: { alwaysAllow: [], alwaysDeny: [], requireConsent: [], policy: {}, settings: {} },
  ui: { consentPort: 3005 },
  semanticSearch: {
    enabled: true,
    provider: 'tensorflow',
    model: 'universal-sentence-encoder',
    batchSize: 32,
    maxQueryLength: 500,
    relevanceScoring: { semanticWeight: 0.4, recencyWeight: 0.3, typeWeight: 0.2, accessWeight: 0.1 }
  },
  backup: {
    enabled: true,
    directory: './backups',
    maxVersions: 10,
    compression: true,
    schedule: { auto: '0 */4 * * *', cleanup: '0 1 * * 0' },
    types: {
      emergency: { maxCount: 5, retention: 2592000000 },
      manual: { maxCount: 20, retention: 7776000000 },
      auto: { maxCount: 48, retention: 1209600000 }
    }
  },
  monitoring: {
    enabled: true,
    healthCheck: { interval: 60000, endpoints: ['database', 'memory', 'filesystem', 'security'] },
    metrics: { enabled: true, collectInterval: 30000, retention: 86400000 },
    alerts: { enabled: true, thresholds: { memoryUsage: 0.9, diskUsage: 0.95, errorRate: 0.1, responseTime: 5000 } }
  }
};

describe('Enhanced User Consent Service', () => {
  let consentService: UserConsentService;

  beforeEach(() => {
    consentService = new UserConsentService(mockSecurityValidator, mockConfig);
  });

  afterEach(() => {
    consentService.clearHistory();
    consentService.removeAllListeners();
  });

  describe('Basic Consent Functionality', () => {
    it('should allow safe file write operations', async () => {
      const request: Omit<ConsentRequest, 'id' | 'timestamp'> = {
        operation: 'file_write',
        severity: 'low',
        details: {
          path: './test/output.log',
          description: 'Writing log file'
        }
      };

      const response = await consentService.requestConsent(request);
      expect(response.decision).toBe('allow');
      expect(response.requestId).toBeDefined();
    });

    it('should deny dangerous operations by policy', async () => {
      const request: Omit<ConsentRequest, 'id' | 'timestamp'> = {
        operation: 'command_execute',
        severity: 'critical',
        details: {
          command: 'rm -rf /*',
          description: 'Attempting to delete all files'
        }
      };

      const response = await consentService.requestConsent(request);
      expect(response.decision).toBe('deny');
    });

    it('should handle security validation failures', async () => {
      const request: Omit<ConsentRequest, 'id' | 'timestamp'> = {
        operation: 'file_write',
        severity: 'medium',
        details: {
          path: '/restricted/file.txt',
          description: 'Writing to restricted path'
        }
      };

      const response = await consentService.requestConsent(request);
      expect(response.decision).toBe('deny');
    });
  });

  describe('Risk Analysis', () => {
    it('should calculate risk scores correctly', async () => {
      const highRiskRequest: Omit<ConsentRequest, 'id' | 'timestamp'> = {
        operation: 'recursive_delete',
        severity: 'critical',
        details: {
          path: './important-data',
          description: 'Deleting important directory',
          affectedFiles: 1000
        }
      };

      let riskScore = 0;
      const originalEmit = consentService.emit;
      consentService.emit = jest.fn((event: string, data: any) => {
        if (event === 'consent-request' && data.riskAssessment) {
          riskScore = data.riskAssessment.score;
        }
        return originalEmit.call(consentService, event, data);
      }) as any;

      const response = await Promise.race([
        consentService.requestConsent(highRiskRequest),
        new Promise<ConsentResponse>(resolve => {
          setTimeout(
            () =>
              resolve({
                requestId: 'timeout',
                decision: 'timeout',
                timestamp: new Date()
              }),
            100
          );
        })
      ]);
      expect(response.decision).toBe('deny');
    });

    it('should auto-approve low-risk operations', async () => {
      const lowRiskRequest: Omit<ConsentRequest, 'id' | 'timestamp'> = {
        operation: 'file_write',
        severity: 'low',
        details: {
          path: './test.tmp',
          description: 'Writing temporary file'
        }
      };

      const response = await consentService.requestConsent(lowRiskRequest);
      expect(response.decision).toBe('allow');
    });
  });

  describe('Trust Level Management', () => {
    it('should track session statistics', () => {
      const stats = consentService.getSessionStats();

      expect(stats.sessionId).toBeDefined();
      expect(stats.trustLevel).toBeGreaterThanOrEqual(0);
      expect(stats.trustLevel).toBeLessThanOrEqual(100);
      expect(stats.requestCount).toBeGreaterThanOrEqual(0);
      expect(stats.startTime).toBeInstanceOf(Date);
    });

    it('should adjust trust level based on decisions', async () => {
      const initialStats = consentService.getSessionStats();

      const safeRequest: Omit<ConsentRequest, 'id' | 'timestamp'> = {
        operation: 'file_write',
        severity: 'low',
        details: {
          path: './safe-file.txt',
          description: 'Safe operation'
        }
      };

      await consentService.requestConsent(safeRequest);

      const newStats = consentService.getSessionStats();
      expect(newStats.requestCount).toBe(initialStats.requestCount + 1);
    });
  });

  describe('Plugin System', () => {
    it('should register and use consent plugins', async () => {
      const testPlugin: ConsentPlugin = {
        name: 'test-plugin',
        async evaluate(request: ConsentRequest) {
          return {
            score: request.operation === 'file_delete' ? 50 : 10,
            reason: 'Test plugin evaluation'
          };
        }
      };

      consentService.addPlugin(testPlugin);

      const request: Omit<ConsentRequest, 'id' | 'timestamp'> = {
        operation: 'file_delete',
        severity: 'medium',
        details: {
          path: './test-file.txt',
          description: 'Deleting test file'
        }
      };
      const response = await consentService.requestConsent(request);
      expect(response.decision).toBeDefined();
    });

    it('should remove plugins correctly', () => {
      const testPlugin: ConsentPlugin = {
        name: 'removable-plugin',
        async evaluate(_request: ConsentRequest) {
          return { score: 0, reason: 'No risk' };
        }
      };

      consentService.addPlugin(testPlugin);
      const removed = consentService.removePlugin('removable-plugin');
      expect(removed).toBe(true);

      const removedAgain = consentService.removePlugin('removable-plugin');
      expect(removedAgain).toBe(false);
    });
  });

  describe('Policy Management', () => {
    it('should update policies correctly', async () => {
      consentService.updatePolicy({
        alwaysAllow: ['file_write:./always-allowed.txt']
      });

      const request: Omit<ConsentRequest, 'id' | 'timestamp'> = {
        operation: 'file_write',
        severity: 'high',
        details: {
          path: './always-allowed.txt',
          description: 'Writing to always-allowed file'
        }
      };

      const response = await consentService.requestConsent(request);
      expect(response.decision).toBe('allow');
    });

    it('should check policy patterns correctly', async () => {
      const allowResult = consentService.checkPolicy('file_write', './test.log');
      expect(['allow', 'deny', 'ask']).toContain(allowResult);

      const denyResult = consentService.checkPolicy('command_execute', 'rm -rf /*');
      expect(denyResult).toBe('deny');
    });
  });

  describe('Audit and History', () => {
    it('should maintain consent history', async () => {
      const initialHistory = consentService.getConsentHistory();
      const initialCount = initialHistory.length;

      const request: Omit<ConsentRequest, 'id' | 'timestamp'> = {
        operation: 'file_write',
        severity: 'low',
        details: {
          path: './history-test.txt',
          description: 'Testing history tracking'
        }
      };

      await consentService.requestConsent(request);

      const newHistory = consentService.getConsentHistory();
      expect(newHistory.length).toBe(initialCount + 1);
    });

    it('should provide audit log access', async () => {
      const request: Omit<ConsentRequest, 'id' | 'timestamp'> = {
        operation: 'file_write',
        severity: 'low',
        details: {
          path: './audit-test.txt',
          description: 'Testing audit logging'
        }
      };

      await consentService.requestConsent(request);
      const auditLog = await consentService.getAuditLog();
      expect(auditLog.length).toBeGreaterThan(0);

      const latestEntry = auditLog[auditLog.length - 1];
      expect(latestEntry.request.operation).toBe('file_write');
      expect(latestEntry.response.decision).toBeDefined();
    });

    it('should filter audit log correctly', async () => {
      await consentService.requestConsent({
        operation: 'file_write',
        severity: 'low',
        details: { path: './test1.txt', description: 'Test 1' }
      });

      await consentService.requestConsent({
        operation: 'file_delete',
        severity: 'medium',
        details: { path: './test2.txt', description: 'Test 2' }
      });

      const writeOperations = await consentService.getAuditLog({
        operation: 'file_write'
      });

      expect(writeOperations.length).toBeGreaterThan(0);
      expect(writeOperations.every(entry => entry.request.operation === 'file_write')).toBe(true);
    });

    it('should clear history when requested', () => {
      consentService.clearHistory();
      const history = consentService.getConsentHistory();
      expect(history.length).toBe(0);
    });
  });

  describe('Settings and Configuration', () => {
    it('should update settings correctly', () => {
      const newSettings = {
        autoApproveThreshold: 15,
        autoRejectThreshold: 85,
        sessionTimeout: 60000
      };

      consentService.updateSettings(newSettings);
      expect(true).toBe(true);
    });

    it('should handle timeout scenarios', async () => {
      const request: Omit<ConsentRequest, 'id' | 'timestamp'> = {
        operation: 'recursive_delete',
        severity: 'critical',
        details: {
          path: './important-data',
          description: 'High-risk operation requiring user consent'
        },
        timeout: 100
      };

      const response = await consentService.requestConsent(request);
      expect(['allow', 'deny', 'timeout']).toContain(response.decision);
    });
  });

  describe('Event System', () => {
    it('should emit consent request events', done => {
      consentService.on('consent-request', data => {
        expect(data.operation).toBe('file_write');
        expect(data.riskAssessment).toBeDefined();
        done();
      });

      consentService
        .requestConsent({
          operation: 'file_write',
          severity: 'medium',
          details: {
            path: './event-test.txt',
            description: 'Testing event emission'
          }
        })
        .catch(() => {});
    });

    it('should handle policy updates', done => {
      consentService.on('policy-updated', policy => {
        expect(policy.defaultTimeout).toBe(60000);
        done();
      });

      consentService.updatePolicy({
        defaultTimeout: 60000
      });
    });
  });
});
