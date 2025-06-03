// Enhanced User Consent Service with Advanced Security Integration
// File: src/application/services/user-consent.service.ts

import { injectable, inject } from 'inversify';
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type {
  IUserConsentService,
  ConsentRequest,
  ConsentResponse,
  ConsentPolicy
} from '../../core/interfaces/consent.interface.js';
import type { ISecurityValidator } from '../../core/interfaces/security.interface.js';
import { logger } from '../../utils/logger.js';
import type { ServerConfig } from '../../infrastructure/config/types.js';

// Enhanced interfaces for advanced consent management
interface ConsentAuditEntry {
  id: string;
  request: ConsentRequest;
  response: ConsentResponse;
  securityContext: {
    remoteIP?: string;
    userAgent?: string;
    sessionId?: string;
  };
  riskAssessment: {
    score: number; // 0-100
    factors: string[];
    recommendation: 'allow' | 'deny' | 'escalate';
  };
  timestamp: Date;
}

interface ConsentPlugin {
  name: string;
  evaluate(request: ConsentRequest): Promise<{
    decision?: 'allow' | 'deny';
    score: number;
    reason: string;
  }>;
}

interface ConsentSettings {
  enableRiskAnalysis: boolean;
  autoApproveThreshold: number; // Risk score below this is auto-approved
  autoRejectThreshold: number; // Risk score above this is auto-rejected
  sessionTimeout: number;
  maxPendingRequests: number;
  auditRetention: number; // Days to keep audit logs
  enablePlugins: boolean;
}

interface SessionContext {
  id: string;
  userId?: string;
  startTime: Date;
  requestCount: number;
  lastActivity: Date;
  trustLevel: number; // 0-100
}

@injectable()
export class UserConsentService extends EventEmitter implements IUserConsentService {
  private consentHistory: ConsentRequest[] = [];
  private auditLog: ConsentAuditEntry[] = [];
  private pendingRequests = new Map<string, ConsentRequest>();
  private rememberedDecisions = new Map<string, ConsentResponse>();
  private policy: ConsentPolicy;
  private settings: ConsentSettings;
  private plugins: ConsentPlugin[] = [];
  private sessionContext: SessionContext;
  private readonly consentLogger;

  // Enhanced security patterns
  private readonly CRITICAL_OPERATIONS = [
    'recursive_delete',
    'sensitive_path_access',
    'database_write'
  ];

  private readonly HIGH_RISK_PATTERNS = [
    /rm\s+-rf/i,
    /del\s+\/s/i,
    /format\s+/i,
    /sudo\s+/i,
    /chmod\s+777/i,
    /\.\.\//,
    /\/etc\/passwd/i,
    /\/etc\/shadow/i,
    /\.ssh\//i,
    /\.aws\//i
  ];

  constructor(
    @inject('SecurityValidator') private security: ISecurityValidator,
    @inject('Config') private config: ServerConfig
  ) {
    super();
    this.consentLogger = logger.child({ component: 'UserConsent' });

    // Initialize session context
    this.sessionContext = {
      id: randomUUID(),
      startTime: new Date(),
      requestCount: 0,
      lastActivity: new Date(),
      trustLevel: 50 // Start with neutral trust
    };

    // Initialize enhanced settings
    this.settings = {
      enableRiskAnalysis: true,
      autoApproveThreshold: 20,
      autoRejectThreshold: 80,
      sessionTimeout: 30 * 60 * 1000, // 30 minutes
      maxPendingRequests: 10,
      auditRetention: 30, // 30 days
      enablePlugins: true
    };

    // Initialize enhanced default policy
    this.policy = {
      alwaysAllow: [
        'file_write:*.log',
        'file_write:*.tmp',
        'file_write:**/temp/**',
        'command_execute:ls',
        'command_execute:dir',
        'command_execute:pwd',
        'command_execute:echo',
        'command_execute:cat',
        'command_execute:type',
        'command_execute:head',
        'command_execute:tail',
        'command_execute:grep',
        'command_execute:find',
        'command_execute:which',
        'command_execute:where'
      ],
      alwaysDeny: [
        'command_execute:rm -rf /*',
        'command_execute:del /s C:\\*',
        'command_execute:format *',
        'command_execute:sudo rm *',
        'command_execute:chmod 777 *',
        'file_delete:**/.ssh/**',
        'file_delete:**/.gnupg/**',
        'file_delete:**/.aws/**',
        'file_delete:/etc/passwd',
        'file_delete:/etc/shadow',
        'file_delete:/etc/sudoers*',
        'file_write:**/.ssh/id_*',
        'file_write:**/*.pem',
        'file_write:**/*.key',
        'recursive_delete:/',
        'recursive_delete:C:\\',
        'recursive_delete:/bin',
        'recursive_delete:/boot',
        'recursive_delete:/etc',
        'recursive_delete:/usr',
        'recursive_delete:/var',
        'sensitive_path_access:/etc/passwd',
        'sensitive_path_access:/etc/shadow',
        'sensitive_path_access:**/.ssh/id_*'
      ],
      requireConsent: [
        'recursive_delete:*',
        'sensitive_path_access:*',
        'command_execute:sudo *',
        'command_execute:chmod *',
        'command_execute:chown *',
        'command_execute:mv * /*',
        'command_execute:cp * /*',
        'file_write:**/*.config',
        'file_write:**/*.ini',
        'file_write:**/*.env',
        'file_delete:**/node_modules',
        'database_write:*'
      ],
      defaultTimeout: 30000 // 30 seconds
    };

    // Load custom policy from config if available
    this.loadPolicyFromConfig();

    // Initialize IPC communication
    this.initializeIPC();

    // Load built-in security plugins
    this.loadSecurityPlugins();

    // Start session maintenance
    this.startSessionMaintenance();

    this.consentLogger.info({
      sessionId: this.sessionContext.id,
      settings: this.settings,
      policyRules: {
        alwaysAllow: this.policy.alwaysAllow?.length || 0,
        alwaysDeny: this.policy.alwaysDeny?.length || 0,
        requireConsent: this.policy.requireConsent?.length || 0
      }
    }, 'Enhanced user consent service initialized');
  }

  async requestConsent(request: Omit<ConsentRequest, 'id' | 'timestamp'>): Promise<ConsentResponse> {
    // Validate session
    this.updateSessionActivity();
    if (this.pendingRequests.size >= this.settings.maxPendingRequests) {
      throw new Error('Too many pending consent requests. Please wait for current requests to complete.');
    }

    const consentRequest: ConsentRequest = {
      ...request,
      id: randomUUID(),
      timestamp: new Date()
    };

    this.consentLogger.debug({
      requestId: consentRequest.id,
      operation: consentRequest.operation,
      severity: consentRequest.severity,
      sessionId: this.sessionContext.id
    }, 'Processing consent request');

    try {
      // Step 1: Security validation
      await this.validateRequestSecurity(consentRequest);

      // Step 2: Check remembered decisions
      const remembered = await this.checkRememberedDecision(consentRequest);
      if (remembered) {
        await this.auditDecision(consentRequest, remembered, 'remembered');
        return remembered;
      }

      // Step 3: Policy evaluation
      const policyDecision = await this.evaluatePolicy(consentRequest);

      if (policyDecision === 'allow') {
        const response = this.createResponse(consentRequest.id, 'allow', 'Allowed by policy');
        await this.auditDecision(consentRequest, response, 'policy-allow');
        this.updateTrustLevel(5); // Slight trust increase for allowed operations
        return response;
      }

      if (policyDecision === 'deny') {
        const response = this.createResponse(consentRequest.id, 'deny', 'Denied by policy');
        await this.auditDecision(consentRequest, response, 'policy-deny');
        this.updateTrustLevel(-10); // Trust decrease for denied operations
        return response;
      }

      // Step 4: Risk analysis
      const riskAssessment = await this.performRiskAnalysis(consentRequest);

      // Step 5: Auto-decision based on risk
      if (this.settings.enableRiskAnalysis) {
        if (riskAssessment.score <= this.settings.autoApproveThreshold) {
          const response = this.createResponse(consentRequest.id, 'allow', `Low risk operation (score: ${riskAssessment.score})`);
          await this.auditDecision(consentRequest, response, 'auto-approve', riskAssessment);
          this.updateTrustLevel(2);
          return response;
        }

        if (riskAssessment.score >= this.settings.autoRejectThreshold) {
          const response = this.createResponse(consentRequest.id, 'deny', `High risk operation (score: ${riskAssessment.score})`);
          await this.auditDecision(consentRequest, response, 'auto-reject', riskAssessment);
          this.updateTrustLevel(-15);
          return response;
        }
      }

      // Step 6: Request user consent
      this.pendingRequests.set(consentRequest.id, consentRequest);
      this.consentHistory.push(consentRequest);

      this.consentLogger.info({
        requestId: consentRequest.id,
        operation: consentRequest.operation,
        severity: consentRequest.severity,
        riskScore: riskAssessment.score,
        trustLevel: this.sessionContext.trustLevel
      }, 'Requesting user consent');

      // Emit enhanced event with risk context
      this.emit('consent-request', {
        ...consentRequest,
        riskAssessment,
        sessionContext: this.sessionContext,
        recommendation: riskAssessment.recommendation
      });

      // Wait for response with timeout
      const response = await this.waitForResponse(consentRequest, riskAssessment);

      // Remember decision if requested
      if (response.remember) {
        await this.rememberDecision(consentRequest, response);
      }

      // Update trust based on user decision
      this.updateTrustBasedOnDecision(response);

      // Audit the final decision
      await this.auditDecision(consentRequest, response, 'user-decision', riskAssessment);

      return response;

    } catch (error) {
      this.consentLogger.error({
        requestId: consentRequest.id,
        error: error instanceof Error ? error.message : 'Unknown error'
      }, 'Error processing consent request');

      const errorResponse = this.createResponse(
        consentRequest.id,
        'deny',
        `Error processing request: ${error instanceof Error ? error.message : 'Unknown error'}`
      );

      await this.auditDecision(consentRequest, errorResponse, 'error');
      return errorResponse;
    } finally {
      this.pendingRequests.delete(consentRequest.id);
    }
  }

  checkPolicy(operation: ConsentRequest['operation'], target?: string): 'allow' | 'deny' | 'ask' {
    const checkTarget = target || '*';
    const operationPattern = `${operation}:${checkTarget}`;

    // Enhanced security check first
    if (this.isHighRiskOperationSync(operation, target)) {
      return 'ask';
    }

    // Check always deny first (most restrictive)
    if (this.matchesPatterns(operationPattern, this.policy.alwaysDeny || [])) {
      return 'deny';
    }

    // Check always allow
    if (this.matchesPatterns(operationPattern, this.policy.alwaysAllow || [])) {
      return 'allow';
    }

    // Check if consent is required
    if (this.matchesPatterns(operationPattern, this.policy.requireConsent || [])) {
      return 'ask';
    }

    // Enhanced decision based on operation type and trust level
    if (this.CRITICAL_OPERATIONS.includes(operation)) {
      return 'ask';
    }

    // Consider session trust level
    if (this.sessionContext.trustLevel < 30 && operation !== 'file_write') {
      return 'ask';
    }

    return 'allow';
  }

  updatePolicy(policy: Partial<ConsentPolicy>): void {
    this.policy = { ...this.policy, ...policy };
    this.consentLogger.info({
      policy: this.policy,
      sessionId: this.sessionContext.id
    }, 'Consent policy updated');

    this.emit('policy-updated', this.policy);
  }

  getConsentHistory(): ConsentRequest[] {
    return [...this.consentHistory];
  }

  clearHistory(): void {
    this.consentHistory = [];
    this.rememberedDecisions.clear();
    this.consentLogger.info({ sessionId: this.sessionContext.id }, 'Consent history cleared');
    this.emit('history-cleared');
  }

  // Enhanced public methods

  async getAuditLog(filter?: {
    startDate?: Date;
    endDate?: Date;
    operation?: string;
    decision?: string
  }): Promise<ConsentAuditEntry[]> {
    let filtered = [...this.auditLog];

    if (filter) {
      if (filter.startDate) {
        filtered = filtered.filter(entry => entry.timestamp >= filter.startDate!);
      }
      if (filter.endDate) {
        filtered = filtered.filter(entry => entry.timestamp <= filter.endDate!);
      }
      if (filter.operation) {
        filtered = filtered.filter(entry => entry.request.operation === filter.operation);
      }
      if (filter.decision) {
        filtered = filtered.filter(entry => entry.response.decision === filter.decision);
      }
    }

    return filtered;
  }

  getSessionStats(): {
    sessionId: string;
    startTime: Date;
    requestCount: number;
    trustLevel: number;
    pendingRequests: number;
    lastActivity: Date;
  } {
    return {
      sessionId: this.sessionContext.id,
      startTime: this.sessionContext.startTime,
      requestCount: this.sessionContext.requestCount,
      trustLevel: this.sessionContext.trustLevel,
      pendingRequests: this.pendingRequests.size,
      lastActivity: this.sessionContext.lastActivity
    };
  }

  addPlugin(plugin: ConsentPlugin): void {
    if (this.settings.enablePlugins) {
      this.plugins.push(plugin);
      this.consentLogger.info({ pluginName: plugin.name }, 'Consent plugin added');
    }
  }

  removePlugin(pluginName: string): boolean {
    const index = this.plugins.findIndex(p => p.name === pluginName);
    if (index !== -1) {
      this.plugins.splice(index, 1);
      this.consentLogger.info({ pluginName }, 'Consent plugin removed');
      return true;
    }
    return false;
  }

  updateSettings(settings: Partial<ConsentSettings>): void {
    this.settings = { ...this.settings, ...settings };
    this.consentLogger.info({ settings: this.settings }, 'Consent settings updated');
  }

  // Enhanced private methods

  private async validateRequestSecurity(request: ConsentRequest): Promise<void> {
    // Validate using security service
    if (request.details.path) {
      try {
        await this.security.validatePath(request.details.path);
      } catch (error) {
        throw new Error(`Security validation failed for path: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }

    if (request.details.command) {
      try {
        await this.security.validateCommand(request.details.command, request.details.args || []);
      } catch (error) {
        throw new Error(`Security validation failed for command: ${error instanceof Error ? error.message : 'Unknown error'}`);
      }
    }
  }

  private async evaluatePolicy(request: ConsentRequest): Promise<'allow' | 'deny' | 'ask'> {
    const target = this.getTargetFromRequest(request);
    return this.checkPolicy(request.operation, target);
  }

  private async performRiskAnalysis(request: ConsentRequest): Promise<{
    score: number;
    factors: string[];
    recommendation: 'allow' | 'deny' | 'escalate';
  }> {
    const factors: string[] = [];
    let score = 0;

    // Base score by operation type
    switch (request.operation) {
      case 'file_write':
        score += 10;
        break;
      case 'file_delete':
        score += 30;
        factors.push('File deletion operation');
        break;
      case 'command_execute':
        score += 20;
        factors.push('Command execution');
        break;
      case 'recursive_delete':
        score += 70;
        factors.push('Recursive deletion - high impact');
        break;
      case 'sensitive_path_access':
        score += 60;
        factors.push('Accessing sensitive system paths');
        break;
      case 'database_write':
        score += 40;
        factors.push('Database modification');
        break;
    }

    // Severity adjustment
    switch (request.severity) {
      case 'low':
        score += 0;
        break;
      case 'medium':
        score += 15;
        factors.push('Medium severity operation');
        break;
      case 'high':
        score += 30;
        factors.push('High severity operation');
        break;
      case 'critical':
        score += 50;
        factors.push('Critical severity operation');
        break;
    }

    // Pattern-based risk assessment
    const target = this.getTargetFromRequest(request);
    for (const pattern of this.HIGH_RISK_PATTERNS) {
      if (pattern.test(target) || (request.details.command && pattern.test(request.details.command))) {
        score += 35;
        factors.push(`Matches high-risk pattern: ${pattern.source}`);
      }
    }

    // Trust level adjustment
    if (this.sessionContext.trustLevel < 30) {
      score += 20;
      factors.push('Low session trust level');
    } else if (this.sessionContext.trustLevel > 70) {
      score -= 10;
      factors.push('High session trust level');
    }

    // Recent activity pattern
    if (this.sessionContext.requestCount > 10) {
      score += 10;
      factors.push('High request frequency in session');
    }

    // Plugin evaluation
    if (this.settings.enablePlugins && this.plugins.length > 0) {
      for (const plugin of this.plugins) {
        try {
          const result = await plugin.evaluate(request);
          score += result.score;
          factors.push(`${plugin.name}: ${result.reason}`);

          if (result.decision === 'deny') {
            score += 30;
            factors.push(`${plugin.name} recommends denial`);
          } else if (result.decision === 'allow') {
            score -= 10;
            factors.push(`${plugin.name} recommends approval`);
          }
        } catch (error) {
          this.consentLogger.warn({
            pluginName: plugin.name,
            error: error instanceof Error ? error.message : 'Unknown error'
          }, 'Plugin evaluation failed');
        }
      }
    }

    // Determine recommendation
    let recommendation: 'allow' | 'deny' | 'escalate';
    if (score <= this.settings.autoApproveThreshold) {
      recommendation = 'allow';
    } else if (score >= this.settings.autoRejectThreshold) {
      recommendation = 'deny';
    } else {
      recommendation = 'escalate';
    }

    // Cap score at 100
    score = Math.min(100, Math.max(0, score));

    return { score, factors, recommendation };
  }

  private isHighRiskOperationSync(operation: ConsentRequest['operation'], target?: string): boolean {
    if (this.CRITICAL_OPERATIONS.includes(operation)) {
      return true;
    }

    if (target) {
      return this.HIGH_RISK_PATTERNS.some(pattern => pattern.test(target));
    }

    return false;
  }


  private updateSessionActivity(): void {
    this.sessionContext.lastActivity = new Date();
    this.sessionContext.requestCount++;
  }

  private updateTrustLevel(delta: number): void {
    this.sessionContext.trustLevel = Math.max(0, Math.min(100, this.sessionContext.trustLevel + delta));
  }

  private updateTrustBasedOnDecision(response: ConsentResponse): void {
    switch (response.decision) {
      case 'allow':
        this.updateTrustLevel(3);
        break;
      case 'deny':
        this.updateTrustLevel(1); // Small increase for responsible decisions
        break;
      case 'timeout':
        this.updateTrustLevel(-5);
        break;
    }
  }

  private async auditDecision(
    request: ConsentRequest,
    response: ConsentResponse,
    source: string,
    riskAssessment?: { score: number; factors: string[]; recommendation: "allow" | "deny" | "escalate" }
  ): Promise<void> {
    const auditEntry: ConsentAuditEntry = {
      id: randomUUID(),
      request,
      response,
      securityContext: {
        sessionId: this.sessionContext.id
      },
      riskAssessment: riskAssessment || {
        score: 0,
        factors: [],
        recommendation: 'allow'
      },
      timestamp: new Date()
    };

    this.auditLog.push(auditEntry);

    // Clean up old audit entries
    if (this.auditLog.length > 1000) {
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - this.settings.auditRetention);
      this.auditLog = this.auditLog.filter(entry => entry.timestamp >= cutoffDate);
    }

    this.consentLogger.debug({
      auditId: auditEntry.id,
      requestId: request.id,
      decision: response.decision,
      source,
      riskScore: auditEntry.riskAssessment.score
    }, 'Consent decision audited');
  }

  private loadPolicyFromConfig(): void {
    // Load custom policy from configuration if available
    const customPolicy = (this.config as any).consent?.policy;
    if (customPolicy) {
      this.policy = { ...this.policy, ...customPolicy };
      this.consentLogger.info('Custom consent policy loaded from configuration');
    }

    const customSettings = (this.config as any).consent?.settings;
    if (customSettings) {
      this.settings = { ...this.settings, ...customSettings };
      this.consentLogger.info('Custom consent settings loaded from configuration');
    }
  }

  private loadSecurityPlugins(): void {
    if (!this.settings.enablePlugins) return;

    // Built-in security plugin
    const securityPlugin: ConsentPlugin = {
      name: 'security-scanner',
      async evaluate(request: ConsentRequest) {
        let score = 0;
        const reasons: string[] = [];

        // Check for common attack patterns
        const target = request.details.path || request.details.command || '';

        if (target.includes('../') || target.includes('..\\')) {
          score += 40;
          reasons.push('Path traversal detected');
        }

        if (target.match(/\$\(.*\)|`.*`/)) {
          score += 50;
          reasons.push('Command injection pattern detected');
        }

        if (request.details.command?.includes('sudo') || request.details.command?.includes('runas')) {
          score += 30;
          reasons.push('Privilege escalation detected');
        }

        return {
          score,
          reason: reasons.join('; ') || 'No security concerns detected'
        };
      }
    };

    this.addPlugin(securityPlugin);
  }

  private startSessionMaintenance(): void {
    // Clean up expired sessions and pending requests
    setInterval(() => {
      const now = Date.now();

      // Check session timeout
      if (now - this.sessionContext.lastActivity.getTime() > this.settings.sessionTimeout) {
        this.consentLogger.info({ sessionId: this.sessionContext.id }, 'Session expired, resetting trust level');
        this.sessionContext.trustLevel = Math.max(30, this.sessionContext.trustLevel - 20);
        this.sessionContext.lastActivity = new Date();
      }

      // Clean up stale pending requests
      for (const [requestId, request] of this.pendingRequests.entries()) {
        const age = now - request.timestamp.getTime();
        if (age > (request.timeout || this.policy.defaultTimeout) * 2) {
          this.pendingRequests.delete(requestId);
          this.consentLogger.warn({ requestId }, 'Removed stale pending consent request');
        }
      }
    }, 60000); // Run every minute
  }

  private initializeIPC(): void {
    // Enhanced IPC for Claude Desktop integration
    this.on('consent-response', (response: ConsentResponse & { source?: string }) => {
      const request = this.pendingRequests.get(response.requestId);
      if (request) {
        this.consentLogger.info({
          requestId: response.requestId,
          decision: response.decision,
          source: response.source || 'unknown'
        }, 'Received consent response');

        this.emit(`response-${response.requestId}`, response);
      }
    });

    // Handle emergency stop
    this.on('emergency-stop', () => {
      this.consentLogger.warn('Emergency stop triggered - denying all pending requests');
      for (const [requestId] of this.pendingRequests.entries()) {
        const response = this.createResponse(requestId, 'deny', 'Emergency stop activated');
        this.emit(`response-${requestId}`, response);
      }
    });
  }

  private async waitForResponse(
    request: ConsentRequest,
    riskAssessment: { score: number; factors: string[]; recommendation: string }
  ): Promise<ConsentResponse> {
    return new Promise(resolve => {
      const timeout = request.timeout || this.policy.defaultTimeout;

      // Enhanced timeout with warning
      const warningTimer = setTimeout(() => {
        this.emit('consent-warning', {
          requestId: request.id,
          message: 'Consent request will timeout soon',
          remainingTime: 10000 // 10 seconds warning
        });
      }, Math.max(0, timeout - 10000));

      const timer = setTimeout(() => {
        clearTimeout(warningTimer);
        this.removeAllListeners(`response-${request.id}`);

        const timeoutResponse = this.createResponse(
          request.id,
          'timeout',
          `User did not respond within ${timeout / 1000} seconds`
        );

        this.consentLogger.warn({
          requestId: request.id,
          timeout: timeout,
          riskScore: riskAssessment.score
        }, 'Consent request timed out');

        resolve(timeoutResponse);
      }, timeout);

      // Listen for response
      this.once(`response-${request.id}`, (response: ConsentResponse) => {
        clearTimeout(timer);
        clearTimeout(warningTimer);
        resolve(response);
      });
    });
  }

  private createResponse(
    requestId: string,
    decision: ConsentResponse['decision'],
    reason?: string
  ): ConsentResponse {
    const response: ConsentResponse = {
      requestId,
      decision,
      timestamp: new Date()
    };

    this.consentLogger.debug({
      response,
      reason,
      sessionId: this.sessionContext.id
    }, 'Consent response created');

    return response;
  }

  private getTargetFromRequest(request: Omit<ConsentRequest, 'id' | 'timestamp'>): string {
    if (request.details.path) return request.details.path;
    if (request.details.command) return request.details.command;
    if (request.details.args?.length) return request.details.args.join(' ');
    return '*';
  }

  private matchesPatterns(target: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      try {
        // Convert glob patterns to regex with enhanced support
        const regexPattern = pattern
          .replace(/\*\*/g, '___DOUBLESTAR___')
          .replace(/\*/g, '[^/\\\\]*')
          .replace(/___DOUBLESTAR___/g, '.*')
          .replace(/\?/g, '[^/\\\\]')
          .replace(/\[(!)?([^\]]+)\]/g, (_match, negate, chars) => {
            return negate ? `[^${chars}]` : `[${chars}]`;
          });

        const regex = new RegExp(`^${regexPattern}$`, 'i');
        return regex.test(target);
      } catch (error) {
        this.consentLogger.warn({ pattern, error }, 'Invalid pattern in policy');
        // Fallback to simple string matching
        return target.toLowerCase().includes(pattern.toLowerCase().replace(/\*/g, ''));
      }
    });
  }

  private async checkRememberedDecision(request: ConsentRequest): Promise<ConsentResponse | null> {
    const key = `${request.operation}:${this.getTargetFromRequest(request)}`;
    const remembered = this.rememberedDecisions.get(key);

    if (!remembered) return null;

    // Check if decision is still valid
    if (remembered.scope === 'permanent') {
      return { ...remembered, timestamp: new Date() };
    }

    if (remembered.scope === 'session') {
      const sessionAge = Date.now() - this.sessionContext.startTime.getTime();
      if (sessionAge < this.settings.sessionTimeout) {
        return { ...remembered, timestamp: new Date() };
      } else {
        // Session expired, remove the decision
        this.rememberedDecisions.delete(key);
        return null;
      }
    }

    return null;
  }

  private async rememberDecision(request: ConsentRequest, response: ConsentResponse): Promise<void> {
    const key = `${request.operation}:${this.getTargetFromRequest(request)}`;
    this.rememberedDecisions.set(key, response);

    this.consentLogger.info({
      key,
      decision: response.decision,
      scope: response.scope,
      sessionId: this.sessionContext.id
    }, 'Consent decision remembered');
  }
}
