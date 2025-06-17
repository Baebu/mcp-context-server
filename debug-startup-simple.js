#!/usr/bin/env node

/**
 * Simple Debug Startup Script
 * Usage: npm run debug-startup
 */

import { spawn } from 'child_process';
import fs from 'fs';
import path from 'path';

console.log('🔍 MCP Server Startup Diagnostics');
console.log('=====================================');

const startTime = Date.now();
const logFile = path.join(process.cwd(), 'startup-debug.log');

// Clear previous log
if (fs.existsSync(logFile)) {
    fs.unlinkSync(logFile);
}

function log(message) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    fs.appendFileSync(logFile, logMessage + '\n');
}

// Environment variables for debugging
const env = {
    ...process.env,
    NODE_ENV: 'development',
    MCP_LOG_LEVEL: 'debug',
    DEBUG: 'mcp:*'
};

log('🚀 Starting MCP Context Server with debugging...');

// Use the same command as the dev script
const serverProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: env,
    cwd: process.cwd()
});

let isReady = false;
let hasError = false;

// Track critical startup events
serverProcess.stderr.on('data', (data) => {
    const output = data.toString();
    const lines = output.split('\n');
    
    lines.forEach(line => {
        if (line.trim()) {
            log(`STDERR: ${line.trim()}`);
            
            // Check for startup completion
            if (line.includes('MCP Context Server started successfully')) {
                isReady = true;
                const totalTime = Date.now() - startTime;
                log(`✅ Server started successfully in ${totalTime}ms`);
            }
            
            // Check for errors
            if (line.includes('Error') || line.includes('ERROR') || line.includes('FATAL')) {
                hasError = true;
            }
        }
    });
});

serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    if (output.trim()) {
        log(`STDOUT: ${output.trim()}`);
    }
});

serverProcess.on('exit', (code, signal) => {
    const totalTime = Date.now() - startTime;
    log(`\n📊 STARTUP SUMMARY`);
    log(`================`);
    log(`Total startup time: ${totalTime}ms`);
    log(`Exit code: ${code}`);
    log(`Signal: ${signal}`);
    
    if (isReady && code === 0) {
        log('✅ Server started successfully');
    } else if (hasError) {
        log('❌ Server failed to start due to errors');
    } else {
        log('⚠️  Server startup incomplete or interrupted');
    }
    
    log(`\n📄 Full log saved to: ${logFile}`);
    process.exit(code || 0);
});

serverProcess.on('error', (error) => {
    log(`❌ Process error: ${error.message}`);
    process.exit(1);
});

// Timeout after 2 minutes
setTimeout(() => {
    if (!isReady) {
        log('⏰ Startup timeout (2 minutes) - killing process');
        serverProcess.kill('SIGTERM');
        
        setTimeout(() => {
            serverProcess.kill('SIGKILL');
        }, 5000);
    }
}, 120000);

// Handle Ctrl+C gracefully
process.on('SIGINT', () => {
    log('🛑 Received SIGINT - shutting down');
    serverProcess.kill('SIGTERM');
});

process.on('SIGTERM', () => {
    log('🛑 Received SIGTERM - shutting down');
    serverProcess.kill('SIGTERM');
});
