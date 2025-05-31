import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import {
  ListToolsRequestSchema,
  CallToolRequestSchema,
  ListResourcesRequestSchema,
  ReadResourceRequestSchema,
  ListPromptsRequestSchema,
  GetPromptRequestSchema
} from '@modelcontextprotocol/sdk/types.js';
import type { Container } from 'inversify';
import type { IToolRegistry } from '@core/interfaces/tool-registry.interface.js';
import type { IResourceRegistry } from '@core/interfaces/resource-registry.interface.js';
import type { IPromptRegistry } from '@core/interfaces/prompt-registry.interface.js';
import { logger } from '@utils/logger.js';
import type { ServerConfig } from '@infrastructure/config/types.js';

export class MCPContextServer {
  private mcpServer: Server;
  private transport: StdioServerTransport | null = null;

  constructor(
    private container: Container,
    private config: ServerConfig
  ) {
    this.mcpServer = new Server(
      {
        name: 'context-efficient-mcp-server',
        version: '1.0.0'
      },
      {
        capabilities: {
          tools: {},
          resources: {},
          prompts: {}
        }
      }
    );
  }

  async start(): Promise<void> {
    logger.info('Starting MCP Context Server...');

    // Register all capabilities
    await this.registerTools();
    await this.registerResources();
    await this.registerPrompts();

    // Setup transport
    this.transport = new StdioServerTransport();
    await this.mcpServer.connect(this.transport);

    logger.info('MCP Context Server started successfully');
  }

  async shutdown(): Promise<void> {
    logger.info('Shutting down MCP Context Server...');
    if (this.transport) {
      await this.transport.close();
    }
    logger.info('MCP Context Server shut down successfully');
  }

  private async registerTools(): Promise<void> {
    const toolRegistry = this.container.get<IToolRegistry>('ToolRegistry');
    const tools = await toolRegistry.getAllTools();

    // Register tools/list handler - returns list of available tools
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      return {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: {
            type: 'object',
            properties: {},
            additionalProperties: true
          }
        }))
      };
    });

    // Register tools/call handler - executes a specific tool
    this.mcpServer.setRequestHandler(
      CallToolRequestSchema,
      async (request: { params: { name?: string; arguments?: Record<string, unknown> } }) => {
        const toolName = request.params?.name;
        const tool = tools.find(t => t.name === toolName);

        if (!tool) {
          throw new Error(`Unknown tool: ${toolName}`);
        }

        const context = this.createToolContext();
        const result = await tool.execute(request.params?.arguments || {}, context);

        // Return MCP-compliant response
        return {
          content: result.content,
          isError: false
        };
      }
    );

    logger.debug(`Registered ${tools.length} tools`);
  }

  private async registerResources(): Promise<void> {
    const resourceRegistry = this.container.get<IResourceRegistry>('ResourceRegistry');
    const resources = await resourceRegistry.getAllResources();

    // Register resources/list handler
    this.mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: resources.map(resource => ({
          uri: resource.template,
          name: resource.name,
          description: resource.description,
          mimeType: 'text/plain'
        }))
      };
    });

    // Register resources/read handler
    this.mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request: { params: { uri?: string } }) => {
      const uri = request.params?.uri;
      const resource = resources.find(r => uri?.startsWith(r.template.replace('{path}', '')));

      if (!resource) {
        throw new Error(`No resource handler for URI: ${uri}`);
      }

      return await resource.read(uri || '', request.params || {});
    });

    logger.debug(`Registered ${resources.length} resources`);
  }

  private async registerPrompts(): Promise<void> {
    const promptRegistry = this.container.get<IPromptRegistry>('PromptRegistry');
    const prompts = await promptRegistry.getAllPrompts();

    // Register prompts/list handler
    this.mcpServer.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: prompts.map(prompt => ({
          name: prompt.name,
          description: prompt.description,
          arguments: []
        }))
      };
    });

    // Register prompts/get handler
    this.mcpServer.setRequestHandler(
      GetPromptRequestSchema,
      async (request: { params: { name?: string; arguments?: Record<string, unknown> } }) => {
        const promptName = request.params?.name;
        const prompt = prompts.find(p => p.name === promptName);

        if (!prompt) {
          throw new Error(`Unknown prompt: ${promptName}`);
        }

        return await prompt.generate(request.params?.arguments || {});
      }
    );

    logger.debug(`Registered ${prompts.length} prompts`);
  }

  private createToolContext() {
    return {
      config: this.config,
      logger: logger.child({ component: 'tool' }),
      container: this.container
    };
  }
}
