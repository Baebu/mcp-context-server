// src/application/services/user-consent.service.ts
import { injectable } from 'inversify'; // Removed inject as it's not used
import { randomUUID } from 'node:crypto';
import { EventEmitter } from 'node:events';
import type {
  IUserConsentService,
  ConsentRequest,
  ConsentResponse,
  ConsentPolicy
} from '@core/interfaces/consent.interface.js';
// import type { ISecurityValidator } from '@core/interfaces/security.interface.js'; // Not used
import { logger } from '../../utils/logger.js';
// import type { ServerConfig } from '@infrastructure/config/types.js'; // Not used

@injectable()
export class UserConsentService extends EventEmitter implements IUserConsentService {
  private consentHistory: ConsentRequest[] = [];
  private pendingRequests = new Map<string, ConsentRequest>();
  private rememberedDecisions = new Map<string, ConsentResponse>();
  private policy: ConsentPolicy;

  constructor() { // @inject('SecurityValidator') private _security: ISecurityValidator // Removed as unused // @inject('Config') private _config: ServerConfig, // Removed as unused
    super();

    // Initialize default policy
    this.policy = {
      alwaysAllow: [
        'file_write:*.log',
        'file_write:*.tmp',
        'command_execute:ls',
        'command_execute:pwd',
        'command_execute:echo'
      ],
      alwaysDeny: [
        'command_execute:rm -rf /*',
        'file_delete:**/.ssh/**',
        'file_delete:**/.gnupg/**',
        'recursive_delete:/',
        'recursive_delete:C:\\'
      ],
      requireConsent: [
        'recursive_delete:*',
        'sensitive_path_access:*',
        'command_execute:sudo *',
        'file_write:**/*.key',
        'file_write:**/*.pem'
      ],
      defaultTimeout: 30000 // 30 seconds
    };

    // Set up IPC communication if available
    this.initializeIPC();
  }

  async requestConsent(request: Omit<ConsentRequest, 'id' | 'timestamp'>): Promise<ConsentResponse> {
    const consentRequest: ConsentRequest = {
      ...request,
      id: randomUUID(),
      timestamp: new Date()
    };

    // Check if we have a remembered decision
    const remembered = this.checkRememberedDecision(consentRequest);
    if (remembered) {
      logger.info({ requestId: consentRequest.id, decision: remembered.decision }, 'Using remembered consent decision');
      return remembered;
    }

    // Check policy
    const policyDecision = this.checkPolicy(request.operation, this.getTargetFromRequest(request));

    if (policyDecision === 'allow') {
      return this.createResponse(consentRequest.id, 'allow', 'Policy allows this operation');
    }

    if (policyDecision === 'deny') {
      return this.createResponse(consentRequest.id, 'deny', 'Policy denies this operation');
    }

    // Need to ask user
    this.pendingRequests.set(consentRequest.id, consentRequest);
    this.consentHistory.push(consentRequest);

    logger.info(
      {
        requestId: consentRequest.id,
        operation: consentRequest.operation,
        severity: consentRequest.severity
      },
      'Requesting user consent'
    );

    try {
      // Emit event for IPC/UI handling
      this.emit('consent-request', consentRequest);

      // Wait for response with timeout
      const response = await this.waitForResponse(consentRequest);

      // Remember decision if requested
      if (response.remember) {
        this.rememberDecision(consentRequest, response);
      }

      return response;
    } finally {
      this.pendingRequests.delete(consentRequest.id);
    }
  }

  checkPolicy(operation: ConsentRequest['operation'], target?: string): 'allow' | 'deny' | 'ask' {
    const checkTarget = target || '*';
    const operationPattern = `${operation}:${checkTarget}`;

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

    // Default based on severity
    if (operation.includes('delete') || operation.includes('sensitive')) {
      return 'ask';
    }

    return 'allow';
  }

  updatePolicy(policy: Partial<ConsentPolicy>): void {
    this.policy = { ...this.policy, ...policy };
    logger.info({ policy: this.policy }, 'Consent policy updated');
  }

  getConsentHistory(): ConsentRequest[] {
    return [...this.consentHistory];
  }

  clearHistory(): void {
    this.consentHistory = [];
    this.rememberedDecisions.clear();
    logger.info('Consent history cleared');
  }

  private initializeIPC(): void {
    // This would be implemented based on the IPC mechanism with Claude Desktop
    // For now, we'll use a simple event-based system that can be extended

    // Listen for responses from UI
    this.on('consent-response', (response: ConsentResponse) => {
      const request = this.pendingRequests.get(response.requestId);
      if (request) {
        this.emit(`response-${response.requestId}`, response);
      }
    });
  }

  private async waitForResponse(request: ConsentRequest): Promise<ConsentResponse> {
    return new Promise(resolve => {
      const timeout = request.timeout || this.policy.defaultTimeout;

      // Set up timeout
      const timer = setTimeout(() => {
        this.removeAllListeners(`response-${request.id}`);
        resolve(this.createResponse(request.id, 'timeout', 'User did not respond in time'));
      }, timeout);

      // Listen for response
      this.once(`response-${request.id}`, (response: ConsentResponse) => {
        clearTimeout(timer);
        resolve(response);
      });
    });
  }

  private createResponse(requestId: string, decision: ConsentResponse['decision'], reason?: string): ConsentResponse {
    const response: ConsentResponse = {
      requestId,
      decision,
      timestamp: new Date()
    };

    logger.info({ response, reason }, 'Consent decision made');
    return response;
  }

  private getTargetFromRequest(request: Omit<ConsentRequest, 'id' | 'timestamp'>): string {
    if (request.details.path) return request.details.path;
    if (request.details.command) return request.details.command;
    return '*';
  }

  private matchesPatterns(target: string, patterns: string[]): boolean {
    return patterns.some(pattern => {
      // Convert simple glob patterns to regex
      const regexPattern = pattern
        .replace(/\*/g, '.*')
        .replace(/\?/g, '.')
        .replace(/\[(!)?([^\]]+)\]/g, (_match, negate, chars) => {
          return negate ? `[^${chars}]` : `[${chars}]`;
        });

      try {
        const regex = new RegExp(`^${regexPattern}$`);
        return regex.test(target);
      } catch {
        // If regex is invalid, do simple string matching
        return target.includes(pattern.replace(/\*/g, ''));
      }
    });
  }

  private checkRememberedDecision(request: ConsentRequest): ConsentResponse | null {
    const key = `${request.operation}:${this.getTargetFromRequest(request)}`;
    const remembered = this.rememberedDecisions.get(key);

    if (remembered && remembered.scope === 'permanent') {
      return remembered;
    }

    // Session-scoped decisions are valid for this session only
    if (remembered && remembered.scope === 'session') {
      return remembered;
    }

    return null;
  }

  private rememberDecision(request: ConsentRequest, response: ConsentResponse): void {
    const key = `${request.operation}:${this.getTargetFromRequest(request)}`;
    this.rememberedDecisions.set(key, response);

    logger.info(
      {
        key,
        decision: response.decision,
        scope: response.scope
      },
      'Consent decision remembered'
    );
  }
}
