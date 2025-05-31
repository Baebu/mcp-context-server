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
import { zodToJsonSchema } from 'zod-to-json-schema';
import type { Container } from 'inversify';
import type { IToolRegistry } from '../core/interfaces/tool-registry.interface.js';
import type { IResourceRegistry } from '../core/interfaces/resource-registry.interface.js';
import type { IPromptRegistry } from '../core/interfaces/prompt-registry.interface.js';
import { logger } from '../utils/logger.js';
import type { ServerConfig } from '../infrastructure/config/types.js';

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
    // Log to stderr only
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

    // Register tools/list handler
    this.mcpServer.setRequestHandler(ListToolsRequestSchema, async () => {
      const result = {
        tools: tools.map(tool => {
          // Convert Zod schema to JSON Schema
          let inputSchema;
          try {
            inputSchema = zodToJsonSchema(tool.schema, {
              target: 'openApi30', // Use OpenAPI 3.0 format which is more compatible
              removeAdditionalStrategy: 'passthrough'
            });

            // Remove the $schema property as MCP doesn't need it
            if ('$schema' in inputSchema) {
              delete inputSchema.$schema;
            }

            // If the schema has definitions, flatten them
            if ('definitions' in inputSchema && '$ref' in inputSchema) {
              const ref = inputSchema.$ref as string;
              const definitionKey = ref.replace('#/definitions/', '');
              if (inputSchema.definitions && typeof inputSchema.definitions === 'object') {
                const definitions = inputSchema.definitions as Record<string, unknown>;
                if (definitionKey in definitions) {
                  inputSchema = definitions[definitionKey] as object;
                }
              }
            }
          } catch (error) {
            logger.warn({ toolName: tool.name, error }, 'Failed to convert tool schema, using generic schema');
            inputSchema = {
              type: 'object',
              additionalProperties: true
            };
          }

          return {
            name: tool.name,
            description: tool.description,
            inputSchema
          };
        })
      };

      return result;
    });

    // Register tools/call handler
    this.mcpServer.setRequestHandler(CallToolRequestSchema, async request => {
      const toolName = request.params?.name;
      const tool = tools.find(t => t.name === toolName);

      if (!tool) {
        const error = new Error(`Unknown tool: ${toolName}`);
        logger.error({ toolName }, error.message);
        throw error;
      }

      try {
        const validatedArgs = tool.schema.parse(request.params?.arguments || {});
        const context = this.createToolContext();
        const result = await tool.execute(validatedArgs, context);

        // Ensure proper response format
        if (!result.content || !Array.isArray(result.content)) {
          return {
            content: [
              {
                type: 'text',
                text: 'Tool executed successfully'
              }
            ],
            isError: false
          };
        }

        return {
          content: result.content,
          isError: false
        };
      } catch (error) {
        logger.error(
          { toolName, error: error instanceof Error ? error.message : String(error) },
          'Tool execution failed'
        );

        // Provide more helpful error messages for validation errors
        let errorMessage = error instanceof Error ? error.message : String(error);

        // Check if it's a Zod validation error and make it more readable
        if (error instanceof Error && error.message.includes('Expected array, received string')) {
          errorMessage = `Parameter validation error: ${error.message}. Please ensure arrays are passed as actual arrays, not JSON strings.`;
        }

        return {
          content: [
            {
              type: 'text',
              text: `Error: ${errorMessage}`
            }
          ],
          isError: true
        };
      }
    });

    logger.debug(`Registered ${tools.length} tools`);
  }

  private async registerResources(): Promise<void> {
    const resourceRegistry = this.container.get<IResourceRegistry>('ResourceRegistry');
    const resources = await resourceRegistry.getAllResources();

    this.mcpServer.setRequestHandler(ListResourcesRequestSchema, async () => {
      return {
        resources: resources.map(resource => ({
          uri: resource.template,
          name: resource.name,
          description: resource.description || 'Resource',
          mimeType: 'text/plain'
        }))
      };
    });

    this.mcpServer.setRequestHandler(ReadResourceRequestSchema, async request => {
      const uri = request.params?.uri;

      if (!uri) {
        const error = new Error('URI is required');
        logger.error('Resource read failed: URI is required');
        throw error;
      }

      const resource = resources.find(r => {
        const template = r.template.replace('{path}', '');
        return uri.startsWith(template);
      });

      if (!resource) {
        const error = new Error(`No resource handler for URI: ${uri}`);
        logger.error({ uri }, error.message);
        throw error;
      }

      try {
        const result = await resource.read(uri, request.params || {});

        if (!result.contents || !Array.isArray(result.contents)) {
          return {
            contents: [
              {
                uri,
                mimeType: 'text/plain',
                text: 'Resource found but returned no content'
              }
            ]
          };
        }

        return result;
      } catch (error) {
        logger.error({ uri, error: error instanceof Error ? error.message : String(error) }, 'Resource read failed');

        return {
          contents: [
            {
              uri,
              mimeType: 'text/plain',
              text: `Error reading resource: ${error instanceof Error ? error.message : String(error)}`
            }
          ]
        };
      }
    });

    logger.debug(`Registered ${resources.length} resources`);
  }

  private async registerPrompts(): Promise<void> {
    const promptRegistry = this.container.get<IPromptRegistry>('PromptRegistry');
    const prompts = await promptRegistry.getAllPrompts();

    this.mcpServer.setRequestHandler(ListPromptsRequestSchema, async () => {
      return {
        prompts: prompts.map(prompt => ({
          name: prompt.name,
          description: prompt.description || 'Prompt',
          arguments: []
        }))
      };
    });

    this.mcpServer.setRequestHandler(GetPromptRequestSchema, async request => {
      const promptName = request.params?.name;
      const prompt = prompts.find(p => p.name === promptName);

      if (!prompt) {
        const error = new Error(`Unknown prompt: ${promptName}`);
        logger.error({ promptName }, error.message);
        throw error;
      }

      try {
        const validatedArgs = prompt.schema.parse(request.params?.arguments || {});
        const result = await prompt.generate(validatedArgs);

        if (!result.messages || !Array.isArray(result.messages)) {
          return {
            description: 'Prompt generated but returned no messages',
            messages: []
          };
        }

        return result;
      } catch (error) {
        logger.error(
          { promptName, error: error instanceof Error ? error.message : String(error) },
          'Prompt generation failed'
        );
        throw error;
      }
    });

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
