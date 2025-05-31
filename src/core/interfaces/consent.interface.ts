// src/core/interfaces/consent.interface.ts
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
  };
  timestamp: Date;
  timeout?: number; // Auto-deny after timeout
}

export interface ConsentResponse {
  requestId: string;
  decision: 'allow' | 'deny' | 'timeout';
  timestamp: Date;
  remember?: boolean; // Remember this decision for similar operations
  scope?: 'session' | 'permanent';
}

export interface ConsentPolicy {
  alwaysAllow?: string[]; // Patterns to always allow
  alwaysDeny?: string[]; // Patterns to always deny
  requireConsent?: string[]; // Patterns that always need consent
  defaultTimeout: number;
}

export interface IUserConsentService {
  requestConsent(request: Omit<ConsentRequest, 'id' | 'timestamp'>): Promise<ConsentResponse>;
  checkPolicy(operation: ConsentRequest['operation'], target?: string): 'allow' | 'deny' | 'ask';
  updatePolicy(policy: Partial<ConsentPolicy>): void;
  getConsentHistory(): ConsentRequest[];
  clearHistory(): void;
}
