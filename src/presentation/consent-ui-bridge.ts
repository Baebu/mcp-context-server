// src/presentation/consent-ui-bridge.ts
import { injectable, inject } from 'inversify';
import { createServer, Server as HttpServer } from 'node:http'; // Renamed Server to avoid conflict
import { WebSocket, WebSocketServer } from 'ws';
import type { ConsentRequest, ConsentResponse } from '../core/interfaces/consent.interface.js';
import { logger } from '../utils/logger.js';
import type { UserConsentService } from '../application/services/user-consent.service.js';

@injectable()
export class ConsentUIBridge {
  private httpServer?: HttpServer; // Use renamed import
  private wss?: WebSocketServer;
  private clients = new Set<WebSocket>();
  private port = 3002; // Different from config UI port

  constructor(@inject('UserConsentService') private consentService: UserConsentService) {}

  start(): void {
    // Create HTTP server for the consent UI
    this.httpServer = createServer((req, res) => {
      if (req.url === '/consent-ui') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getConsentUIHTML());
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    // Add crucial error handling for the HTTP server
    this.httpServer.on('error', (err: Error) => {
      console.error(
        `ConsentUIBridge HTTP Server Error on port ${this.port}:`,
        err.message,
        (err as NodeJS.ErrnoException).code
      ); // Direct console log
      logger.error(
        {
          error: { message: err.message, stack: err.stack, code: (err as NodeJS.ErrnoException).code },
          port: this.port
        },
        'Consent UI HTTP server error'
      );
      if ((err as NodeJS.ErrnoException).code === 'EADDRINUSE') {
        logger.fatal(
          { port: this.port },
          `Consent UI port ${this.port} is already in use. This will prevent user consent from functioning. Please ensure port ${this.port} is free or configure a different port for the consent UI if this feature becomes configurable.`
        );
        // Consider if the application should exit or attempt recovery if consent is critical.
        // For now, logging fatal should highlight the issue.
      }
      // Other errors might also be critical.
    });

    // Create WebSocket server for real-time communication
    this.wss = new WebSocketServer({ server: this.httpServer });

    this.wss.on('connection', ws => {
      this.clients.add(ws);
      logger.info('Consent UI client connected');

      ws.on('message', data => {
        try {
          const message = JSON.parse(data.toString());
          if (message.type === 'consent-response') {
            this.consentService.emit('consent-response', message.response as ConsentResponse);
          }
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

    // Forward consent requests to UI
    this.consentService.on('consent-request', (request: ConsentRequest) => {
      this.broadcastToClients({
        type: 'consent-request',
        request
      });
    });

    this.httpServer.listen(this.port, () => {
      logger.info(`Consent UI available at http://localhost:${this.port}/consent-ui`);
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

  private broadcastToClients(message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data, err => {
          if (err) {
            logger.warn(
              { error: err, clientId: /* if you have client id */ '' },
              'Failed to send message to a consent UI client'
            );
          }
        });
      }
    });
  }

  private getConsentUIHTML(): string {
    return `<!DOCTYPE html>
<html>
<head>
  <title>MCP Consent Manager</title>
  <style>
    body { font-family: -apple-system, sans-serif; margin: 0; padding: 20px; background: #1e1e1e; color: #fff; }
    .consent-request { background: #2d2d2d; border-radius: 8px; padding: 20px; margin-bottom: 20px; }
    .severity-critical { border-left: 4px solid #ff4444; }
    .severity-high { border-left: 4px solid #ff8800; }
    .severity-medium { border-left: 4px solid #ffaa00; }
    .severity-low { border-left: 4px solid #00aa00; }
    .details { margin: 10px 0; padding: 10px; background: #1e1e1e; border-radius: 4px; }
    .risks { color: #ff8800; margin: 10px 0; }
    .actions { margin-top: 20px; display: flex; gap: 10px; }
    button { padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; font-size: 16px; }
    .allow { background: #00aa00; color: white; }
    .deny { background: #ff4444; color: white; }
    .remember { margin-left: auto; }
  </style>
</head>
<body>
  <h1>MCP Consent Manager</h1>
  <div id="requests"></div>
  <script>
    const ws = new WebSocket('ws://localhost:${this.port}');
    const requests = new Map();

    ws.onopen = () => console.log('Consent UI WebSocket connected.');
    ws.onerror = (error) => console.error('Consent UI WebSocket error:', error);
    ws.onclose = () => console.log('Consent UI WebSocket disconnected.');

    ws.onmessage = (event) => {
      const message = JSON.parse(event.data);
      if (message.type === 'consent-request') {
        displayRequest(message.request);
      }
    };

    function displayRequest(request) {
      requests.set(request.id, request);
      const container = document.getElementById('requests');

      const div = document.createElement('div');
      div.className = 'consent-request severity-' + request.severity;
      div.innerHTML = \`
        <h3>\${request.operation.replace(/_/g, ' ').toUpperCase()}</h3>
        <div class="details">
          <strong>Description:</strong> \${request.details.description}<br>
          \${request.details.path ? '<strong>Path:</strong> ' + request.details.path + '<br>' : ''}
          \${request.details.command ? '<strong>Command:</strong> ' + request.details.command + '<br>' : ''}
          \${request.details.args ? '<strong>Arguments:</strong> ' + request.details.args.join(' ') + '<br>' : ''}
        </div>
        \${request.details.risks ? '<div class="risks"><strong>Risks:</strong><ul>' +
          request.details.risks.map(r => '<li>' + r + '</li>').join('') + '</ul></div>' : ''}
        <div class="actions">
          <button class="allow" onclick="respond('\${request.id}', 'allow')">Allow</button>
          <button class="deny" onclick="respond('\${request.id}', 'deny')">Deny</button>
          <label class="remember">
            <input type="checkbox" id="remember-\${request.id}"> Remember this decision
          </label>
        </div>
      \`;

      container.insertBefore(div, container.firstChild);
    }

    function respond(requestId, decision) {
      const remember = document.getElementById('remember-' + requestId)?.checked;

      ws.send(JSON.stringify({
        type: 'consent-response',
        response: {
          requestId,
          decision,
          timestamp: new Date(),
          remember,
          scope: remember ? 'session' : undefined
        }
      }));

      // Remove from UI
      const container = document.getElementById('requests');
      const elements = container.getElementsByClassName('consent-request');
      for (let el of elements) {
        if (el.innerHTML.includes(requestId)) {
          el.remove();
          break;
        }
      }
    }
  </script>
</body>
</html>`;
  }
}
