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
  visibleTerminal?: boolean | undefined;
  terminalType?: 'cmd' | 'powershell' | 'wt' | 'terminal' | 'auto' | undefined;
  keepOpen?: boolean | undefined;
  title?: string | undefined;
}

export interface ICLIHandler {
  execute(params: { command: string; args: string[]; options?: CommandOptions | undefined }): Promise<CommandResult>;
  validateCommand(command: string): Promise<boolean>;
}

// Publicly safe Process Information
export interface ProcessInfoPublic {
  id: string;
  command: string;
  args: string[];
  pid: number;
  startTime: Date;
  memoryUsage: number; // MB
  cpuUsage: number; // Percentage
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'killed';
}

// Process Limits (can be same as internal for now)
export interface ProcessLimitsPublic {
  maxConcurrentProcesses: number;
  maxProcessMemoryMB: number;
  maxProcessCpuPercent: number;
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
  cleanupIntervalMs: number;
  resourceCheckIntervalMs: number;
}

// Process Manager Stats (can be same as internal for now)
export interface ProcessManagerStatsPublic {
  activeProcesses: number;
  totalProcesses: number;
  completedProcesses: number;
  failedProcesses: number;
  timeoutProcesses: number;
  killedProcesses: number;
  totalMemoryUsageMB: number;
  totalCpuUsage: number;
}

// Enhanced CLI Handler Interface
export interface IEnhancedCLIHandler extends ICLIHandler {
  getProcesses(): ProcessInfoPublic[];
  getProcessInfo(processId: string): ProcessInfoPublic | undefined;
  killProcess(processId: string, signal?: 'SIGTERM' | 'SIGKILL'): boolean;
  killAllProcesses(): number;
  getStats(): ProcessManagerStatsPublic & { systemResources: any }; // systemResources can remain 'any' for flexibility
  updateLimits(newLimits: Partial<ProcessLimitsPublic>): void;
  getLimits(): ProcessLimitsPublic;
  shutdown(): void;
}
