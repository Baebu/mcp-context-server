// Consent UI Server - Standalone HTTP server for consent management
// File: src/infrastructure/http/consent-server.ts

import express from 'express';
import type { Express } from 'express';
import { createServer, Server } from 'http';
import path from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { inject, injectable } from 'inversify';
import type { IUserConsentService } from '../../core/interfaces/consent.interface.js';
import { ConsentRoutes } from './consent-routes.js';
import { logger } from '../../utils/logger.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

@injectable()
export class ConsentUIServer {
  private app: Express;
  private server: Server;
  private consentRoutes: ConsentRoutes;
  private logger;

  constructor(
    @inject('UserConsentService') consentService: IUserConsentService
  ) {
    this.app = express();
    this.server = createServer(this.app);
    this.consentRoutes = new ConsentRoutes(consentService);
    this.logger = logger.child({ component: 'ConsentUIServer' });
    
    this.setupMiddleware();
    this.setupRoutes();
  }

  private setupMiddleware(): void {
    // Enable JSON parsing
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true }));

    // CORS for development
    this.app.use((req, res, next) => {
      res.header('Access-Control-Allow-Origin', '*');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Origin, X-Requested-With, Content-Type, Accept, Authorization');
      
      if (req.method === 'OPTIONS') {
        res.sendStatus(200);
      } else {
        next();
      }
    });

    // Logging middleware
    this.app.use((req, _res, next) => {
      this.logger.debug({
        method: req.method,
        url: req.url,
        ip: req.ip,
        userAgent: req.get('User-Agent')
      }, 'HTTP request');
      next();
    });

    // Static file serving for UI
    const uiPath = path.resolve(__dirname, '../../../ui');
    this.app.use('/ui', express.static(uiPath));
    
    this.logger.info({ uiPath }, 'Serving static UI files');
  }

  private setupRoutes(): void {
    // Health check
    this.app.get('/health', (_req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        version: '1.0.0',
        service: 'consent-ui-server'
      });
    });

    // API routes
    this.app.use('/api/consent', this.consentRoutes.getRouter());

    // Serve consent UI at root
    this.app.get('/', (_req, res) => {
      res.redirect('/ui/consent-ui.html');
    });

    // Serve consent UI directly
    this.app.get('/consent', (_req, res) => {
      res.redirect('/ui/consent-ui.html');
    });

    // 404 handler
    this.app.use('*', (req, res) => {
      res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`,
        availableRoutes: [
          '/',
          '/consent',
          '/ui/consent-ui.html',
          '/api/consent/*',
          '/health'
        ]
      });
    });

    // Error handler
    this.app.use((err: any, req: any, res: any, _next: any) => {
      this.logger.error({
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method
      }, 'Express error');

      res.status(500).json({
        error: 'Internal Server Error',
        message: err.message
      });
    });
  }

  async start(port: number = 3001): Promise<void> {
    return new Promise((resolve, reject) => {
      try {
        // Setup WebSocket for real-time communication
        this.consentRoutes.setupWebSocket(this.server);

        this.server.listen(port, () => {
          this.logger.info({
            port,
            urls: [
              `http://localhost:${port}`,
              `http://localhost:${port}/consent`,
              `http://localhost:${port}/ui/consent-ui.html`
            ]
          }, 'Consent UI server started');
          resolve();
        });

        this.server.on('error', (error: any) => {
          if (error.code === 'EADDRINUSE') {
            this.logger.error({ port }, 'Port is already in use');
            reject(new Error(`Port ${port} is already in use`));
          } else {
            this.logger.error({ error }, 'Server error');
            reject(error);
          }
        });

      } catch (error) {
        this.logger.error({ error }, 'Failed to start consent UI server');
        reject(error);
      }
    });
  }

  async stop(): Promise<void> {
    return new Promise((resolve) => {
      this.server.close(() => {
        this.logger.info('Consent UI server stopped');
        resolve();
      });
    });
  }

  getApp(): Express {
    return this.app;
  }

  getServer(): Server {
    return this.server;
  }
}

// Standalone server initialization function
export async function startConsentUIServer(
  consentService: IUserConsentService,
  port: number = 3001
): Promise<ConsentUIServer> {
  const server = new ConsentUIServer(consentService);
  await server.start(port);
  return server;
}
