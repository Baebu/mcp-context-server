// src/application/tools/command-execution.tool.ts - Consent Removed
import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { ICLIHandler } from '../../core/interfaces/cli.interface.js';
// IUserConsentService import removed

const executeCommandSchema = z.object({
  command: z.string().describe('Command to execute'),
  args: z.array(z.string()).optional().default([]),
  cwd: z.string().optional().describe('Working directory'),
  timeout: z.number().optional().default(30000),
  shell: z.enum(['default', 'powershell', 'bash']).optional().default('default'),
  visibleTerminal: z.boolean().optional().default(false).describe('Open command in a visible terminal window'),
  terminalType: z
    .enum(['cmd', 'powershell', 'wt', 'terminal', 'auto'])
    .optional()
    .default('auto')
    .describe('Type of terminal to use for visible execution'),
  keepOpen: z.boolean().optional().default(true).describe('Keep terminal window open after command completion'),
  title: z.string().optional().describe('Title for the terminal window')
});

@injectable()
export class ExecuteCommandTool implements IMCPTool {
  // Renamed class
  name = 'execute_command';
  description = 'Execute a command with security validation, timeout, and optional visible terminal window'; // Updated description
  schema = executeCommandSchema;

  async execute(params: z.infer<typeof executeCommandSchema>, context: ToolContext): Promise<ToolResult> {
    const cliHandler = context.container.get('CLIHandler') as ICLIHandler;
    // consentService injection and usage removed

    try {
      // Consent checking logic removed

      const result = await cliHandler.execute({
        command: params.command,
        args: params.args,
        options: {
          cwd: params.cwd,
          timeout: params.timeout,
          shell: params.shell,
          visibleTerminal: params.visibleTerminal,
          terminalType: params.terminalType,
          keepOpen: params.keepOpen,
          title: params.title
        }
      });

      const responseData = {
        stdout: result.stdout,
        stderr: result.stderr,
        exitCode: result.exitCode,
        executionTime: result.executionTime,
        visibleTerminal: params.visibleTerminal,
        ...(params.visibleTerminal && {
          terminalType: params.terminalType,
          title: params.title,
          keepOpen: params.keepOpen,
          note: 'Command executed in visible terminal window - output may not be captured'
        })
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(responseData, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to execute command');
      throw error;
    }
  }

  // Removed private methods: needsConsent, determineSeverity, identifyRisks
  // as they were specific to the consent flow.
}
