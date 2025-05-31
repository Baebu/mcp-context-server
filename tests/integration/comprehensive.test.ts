// Fixed integration test file - tests/integration/comprehensive.test.ts
// Replace the entire file content with this corrected version

import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';
// serverProcess is no longer manually managed if transport handles spawning
// import type { ChildProcessWithoutNullStreams } from 'node:child_process';
// import { spawn } from 'node:child_process'; // spawn is no longer manually called here
import path from 'node:path';
import fs from 'node:fs/promises';
import os from 'node:os';

// Increase Jest timeout for these integration tests, especially server startup
jest.setTimeout(60000); // 60 seconds

// Helper type for content items from the MCP SDK
interface TextContentItem {
  type: 'text';
  text: string;
}

interface ResourceContentItem {
  uri: string;
  mimeType?: string;
  text?: string;
}

// Define the response types based on MCP SDK structure
interface ToolCallResponse {
  content: TextContentItem[];
  isError?: boolean;
}

interface ToolsListResponse {
  tools: Array<{
    name: string;
    description?: string;
    inputSchema?: unknown;
  }>;
}

interface ResourcesListResponse {
  resources: Array<{
    name: string;
    uri: string;
    description?: string;
    mimeType?: string;
  }>;
}

interface PromptsListResponse {
  prompts: Array<{
    name: string;
    description?: string;
    arguments?: Array<{
      name: string;
      description?: string;
      required?: boolean;
    }>;
  }>;
}

interface ResourceReadResponse {
  contents: ResourceContentItem[];
}

interface PromptGetResponse {
  description?: string;
  messages: Array<{
    role: string;
    content: {
      type: string;
      text: string;
    };
  }>;
}

describe('MCP Server Comprehensive Integration Tests', () => {
  let client: Client;
  // serverProcess is removed as transport will handle it
  // let serverProcess: ChildProcessWithoutNullStreams;

  const testDir = path.join(os.tmpdir(), 'mcp-comprehensive-tests');
  const safeTestFile = path.join(testDir, 'test_file.txt');
  const safeTestJsonFile = path.join(testDir, 'test_data.json');
  const safeTestYamlFile = path.join(testDir, 'test_data.yaml');
  const safeTestCsvFile = path.join(testDir, 'test_data.csv');
  const contextKey1 = 'testContextItem1';
  const contextKey2 = 'testContextItem2_file';

  beforeAll(async () => {
    await fs.rm(testDir, { recursive: true, force: true });
    await fs.mkdir(testDir, { recursive: true });
    console.log(`Test directory created at: ${testDir}`);

    // Manual server spawning is removed. StdioClientTransport will handle it.
    // console.log('Spawning MCP server for integration tests...');
    // serverProcess = spawn('npm', ['start'], {
    //   cwd: projectRoot,
    //   stdio: ['pipe', 'pipe', 'pipe'],
    //   env: { ...process.env, NODE_ENV: 'development', MCP_LOG_LEVEL: 'error' }
    // });

    // await new Promise<void>((resolve, reject) => {
    //   let output = '';
    //   const readyMessage = 'MCP Context Server started successfully';
    //   const startupTimeout = 45000;

    //   const timeoutId = setTimeout(() => {
    //     console.error(`Server startup output: ${output}`);
    //     reject(new Error(`Server startup timed out after ${startupTimeout / 1000}s`));
    //   }, startupTimeout);

    //   serverProcess.stdout?.on('data', data => {
    //     const dataStr = data.toString();
    //     output += dataStr;
    //     if (dataStr.includes(readyMessage)) {
    //       clearTimeout(timeoutId);
    //       console.log('MCP Server reported as started successfully.');
    //       resolve();
    //     }
    //   });

    //   serverProcess.stderr?.on('data', data => {
    //     const dataStr = data.toString();
    //     output += dataStr;
    //     console.error(`Server stderr: ${dataStr}`);
    //     if (dataStr.toLowerCase().includes('failed to start') || dataStr.toLowerCase().includes('error')) {
    //       if (!output.includes(readyMessage)) {
    //         clearTimeout(timeoutId);
    //         reject(new Error(`Server failed to start: ${dataStr}`));
    //       }
    //     }
    //   });

    //   serverProcess.on('error', err => {
    //     clearTimeout(timeoutId);
    //     console.error('Failed to start server process:', err);
    //     reject(err);
    //   });

    //   serverProcess.on('exit', (code, signal) => {
    //     clearTimeout(timeoutId);
    //     if (code !== 0 && code !== null) {
    //       console.error(`Server process exited prematurely with code ${code}, signal ${signal}. Output: ${output}`);
    //       if (!output.includes(readyMessage)) {
    //         reject(new Error(`Server process exited with code ${code}, signal ${signal}`));
    //       }
    //     }
    //   });
    // });

    console.log('Initializing MCP client transport to spawn and manage server...');
    const transport = new StdioClientTransport({
      command: 'npm',
      args: ['start'],
      env: { ...process.env, NODE_ENV: 'development', MCP_LOG_LEVEL: 'error' }
    });

    client = new Client(
      {
        name: 'integration-test-client',
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

    // client.connect should handle waiting for the server to be ready if the transport spawns it.
    // The increased Jest timeout should cover this.
    await client.connect(transport);
    console.log('MCP Client connected to server managed by transport.');
  });

  afterAll(async () => {
    console.log('Disconnecting client and shutting down server (managed by transport)...');
    if (client) {
      // Original error: ts(2554): Expected 1 arguments, but got 2.
      // This error is unusual for a 0-argument call client.close().
      // It might indicate an SDK type definition issue or an internal SDK problem.
      // Leaving the call as is, assuming close() is a no-argument method.
      await client.close(); // This should signal the transport to terminate its process.
    }
    // Manual serverProcess killing is removed as the transport should handle it.
    // if (serverProcess && !serverProcess.killed) {
    //   const killed = serverProcess.kill('SIGTERM');
    //   if (!killed) {
    //     serverProcess.kill('SIGKILL');
    //   }
    //   await new Promise<void>(resolve => serverProcess.on('exit', () => resolve()));
    // }
    console.log('Cleaning up test directory...');
    await fs.rm(testDir, { recursive: true, force: true });
    console.log('Integration test cleanup complete.');
  });

  describe('Core MCP Handlers', () => {
    it('should list available tools', async () => {
      const response = (await client.listTools()) as ToolsListResponse;
      expect(response.tools).toBeInstanceOf(Array);
      expect(response.tools.length).toBeGreaterThan(0);
      const toolNames = response.tools.map(t => t.name);
      expect(toolNames).toContain('read_file');
      expect(toolNames).toContain('execute_command');
      expect(toolNames).toContain('get_metrics');
    });

    it('should list available resources', async () => {
      const response = (await client.listResources()) as ResourcesListResponse;
      expect(response.resources).toBeInstanceOf(Array);
      expect(response.resources.length).toBeGreaterThan(0);
      expect(response.resources.map(r => r.name)).toContain('project-files');
    });

    it('should list available prompts', async () => {
      const response = (await client.listPrompts()) as PromptsListResponse;
      expect(response.prompts).toBeInstanceOf(Array);
      expect(response.prompts.length).toBeGreaterThan(0);
      expect(response.prompts.map(p => p.name)).toContain('context-summary');
    });
  });

  describe('File Operations Tools', () => {
    const fileContent = 'Hello MCP World from comprehensive test!';
    const appendedContent = '\nMore content appended.';

    it('should write a file using write_file tool', async () => {
      const response = (await client.callTool({
        name: 'write_file',
        arguments: { path: safeTestFile, content: fileContent, createDirs: true }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      expect(firstContent?.text).toContain(`Successfully wrote to file: ${safeTestFile}`);
      const actualContent = await fs.readFile(safeTestFile, 'utf-8');
      expect(actualContent).toBe(fileContent);
    });

    it('should read the file using read_file tool', async () => {
      const response = (await client.callTool({
        name: 'read_file',
        arguments: { path: safeTestFile }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      expect(firstContent?.text).toBe(fileContent);
    });

    it('should append to the file using write_file tool', async () => {
      await client.callTool({
        name: 'write_file',
        arguments: { path: safeTestFile, content: appendedContent, append: true }
      });
      const actualContent = await fs.readFile(safeTestFile, 'utf-8');
      expect(actualContent).toBe(fileContent + appendedContent);
    });

    it('should list directory contents using list_directory tool', async () => {
      const response = (await client.callTool({
        name: 'list_directory',
        arguments: { path: testDir, includeMetadata: true }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const entries = JSON.parse(firstContent?.text || '[]');
      expect(entries).toBeInstanceOf(Array);
      expect(entries.length).toBeGreaterThanOrEqual(1);
      expect(entries.find((e: any) => e.name === 'test_file.txt')).toBeDefined();
    });

    it('should fail to read a non-existent file', async () => {
      const response = (await client.callTool({
        name: 'read_file',
        arguments: { path: path.join(testDir, 'non_existent.txt') }
      })) as ToolCallResponse;

      expect(response.isError).toBe(true);
      const firstContent = response.content[0] as TextContentItem;
      expect(firstContent?.text).toMatch(/File or directory not found|ENOENT/i);
    });

    const veryUnsafePath = path.resolve(os.homedir(), 'very_unsafe_mcp_test_file.txt');
    it('SECURITY: should fail to write outside configured safe zones', async () => {
      const response = (await client.callTool({
        name: 'write_file',
        arguments: { path: veryUnsafePath, content: 'unsafe write attempt' }
      })) as ToolCallResponse;

      expect(response.isError).toBe(true);
      const firstContent = response.content[0] as TextContentItem;
      expect(firstContent?.text).toMatch(/Path access denied/i);
    });
  });

  describe('Command Execution Tool', () => {
    it('should execute a simple echo command', async () => {
      const response = (await client.callTool({
        name: 'execute_command',
        arguments: { command: 'echo', args: ['MCP', 'Command', 'Test'] }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const result = JSON.parse(firstContent?.text || '{}');
      expect(result.stdout).toBe('MCP Command Test');
      expect(result.exitCode).toBe(0);
    });

    it('should execute a command within a specified CWD', async () => {
      await fs.writeFile(path.join(testDir, 'dummy_for_ls.txt'), 'dummy');
      const command = os.platform() === 'win32' ? 'dir' : 'ls';
      const response = (await client.callTool({
        name: 'execute_command',
        arguments: { command, args: [], cwd: testDir }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const result = JSON.parse(firstContent?.text || '{}');
      expect(result.stdout).toContain('dummy_for_ls.txt');
      expect(result.exitCode).toBe(0);
    });

    it('SECURITY: should fail to execute a disallowed command pattern', async () => {
      const response = (await client.callTool({
        name: 'execute_command',
        arguments: { command: 'echo', args: [';', 'rm', '-rf', '/'] }
      })) as ToolCallResponse;

      expect(response.isError).toBe(true);
      const firstContent = response.content[0] as TextContentItem;
      expect(firstContent?.text).toMatch(
        /Potentially dangerous command pattern blocked|Unsafe argument content detected/i
      );
    });
  });

  describe('Context Management Tools', () => {
    const item1 = { message: 'Hello from context item 1', number: 123 };

    it('should store a context item using store_context', async () => {
      const response = (await client.callTool({
        name: 'store_context',
        arguments: { key: contextKey1, value: item1, type: 'test-data' }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      expect(firstContent?.text).toContain(`Context stored successfully with key: ${contextKey1}`);
    });

    it('should retrieve the context item using get_context', async () => {
      const response = (await client.callTool({
        name: 'get_context',
        arguments: { key: contextKey1 }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const result = JSON.parse(firstContent?.text || '{}');
      expect(result.key).toBe(contextKey1);
      expect(result.value).toEqual(item1);
    });

    it('should store file content as context', async () => {
      await fs.writeFile(safeTestFile, 'Content of file for context storage.');
      const fileAsContextResponse = await client.callTool({
        name: 'store_context',
        arguments: { key: contextKey2, value: { filePath: safeTestFile }, type: 'file-ref' }
      });
      expect((fileAsContextResponse as ToolCallResponse).isError).toBeFalsy();
    });

    it('should query context items by type', async () => {
      const response = (await client.callTool({
        name: 'query_context',
        arguments: { type: 'test-data', limit: 5 }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const results = JSON.parse(firstContent?.text || '[]');
      expect(results).toBeInstanceOf(Array);
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((item: any) => item.key === contextKey1 && item.type === 'test-data')).toBe(true);
    });

    it('should query context items by keyPattern', async () => {
      const response = (await client.callTool({
        name: 'query_context',
        arguments: { keyPattern: 'testContextItem', limit: 5 }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const results = JSON.parse(firstContent?.text || '[]');
      expect(results.length).toBeGreaterThanOrEqual(1);
      expect(results.some((item: any) => item.key === contextKey1)).toBe(true);
      expect(results.some((item: any) => item.key === contextKey2)).toBe(true);
    });
  });

  describe('Smart Path Tools', () => {
    const smartPathItemBundleName = 'testItemBundleSP';
    const smartPathFileSetName = 'testFileSetSP';
    let itemBundleId: string;
    let fileSetId: string;

    it('should create an item_bundle smart path', async () => {
      const response = (await client.callTool({
        name: 'create_smart_path',
        arguments: {
          name: smartPathItemBundleName,
          type: 'item_bundle',
          definition: { items: [contextKey1, contextKey2] }
        }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const result = JSON.parse(firstContent?.text || '{}');
      expect(result.success).toBe(true);
      expect(result.name).toBe(smartPathItemBundleName);
      itemBundleId = result.smart_path_id;
      expect(itemBundleId).toBeDefined();
    });

    it('should create a file_set smart path', async () => {
      const response = (await client.callTool({
        name: 'create_smart_path',
        arguments: {
          name: smartPathFileSetName,
          type: 'file_set',
          definition: { paths: [safeTestFile] }
        }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const result = JSON.parse(firstContent?.text || '{}');
      expect(result.success).toBe(true);
      fileSetId = result.smart_path_id;
      expect(fileSetId).toBeDefined();
    });

    it('should list smart paths', async () => {
      const response = (await client.callTool({
        name: 'list_smart_paths',
        arguments: { limit: 10 }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const result = JSON.parse(firstContent?.text || '{}');
      expect(result.smart_paths).toBeInstanceOf(Array);
      expect(result.smart_paths.length).toBeGreaterThanOrEqual(2);
      expect(result.smart_paths.some((sp: any) => sp.id === itemBundleId)).toBe(true);
      expect(result.smart_paths.some((sp: any) => sp.id === fileSetId)).toBe(true);
    });

    it('should execute an item_bundle smart path', async () => {
      const response = (await client.callTool({
        name: 'execute_smart_path',
        arguments: { id: itemBundleId }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const result = JSON.parse(firstContent?.text || '{}');
      expect(result.id).toBe(itemBundleId);
      expect(result.data.items.length).toBe(2);
      expect(result.data.items.find((i: any) => i.key === contextKey1).value.message).toEqual(
        'Hello from context item 1'
      );
    });

    it('should execute a file_set smart path', async () => {
      const response = (await client.callTool({
        name: 'execute_smart_path',
        arguments: { id: fileSetId }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const result = JSON.parse(firstContent?.text || '{}');
      expect(result.id).toBe(fileSetId);
      expect(result.data.files.length).toBe(1);
      expect(result.data.files[0].path).toBe(safeTestFile);
      expect(result.data.files[0].content).toContain('Content of file for context storage.');
    });
  });

  describe('File Parsing Tool', () => {
    const jsonData = { name: 'MCP Test', version: 1, active: true, items: [1, 'two'] };
    const csvData = 'id,name,value\n1,alpha,100\n2,beta,200';

    beforeAll(async () => {
      await fs.writeFile(safeTestJsonFile, JSON.stringify(jsonData, null, 2));
      await fs.writeFile(
        safeTestYamlFile,
        `user:\n  name: Test User\n  role: tester\nsettings:\n  theme: dark\n  notifications: false`
      );
      await fs.writeFile(safeTestCsvFile, csvData);
    });

    it('should parse a JSON file and return full content', async () => {
      const response = (await client.callTool({
        name: 'parse_file',
        arguments: { path: safeTestJsonFile, format: 'json', summaryOnly: false }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const result = JSON.parse(firstContent?.text || '{}');
      expect(result.data).toEqual(jsonData);
      expect(result.summary.type).toBe('object');
    });

    it('should parse a YAML file and return summary', async () => {
      const response = (await client.callTool({
        name: 'parse_file',
        arguments: { path: safeTestYamlFile, format: 'yaml', summaryOnly: true }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const summary = JSON.parse(firstContent?.text || '{}');
      expect(summary.type).toBe('object');
      expect(summary.keys).toContain('user');
      expect(summary.structure.user.type).toBe('object');
    });

    it('should parse a CSV file', async () => {
      const response = (await client.callTool({
        name: 'parse_file',
        arguments: { path: safeTestCsvFile, format: 'csv', summaryOnly: false }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const result = JSON.parse(firstContent?.text || '{}');
      expect(result.data.length).toBe(2);
      expect(result.data[0]).toEqual({ id: '1', name: 'alpha', value: '100' });
      expect(result.summary.rowCount).toBe(2);
      expect(result.summary.headers).toEqual(['id', 'name', 'value']);
    });
  });

  describe('Metrics Tool', () => {
    it('should get all server metrics', async () => {
      const response = (await client.callTool({
        name: 'get_metrics',
        arguments: {}
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const metrics = JSON.parse(firstContent?.text || '{}');
      expect(metrics.server).toBeDefined();
      expect(metrics.server.uptime).toBeGreaterThanOrEqual(0);
      expect(metrics.server.requestCount).toBeGreaterThan(0);
    });

    it('should get specific category metrics (e.g., server)', async () => {
      const response = (await client.callTool({
        name: 'get_metrics',
        arguments: { category: 'server' }
      })) as ToolCallResponse;

      expect(response.isError).toBeFalsy();
      const firstContent = response.content[0] as TextContentItem;
      const metrics = JSON.parse(firstContent?.text || '{}');
      expect(metrics.server).toBeDefined();
      expect(metrics.database).toBeUndefined();
    });
  });

  describe('Resource Reading', () => {
    it('should read a project file using project-files resource', async () => {
      await fs.writeFile(safeTestFile, 'File content for resource test');
      const resourceUri = `file:///${safeTestFile.replace(/\\/g, '/')}`;

      const response = (await client.readResource({ uri: resourceUri })) as ResourceReadResponse;
      expect(response.contents).toBeInstanceOf(Array);
      expect(response.contents.length).toBe(1);
      const firstContent = response.contents[0] as ResourceContentItem;
      expect(firstContent?.uri).toBe(resourceUri);
      expect(firstContent?.text).toBe('File content for resource test');
    });
  });

  describe('Prompt Generation', () => {
    it('should get the context-summary prompt', async () => {
      await client.callTool({
        name: 'store_context',
        arguments: { key: 'summary_ctx_1', value: 'Info A' }
      });
      await client.callTool({
        name: 'store_context',
        arguments: { key: 'summary_ctx_2', value: 'Details B' }
      });

      const response = (await client.getPrompt({
        name: 'context-summary',
        arguments: {
          contextKeys: JSON.stringify(['summary_ctx_1', 'summary_ctx_2']),
          maxLength: '100'
        }
      })) as PromptGetResponse;

      expect(response.messages).toBeInstanceOf(Array);
      expect(response.messages.length).toBe(1);
      const firstMessageContent = response.messages[0]?.content;
      if (!firstMessageContent) {
        // Fixed: Replaced fail() with throw new Error()
        throw new Error('Expected message content to be defined');
      }
      expect(response.messages[0]?.role).toBe('user');
      expect(firstMessageContent.text).toContain('summary of the following context items');
      expect(firstMessageContent.text).toContain('- summary_ctx_1');
      expect(firstMessageContent.text).toContain('- summary_ctx_2');
      expect(firstMessageContent.text).toContain('max 100 characters');
    });
  });
});
