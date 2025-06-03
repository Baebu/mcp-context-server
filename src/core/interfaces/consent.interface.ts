// src/core/interfaces/consent.interface.ts
import { EventEmitter } from 'node:events';

export interface ConsentRequest {
  id: string;
  operation:
    | 'file_write'
    | 'file_delete'
    | 'command_execute'
    | 'recursive_delete'
    | 'sensitive_path_access'
    | 'database_write';
  severity: 'low' | 'medium' | 'high' | 'critical';
  details: {
    path?: string;
    command?: string;
    args?: string[];
    affectedFiles?: number;
    description: string;
    risks?: string[];
    reason?: string;
  };
  timestamp: Date;
  timeout?: number; // Auto-deny after timeout
  reason?: string; // Additional context for the request
}

export interface ConsentResponse {
  requestId: string;
  decision: 'allow' | 'deny' | 'timeout';
  timestamp: Date;
  remember?: boolean; // Remember this decision for similar operations
  scope?: 'session' | 'permanent';
  reason?: string; // Reason for the decision
}

export interface ConsentPolicy {
  alwaysAllow?: string[]; // Patterns to always allow
  alwaysDeny?: string[]; // Patterns to always deny
  requireConsent?: string[]; // Patterns that always need consent
  defaultTimeout: number;
}

export interface SessionStats {
  sessionId: string;
  startTime: Date;
  requestCount: number;
  trustLevel: number;
  pendingRequests: number;
  lastActivity: Date;
  autoDecisions?: number;
}

export interface ConsentAuditEntry {
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

export interface IUserConsentService extends EventEmitter {
  requestConsent(request: Omit<ConsentRequest, 'id' | 'timestamp'>): Promise<ConsentResponse>;
  checkPolicy(operation: ConsentRequest['operation'], target?: string): 'allow' | 'deny' | 'ask';
  updatePolicy(policy: Partial<ConsentPolicy>): void;
  getConsentHistory(): ConsentRequest[];
  clearHistory(): void;
  
  // Additional methods for UI support
  getSessionStats(): SessionStats;
  getAuditLog(filter?: {
    startDate?: Date;
    endDate?: Date;
    operation?: string;
    decision?: string;
  }): Promise<ConsentAuditEntry[]>;
}
