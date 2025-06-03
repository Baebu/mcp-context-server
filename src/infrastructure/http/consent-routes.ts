// Enhanced Consent API Routes with WebSocket Support
// File: src/infrastructure/http/consent-routes.ts

import { Router } from 'express';
import type { Request, Response } from 'express';
import WebSocket, { WebSocketServer } from 'ws';
import { inject, injectable } from 'inversify';
import type { IUserConsentService } from '../../core/interfaces/consent.interface.js';
import { logger } from '../../utils/logger.js';

@injectable()
export class ConsentRoutes {
  private router: Router;
  private wsServer: WebSocketServer | null = null;
  private consentLogger;

  constructor(@inject('UserConsentService') private consentService: IUserConsentService) {
    this.router = Router();
    this.consentLogger = logger.child({ component: 'ConsentAPI' });
    this.setupRoutes();
    this.setupConsentServiceListeners();
  }

  private setupRoutes(): void {
    // Session statistics
    this.router.get('/session-stats', this.getSessionStats.bind(this));

    // Pending requests
    this.router.get('/pending', this.getPendingRequests.bind(this));

    // Respond to consent requests
    this.router.post('/respond', this.respondToConsent.bind(this));

    // Consent history
    this.router.get('/history', this.getConsentHistory.bind(this));
    this.router.delete('/history', this.clearConsentHistory.bind(this));

    // Policy management
    this.router.get('/policy', this.getConsentPolicy.bind(this));
    this.router.post('/policy', this.updateConsentPolicy.bind(this));
    this.router.post('/policy/reset', this.resetConsentPolicy.bind(this));

    // Audit log
    this.router.get('/audit', this.getAuditLog.bind(this));
    this.router.get('/audit/export', this.exportAuditLog.bind(this));

    // Emergency controls
    this.router.post('/emergency-stop', this.emergencyStop.bind(this));
  }

  private setupConsentServiceListeners(): void {
    // Listen for consent events and broadcast to connected clients
    this.consentService.on('consent-request', request => {
      this.broadcastToClients({
        type: 'consent-request',
        request: {
          ...request,
          // Add additional context for UI
          timestamp: new Date().toISOString(),
          sessionId: this.getSessionId()
        }
      });
    });

    this.consentService.on('consent-response', response => {
      this.broadcastToClients({
        type: 'consent-decision',
        requestId: response.requestId,
        decision: response.decision,
        reason: response.reason || 'User decision',
        timestamp: new Date().toISOString()
      });
    });

    this.consentService.on('policy-updated', policy => {
      this.broadcastToClients({
        type: 'policy-update',
        policy
      });
    });

    this.consentService.on('history-cleared', () => {
      this.broadcastToClients({
        type: 'history-cleared',
        timestamp: new Date().toISOString()
      });
    });
  }

  setupWebSocket(server: any): void {
    this.wsServer = new WebSocketServer({
      server,
      path: '/consent-ws'
    });

    this.wsServer.on('connection', (ws: WebSocket, req: any) => {
      this.consentLogger.info(
        {
          clientIP: req.socket?.remoteAddress,
          userAgent: req.headers?.['user-agent']
        },
        'Consent UI client connected'
      );

      ws.on('message', (message: string) => {
        try {
          const data = JSON.parse(message);
          this.handleWebSocketMessage(ws, data);
        } catch (error) {
          this.consentLogger.warn({ error }, 'Invalid WebSocket message received');
          ws.send(
            JSON.stringify({
              type: 'error',
              message: 'Invalid message format'
            })
          );
        }
      });

      ws.on('close', () => {
        this.consentLogger.info('Consent UI client disconnected');
      });

      ws.on('error', error => {
        this.consentLogger.error({ error }, 'WebSocket error');
      });

      // Send initial session stats
      this.sendSessionStats(ws);
    });

    this.consentLogger.info('Consent WebSocket server initialized');
  }

  private handleWebSocketMessage(ws: WebSocket, data: any): void {
    switch (data.type) {
      case 'get-session-stats':
        this.sendSessionStats(ws);
        break;
      case 'ping':
        ws.send(JSON.stringify({ type: 'pong', timestamp: Date.now() }));
        break;
      default:
        this.consentLogger.warn({ messageType: data.type }, 'Unknown WebSocket message type');
    }
  }

  private sendSessionStats(ws: WebSocket): void {
    try {
      const stats = this.consentService.getSessionStats();
      ws.send(
        JSON.stringify({
          type: 'session-update',
          stats
        })
      );
    } catch (error) {
      this.consentLogger.error({ error }, 'Failed to send session stats');
    }
  }

  private broadcastToClients(message: any): void {
    if (!this.wsServer) return;

    const messageStr = JSON.stringify(message);
    this.wsServer.clients.forEach((client: WebSocket) => {
      if (client.readyState === WebSocket.OPEN) {
        try {
          client.send(messageStr);
        } catch (error) {
          this.consentLogger.warn({ error }, 'Failed to send message to client');
        }
      }
    });
  }

  private getSessionId(): string {
    return this.consentService.getSessionStats().sessionId;
  }

  // Route handlers
  private async getSessionStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = this.consentService.getSessionStats();
      res.json(stats);
    } catch (error) {
      this.consentLogger.error({ error }, 'Failed to get session stats');
      res.status(500).json({ error: 'Failed to get session statistics' });
    }
  }

  private async getPendingRequests(_req: Request, res: Response): Promise<void> {
    try {
      // In a real implementation, this would get actual pending requests
      // For now, return empty array as the service doesn't expose pending requests directly
      const pendingRequests: any[] = [];
      res.json(pendingRequests);
    } catch (error) {
      this.consentLogger.error({ error }, 'Failed to get pending requests');
      res.status(500).json({ error: 'Failed to get pending requests' });
    }
  }

  private async respondToConsent(_req: Request, res: Response): Promise<void> {
    try {
      const { requestId, decision, remember, scope } = res.req.body;

      if (!requestId || !decision) {
        res.status(400).json({ error: 'requestId and decision are required' });
        return;
      }

      if (!['allow', 'deny'].includes(decision)) {
        res.status(400).json({ error: 'decision must be "allow" or "deny"' });
        return;
      }

      // Emit the response event that the consent service is listening for
      this.consentService.emit('consent-response', {
        requestId,
        decision,
        remember: Boolean(remember),
        scope: scope || 'session',
        timestamp: new Date(),
        source: 'ui'
      });

      this.consentLogger.info(
        {
          requestId,
          decision,
          remember,
          scope
        },
        'Consent response submitted via UI'
      );

      res.json({ success: true });
    } catch (error) {
      this.consentLogger.error({ error }, 'Failed to respond to consent request');
      res.status(500).json({ error: 'Failed to respond to consent request' });
    }
  }

  private async getConsentHistory(_req: Request, res: Response): Promise<void> {
    try {
      const history = this.consentService.getConsentHistory();

      // Transform to format expected by UI
      const transformedHistory = history.map(item => ({
        operation: item.operation,
        decision: 'unknown', // This would come from the response in a full implementation
        reason: item.reason || 'No reason provided',
        timestamp: item.timestamp,
        severity: item.severity,
        details: item.details
      }));

      res.json(transformedHistory);
    } catch (error) {
      this.consentLogger.error({ error }, 'Failed to get consent history');
      res.status(500).json({ error: 'Failed to get consent history' });
    }
  }

  private async clearConsentHistory(_req: Request, res: Response): Promise<void> {
    try {
      this.consentService.clearHistory();

      this.consentLogger.info('Consent history cleared via UI');
      res.json({ success: true });
    } catch (error) {
      this.consentLogger.error({ error }, 'Failed to clear consent history');
      res.status(500).json({ error: 'Failed to clear consent history' });
    }
  }

  private async getConsentPolicy(_req: Request, res: Response): Promise<void> {
    try {
      // Since the service doesn't expose policy directly, we'll construct a response
      // based on the service's current configuration
      const policy = {
        defaultTimeout: 30000,
        autoApproveThreshold: 20,
        autoRejectThreshold: 80,
        enableRiskAnalysis: true,
        enablePlugins: true,
        alwaysAllow: [
          'file_write:*.log',
          'file_write:*.tmp',
          'file_write:**/temp/**',
          'command_execute:ls',
          'command_execute:dir',
          'command_execute:pwd',
          'command_execute:echo',
          'command_execute:cat',
          'command_execute:type'
        ],
        alwaysDeny: [
          'command_execute:rm -rf /*',
          'command_execute:del /s C:\\*',
          'command_execute:format *',
          'file_delete:**/.ssh/**',
          'recursive_delete:/',
          'recursive_delete:C:\\'
        ],
        requireConsent: [
          'recursive_delete:*',
          'sensitive_path_access:*',
          'command_execute:sudo *',
          'file_write:**/*.config',
          'database_write:*'
        ]
      };

      res.json(policy);
    } catch (error) {
      this.consentLogger.error({ error }, 'Failed to get consent policy');
      res.status(500).json({ error: 'Failed to get consent policy' });
    }
  }

  private async updateConsentPolicy(_req: Request, res: Response): Promise<void> {
    try {
      const policy = res.req.body;

      // Validate policy structure
      if (typeof policy !== 'object') {
        res.status(400).json({ error: 'Policy must be an object' });
        return;
      }

      // Update the consent service policy
      this.consentService.updatePolicy(policy);

      this.consentLogger.info({ policy }, 'Consent policy updated via UI');
      res.json({ success: true });
    } catch (error) {
      this.consentLogger.error({ error }, 'Failed to update consent policy');
      res.status(500).json({ error: 'Failed to update consent policy' });
    }
  }

  private async resetConsentPolicy(_req: Request, res: Response): Promise<void> {
    try {
      // Reset to default policy
      const defaultPolicy = {
        alwaysAllow: [
          'file_write:*.log',
          'file_write:*.tmp',
          'command_execute:ls',
          'command_execute:pwd',
          'command_execute:echo'
        ],
        alwaysDeny: ['command_execute:rm -rf /*', 'recursive_delete:/', 'file_delete:**/.ssh/**'],
        requireConsent: ['recursive_delete:*', 'sensitive_path_access:*', 'command_execute:sudo *'],
        defaultTimeout: 30000
      };

      this.consentService.updatePolicy(defaultPolicy);

      this.consentLogger.info('Consent policy reset to defaults via UI');
      res.json({ success: true });
    } catch (error) {
      this.consentLogger.error({ error }, 'Failed to reset consent policy');
      res.status(500).json({ error: 'Failed to reset consent policy' });
    }
  }

  private async getAuditLog(_req: Request, res: Response): Promise<void> {
    try {
      const { startDate, endDate, operation, decision } = res.req.query;

      const filter: any = {};
      if (startDate) filter.startDate = new Date(startDate as string);
      if (endDate) filter.endDate = new Date(endDate as string);
      if (operation) filter.operation = operation as string;
      if (decision) filter.decision = decision as string;

      const auditLog = await this.consentService.getAuditLog(filter);
      res.json(auditLog);
    } catch (error) {
      this.consentLogger.error({ error }, 'Failed to get audit log');
      res.status(500).json({ error: 'Failed to get audit log' });
    }
  }

  private async exportAuditLog(_req: Request, res: Response): Promise<void> {
    try {
      const auditLog = await this.consentService.getAuditLog();

      const exportData = {
        exportDate: new Date().toISOString(),
        totalEntries: auditLog.length,
        entries: auditLog
      };

      res.setHeader('Content-Type', 'application/json');
      res.setHeader(
        'Content-Disposition',
        `attachment; filename="consent-audit-${new Date().toISOString().split('T')[0]}.json"`
      );
      res.json(exportData);
    } catch (error) {
      this.consentLogger.error({ error }, 'Failed to export audit log');
      res.status(500).json({ error: 'Failed to export audit log' });
    }
  }

  private async emergencyStop(_req: Request, res: Response): Promise<void> {
    try {
      this.consentService.emit('emergency-stop');

      this.consentLogger.warn('Emergency stop triggered via UI');

      // Broadcast emergency stop to all connected clients
      this.broadcastToClients({
        type: 'emergency-stop',
        timestamp: new Date().toISOString(),
        message: 'Emergency stop activated - all pending requests denied'
      });

      res.json({ success: true, message: 'Emergency stop activated' });
    } catch (error) {
      this.consentLogger.error({ error }, 'Failed to trigger emergency stop');
      res.status(500).json({ error: 'Failed to trigger emergency stop' });
    }
  }

  getRouter(): Router {
    return this.router;
  }

  getWebSocketServer(): WebSocketServer | null {
    return this.wsServer;
  }
}
