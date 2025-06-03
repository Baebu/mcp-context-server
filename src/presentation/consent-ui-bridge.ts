// src/presentation/consent-ui-bridge.ts - FIXED VERSION
import { injectable, inject } from 'inversify';
import { createServer, Server as HttpServer } from 'node:http';
import { readFileSync } from 'node:fs';
import { join, resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { WebSocket, WebSocketServer } from 'ws';
import type { ConsentResponse } from '../core/interfaces/consent.interface.js';
import { logger } from '../utils/logger.js';
import type { UserConsentService } from '../application/services/user-consent.service.js';

interface ConsentUIMessage {
  type: 'consent-response' | 'policy-update' | 'settings-update';
  response?: ConsentResponse;
  policy?: any;
  settings?: any;
}

@injectable()
export class ConsentUIBridge {
  private httpServer?: HttpServer;
  private wss?: WebSocketServer;
  private clients = new Set<WebSocket>();
  private port: number;
  private projectRoot: string;

  constructor(
    @inject('UserConsentService') private consentService: UserConsentService,
    @inject('Config') private config: any
  ) {
    // Use configured port or fallback to environment variable or default
    this.port = this.config?.ui?.consentPort || parseInt(process.env.CONSENT_UI_PORT || '3003');
    
    // Determine project root using import.meta.url (ES module compatible)
    const currentFilePath = dirname(fileURLToPath(import.meta.url));
    this.projectRoot = resolve(currentFilePath, '..', '..');
  }

  start(): void {
    // Create HTTP server for the consent UI
    this.httpServer = createServer((req, res) => {
      // Enable CORS
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      const url = new URL(req.url || '/', `http://localhost:${this.port}`);

      // Serve the sophisticated consent UI
      if (url.pathname === '/' || url.pathname === '/consent-ui') {
        this.serveConsentUI(res);
        return;
      }

      // Handle API endpoints
      if (url.pathname.startsWith('/api/consent/')) {
        this.handleConsentAPI(req, res, url).catch((error: unknown) => {
          logger.error({ error, url: url.pathname }, 'Consent API handler error');
          res.writeHead(500);
          res.end(JSON.stringify({
            error: error instanceof Error ? error.message : 'Unknown error'
          }));
        });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    // Add error handling for the HTTP server
    this.httpServer.on('error', (err: Error) => {
      console.error(`ConsentUIBridge HTTP Server Error on port ${this.port}:`, err.message);
      logger.error({
        error: { message: err.message, stack: err.stack, code: (err as NodeJS.ErrnoException).code },
        port: this.port
      }, 'Consent UI HTTP server error');
      
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        logger.fatal({ port: this.port }, 
          `Consent UI port ${this.port} is already in use. Please configure a different port.`);
      }
    });

    // Create WebSocket server for real-time communication
    this.wss = new WebSocketServer({ server: this.httpServer, path: '/consent-ws' });

    this.wss.on('connection', ws => {
      this.clients.add(ws);
      logger.info('Consent UI client connected');

      // Send current session stats when client connects
      this.sendSessionStats(ws);

      ws.on('message', data => {
        try {
          const message = JSON.parse(data.toString()) as ConsentUIMessage;
          this.handleWebSocketMessage(message);
        } catch (error) {
          logger.error({ error }, 'Failed to parse consent UI message');
        }
      });

      ws.on('close', () => {
        this.clients.delete(ws);
        logger.info('Consent UI client disconnected');
      });

      ws.on('error', (wsError: Error) => {
        logger.error({ error: wsError }, 'Consent UI WebSocket client error');
      });
    });

    this.wss.on('error', (wssError: Error) => {
      logger.error({ error: wssError }, 'Consent UI WebSocketServer error');
    });

    // Set up consent service event listeners
    this.setupConsentServiceListeners();

    this.httpServer.listen(this.port, () => {
      logger.info(`🛡️ Consent UI available at: http://localhost:${this.port}/consent-ui`);
      logger.info(`   Real-time consent management and security oversight`);
    });
  }

  stop(): void {
    this.clients.forEach(client => client.close());
    this.wss?.close();
    this.httpServer?.close(err => {
      if (err) {
        logger.error({ error: err }, 'Error closing ConsentUIBridge HTTP server');
      } else {
        logger.info('ConsentUIBridge HTTP server closed.');
      }
    });
  }

  private serveConsentUI(res: any): void {
    try {
      const uiPath = join(this.projectRoot, 'ui', 'consent-ui.html');
      const html = readFileSync(uiPath, 'utf8');
      
      // Update WebSocket URL in the HTML to match our server
      const updatedHtml = html.replace(
        /ws:\/\/\${window\.location\.host}\/consent-ws/g,
        `ws://localhost:${this.port}/consent-ws`
      );
      
      res.setHeader('Content-Type', 'text/html');
      res.writeHead(200);
      res.end(updatedHtml);
    } catch (error) {
      logger.error({ error }, 'Failed to serve consent UI');
      res.writeHead(500);
      res.end(`
        <html>
          <body>
            <h1>Consent UI Error</h1>
            <p>Failed to load consent UI. Error: ${error instanceof Error ? error.message : 'Unknown error'}</p>
            <p>Please ensure consent-ui.html is in the ui/ directory.</p>
          </body>
        </html>
      `);
    }
  }

  private async handleConsentAPI(req: any, res: any, url: URL): Promise<void> {
    res.setHeader('Content-Type', 'application/json');

    try {
      // GET /api/consent/session-stats
      if (url.pathname === '/api/consent/session-stats' && req.method === 'GET') {
        const stats = this.consentService.getSessionStats();
        const enhancedStats = {
          ...stats,
          pendingRequests: stats.pendingRequests || 0,
          autoDecisions: 0, // TODO: Add this to consent service if needed
        };
        res.writeHead(200);
        res.end(JSON.stringify(enhancedStats));
        return;
      }

      // GET /api/consent/pending
      if (url.pathname === '/api/consent/pending' && req.method === 'GET') {
        // For now, return empty since pending requests are handled via WebSocket
        res.writeHead(200);
        res.end(JSON.stringify([]));
        return;
      }

      // POST /api/consent/respond
      if (url.pathname === '/api/consent/respond' && req.method === 'POST') {
        const body = await this.getRequestBody(req);
        const responseData = JSON.parse(body);
        
        // Emit the response to the consent service
        this.consentService.emit('consent-response', responseData);
        
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // GET /api/consent/history
      if (url.pathname === '/api/consent/history' && req.method === 'GET') {
        const history = this.consentService.getConsentHistory();
        res.writeHead(200);
        res.end(JSON.stringify(history));
        return;
      }

      // DELETE /api/consent/history
      if (url.pathname === '/api/consent/history' && req.method === 'DELETE') {
        this.consentService.clearHistory();
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // GET /api/consent/policy
      if (url.pathname === '/api/consent/policy' && req.method === 'GET') {
        // Return current policy - this would need to be added to the consent service
        const policy = {
          defaultTimeout: 30000,
          autoApproveThreshold: 20,
          autoRejectThreshold: 80,
          enableRiskAnalysis: true,
          enablePlugins: true,
          alwaysAllow: [],
          alwaysDeny: [],
          requireConsent: []
        };
        res.writeHead(200);
        res.end(JSON.stringify(policy));
        return;
      }

      // POST /api/consent/policy
      if (url.pathname === '/api/consent/policy' && req.method === 'POST') {
        const body = await this.getRequestBody(req);
        const policy = JSON.parse(body);
        
        // Update policy in consent service - this would need to be enhanced
        this.consentService.updatePolicy(policy);
        
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // POST /api/consent/policy/reset
      if (url.pathname === '/api/consent/policy/reset' && req.method === 'POST') {
        // Reset to default policy
        this.consentService.updatePolicy({
          defaultTimeout: 30000,
          alwaysAllow: [],
          alwaysDeny: [],
          requireConsent: []
        });
        
        res.writeHead(200);
        res.end(JSON.stringify({ success: true }));
        return;
      }

      // GET /api/consent/audit
      if (url.pathname === '/api/consent/audit' && req.method === 'GET') {
        try {
          // Try to get audit log if the method exists
          const auditLog = (this.consentService as any).getAuditLog ? 
            await (this.consentService as any).getAuditLog() : [];
          res.writeHead(200);
          res.end(JSON.stringify(auditLog));
        } catch (error) {
          res.writeHead(200);
          res.end(JSON.stringify([])); // Return empty if not available
        }
        return;
      }

      // GET /api/consent/audit/export
      if (url.pathname === '/api/consent/audit/export' && req.method === 'GET') {
        try {
          const auditLog = (this.consentService as any).getAuditLog ? 
            await (this.consentService as any).getAuditLog() : [];
          
          res.setHeader('Content-Type', 'application/json');
          res.setHeader('Content-Disposition', 'attachment; filename="consent-audit.json"');
          res.writeHead(200);
          res.end(JSON.stringify(auditLog, null, 2));
        } catch (error) {
          res.writeHead(500);
          res.end(JSON.stringify({ error: 'Failed to export audit log' }));
        }
        return;
      }

      // If no endpoint matched
      res.writeHead(404);
      res.end(JSON.stringify({ error: 'API endpoint not found' }));

    } catch (error) {
      logger.error({ error, url: url.pathname }, 'Consent API error');
      res.writeHead(500);
      res.end(JSON.stringify({ 
        error: error instanceof Error ? error.message : 'Unknown API error' 
      }));
    }
  }

  private async getRequestBody(req: any): Promise<string> {
    return new Promise((resolve, reject) => {
      let body = '';
      req.on('data', (chunk: Buffer) => {
        body += chunk.toString();
      });
      req.on('end', () => resolve(body));
      req.on('error', reject);
    });
  }

  private setupConsentServiceListeners(): void {
    // Forward consent requests to UI clients
    this.consentService.on('consent-request', (data: any) => {
      this.broadcastToClients({
        type: 'consent-request',
        request: data
      });
    });

    // Forward consent decisions to UI clients
    this.consentService.on('consent-decision', (data: any) => {
      this.broadcastToClients({
        type: 'consent-decision',
        ...data
      });
    });

    // Forward session updates
    this.consentService.on('session-update', (data: any) => {
      this.broadcastToClients({
        type: 'session-update',
        stats: data
      });
    });

    // Forward audit entries
    this.consentService.on('audit-entry', (data: any) => {
      this.broadcastToClients({
        type: 'audit-entry',
        entry: data
      });
    });

    // Forward policy updates
    this.consentService.on('policy-updated', (policy: any) => {
      this.broadcastToClients({
        type: 'policy-updated',
        policy
      });
    });
  }

  private handleWebSocketMessage(message: ConsentUIMessage): void {
    switch (message.type) {
      case 'consent-response':
        if (message.response) {
          this.consentService.emit('consent-response', message.response);
        }
        break;
      
      case 'policy-update':
        if (message.policy) {
          this.consentService.updatePolicy(message.policy);
        }
        break;
      
      case 'settings-update':
        if (message.settings && (this.consentService as any).updateSettings) {
          (this.consentService as any).updateSettings(message.settings);
        }
        break;
      
      default:
        logger.warn({ messageType: message.type }, 'Unknown WebSocket message type');
    }
  }

  private sendSessionStats(ws: WebSocket): void {
    try {
      const stats = this.consentService.getSessionStats();
      ws.send(JSON.stringify({
        type: 'session-update',
        stats: {
          ...stats,
          pendingRequests: stats.pendingRequests || 0,
          autoDecisions: 0
        }
      }));
    } catch (error) {
      logger.error({ error }, 'Failed to send session stats to client');
    }
  }

  private broadcastToClients(message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, err => {
          if (err) {
            logger.warn({ error: err }, 'Failed to send message to consent UI client');
          }
        });
      }
    });
  }
}