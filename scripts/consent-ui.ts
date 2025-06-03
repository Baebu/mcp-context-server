#!/usr/bin/env node

// Consent UI Launcher Script
// File: scripts/consent-ui.ts

import 'reflect-metadata';
import { Container } from 'inversify';
import { UserConsentService } from '../src/application/services/user-consent.service.js';
import { startConsentUIServer } from '../src/infrastructure/http/consent-server.js';
import type { ISecurityValidator } from '../src/core/interfaces/security.interface.js';
import type { ServerConfig } from '../src/infrastructure/config/types.js';

async function main() {
  try {
    console.log('🛡️  Starting Consent UI Server...\n');

    // Create DI container
    const container = new Container();

    // Mock security validator for standalone operation
    const mockSecurityValidator: ISecurityValidator = {
      async validatePath(path: string): Promise<string> {
        // Simple validation - just check for obviously dangerous paths
        if (path.includes('..') || path.includes('/etc/') || path.includes('C:\\Windows\\')) {
          throw new Error(`Potentially dangerous path: ${path}`);
        }
        return path;
      },
      async validateCommand(command: string, args: string[]): Promise<void> {
        // Simple validation - check for dangerous commands
        const dangerousCommands = ['rm', 'del', 'format', 'rmdir', 'rd'];
        if (dangerousCommands.some(cmd => command.toLowerCase().includes(cmd))) {
          if (args.some(arg => arg.includes('-r') || arg.includes('/s') || arg.includes('*'))) {
            throw new Error(`Potentially dangerous command: ${command} ${args.join(' ')}`);
          }
        }
      },
      isPathInSafeZone(path: string): boolean {
        // Simple check: allow only /home, /tmp, or C:\Users
        return (
          path.startsWith('/home/') ||
          path.startsWith('/tmp/') ||
          path.startsWith('C:\\Users\\')
        );
      },
      sanitizeInput(input: string): string {
        // Remove dangerous characters for demonstration
        return input.replace(/[;&|$><]/g, '');
      },
      // Add mock implementations for optional methods
      getSecurityInfo() {
        return {
          safeZones: ['/home/', '/tmp/', 'C:\\Users\\'],
          restrictedZones: ['/etc/', 'C:\\Windows\\'],
          safeZoneMode: 'recursive',
          blockedPatterns: 0,
        };
      },
      async testPathAccess(path: string) {
        const allowed = mockSecurityValidator.isPathInSafeZone(path) &&
                        !path.includes('/etc/') && !path.includes('C:\\Windows\\');
        return {
          allowed,
          reason: allowed ? 'Path is in a safe zone and not restricted.' : 'Path is not in a safe zone or is restricted.',
          resolvedPath: path,
          inputPath: path,
        };
      }
    };

    // Mock server config for standalone operation
    const mockConfig: ServerConfig = {
      server: {
        name: 'mock-consent-ui-server',
        version: '1.0.0',
        workingDirectory: process.cwd(),
      },
      security: {
        allowedCommands: 'all',
        safezones: ['/tmp', './data'],
        restrictedZones: ['/etc', 'C:\\Windows'],
        maxExecutionTime: 30000,
        maxFileSize: 1048576, // 1MB
        unsafeArgumentPatterns: [],
        autoExpandSafezones: true,
        safeZoneMode: 'recursive',
        blockedPathPatterns: [],
      },
      database: {
        path: './data/consent-ui-mock.db',
        backupInterval: 0, // Disabled for mock
      },
      logging: { level: 'info', pretty: true },
      performance: { maxConcurrency: 5, queueSize: 100 },
    };
    // Bind services
    container.bind<ISecurityValidator>('SecurityValidator').toConstantValue(mockSecurityValidator);
    container.bind<ServerConfig>('Config').toConstantValue(mockConfig as ServerConfig);
    container.bind<UserConsentService>('UserConsentService').to(UserConsentService).inSingletonScope();

    // Get consent service
    const consentService = container.get<UserConsentService>('UserConsentService');

    // Simulate some test data for demonstration
    setTimeout(() => {
      simulateConsentActivity(consentService);
    }, 2000);

    // Start the UI server
    const port = parseInt(process.env.CONSENT_UI_PORT || '3001');
    const server = await startConsentUIServer(consentService, port);

    console.log(`✅ Consent UI Server running at:`);
    console.log(`   • Main UI: http://localhost:${port}`);
    console.log(`   • Direct: http://localhost:${port}/consent`);
    console.log(`   • Health: http://localhost:${port}/health`);
    console.log(`   • API: http://localhost:${port}/api/consent/*`);
    console.log();
    console.log('📱 Open the URL in your browser to manage consent requests');
    console.log('🔄 The UI will update in real-time as consent requests are made');
    console.log();
    console.log('Press Ctrl+C to stop the server');

    // Graceful shutdown
    process.on('SIGINT', async () => {
      console.log('\n🛑 Shutting down Consent UI Server...');
      await server.stop();
      process.exit(0);
    });

    process.on('SIGTERM', async () => {
      console.log('\n🛑 Shutting down Consent UI Server...');
      await server.stop();
      process.exit(0);
    });

  } catch (error) {
    console.error('❌ Failed to start Consent UI Server:', error);
    process.exit(1);
  }
}

function simulateConsentActivity(consentService: UserConsentService) {
  console.log('🧪 Simulating consent activity for demonstration...\n');

  // Simulate some consent requests for testing the UI
  const testRequests = [
    {
      operation: 'file_write' as const,
      severity: 'medium' as const,
      details: {
        path: '/home/user/important-file.txt',
        description: 'Writing configuration data',
        reason: 'Application needs to write configuration data'
      },
      reason: 'Application needs to write configuration data',
      timeout: 30000
    },
    {
      operation: 'command_execute' as const,
      severity: 'high' as const,
      details: {
        command: 'sudo',
        args: ['apt', 'update'],
        description: 'System update required',
        reason: 'System update required'
      },
      reason: 'System package update requested',
      timeout: 45000
    },
    {
      operation: 'recursive_delete' as const,
      severity: 'critical' as const,
      details: {
        path: '/tmp/old-data',
        description: 'Cleanup old temporary files',
        reason: 'Cleanup old temporary files'
      },
      reason: 'Recursive deletion of temporary directory',
      timeout: 60000
    }
  ];

  // Add test requests with delays
  testRequests.forEach((request, index) => {
    setTimeout(async () => {
      try {
        const response = await consentService.requestConsent(request);
        console.log(`📋 Test request ${index + 1} resolved:`, response.decision);
      } catch (error) {
        console.log(`❌ Test request ${index + 1} failed:`, error);
      }
    }, (index + 1) * 10000); // 10 seconds apart
  });

  // Periodically add more test data
  setInterval(() => {
    const randomRequest = testRequests[Math.floor(Math.random() * testRequests.length)];
    const randomizedRequest = {
      ...randomRequest,
      details: {
        ...randomRequest.details,
        path: randomRequest.details.path + '-' + Date.now()
      }
    };

    consentService.requestConsent(randomizedRequest).catch(() => {
      // Ignore errors for simulation
    });
  }, 60000); // Every minute
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch(console.error);
}
