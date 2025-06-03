#!/usr/bin/env node
import 'reflect-metadata';
import { Container } from 'inversify';
import { UserConsentService } from '../src/application/services/user-consent.service.js';
import { startConsentUIServer } from '../src/infrastructure/http/consent-server.js';
async function main() {
    try {
        console.log('🛡️  Starting Consent UI Server...\n');
        const container = new Container();
        const mockSecurityValidator = {
            async validatePath(path) {
                if (path.includes('..') || path.includes('/etc/') || path.includes('C:\\Windows\\')) {
                    throw new Error(`Potentially dangerous path: ${path}`);
                }
                return path;
            },
            async validateCommand(command, args) {
                const dangerousCommands = ['rm', 'del', 'format', 'rmdir', 'rd'];
                if (dangerousCommands.some(cmd => command.toLowerCase().includes(cmd))) {
                    if (args.some(arg => arg.includes('-r') || arg.includes('/s') || arg.includes('*'))) {
                        throw new Error(`Potentially dangerous command: ${command} ${args.join(' ')}`);
                    }
                }
            },
            isPathInSafeZone(path) {
                return (path.startsWith('/home/') ||
                    path.startsWith('/tmp/') ||
                    path.startsWith('C:\\Users\\'));
            },
            sanitizeInput(input) {
                return input.replace(/[;&|$><]/g, '');
            },
            getSecurityInfo() {
                return {
                    safeZones: ['/home', '/tmp', 'C:\\Users'],
                    restrictedZones: ['/etc/', 'C:\\Windows\\'],
                    safeZoneMode: 'recursive',
                    blockedPatterns: 0,
                };
            },
            async testPathAccess(path) {
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
        const mockConfig = {
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
                maxFileSize: 1048576,
                unsafeArgumentPatterns: [],
                autoExpandSafezones: true,
                safeZoneMode: 'recursive',
                blockedPathPatterns: [],
            },
            database: {
                path: './data/consent-ui-mock.db',
                backupInterval: 0,
            },
            logging: { level: 'info', pretty: true },
            performance: { maxConcurrency: 5, queueSize: 100 },
        };
        container.bind('SecurityValidator').toConstantValue(mockSecurityValidator);
        container.bind('Config').toConstantValue(mockConfig);
        container.bind('UserConsentService').to(UserConsentService).inSingletonScope();
        const consentService = container.get('UserConsentService');
        setTimeout(() => {
            simulateConsentActivity(consentService);
        }, 2000);
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
    }
    catch (error) {
        console.error('❌ Failed to start Consent UI Server:', error);
        process.exit(1);
    }
}
function simulateConsentActivity(consentService) {
    console.log('🧪 Simulating consent activity for demonstration...\n');
    const testRequests = [
        {
            details: {
                path: '/home/user/important-file.txt',
                description: 'Writing configuration data',
                reason: 'Application needs to write configuration data'
            },
            reason: 'Application needs to write configuration data',
            timeout: 30000
        },
        {
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
            details: {
                path: '/tmp/old-data',
                description: 'Cleanup old temporary files',
                reason: 'Cleanup old temporary files'
            },
            reason: 'Recursive deletion of temporary directory',
            timeout: 60000
        }
    ];
    testRequests.forEach((request, index) => {
        setTimeout(async () => {
            try {
                const fullRequest = {
                    ...request,
                    operation: request.details.command ? 'command_execute' : (request.details.path ? 'file_access' : 'unknown'),
                    severity: request.details.command?.includes('sudo') ? 'high' : (request.details.path?.includes('/tmp') ? 'low' : 'medium'),
                };
                const response = await consentService.requestConsent(fullRequest);
                console.log(`📋 Test request ${index + 1} resolved:`, response.decision);
            }
            catch (error) {
                console.log(`❌ Test request ${index + 1} failed:`, error);
            }
        }, (index + 1) * 10000);
    });
    setInterval(() => {
        if (testRequests.length === 0) {
            return;
        }
        const randomRequest = testRequests[Math.floor(Math.random() * testRequests.length)];
        const randomizedRequest = {
            ...randomRequest,
            details: {
                ...randomRequest.details,
                path: randomRequest.details.path + '-' + Date.now()
            }
        };
        const fullRandomRequest = {
            ...randomizedRequest,
            operation: randomizedRequest.details.command ? 'command_execute' : (randomizedRequest.details.path ? 'file_access' : 'unknown'),
            severity: randomizedRequest.details.command?.includes('sudo') ? 'high' : (randomizedRequest.details.path?.includes('/tmp') ? 'low' : 'medium'),
        };
        consentService.requestConsent(fullRandomRequest).catch(() => {
        });
    }, 60000);
}
if (import.meta.url === `file://${process.argv[1]}`) {
    main().catch(console.error);
}
