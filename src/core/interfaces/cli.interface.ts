export interface CommandResult {
  stdout: string;
  stderr: string;
  exitCode: number;
  signal?: string | null;
  executionTime: number;
}

export interface CommandOptions {
  cwd?: string | undefined;
  env?: Record<string, string> | undefined;
  timeout?: number | undefined;
  shell?: 'default' | 'powershell' | 'bash' | undefined;
}

export interface ICLIHandler {
  execute(params: { command: string; args: string[]; options?: CommandOptions | undefined }): Promise<CommandResult>;
  validateCommand(command: string): Promise<boolean>;
}
