# Enhanced User Consent Service - Usage Guide

## Overview

The Enhanced User Consent Service provides sophisticated consent management with risk analysis, trust levels, plugin architecture, and comprehensive audit logging. This guide shows how to integrate and use the enhanced features.

## Basic Integration

### 1. Service Registration (DI Container)

```typescript
// In your DI container setup
import { UserConsentService } from '@application/services/user-consent.service.js';
import type { IUserConsentService } from '@core/interfaces/consent.interface.js';

container.bind<IUserConsentService>('UserConsentService').to(UserConsentService).inSingletonScope();
```

### 2. Basic Usage in Tools

```typescript
import { injectable, inject } from 'inversify';
import type { IUserConsentService } from '@core/interfaces/consent.interface.js';

@injectable()
export class FileOperationsTool {
  constructor(
    @inject('UserConsentService') private consent: IUserConsentService
  ) {}

  async writeFile(path: string, content: string): Promise<void> {
    const response = await this.consent.requestConsent({
      operation: 'file_write',
      severity: 'medium',
      details: {
        path,
        description: `Writing ${content.length} bytes to ${path}`,
        risks: path.includes('.env') ? ['Potential credential exposure'] : undefined
      }
    });

    if (response.decision !== 'allow') {
      throw new Error(`File write denied: ${response.decision}`);
    }

    // Proceed with file write...
  }
}
```

## Advanced Features

### 1. Risk Analysis Integration

```typescript
import type { IEnhancedUserConsentService } from '@core/interfaces/consent-extended.interface.js';

@injectable()
export class DatabaseOperationsTool {
  constructor(
    @inject('UserConsentService') private consent: IEnhancedUserConsentService
  ) {}

  async performDatabaseWrite(query: string): Promise<void> {
    const response = await this.consent.requestConsent({
      operation: 'database_write',
      severity: this.assessQuerySeverity(query),
      details: {
        command: query,
        description: 'Database modification',
        risks: this.identifyQueryRisks(query)
      }
    });

    // Access risk score and factors
    if (response.riskScore && response.riskScore > 70) {
      logger.warn({ riskScore: response.riskScore }, 'High-risk database operation approved');
    }

    if (response.decision !== 'allow') {
      throw new Error(`Database write denied: ${response.decision}`);
    }

    // Proceed with database operation...
  }

  private assessQuerySeverity(query: string): 'low' | 'medium' | 'high' | 'critical' {
    if (query.toLowerCase().includes('drop table')) return 'critical';
    if (query.toLowerCase().includes('delete from')) return 'high';
    if (query.toLowerCase().includes('update')) return 'medium';
    return 'low';
  }

  private identifyQueryRisks(query: string): string[] {
    const risks: string[] = [];
    if (query.toLowerCase().includes('drop')) risks.push('Data loss');
    if (query.toLowerCase().includes('*')) risks.push('Broad scope modification');
    if (query.toLowerCase().includes('where')) risks.push('Conditional modification');
    return risks;
  }
}
```

### 2. Custom Consent Plugins

```typescript
import type { ConsentPlugin } from '@core/interfaces/consent-extended.interface.js';

// Security-focused plugin
const securityPlugin: ConsentPlugin = {
  name: 'advanced-security-scanner',
  async evaluate(request) {
    let score = 0;
    const reasons: string[] = [];

    // Check for suspicious patterns
    const target = request.details.path || request.details.command || '';
    
    // Path traversal detection
    if (target.includes('../') || target.includes('..\\')) {
      score += 60;
      reasons.push('Path traversal attempt detected');
    }

    // Command injection patterns
    if (/\$\(.*\)|`.*`|\|\s*sh|\|\s*bash/.test(target)) {
      score += 70;
      reasons.push('Command injection pattern detected');
    }

    // Sensitive file access
    if (/\.(key|pem|p12|pfx)$/i.test(target)) {
      score += 50;
      reasons.push('Accessing cryptographic key material');
    }

    // Environment variable access
    if (target.includes('.env') || target.includes('environment')) {
      score += 30;
      reasons.push('Environment configuration access');
    }

    return {
      score,
      reason: reasons.join('; ') || 'No security concerns detected'
    };
  }
};

// Business logic plugin
const businessLogicPlugin: ConsentPlugin = {
  name: 'business-rules-validator',
  async evaluate(request) {
    let score = 0;
    const reasons: string[] = [];

    // Check business hours
    const now = new Date();
    const hour = now.getHours();
    if (hour < 8 || hour > 18) {
      score += 20;
      reasons.push('Operation outside business hours');
    }

    // Check for production environment
    if (process.env.NODE_ENV === 'production') {
      score += 15;
      reasons.push('Production environment operation');
    }

    // Check file size impact
    if (request.details.affectedFiles && request.details.affectedFiles > 100) {
      score += 25;
      reasons.push(`Large number of files affected: ${request.details.affectedFiles}`);
    }

    return {
      score,
      reason: reasons.join('; ') || 'No business rule violations'
    };
  }
};

// Register plugins
const consentService = container.get<IEnhancedUserConsentService>('UserConsentService');
consentService.addPlugin(securityPlugin);
consentService.addPlugin(businessLogicPlugin);
```

### 3. Event-Driven Integration

```typescript
import type { ConsentEvents } from '@core/interfaces/consent-extended.interface.js';

@injectable()
export class ConsentEventHandler {
  constructor(
    @inject('UserConsentService') private consent: IEnhancedUserConsentService,
    @inject('Logger') private logger: Logger
  ) {
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Monitor high-risk requests
    this.consent.on('consent-request', (request) => {
      if (request.riskAssessment && request.riskAssessment.score > 80) {
        this.logger.warn({
          requestId: request.id,
          operation: request.operation,
          riskScore: request.riskAssessment.score,
          factors: request.riskAssessment.factors
        }, 'High-risk consent request detected');

        // Send alert to security team
        this.sendSecurityAlert(request);
      }
    });

    // Track trust level changes
    this.consent.on('trust-level-changed', (event) => {
      this.logger.info({
        sessionId: event.sessionId,
        oldLevel: event.oldLevel,
        newLevel: event.newLevel,
        reason: event.reason
      }, 'User trust level changed');

      // Update user profile or trigger additional security measures
      if (event.newLevel < 20) {
        this.triggerEnhancedSecurity(event.sessionId);
      }
    });

    // Handle emergency situations
    this.consent.on('emergency-stop', () => {
      this.logger.error('Emergency stop activated - all operations halted');
      this.notifyAdministrators();
    });
  }

  private async sendSecurityAlert(request: any): Promise<void> {
    // Implementation for security alerts
  }

  private async triggerEnhancedSecurity(sessionId: string): Promise<void> {
    // Implementation for enhanced security measures
  }

  private async notifyAdministrators(): Promise<void> {
    // Implementation for admin notifications
  }
}
```

### 4. Configuration and Policy Management

```typescript
// Configuration example
const consentConfig = {
  policy: {
    alwaysAllow: [
      'file_write:*.log',
      'file_write:**/temp/**',
      'command_execute:ls',
      'command_execute:pwd'
    ],
    alwaysDeny: [
      'command_execute:rm -rf *',
      'file_delete:**/.ssh/**',
      'recursive_delete:/',
      'sensitive_path_access:/etc/passwd'
    ],
    requireConsent: [
      'recursive_delete:*',
      'database_write:*',
      'command_execute:sudo *'
    ],
    defaultTimeout: 30000
  },
  settings: {
    enableRiskAnalysis: true,
    autoApproveThreshold: 20,
    autoRejectThreshold: 80,
    sessionTimeout: 1800000, // 30 minutes
    maxPendingRequests: 5,
    auditRetention: 90, // 90 days
    enablePlugins: true
  }
};

// Apply configuration
consentService.updatePolicy(consentConfig.policy);
consentService.updateSettings(consentConfig.settings);
```

### 5. Audit and Compliance

```typescript
@injectable()
export class ConsentAuditService {
  constructor(
    @inject('UserConsentService') private consent: IEnhancedUserConsentService
  ) {}

  async generateComplianceReport(startDate: Date, endDate: Date): Promise<any> {
    const auditLog = await this.consent.getAuditLog({
      startDate,
      endDate
    });

    const summary = {
      totalRequests: auditLog.length,
      approved: auditLog.filter(entry => entry.response.decision === 'allow').length,
      denied: auditLog.filter(entry => entry.response.decision === 'deny').length,
      timedOut: auditLog.filter(entry => entry.response.decision === 'timeout').length,
      averageRiskScore: auditLog.reduce((sum, entry) => sum + entry.riskAssessment.score, 0) / auditLog.length,
      highRiskOperations: auditLog.filter(entry => entry.riskAssessment.score > 70),
      operationBreakdown: this.groupByOperation(auditLog),
      securityIncidents: auditLog.filter(entry => 
        entry.riskAssessment.factors.some(factor => 
          factor.includes('injection') || factor.includes('traversal')
        )
      )
    };

    return {
      period: { startDate, endDate },
      summary,
      detailedLog: auditLog,
      recommendations: this.generateRecommendations(summary)
    };
  }

  private groupByOperation(auditLog: any[]): Record<string, number> {
    return auditLog.reduce((acc, entry) => {
      const operation = entry.request.operation;
      acc[operation] = (acc[operation] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }

  private generateRecommendations(summary: any): string[] {
    const recommendations: string[] = [];

    if (summary.averageRiskScore > 50) {
      recommendations.push('Consider tightening security policies - average risk score is high');
    }

    if (summary.timedOut > summary.totalRequests * 0.1) {
      recommendations.push('High timeout rate - consider increasing default timeout or improving UX');
    }

    if (summary.securityIncidents.length > 0) {
      recommendations.push('Security incidents detected - review and enhance security plugins');
    }

    return recommendations;
  }
}
```

### 6. Claude Desktop Integration

```typescript
// MCP tool integration with enhanced consent
@injectable()
export class SecureFileOperationsTool implements IMCPTool {
  name = 'secure_file_operations';
  description = 'File operations with enhanced consent management';

  constructor(
    @inject('UserConsentService') private consent: IEnhancedUserConsentService
  ) {}

  async execute(params: any, context: ToolContext): Promise<ToolResult> {
    try {
      // Request consent with full context
      const response = await this.consent.requestConsent({
        operation: 'file_write',
        severity: this.assessSeverity(params),
        details: {
          path: params.path,
          description: `${params.operation} on ${params.path}`,
          risks: this.identifyRisks(params)
        }
      });

      if (response.decision !== 'allow') {
        return {
          content: [{
            type: 'text',
            text: `Operation denied: ${response.decision}\nReason: Policy restriction or user denial`
          }]
        };
      }

      // Proceed with the actual file operation
      const result = await this.performFileOperation(params);

      // Log successful operation
      const stats = this.consent.getSessionStats();
      
      return {
        content: [{
          type: 'text',
          text: `Operation completed successfully\nTrust Level: ${stats.trustLevel}\nSession Requests: ${stats.requestCount}`
        }]
      };

    } catch (error) {
      return {
        content: [{
          type: 'text',
          text: `Operation failed: ${error instanceof Error ? error.message : 'Unknown error'}`
        }]
      };
    }
  }

  private assessSeverity(params: any): 'low' | 'medium' | 'high' | 'critical' {
    // Implementation for severity assessment
    return 'medium';
  }

  private identifyRisks(params: any): string[] {
    // Implementation for risk identification
    return [];
  }

  private async performFileOperation(params: any): Promise<any> {
    // Implementation for actual file operation
    return {};
  }
}
```

## Best Practices

### 1. Error Handling

```typescript
try {
  const response = await consentService.requestConsent(request);
  
  switch (response.decision) {
    case 'allow':
      await performOperation();
      break;
    case 'deny':
      logger.info({ requestId: response.requestId }, 'Operation denied by policy or user');
      throw new Error('Operation not permitted');
    case 'timeout':
      logger.warn({ requestId: response.requestId }, 'User consent timed out');
      throw new Error('Operation timed out waiting for consent');
  }
} catch (error) {
  logger.error({ error }, 'Consent request failed');
  throw error;
}
```

### 2. Performance Optimization

```typescript
// Cache policy decisions for repeated operations
const policyCache = new Map<string, 'allow' | 'deny' | 'ask'>();

async function checkCachedPolicy(operation: string, target: string): Promise<'allow' | 'deny' | 'ask'> {
  const key = `${operation}:${target}`;
  
  if (!policyCache.has(key)) {
    const decision = await consentService.checkPolicy(operation as any, target);
    policyCache.set(key, decision);
  }
  
  return policyCache.get(key)!;
}
```

### 3. Testing

```typescript
// Mock consent service for testing
const mockConsentService: IUserConsentService = {
  async requestConsent(request) {
    return {
      requestId: 'test-' + Date.now(),
      decision: 'allow',
      timestamp: new Date()
    };
  },
  
  async checkPolicy() {
    return 'allow';
  },
  
  updatePolicy() {},
  getConsentHistory() { return []; },
  clearHistory() {}
};
```

This enhanced consent service provides enterprise-grade consent management with comprehensive security, audit, and user experience features while maintaining full backward compatibility with the existing interface.
