import { spawn } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import { injectable, inject } from 'inversify';
import type { ICLIHandler, CommandResult, CommandOptions } from '@core/interfaces/cli.interface.js';
import type { ISecurityValidator } from '@core/interfaces/security.interface.js';
import { logger } from '@utils/logger.js';

@injectable()
export class CLIAdapter implements ICLIHandler {
  constructor(@inject('SecurityValidator') private security: ISecurityValidator) {}

  async execute(params: { command: string; args: string[]; options?: CommandOptions }): Promise<CommandResult> {
    // Validate command and arguments
    await this.security.validateCommand(params.command, params.args);

    if (params.options?.cwd) {
      await this.security.validatePath(params.options.cwd);
    }

    const startTime = Date.now();

    return new Promise((resolve, reject) => {
      const spawnOptions: SpawnOptions = {
        cwd: params.options?.cwd,
        env: { ...process.env, ...params.options?.env },
        timeout: params.options?.timeout || 30000,
        windowsHide: true
      };

      // Handle different shell types
      let command = params.command;
      let args = params.args;

      if (params.options?.shell === 'powershell') {
        command = 'powershell.exe';
        args = ['-Command', `${params.command} ${params.args.join(' ')}`];
      } else if (params.options?.shell === 'bash') {
        command = 'bash';
        args = ['-c', `${params.command} ${params.args.join(' ')}`];
      }

      const child = spawn(command, args, spawnOptions);

      let stdout = '';
      let stderr = '';

      child.stdout?.on('data', data => {
        stdout += data.toString();
      });

      child.stderr?.on('data', data => {
        stderr += data.toString();
      });

      child.on('close', (code, signal) => {
        const executionTime = Date.now() - startTime;

        logger.debug(
          {
            command: params.command,
            exitCode: code,
            executionTime
          },
          'Command executed'
        );

        resolve({
          stdout: stdout.trim(),
          stderr: stderr.trim(),
          exitCode: code || 0,
          signal,
          executionTime
        });
      });

      child.on('error', error => {
        logger.error({ error, command: params.command }, 'Command execution failed');
        reject(error);
      });
    });
  }

  async validateCommand(command: string): Promise<boolean> {
    try {
      await this.security.validateCommand(command, []);
      return true;
    } catch {
      return false;
    }
  }
}
