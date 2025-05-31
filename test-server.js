#!/usr/bin/env node

import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const __dirname = dirname(fileURLToPath(import.meta.url));

function testMCPServer() {
  console.error('🧪 Testing MCP Server Communication...\n');

  const serverPath = join(__dirname, 'dist', 'index.js');

  // Start the server
  const server = spawn('node', [serverPath], {
    stdio: ['pipe', 'pipe', 'inherit'], // stdin, stdout, stderr
    env: { ...process.env, MCP_LOG_LEVEL: 'info' }
  });

  let stdoutData = '';
  let hasInitialized = false;

  server.stdout.on('data', (data) => {
    stdoutData += data.toString();

    // Look for complete JSON messages
    const lines = stdoutData.split('\n');
    stdoutData = lines.pop() || ''; // Keep incomplete line

    for (const line of lines) {
      if (line.trim()) {
        try {
          const message = JSON.parse(line);
          console.error('📨 Received message:', JSON.stringify(message, null, 2));

          if (message.result && message.result.serverInfo) {
            console.error('✅ Server initialized successfully');
            hasInitialized = true;

            // Test tools/list
            setTimeout(() => {
              console.error('🔧 Testing tools/list...');
              server.stdin.write(JSON.stringify({
                jsonrpc: '2.0',
                method: 'tools/list',
                params: {},
                id: 2
              }) + '\n');
            }, 100);
          }

          if (message.result && message.result.tools) {
            console.error(`✅ Tools list received: ${message.result.tools.length} tools`);
            console.error('🎉 MCP Server is working correctly!');
            server.kill();
            process.exit(0);
          }

        } catch (error) {
          console.error('❌ Invalid JSON received:', line);
          console.error('❌ This indicates stdout contamination!');
          server.kill();
          process.exit(1);
        }
      }
    }
  });

  server.on('error', (error) => {
    console.error('❌ Server error:', error.message);
    process.exit(1);
  });

  server.on('exit', (code) => {
    if (code !== 0 && !hasInitialized) {
      console.error(`❌ Server exited with code ${code}`);
      process.exit(1);
    }
  });

  // Send initialization message
  console.error('📤 Sending initialization message...');
  server.stdin.write(JSON.stringify({
    jsonrpc: '2.0',
    method: 'initialize',
    params: {
      protocolVersion: '2024-11-05',
      capabilities: {},
      clientInfo: {
        name: 'test-client',
        version: '1.0.0'
      }
    },
    id: 1
  }) + '\n');

  // Timeout after 10 seconds
  setTimeout(() => {
    console.error('❌ Test timeout - server may not be responding');
    server.kill();
    process.exit(1);
  }, 10000);
}

testMCPServer();
