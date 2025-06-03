// Enhanced Consent Interfaces with Advanced Features
// File: src/core/interfaces/consent-extended.interface.ts

import type { ConsentRequest, ConsentResponse, ConsentPolicy } from './consent.interface.js';

// Enhanced consent request with risk assessment context
export interface EnhancedConsentRequest extends ConsentRequest {
  riskAssessment?: {
    score: number;
    factors: string[];
    recommendation: 'allow' | 'deny' | 'escalate';
  };
  sessionContext?: {
    id: string;
    trustLevel: number;
    requestCount: number;
  };
}

// Enhanced consent response with additional metadata
export interface EnhancedConsentResponse extends ConsentResponse {
  source?: 'policy-allow' | 'policy-deny' | 'auto-approve' | 'auto-reject' | 'user-decision' | 'remembered' | 'error';
  riskScore?: number;
  trustLevelImpact?: number;
}

// Audit entry for consent decisions
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
    score: number;
    factors: string[];
    recommendation: 'allow' | 'deny' | 'escalate';
  };
  timestamp: Date;
}

// Plugin interface for custom consent evaluation
export interface ConsentPlugin {
  name: string;
  evaluate(request: ConsentRequest): Promise<{
    decision?: 'allow' | 'deny';
    score: number;
    reason: string;
  }>;
}

// Enhanced consent settings
export interface ConsentSettings {
  enableRiskAnalysis: boolean;
  autoApproveThreshold: number; // Risk score below this is auto-approved
  autoRejectThreshold: number; // Risk score above this is auto-rejected
  sessionTimeout: number;
  maxPendingRequests: number;
  auditRetention: number; // Days to keep audit logs
  enablePlugins: boolean;
}

// Session context for tracking user behavior
export interface SessionContext {
  id: string;
  userId?: string;
  startTime: Date;
  requestCount: number;
  lastActivity: Date;
  trustLevel: number; // 0-100
}

// Enhanced policy with security levels
export interface EnhancedConsentPolicy extends ConsentPolicy {
  securityLevels?: {
    [operation: string]: {
      minTrustLevel: number;
      maxRiskScore: number;
      requireMFA?: boolean;
    };
  };
  riskFactors?: {
    [pattern: string]: number; // Risk score to add
  };
  trustAdjustments?: {
    allowDecision: number;
    denyDecision: number;
    timeoutPenalty: number;
  };
}

// Filter options for audit log queries
export interface AuditLogFilter {
  startDate?: Date;
  endDate?: Date;
  operation?: string;
  decision?: string;
  minRiskScore?: number;
  maxRiskScore?: number;
  sessionId?: string;
}

// Session statistics
export interface SessionStats {
  sessionId: string;
  startTime: Date;
  requestCount: number;
  trustLevel: number;
  pendingRequests: number;
  lastActivity: Date;
  approvalRate: number;
  averageRiskScore: number;
}

// Event types for consent service
export interface ConsentEvents {
  'consent-request': EnhancedConsentRequest;
  'consent-response': EnhancedConsentResponse;
  'consent-warning': {
    requestId: string;
    message: string;
    remainingTime: number;
  };
  'emergency-stop': void;
  'policy-updated': ConsentPolicy;
  'history-cleared': void;
  'trust-level-changed': {
    sessionId: string;
    oldLevel: number;
    newLevel: number;
    reason: string;
  };
  'plugin-added': {
    name: string;
  };
  'plugin-removed': {
    name: string;
  };
}

// Enhanced consent service interface
export interface IEnhancedUserConsentService {
  // Core consent methods (from base interface)
  requestConsent(request: Omit<ConsentRequest, 'id' | 'timestamp'>): Promise<ConsentResponse>;
  checkPolicy(operation: ConsentRequest['operation'], target?: string): Promise<'allow' | 'deny' | 'ask'>;
  updatePolicy(policy: Partial<ConsentPolicy>): void;
  getConsentHistory(): ConsentRequest[];
  clearHistory(): void;

  // Enhanced methods
  getAuditLog(filter?: AuditLogFilter): Promise<ConsentAuditEntry[]>;
  getSessionStats(): SessionStats;
  addPlugin(plugin: ConsentPlugin): void;
  removePlugin(pluginName: string): boolean;
  updateSettings(settings: Partial<ConsentSettings>): void;
  
  // Event handling
  on<K extends keyof ConsentEvents>(event: K, listener: (data: ConsentEvents[K]) => void): void;
  emit<K extends keyof ConsentEvents>(event: K, data: ConsentEvents[K]): boolean;
  
  // Emergency controls
  emergencyStop(): void;
  resetSession(): void;
  
  // Trust management
  getTrustLevel(): number;
  adjustTrustLevel(delta: number, reason: string): void;
}

// Configuration interface for consent service
export interface ConsentServiceConfig {
  policy?: Partial<EnhancedConsentPolicy>;
  settings?: Partial<ConsentSettings>;
  plugins?: ConsentPlugin[];
  enableAuditLogging?: boolean;
  auditLogPath?: string;
}

// Risk assessment result
export interface RiskAssessmentResult {
  score: number; // 0-100
  factors: string[];
  recommendation: 'allow' | 'deny' | 'escalate';
  confidence: number; // 0-1
  mitigations?: string[];
}

// Security context for requests
export interface SecurityContext {
  sessionId: string;
  userAgent?: string;
  remoteIP?: string;
  timestamp: Date;
  previousRequests: number;
  recentDenials: number;
  trustHistory: Array<{
    timestamp: Date;
    level: number;
    reason: string;
  }>;
}

// Consent decision metadata
export interface ConsentDecisionMetadata {
  decisionTime: number; // milliseconds taken to decide
  riskFactorsConsidered: string[];
  policyRulesApplied: string[];
  pluginsConsulted: string[];
  securityChecksPerformed: string[];
  userInteractionRequired: boolean;
  automatedDecision: boolean;
}

// Pattern matching configuration
export interface PatternMatchConfig {
  caseSensitive?: boolean;
  allowWildcards?: boolean;
  allowRegex?: boolean;
  maxComplexity?: number;
}

// Consent workflow step
export interface ConsentWorkflowStep {
  id: string;
  name: string;
  description: string;
  required: boolean;
  timeout?: number;
  order: number;
  condition?: (request: ConsentRequest) => boolean;
  action: (request: ConsentRequest) => Promise<{
    proceed: boolean;
    result?: any;
    reason?: string;
  }>;
}

// Workflow definition
export interface ConsentWorkflow {
  id: string;
  name: string;
  description: string;
  steps: ConsentWorkflowStep[];
  applicableOperations: ConsentRequest['operation'][];
  minimumSeverity: ConsentRequest['severity'];
}
