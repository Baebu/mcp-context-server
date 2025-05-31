// src/application/tools/command-execution.tool.ts - Enhanced with consent
import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '@core/interfaces/tool-registry.interface.js';
import type { ICLIHandler } from '@core/interfaces/cli.interface.js';
import type { IUserConsentService } from '@core/interfaces/consent.interface.js';

const executeCommandSchema = z.object({
  command: z.string().describe('Command to execute'),
  args: z.array(z.string()).optional().default([]),
  cwd: z.string().optional().describe('Working directory'),
  timeout: z.number().optional().default(30000),
  shell: z.enum(['default', 'powershell', 'bash']).optional().default('default'),
  requireConsent: z.boolean().optional().default(true)
});

@injectable()
export class ExecuteCommandToolWithConsent implements IMCPTool {
  name = 'execute_command';
  description = 'Execute a command with proper security validation, timeout, and user consent';
  schema = executeCommandSchema;

  async execute(params: z.infer<typeof executeCommandSchema>, context: ToolContext): Promise<ToolResult> {
    const cliHandler = context.container.get('CLIHandler') as ICLIHandler;
    const consentService = context.container.get('UserConsentService') as IUserConsentService;

    try {
      // Check if consent is required
      if (params.requireConsent && this.needsConsent(params.command, params.args)) {
        const consentRequest = {
          operation: 'command_execute' as const,
          severity: this.determineSeverity(params.command, params.args),
          details: {
            command: params.command,
            args: params.args,
            description: `Execute: ${params.command} ${params.args.join(' ')}`,
            risks: this.identifyRisks(params.command, params.args)
          }
        };

        const consentResponse = await consentService.requestConsent(consentRequest);

        if (consentResponse.decision !== 'allow') {
          return {
            content: [
              {
                type: 'text',
                text: JSON.stringify(
                  {
                    error: `Command execution denied by user consent: ${consentResponse.decision}`,
                    command: params.command,
                    args: params.args
                  },
                  null,
                  2
                )
              }
            ]
          };
        }
      }

      const result = await cliHandler.execute({
        command: params.command,
        args: params.args,
        options: {
          cwd: params.cwd,
          timeout: params.timeout,
          shell: params.shell
        }
      });

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                stdout: result.stdout,
                stderr: result.stderr,
                exitCode: result.exitCode,
                executionTime: result.executionTime
              },
              null,
              2
            )
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to execute command');
      throw error;
    }
  }

  private needsConsent(command: string, args: string[]): boolean {
    // Always require consent for certain commands
    const alwaysAskCommands = ['rm', 'del', 'sudo', 'chmod', 'chown', 'install', 'uninstall'];
    if (alwaysAskCommands.includes(command)) return true;

    // Check for dangerous patterns in args
    const dangerousPatterns = ['-rf', '--force', '--recursive', 'sudo', '/', 'C:\\'];
    return args.some(arg => dangerousPatterns.some(pattern => arg.includes(pattern)));
  }

  private determineSeverity(command: string, args: string[]): 'low' | 'medium' | 'high' | 'critical' {
    const fullCommand = `${command} ${args.join(' ')}`;

    if (fullCommand.includes('rm -rf') || fullCommand.includes('del /s')) return 'critical';
    if (command === 'sudo' || fullCommand.includes('sudo')) return 'high';
    if (['chmod', 'chown', 'install'].includes(command)) return 'medium';

    return 'low';
  }

  private identifyRisks(command: string, args: string[]): string[] {
    const risks = [];

    if (command === 'rm' || command === 'del') {
      risks.push('Permanent file deletion - data cannot be recovered');
    }
    if (args.includes('-rf') || args.includes('/s')) {
      risks.push('Recursive deletion - will delete entire directory trees');
    }
    if (command === 'sudo' || args.includes('sudo')) {
      risks.push('Elevated privileges - can modify system files');
    }
    if (command === 'chmod' || command === 'chown') {
      risks.push('Permission changes - may affect file accessibility');
    }

    return risks;
  }
}
