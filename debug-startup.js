#!/usr/bin/env node

/**
 * Debug Startup Script - Identify bottlenecks in MCP server startup
 * Usage: node debug-startup.js
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

function measureTime(startTime, phase) {
    const elapsed = Date.now() - startTime;
    log(`⏱️  ${phase}: ${elapsed}ms`);
    return elapsed;
}

// Environment variables for debugging
const env = {
    ...process.env,
    NODE_ENV: 'development',
    MCP_LOG_LEVEL: 'debug', // Enable debug logging
    DEBUG: 'mcp:*' // Enable all MCP debug logging
};

log('🚀 Starting MCP Context Server...');

const serverProcess = spawn('npx', ['tsx', 'src/index.ts'], {
    stdio: ['pipe', 'pipe', 'pipe'],
    env: env,
    cwd: process.cwd()
});

let phaseStartTime = Date.now();
let isReady = false;

// Track startup phases
const phases = {
    configLoad: false,
    databaseInit: false,
    containerInit: false,
    toolRegistration: false,
    serverStart: false,
    ready: false
};

// Parse stderr for startup phases
serverProcess.stderr.on('data', (data) => {
    const output = data.toString();
    const lines = output.split('\n');
    
    lines.forEach(line => {
        if (line.trim()) {
            // Log all stderr output
            log(`STDERR: ${line.trim()}`);
            
            // Detect startup phases
            if (line.includes('Loading configuration') && !phases.configLoad) {
                phases.configLoad = true;
                measureTime(phaseStartTime, 'Config Loading');
                phaseStartTime = Date.now();
            }
            
            if (line.includes('Initializing database') && !phases.databaseInit) {
                phases.databaseInit = true;
                measureTime(phaseStartTime, 'Database Initialization');
                phaseStartTime = Date.now();
            }
            
            if (line.includes('Initializing container') && !phases.containerInit) {
                phases.containerInit = true;
                measureTime(phaseStartTime, 'Container Initialization');
                phaseStartTime = Date.now();
            }
            
            if (line.includes('tools') && !phases.toolRegistration) {
                phases.toolRegistration = true;
                measureTime(phaseStartTime, 'Tool Registration');
                phaseStartTime = Date.now();
            }
            
            if (line.includes('MCP Context Server started') && !phases.serverStart) {
                phases.serverStart = true;
                measureTime(phaseStartTime, 'Server Start');
                phaseStartTime = Date.now();
                isReady = true;
            }
        }
    });
});

// Parse stdout for any output
serverProcess.stdout.on('data', (data) => {
    const output = data.toString();
    log(`STDOUT: ${output.trim()}`);
});

// Handle process exit
serverProcess.on('exit', (code, signal) => {
    const totalTime = Date.now() - startTime;
    log(`\n📊 STARTUP SUMMARY`);
    log(`================`);
    log(`Total startup time: ${totalTime}ms`);
    log(`Exit code: ${code}`);
    log(`Signal: ${signal}`);
    
    if (isReady) {
        log('✅ Server started successfully');
    } else {
        log('❌ Server failed to start or startup was incomplete');
    }
    
    log(`\n📋 Phase Completion:`);
    Object.entries(phases).forEach(([phase, completed]) => {
        log(`  ${completed ? '✅' : '❌'} ${phase}`);
    });
    
    log(`\n📄 Full log saved to: ${logFile}`);
    process.exit(code);
});

// Handle errors
serverProcess.on('error', (error) => {
    log(`❌ Process error: ${error.message}`);
    process.exit(1);
});

// Timeout after 3 minutes
setTimeout(() => {
    if (!isReady) {
        log('⏰ Startup timeout (3 minutes) - killing process');
        serverProcess.kill('SIGTERM');
        
        setTimeout(() => {
            serverProcess.kill('SIGKILL');
        }, 5000);
    }
}, 180000); // 3 minutes timeout

// Handle Ctrl+C
process.on('SIGINT', () => {
    log('🛑 Received SIGINT - shutting down');
    serverProcess.kill('SIGTERM');
});

process.on('SIGTERM', () => {
    log('🛑 Received SIGTERM - shutting down');
    serverProcess.kill('SIGTERM');
});
