// Add this to your MCP server to serve the UI
// File: src/presentation/ui-server.ts

import { createServer } from 'http';
import type { Server } from 'http';
import type { IncomingMessage, ServerResponse } from 'http';
import { readFileSync } from 'fs';
import { join } from 'path';
import type { Container } from 'inversify';
import type { ServerConfig } from '../infrastructure/config/types.js';
import type { IToolRegistry, IMCPTool } from '../core/interfaces/tool-registry.interface.js';
import { logger } from '../utils/logger.js';

export class UIServer {
  private server: Server | null = null;

  constructor(
    private container: Container,
    private config: ServerConfig,
    private port: number = 3001
  ) {}

  start(): void {
    this.server = createServer((req, res) => {
      // CORS headers
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

      if (req.method === 'OPTIONS') {
        res.writeHead(200);
        res.end();
        return;
      }

      if (!req.url) {
        res.writeHead(400);
        res.end('Bad Request');
        return;
      }

      const url = new URL(req.url, `http://localhost:${this.port}`);

      // Serve the UI
      if (url.pathname === '/' || url.pathname === '/ui') {
        res.setHeader('Content-Type', 'text/html');
        const uiPath = join(process.cwd(), 'ui', 'config-ui.html');
        try {
          const html = readFileSync(uiPath, 'utf8');
          res.writeHead(200);
          res.end(html);
        } catch (error) {
          logger.error({ error }, 'Failed to read UI file');
          res.writeHead(404);
          res.end('UI file not found. Please ensure config-ui.html is in the ui/ directory.');
        }
        return;
      }

      // API endpoints for the UI
      if (url.pathname.startsWith('/api/')) {
        this.handleAPI(req, res, url).catch((error: unknown) => {
          logger.error({ error }, 'API handler error');
          res.writeHead(500);
          res.end(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Unknown error'
            })
          );
        });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    this.server.listen(this.port, () => {
      logger.info(`🌐 MCP Configuration UI available at: http://localhost:${this.port}`);
    });
  }

  private async handleAPI(req: IncomingMessage, res: ServerResponse, url: URL): Promise<void> {
    res.setHeader('Content-Type', 'application/json');

    try {
      // Get current config
      if (url.pathname === '/api/config' && req.method === 'GET') {
        res.writeHead(200);
        res.end(
          JSON.stringify({
            allowedCommands: this.config.security.allowedCommands,
            safezones: this.config.security.safezones,
            maxExecutionTime: this.config.security.maxExecutionTime,
            maxFileSize: this.config.security.maxFileSize
          })
        );
        return;
      }

      // Execute MCP tool calls
      if (url.pathname === '/api/execute' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const { tool, arguments: args } = JSON.parse(body) as {
              tool: string;
              arguments: Record<string, unknown>;
            };
            const result = await this.executeMCPTool(tool, args);
            res.writeHead(200);
            res.end(JSON.stringify(result));
          } catch (error: unknown) {
            logger.error({ error }, 'Tool execution error');
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : 'Tool execution failed'
              })
            );
          }
        });
        return;
      }

      // Get metrics
      if (url.pathname === '/api/metrics' && req.method === 'GET') {
        const metrics = await this.getServerMetrics();
        res.writeHead(200);
        res.end(JSON.stringify(metrics));
        return;
      }

      // Save configuration
      if (url.pathname === '/api/config' && req.method === 'PUT') {
        let body = '';
        req.on('data', (chunk: Buffer) => {
          body += chunk.toString();
        });

        req.on('end', async () => {
          try {
            const configUpdate = JSON.parse(body) as {
              allowedCommands?: string[] | 'all';
              safezones?: string[];
            };

            // In a real implementation, you'd save this to your config file
            logger.info({ configUpdate }, 'Configuration update requested');

            res.writeHead(200);
            res.end(
              JSON.stringify({
                success: true,
                message: 'Configuration saved (would update config file in production)'
              })
            );
          } catch (error: unknown) {
            logger.error({ error }, 'Config save error');
            res.writeHead(500);
            res.end(
              JSON.stringify({
                error: error instanceof Error ? error.message : 'Config save failed'
              })
            );
          }
        });
        return;
      }

      res.writeHead(404);
      res.end(JSON.stringify({ error: 'API endpoint not found' }));
    } catch (error: unknown) {
      logger.error({ error }, 'API error');
      res.writeHead(500);
      res.end(
        JSON.stringify({
          error: error instanceof Error ? error.message : 'API error'
        })
      );
    }
  }

  private async executeMCPTool(toolName: string, args: Record<string, unknown>): Promise<unknown> {
    const toolRegistry = this.container.get<IToolRegistry>('ToolRegistry');
    const tools = await toolRegistry.getAllTools();
    const tool = tools.find((t: IMCPTool) => t.name === toolName);

    if (!tool) {
      throw new Error(`Tool not found: ${toolName}`);
    }

    const context = {
      config: this.config,
      logger: logger.child({ component: 'ui-tool' }),
      container: this.container
    };

    const validatedArgs = tool.schema.parse(args);
    return await tool.execute(validatedArgs, context);
  }

  private async getServerMetrics(): Promise<Record<string, unknown>> {
    return {
      uptime: process.uptime(),
      memoryUsage: process.memoryUsage(),
      cpuUsage: process.cpuUsage(),
      timestamp: new Date().toISOString(),
      nodeVersion: process.version,
      platform: process.platform
    };
  }

  stop(): void {
    if (this.server) {
      this.server.close((error?: Error) => {
        if (error) {
          logger.error({ error }, 'Error closing UI server');
        } else {
          logger.info('UI server closed successfully');
        }
      });
      this.server = null;
    }
  }
}
