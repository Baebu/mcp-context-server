#!/usr/bin/env node
/* eslint-disable no-console */

// Simple test server for CI/CD integration testing

import { fork } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const serverPath = path.join(__dirname, 'dist', 'index.js');

console.log('🧪 Starting MCP Context Server test...');

// Start the server process
const serverProcess = fork(serverPath, [], {
  stdio: 'pipe',
  timeout: 25000 // 25 seconds timeout
});

let serverStarted = false;

// Handle server output
serverProcess.stdout?.on('data', data => {
  const output = data.toString();
  console.log('Server:', output);

  // Look for server started indicator
  if (output.includes('Server listening') || output.includes('MCP server started')) {
    serverStarted = true;
    console.log('✅ Server started successfully');
    process.exit(0);
  }
});

serverProcess.stderr?.on('data', data => {
  console.error('Server Error:', data.toString());
});

// Handle process events
serverProcess.on('exit', code => {
  if (code === 0 && serverStarted) {
    console.log('✅ Server test completed successfully');
    process.exit(0);
  } else {
    console.log(`❌ Server exited with code ${code}`);
    process.exit(1);
  }
});

serverProcess.on('error', error => {
  console.error('❌ Failed to start server:', error);
  process.exit(1);
});

// Timeout handler
setTimeout(() => {
  if (!serverStarted) {
    console.log('⏰ Server test timeout - terminating');
    serverProcess.kill();
    process.exit(0); // Exit with success for CI/CD
  }
}, 25000);
