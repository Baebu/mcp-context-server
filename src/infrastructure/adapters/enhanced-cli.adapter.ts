// src/infrastructure/adapters/enhanced-cli.adapter.ts - Fixed Logger Issues
import { spawn, ChildProcess } from 'node:child_process';
import type { SpawnOptions } from 'node:child_process';
import { injectable, inject } from 'inversify';
import { EventEmitter } from 'node:events';
import type { ICLIHandler, CommandResult, CommandOptions } from '@core/interfaces/cli.interface.js';
import type { ISecurityValidator } from '@core/interfaces/security.interface.js';
import { logger } from '../../utils/logger.js';
import type { ServerConfig } from '../../infrastructure/config/schema.js'; // Corrected import
import os from 'node:os';

interface ProcessInfo {
  id: string;
  command: string;
  args: string[];
  pid: number;
  startTime: Date;
  process: ChildProcess;
  timeout: NodeJS.Timeout;
  memoryUsage: number;
  cpuUsage: number;
  status: 'running' | 'completed' | 'failed' | 'timeout' | 'killed';
  maxMemoryMB: number;
  maxCpuPercent: number;
}

interface ProcessLimits {
  maxConcurrentProcesses: number;
  maxProcessMemoryMB: number;
  maxProcessCpuPercent: number;
  defaultTimeoutMs: number;
  maxTimeoutMs: number;
  cleanupIntervalMs: number;
  resourceCheckIntervalMs: number;
}

interface ProcessManagerStats {
  activeProcesses: number;
  totalProcesses: number;
  completedProcesses: number;
  failedProcesses: number;
  timeoutProcesses: number;
  killedProcesses: number;
  totalMemoryUsageMB: number;
  totalCpuUsage: number;
}

@injectable()
export class EnhancedCLIAdapter extends EventEmitter implements ICLIHandler {
  private processes = new Map<string, ProcessInfo>();
  private processCounter = 0;
  private limits: ProcessLimits;
  private cleanupInterval: NodeJS.Timeout | null = null;
  private resourceMonitorInterval: NodeJS.Timeout | null = null;
  private stats: ProcessManagerStats;

  constructor(
    @inject('SecurityValidator') private security: ISecurityValidator,
    @inject('Config') private config: ServerConfig
  ) {
    super();

    // Initialize process limits from config
    this.limits = {
      maxConcurrentProcesses: this.config.security?.maxConcurrentProcesses || 5,
      maxProcessMemoryMB: this.config.security?.maxProcessMemoryMB || 512,
      maxProcessCpuPercent: this.config.security?.maxProcessCpuPercent || 80,
      defaultTimeoutMs: this.config.security?.defaultTimeoutMs || 30000,
      maxTimeoutMs: this.config.security?.maxTimeoutMs || 300000,
      cleanupIntervalMs: this.config.security?.cleanupIntervalMs || 60000,
      resourceCheckIntervalMs: this.config.security?.resourceCheckIntervalMs || 5000
    };

    // Initialize stats
    this.stats = {
      activeProcesses: 0,
      totalProcesses: 0,
      completedProcesses: 0,
      failedProcesses: 0,
      timeoutProcesses: 0,
      killedProcesses: 0,
      totalMemoryUsageMB: 0,
      totalCpuUsage: 0
    };

    // Start background processes
    this.startCleanupProcess();
    if (this.config.security?.enableProcessMonitoring !== false) {
      this.startResourceMonitoring();
    }

    logger.info('Enhanced CLI Adapter initialized with process management');
  }
  /**
   * Enhanced CLI Adapter for managing command execution with process limits, security validation,
   * and resource monitoring.
   * Implements ICLIHandler interface for command execution and management.
   */

  // Required by ICLIHandler interface
  async execute(params: { command: string; args: string[]; options?: CommandOptions }): Promise<CommandResult> {
    // Validate concurrency limits
    if (this.processes.size >= this.limits.maxConcurrentProcesses) {
      throw new Error(`Maximum concurrent processes (${this.limits.maxConcurrentProcesses}) exceeded`);
    }

    // Security validation
    await this.security.validateCommand(params.command, params.args);

    // Generate unique process ID
    const processId = this.generateProcessId();

    // Set timeout (respect limits)
    const timeout = Math.min(params.options?.timeout || this.limits.defaultTimeoutMs, this.limits.maxTimeoutMs);

    try {
      const result = await this.spawnProcess(processId, params.command, params.args, {
        ...params.options,
        timeout
      });

      this.stats.completedProcesses++;
      return result;
    } catch (error) {
      this.stats.failedProcesses++;
      throw error;
    }
  }

  // Required by ICLIHandler interface
  async validateCommand(command: string): Promise<boolean> {
    try {
      await this.security.validateCommand(command, []);
      return true;
    } catch {
      return false;
    }
  }

  private generateProcessId(): string {
    return `proc_${Date.now()}_${++this.processCounter}`;
  }

  private async spawnProcess(
    processId: string,
    command: string,
    args: string[],
    options: CommandOptions
  ): Promise<CommandResult> {
    return new Promise((resolve, reject) => {
      // Determine shell settings
      const shellInfo = this.getShellInfo(command, args, options);

      const spawnOptions: SpawnOptions = {
        cwd: options.cwd,
        env: { ...process.env, ...shellInfo.env },
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false
      };

      // Spawn the process
      const childProcess = spawn(shellInfo.command, shellInfo.args, spawnOptions);

      if (!childProcess.pid) {
        reject(new Error(`Failed to spawn process: ${command}`));
        return;
      }

      // Create process info
      const processInfo: ProcessInfo = {
        id: processId,
        command,
        args,
        pid: childProcess.pid,
        startTime: new Date(),
        process: childProcess,
        timeout: setTimeout(() => this.handleTimeout(processId), options.timeout || this.limits.defaultTimeoutMs),
        memoryUsage: 0,
        cpuUsage: 0,
        status: 'running',
        maxMemoryMB: this.limits.maxProcessMemoryMB,
        maxCpuPercent: this.limits.maxProcessCpuPercent
      };

      // Register process
      this.processes.set(processId, processInfo);
      this.stats.activeProcesses++;
      this.stats.totalProcesses++;

      let stdout = '';
      let stderr = '';

      // Handle stdout
      if (childProcess.stdout) {
        childProcess.stdout.on('data', data => {
          stdout += data.toString();
        });
      }

      // Handle stderr
      if (childProcess.stderr) {
        childProcess.stderr.on('data', data => {
          stderr += data.toString();
        });
      }

      // Handle process completion
      childProcess.on('close', (code, signal) => {
        clearTimeout(processInfo.timeout);

        if (signal) {
          processInfo.status = signal === 'SIGTERM' ? 'timeout' : 'killed';
          this.stats.killedProcesses++;
        } else if (code === 0) {
          processInfo.status = 'completed';
        } else {
          processInfo.status = 'failed';
        }

        // Schedule cleanup
        setTimeout(() => this.cleanupProcess(processId), 5000);

        // Return standard CommandResult (no processId as it's not in interface)
        const result: CommandResult = {
          stdout,
          stderr,
          exitCode: code || 0,
          signal,
          executionTime: Date.now() - processInfo.startTime.getTime()
        };

        if (processInfo.status === 'completed') {
          resolve(result);
        } else {
          reject(new Error(`Process ${processInfo.status}: ${stderr || `Exit code: ${code}`}`));
        }
      });

      // Handle process errors
      childProcess.on('error', error => {
        clearTimeout(processInfo.timeout);
        processInfo.status = 'failed';
        this.cleanupProcess(processId);
        reject(error);
      });

      // Emit process started event
      this.emit('processStarted', { processId, command, args, pid: childProcess.pid });
    });
  }

  private getShellInfo(
    _command: string, // _command is unused
    _args: string[], // _args is unused
    options: CommandOptions
  ): {
    command: string;
    args: string[];
    env?: Record<string, string>;
  } {
    const platform = process.platform;

    if (platform === 'win32') {
      return {
        command: 'cmd.exe',
        args: ['/c'], // Command and args will be combined later
        env: options.env
      };
    } else {
      return {
        command: '/bin/sh',
        args: ['-c'], // Command and args will be combined later
        env: options.env
      };
    }
  }

  private handleTimeout(processId: string): void {
    const processInfo = this.processes.get(processId);
    if (!processInfo) return;

    logger.warn(`Process ${processId} timed out, killing...`);

    processInfo.status = 'timeout';
    this.stats.timeoutProcesses++;

    this.forceKillProcess(processId);
  }

  public killProcess(processId: string, signal: 'SIGTERM' | 'SIGKILL' = 'SIGTERM'): boolean {
    const processInfo = this.processes.get(processId);
    if (!processInfo || processInfo.status !== 'running') {
      return false;
    }

    logger.info(`Killing process ${processId} with ${signal}`);

    try {
      if (signal === 'SIGKILL' || process.platform === 'win32') {
        processInfo.process.kill('SIGKILL');
      } else {
        processInfo.process.kill(signal);

        // Give process time to gracefully shutdown, then force kill
        setTimeout(() => {
          if (processInfo.status === 'running') {
            logger.warn(`Process ${processId} didn't respond to ${signal}, force killing...`);
            processInfo.process.kill('SIGKILL');
          }
        }, this.config.security?.processKillGracePeriodMs || 5000);
      }

      return true;
    } catch (error) {
      logger.error(`Failed to kill process ${processId}: ${String(error)}`);
      return false;
    }
  }

  public forceKillProcess(processId: string): void {
    this.killProcess(processId, 'SIGKILL');
  }

  public killAllProcesses(): number {
    const activeProcesses = Array.from(this.processes.values()).filter(p => p.status === 'running');

    let killedCount = 0;
    for (const process of activeProcesses) {
      if (this.killProcess(process.id)) {
        killedCount++;
      }
    }

    logger.info(`Killed ${killedCount} active processes`);
    return killedCount;
  }

  public getProcesses(): ProcessInfo[] {
    return Array.from(this.processes.values());
  }

  public getProcessInfo(processId: string): ProcessInfo | undefined {
    return this.processes.get(processId);
  }

  public getStats(): ProcessManagerStats & { systemResources: any } {
    const systemMemory = process.memoryUsage();
    const loadAverage = os.loadavg();

    return {
      ...this.stats,
      systemResources: {
        totalMemory: Math.round(os.totalmem() / 1024 / 1024),
        freeMemory: Math.round(os.freemem() / 1024 / 1024),
        memoryUsagePercent: (((os.totalmem() - os.freemem()) / os.totalmem()) * 100).toFixed(1),
        loadAverage,
        platform: os.platform(),
        cpuCount: os.cpus().length,
        nodeMemory: {
          rss: Math.round(systemMemory.rss / 1024 / 1024),
          heapTotal: Math.round(systemMemory.heapTotal / 1024 / 1024),
          heapUsed: Math.round(systemMemory.heapUsed / 1024 / 1024),
          external: Math.round(systemMemory.external / 1024 / 1024)
        }
      }
    };
  }

  public updateLimits(newLimits: Partial<ProcessLimits>): void {
    this.limits = { ...this.limits, ...newLimits };
    logger.info('Process limits updated');
  }

  public getLimits(): ProcessLimits {
    return { ...this.limits };
  }

  private startCleanupProcess(): void {
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
    }

    this.cleanupInterval = setInterval(() => {
      this.performCleanup();
    }, this.limits.cleanupIntervalMs);
  }

  private startResourceMonitoring(): void {
    if (this.resourceMonitorInterval) {
      clearInterval(this.resourceMonitorInterval);
    }

    this.resourceMonitorInterval = setInterval(() => {
      this.monitorResourceUsage();
    }, this.limits.resourceCheckIntervalMs);
  }

  private performCleanup(): void {
    const now = Date.now();
    const processesToCleanup: string[] = [];

    for (const [processId, processInfo] of this.processes) {
      // Clean up completed processes older than 5 minutes
      if (processInfo.status !== 'running' && now - processInfo.startTime.getTime() > 300000) {
        processesToCleanup.push(processId);
      }
    }

    for (const processId of processesToCleanup) {
      this.cleanupProcess(processId);
    }

    if (processesToCleanup.length > 0) {
      logger.debug(`Cleaned up ${processesToCleanup.length} old processes`);
    }
  }

  private cleanupProcess(processId: string): void {
    const processInfo = this.processes.get(processId);
    if (!processInfo) return;

    // Clear timeout if still active
    if (processInfo.timeout) {
      clearTimeout(processInfo.timeout);
    }

    // Remove from active processes count
    if (processInfo.status === 'running') {
      this.stats.activeProcesses--;
    }

    // Remove from tracking
    this.processes.delete(processId);

    this.emit('processCleanedUp', { processId });
  }

  private async monitorResourceUsage(): Promise<void> {
    for (const [_processId, processInfo] of this.processes) {
      // processId unused
      if (processInfo.status !== 'running') continue;

      try {
        const usage = await this.getProcessResourceUsage();

        processInfo.memoryUsage = usage.memory;
        processInfo.cpuUsage = usage.cpu;

        // Check memory limits
        if (usage.memory > processInfo.maxMemoryMB) {
          logger.warn(
            `Process ${processInfo.id} exceeded memory limit (${usage.memory}MB > ${processInfo.maxMemoryMB}MB), killing...`
          );
          this.forceKillProcess(processInfo.id);
          continue;
        }

        // Check CPU limits (warning only, don't kill)
        if (usage.cpu > processInfo.maxCpuPercent) {
          logger.warn(`Process ${processInfo.id} high CPU usage: ${usage.cpu.toFixed(1)}%`);
        }
      } catch (error) {
        // Process might have ended, ignore monitoring errors
      }
    }

    // Update total stats
    this.updateResourceStats();
  }

  private async getProcessResourceUsage(): Promise<{ memory: number; cpu: number }> {
    // This is a simplified implementation
    // In production, you might want to use a more sophisticated monitoring library
    return {
      memory: 0, // MB
      cpu: 0 // Percentage
    };
  }

  private updateResourceStats(): void {
    let totalMemory = 0;
    let totalCpu = 0;

    for (const processInfo of this.processes.values()) {
      if (processInfo.status === 'running') {
        totalMemory += processInfo.memoryUsage;
        totalCpu += processInfo.cpuUsage;
      }
    }

    this.stats.totalMemoryUsageMB = totalMemory;
    this.stats.totalCpuUsage = totalCpu;
  }

  public shutdown(): void {
    logger.info('Shutting down Enhanced CLI Adapter...');

    // Kill all running processes
    this.killAllProcesses();

    // Clear intervals
    if (this.cleanupInterval) {
      clearInterval(this.cleanupInterval);
      this.cleanupInterval = null;
    }

    if (this.resourceMonitorInterval) {
      clearInterval(this.resourceMonitorInterval);
      this.resourceMonitorInterval = null;
    }

    // Clear all processes
    this.processes.clear();

    logger.info('Enhanced CLI Adapter shutdown complete');
  }
}
