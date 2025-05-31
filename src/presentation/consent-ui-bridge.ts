// src/presentation/consent-ui-bridge.ts
import { injectable, inject } from 'inversify';
import { createServer, Server } from 'node:http';
import { WebSocket, WebSocketServer } from 'ws';
import type { ConsentRequest, ConsentResponse } from '@core/interfaces/consent.interface.js';
import { logger } from '../utils/logger.js';
import type { UserConsentService } from '../application/services/user-consent.service.js'; // Added import

@injectable()
export class ConsentUIBridge {
  private server?: Server;
  private wss?: WebSocketServer;
  private clients = new Set<WebSocket>();
  private port = 3002; // Different from config UI port

  constructor(@inject('UserConsentService') private consentService: UserConsentService) {}

  start(): void {
    // Create HTTP server for the consent UI
    this.server = createServer((req, res) => {
      if (req.url === '/consent-ui') {
        res.writeHead(200, { 'Content-Type': 'text/html' });
        res.end(this.getConsentUIHTML());
      } else {
        res.writeHead(404);
        res.end('Not found');
      }
    });

    // Create WebSocket server for real-time communication
    this.wss = new WebSocketServer({ server: this.server });

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
    });

    // Forward consent requests to UI
    this.consentService.on('consent-request', (request: ConsentRequest) => {
      this.broadcastToClients({
        type: 'consent-request',
        request
      });
    });

    this.server.listen(this.port, () => {
      logger.info(`Consent UI available at http://localhost:${this.port}/consent-ui`);
    });
  }

  stop(): void {
    this.clients.forEach(client => client.close());
    this.wss?.close();
    this.server?.close();
  }

  private broadcastToClients(message: any): void {
    const data = JSON.stringify(message);
    this.clients.forEach(client => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
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
};
