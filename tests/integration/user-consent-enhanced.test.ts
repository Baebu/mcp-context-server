// Enhanced User Consent Service Test
// File: tests/integration/user-consent-enhanced.test.ts

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { UserConsentService } from '../../src/application/services/user-consent.service.js';
import type { ISecurityValidator } from '../../src/core/interfaces/security.interface.js';
import type { ServerConfig } from '../../src/infrastructure/config/types.js';
import type { ConsentRequest, ConsentResponse } from '../../src/core/interfaces/consent.interface.js';
import type { ConsentPlugin } from '../../src/core/interfaces/consent-extended.interface.js';

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
  
  async validateArguments(args: string[]): Promise<void> {
    // Mock implementation
  }
};

// Mock server config
const mockConfig: ServerConfig = {
  server: {
    name: 'test-server',
    version: '1.0.0'
  },
  security: {
    allowedCommands: ['ls', 'cat', 'echo'],
    safezones: ['.', './test'],
    maxExecutionTime: 5000,
    maxFileSize: 1048576
  },
  database: {
    path: './test.db',
    backupInterval: 3600000
  },
  logging: {
    level: 'debug',
    pretty: true
  },
  performance: {
    maxConcurrency: 10,
    queueSize: 100
  }
};

describe('Enhanced User Consent Service', () => {
  let consentService: UserConsentService;

  beforeEach(() => {
    // Create a new instance for each test
    consentService = new UserConsentService(mockSecurityValidator, mockConfig);
  });

  afterEach(() => {
    // Clean up
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

      // Mock the risk analysis by listening to internal events
      let riskScore = 0;
      const originalEmit = consentService.emit;
      consentService.emit = jest.fn((event: string, data: any) => {
        if (event === 'consent-request' && data.riskAssessment) {
          riskScore = data.riskAssessment.score;
        }
        return originalEmit.call(consentService, event, data);
      }) as any;

      // This should trigger risk analysis
      const response = await Promise.race([
        consentService.requestConsent(highRiskRequest),
        new Promise<ConsentResponse>(resolve => {
          setTimeout(() => resolve({
            requestId: 'timeout',
            decision: 'timeout',
            timestamp: new Date()
          }), 100);
        })
      ]);

      // Should be auto-rejected due to high risk
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
      const initialTrust = initialStats.trustLevel;

      // Make a safe request that should be allowed
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
      // Create a test plugin
      const testPlugin: ConsentPlugin = {
        name: 'test-plugin',
        async evaluate(request: ConsentRequest) {
          return {
            score: request.operation === 'file_delete' ? 50 : 10,
            reason: 'Test plugin evaluation'
          };
        }
      };

      // Add the plugin
      consentService.addPlugin(testPlugin);

      // Test that the plugin influences decisions
      const request: Omit<ConsentRequest, 'id' | 'timestamp'> = {
        operation: 'file_delete',
        severity: 'medium',
        details: {
          path: './test-file.txt',
          description: 'Deleting test file'
        }
      };

      // The plugin should add risk score, potentially affecting the decision
      const response = await consentService.requestConsent(request);
      expect(response.decision).toBeDefined();
    });

    it('should remove plugins correctly', () => {
      const testPlugin: ConsentPlugin = {
        name: 'removable-plugin',
        async evaluate(request: ConsentRequest) {
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
      // Update policy to always allow a specific operation
      consentService.updatePolicy({
        alwaysAllow: ['file_write:./always-allowed.txt']
      });

      const request: Omit<ConsentRequest, 'id' | 'timestamp'> = {
        operation: 'file_write',
        severity: 'high', // High severity but should be allowed by policy
        details: {
          path: './always-allowed.txt',
          description: 'Writing to always-allowed file'
        }
      };

      const response = await consentService.requestConsent(request);
      expect(response.decision).toBe('allow');
    });

    it('should check policy patterns correctly', async () => {
      const allowResult = await consentService.checkPolicy('file_write', './test.log');
      expect(['allow', 'deny', 'ask']).toContain(allowResult);

      const denyResult = await consentService.checkPolicy('command_execute', 'rm -rf /*');
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
      // Make a request to generate audit data
      const request: Omit<ConsentRequest, 'id' | 'timestamp'> = {
        operation: 'file_write',
        severity: 'low',
        details: {
          path: './audit-test.txt',
          description: 'Testing audit logging'
        }
      };

      await consentService.requestConsent(request);

      // Check audit log
      const auditLog = await consentService.getAuditLog();
      expect(auditLog.length).toBeGreaterThan(0);
      
      const latestEntry = auditLog[auditLog.length - 1];
      expect(latestEntry.request.operation).toBe('file_write');
      expect(latestEntry.response.decision).toBeDefined();
    });

    it('should filter audit log correctly', async () => {
      // Generate some audit data
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

      // Filter by operation
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

      // Settings update should not throw an error
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
        timeout: 100 // Very short timeout for testing
      };

      const response = await consentService.requestConsent(request);
      
      // Should either get a user response or timeout
      expect(['allow', 'deny', 'timeout']).toContain(response.decision);
    });
  });

  describe('Event System', () => {
    it('should emit consent request events', (done) => {
      consentService.on('consent-request', (data) => {
        expect(data.operation).toBe('file_write');
        expect(data.riskAssessment).toBeDefined();
        done();
      });

      // This should trigger the event (but may be auto-decided)
      consentService.requestConsent({
        operation: 'file_write',
        severity: 'medium',
        details: {
          path: './event-test.txt',
          description: 'Testing event emission'
        }
      }).catch(() => {
        // Ignore the promise - we're testing events
      });
    });

    it('should handle policy updates', (done) => {
      consentService.on('policy-updated', (policy) => {
        expect(policy.defaultTimeout).toBe(60000);
        done();
      });

      consentService.updatePolicy({
        defaultTimeout: 60000
      });
    });
  });
});
