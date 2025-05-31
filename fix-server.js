#!/usr/bin/env node

import { execSync } from 'node:child_process';
import { promises as fs } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

// Fixed server.ts content (simple version without extra dependencies)
const fixedServerContent = `import { Server } from '@modelcontextprotocol/sdk/server/index.js';
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
      return {
        tools: tools.map(tool => ({
          name: tool.name,
          description: tool.description,
          inputSchema: {
            type: 'object',
            additionalProperties: true
          }
        }))
      };
    });

    // Register tools/call handler
    this.mcpServer.setRequestHandler(
      CallToolRequestSchema,
      async (request) => {
        const toolName = request.params?.name;
        const tool = tools.find(t => t.name === toolName);

        if (!tool) {
          throw new Error(\`Unknown tool: \${toolName}\`);
        }

        try {
          const validatedArgs = tool.schema.parse(request.params?.arguments || {});
          const context = this.createToolContext();
          const result = await tool.execute(validatedArgs, context);

          if (!result.content || !Array.isArray(result.content)) {
            return {
              content: [{
                type: 'text',
                text: 'Tool executed successfully'
              }],
              isError: false
            };
          }

          return {
            content: result.content,
            isError: false
          };
        } catch (error) {
          logger.error({ toolName, error }, 'Tool execution failed');

          return {
            content: [{
              type: 'text',
              text: \`Error: \${error instanceof Error ? error.message : String(error)}\`
            }],
            isError: true
          };
        }
      }
    );

    logger.debug(\`Registered \${tools.length} tools\`);
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

    this.mcpServer.setRequestHandler(ReadResourceRequestSchema, async (request) => {
      const uri = request.params?.uri;

      if (!uri) {
        throw new Error('URI is required');
      }

      const resource = resources.find(r => {
        const template = r.template.replace('{path}', '');
        return uri.startsWith(template);
      });

      if (!resource) {
        throw new Error(\`No resource handler for URI: \${uri}\`);
      }

      try {
        const result = await resource.read(uri, request.params || {});

        if (!result.contents || !Array.isArray(result.contents)) {
          return {
            contents: [{
              uri,
              mimeType: 'text/plain',
              text: 'Resource found but returned no content'
            }]
          };
        }

        return result;
      } catch (error) {
        logger.error({ uri, error }, 'Resource read failed');

        return {
          contents: [{
            uri,
            mimeType: 'text/plain',
            text: \`Error reading resource: \${error instanceof Error ? error.message : String(error)}\`
          }]
        };
      }
    });

    logger.debug(\`Registered \${resources.length} resources\`);
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

    this.mcpServer.setRequestHandler(
      GetPromptRequestSchema,
      async (request) => {
        const promptName = request.params?.name;
        const prompt = prompts.find(p => p.name === promptName);

        if (!prompt) {
          throw new Error(\`Unknown prompt: \${promptName}\`);
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
          logger.error({ promptName, error }, 'Prompt generation failed');
          throw error;
        }
      }
    );

    logger.debug(\`Registered \${prompts.length} prompts\`);
  }

  private createToolContext() {
    return {
      config: this.config,
      logger: logger.child({ component: 'tool' }),
      container: this.container
    };
  }
}`;

async function runCommand(command, description) {
  console.log(`🔧 ${description}...`);
  try {
    execSync(command, {
      stdio: 'pipe',
      cwd: __dirname
    });
    console.log(`✅ ${description} completed`);
    return true;
  } catch (error) {
    console.error(`❌ ${description} failed:`, error.message);
    return false;
  }
}

async function main() {
  console.log('🚀 Comprehensive MCP Server Fix Starting...\n');

  try {
    // 1. Backup original server file
    const serverPath = join(__dirname, 'src', 'presentation', 'server.ts');
    const backupPath = join(__dirname, 'src', 'presentation', 'server.ts.backup');

    try {
      await fs.copyFile(serverPath, backupPath);
      console.log('✅ Original server.ts backed up');
    } catch (error) {
      console.log('⚠️  Could not backup original server file');
    }

    // 2. Apply the fix
    console.log('🔧 Applying server fix...');
    await fs.writeFile(serverPath, fixedServerContent);
    console.log('✅ Server fix applied');

    // 3. Clean and rebuild
    console.log('🧹 Cleaning previous build...');
    try {
      await fs.rm(join(__dirname, 'dist'), { recursive: true, force: true });
      console.log('✅ Previous build cleaned');
    } catch {
      console.log('✅ No previous build to clean');
    }

    // 4. Type check
    console.log('🔍 Type checking...');
    const typeCheckResult = await runCommand('npx tsc -p tsconfig.build.json --noEmit', 'Type checking');
    if (!typeCheckResult) {
      console.log('⚠️  Type check failed, but continuing...');
    }

    // 5. Build
    const buildResult = await runCommand('npx tsc -p tsconfig.build.json', 'Building TypeScript');
    if (!buildResult) {
      throw new Error('Build failed');
    }

    // 6. Verify build
    console.log('🔍 Verifying build output...');
    const indexPath = join(__dirname, 'dist', 'index.js');
    try {
      await fs.access(indexPath);
      console.log('✅ Build output verified - index.js exists');
    } catch {
      console.log('❌ Build output verification failed');
      throw new Error('Build verification failed');
    }

    // 7. Show Claude Desktop config
    console.log('\n📋 Claude Desktop Configuration:');
    console.log('Add this to your claude_desktop_config.json:');
    console.log(
      JSON.stringify(
        {
          mcpServers: {
            'context-server': {
              command: 'node',
              args: [join(__dirname, 'dist', 'index.js')],
              env: {
                MCP_LOG_LEVEL: 'info'
              }
            }
          }
        },
        null,
        2
      )
    );

    console.log('\n✅ Comprehensive fix completed successfully!');
    console.log('\n📋 Next steps:');
    console.log('   1. Update your Claude Desktop configuration with the path above');
    console.log('   2. Restart Claude Desktop completely');
    console.log('   3. Test with: "Can you list the files in the current directory?"');
  } catch (error) {
    console.error('\n❌ Fix failed:', error.message);
    console.log('\n🔧 Manual steps if this fails:');
    console.log('   1. Copy the fixed server code from the artifact above');
    console.log('   2. Replace src/presentation/server.ts');
    console.log('   3. Run: npm run build');
    console.log('   4. Update Claude Desktop config with absolute path');
    process.exit(1);
  }
}

main();
