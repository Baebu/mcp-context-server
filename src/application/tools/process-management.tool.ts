// src/application/tools/process-management.tool.ts - Final Fixed Version
import { z } from 'zod';
import { injectable, inject } from 'inversify';
import type { IMCPTool, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IEnhancedCLIHandler } from '../../core/interfaces/cli.interface.js'; // Changed import
import { logger } from '../../utils/logger.js';
import { queueManager } from '../../utils/queue-manager.js';

const ProcessManagementSchema = z.object({
  action: z
    .enum([
      'list_processes',
      'get_stats',
      'kill_process',
      'kill_all',
      'update_limits',
      'get_limits',
      'monitor_resources'
    ])
    .describe('Action to perform'),

  processId: z.string().optional().describe('Process ID for kill_process action'),
  signal: z.enum(['SIGTERM', 'SIGKILL']).optional().default('SIGTERM').describe('Signal to send when killing process'),

  limits: z
    .object({
      maxConcurrentProcesses: z.number().int().min(1).max(50).optional(),
      maxProcessMemoryMB: z.number().int().min(64).max(4096).optional(),
      maxProcessCpuPercent: z.number().int().min(10).max(100).optional(),
      defaultTimeoutMs: z.number().int().min(5000).max(1800000).optional(),
      maxTimeoutMs: z.number().int().min(5000).max(1800000).optional(),
      cleanupIntervalMs: z.number().int().min(10000).max(300000).optional(),
      resourceCheckIntervalMs: z.number().int().min(1000).max(60000).optional()
    })
    .optional()
    .describe('Process limits for update_limits action')
});

@injectable()
export class ProcessManagementTool implements IMCPTool {
  name = 'manage_processes';
  description = 'Manage system processes with limits, monitoring, and cleanup';
  schema = ProcessManagementSchema;

  private processTasksQueue = queueManager.getQueue('process-tasks', 2); // Concurrency of 2 for kill tasks

  constructor(
    @inject('CLIHandler') private cliHandler: IEnhancedCLIHandler // Changed type
  ) {}

  async execute(args: z.infer<typeof ProcessManagementSchema>): Promise<ToolResult> {
    try {
      // No longer need to cast cliHandler as any
      const enhancedCLI = this.cliHandler;

      // getProcesses is now part of IEnhancedCLIHandler, so this check is more type-safe
      // but we can rely on the interface contract.
      // if (!enhancedCLI.getProcesses) {
      //   return {
      //     content: [{
      //       type: 'text',
      //       text: '❌ Process management not available - Enhanced CLI adapter not properly initialized'
      //     }]
      //   };
      // }

      switch (args.action) {
        case 'list_processes':
          return this.listProcesses(enhancedCLI);

        case 'get_stats':
          return this.getStats(enhancedCLI);

        case 'kill_process':
          if (!args.processId) {
            throw new Error('processId is required for kill_process action');
          }
          // Use queue for kill_process, explicitly typing the async function and casting the result
          return (await this.processTasksQueue.add(async (): Promise<ToolResult> => {
            return this.killProcess(enhancedCLI, args.processId!, args.signal || 'SIGTERM');
          })) as ToolResult;

        case 'kill_all':
          // Use queue for kill_all, explicitly typing the async function and casting the result
          return (await this.processTasksQueue.add(async (): Promise<ToolResult> => {
            return this.killAllProcesses(enhancedCLI);
          })) as ToolResult;

        case 'update_limits':
          if (!args.limits) {
            throw new Error('limits object is required for update_limits action');
          }
          return this.updateLimits(enhancedCLI, args.limits);

        case 'get_limits':
          return this.getLimits(enhancedCLI);

        case 'monitor_resources':
          return this.monitorResources(enhancedCLI);

        default:
          throw new Error(`Unknown action: ${args.action}`);
      }
    } catch (error) {
      logger.error({ error }, 'Process management tool error');
      return {
        content: [
          {
            type: 'text',
            text: `❌ Error: ${error instanceof Error ? error.message : String(error)}`
          }
        ]
      };
    }
  }

  private listProcesses(enhancedCLI: IEnhancedCLIHandler): ToolResult {
    // Changed type
    const processes = enhancedCLI.getProcesses();

    if (processes.length === 0) {
      return {
        content: [
          {
            type: 'text',
            text: '📋 **Active Processes**\n\nNo active processes currently running.'
          }
        ]
      };
    }

    const processList = processes
      .map(proc => {
        // proc is ProcessInfoPublic
        const duration = Math.round((Date.now() - proc.startTime.getTime()) / 1000);
        return `• **${proc.id}** - ${proc.command} ${proc.args.join(' ')}\n  ├─ PID: ${proc.pid}\n  ├─ Status: ${proc.status}\n  ├─ Duration: ${duration}s\n  ├─ Memory: ${proc.memoryUsage}MB\n  └─ CPU: ${proc.cpuUsage.toFixed(1)}%`;
      })
      .join('\n\n');

    return {
      content: [
        {
          type: 'text',
          text: `📋 **Active Processes** (${processes.length})\n\n${processList}`
        }
      ]
    };
  }

  private getStats(enhancedCLI: IEnhancedCLIHandler): ToolResult {
    // Changed type
    const stats = enhancedCLI.getStats();

    // Generate alerts based on resource usage
    const alerts: string[] = [];
    const systemMemoryPercent = parseFloat(String(stats.systemResources.memoryUsagePercent));

    if (systemMemoryPercent > 85) {
      alerts.push('🚨 **Critical**: System memory usage very high');
    } else if (systemMemoryPercent > 70) {
      alerts.push('⚠️ **Warning**: System memory usage high');
    }

    if (stats.systemResources.loadAverage[0] > stats.systemResources.cpuCount) {
      alerts.push('⚠️ **Warning**: High system load average');
    }

    if (stats.totalMemoryUsageMB > 1000) {
      alerts.push('⚠️ **Warning**: Process memory usage high');
    }

    if (alerts.length === 0) {
      alerts.push('✅ All system resources within normal limits');
    }

    return {
      content: [
        {
          type: 'text',
          text: `📊 **Process Manager Statistics**

**Process Counts:**
• Active: ${stats.activeProcesses}
• Total: ${stats.totalProcesses}
• Completed: ${stats.completedProcesses}
• Failed: ${stats.failedProcesses}
• Timeout: ${stats.timeoutProcesses}
• Killed: ${stats.killedProcesses}

**Resource Usage:**
• Total Process Memory: ${stats.totalMemoryUsageMB} MB
• Total Process CPU: ${stats.totalCpuUsage.toFixed(1)}%

**System Resources:**
• Total Memory: ${stats.systemResources.totalMemory} MB
• Free Memory: ${stats.systemResources.freeMemory} MB
• Memory Usage: ${stats.systemResources.memoryUsagePercent}%
• Load Average: ${stats.systemResources.loadAverage.map((l: number) => l.toFixed(2)).join(', ')}
• Platform: ${stats.systemResources.platform}
• CPU Cores: ${stats.systemResources.cpuCount}

**Node.js Memory:**
• RSS: ${stats.systemResources.nodeMemory.rss} MB
• Heap Total: ${stats.systemResources.nodeMemory.heapTotal} MB
• Heap Used: ${stats.systemResources.nodeMemory.heapUsed} MB
• External: ${stats.systemResources.nodeMemory.external} MB

**Alerts:**
${alerts.join('\n')}`
        }
      ]
    };
  }

  private killProcess(enhancedCLI: IEnhancedCLIHandler, processId: string, signal: 'SIGTERM' | 'SIGKILL'): ToolResult {
    // Changed type
    const processInfo = enhancedCLI.getProcessInfo(processId);

    if (!processInfo) {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Process ${processId} not found`
          }
        ]
      };
    }

    const success = enhancedCLI.killProcess(processId, signal);

    if (success) {
      return {
        content: [
          {
            type: 'text',
            text: `✅ Process ${processId} killed with ${signal}\n\n**Process Details:**\n• Command: ${processInfo.command} ${processInfo.args.join(' ')}\n• PID: ${processInfo.pid}\n• Status: ${processInfo.status}`
          }
        ]
      };
    } else {
      return {
        content: [
          {
            type: 'text',
            text: `❌ Failed to kill process ${processId} - it may have already terminated`
          }
        ]
      };
    }
  }

  private killAllProcesses(enhancedCLI: IEnhancedCLIHandler): ToolResult {
    // Changed type
    const killedCount = enhancedCLI.killAllProcesses();

    return {
      content: [
        {
          type: 'text',
          text: `🛑 **Kill All Processes Complete**\n\n• Processes killed: ${killedCount}\n• All active processes have been terminated`
        }
      ]
    };
  }

  private updateLimits(enhancedCLI: IEnhancedCLIHandler, limits: any): ToolResult {
    // Changed type
    const currentLimits = enhancedCLI.getLimits();
    enhancedCLI.updateLimits(limits); // limits is Partial<ProcessLimitsPublic>
    const newLimits = enhancedCLI.getLimits();

    const changes = Object.keys(limits)
      .map(key => {
        const oldValue = (currentLimits as any)[key];
        const newValue = (newLimits as any)[key];
        return `• ${key}: ${oldValue} → ${newValue}`;
      })
      .join('\n');

    return {
      content: [
        {
          type: 'text',
          text: `⚙️ **Process Limits Updated**\n\n**Changes Made:**\n${changes}\n\n**New Limits:**\n• Max Concurrent: ${newLimits.maxConcurrentProcesses}\n• Max Memory: ${newLimits.maxProcessMemoryMB} MB\n• Max CPU: ${newLimits.maxProcessCpuPercent}%\n• Default Timeout: ${newLimits.defaultTimeoutMs} ms\n• Max Timeout: ${newLimits.maxTimeoutMs} ms`
        }
      ]
    };
  }

  private getLimits(enhancedCLI: IEnhancedCLIHandler): ToolResult {
    // Changed type
    const limits = enhancedCLI.getLimits();

    return {
      content: [
        {
          type: 'text',
          text: `⚙️ **Current Process Limits**

• **Max Concurrent Processes**: ${limits.maxConcurrentProcesses}
• **Max Memory per Process**: ${limits.maxProcessMemoryMB} MB
• **Max CPU per Process**: ${limits.maxProcessCpuPercent}%
• **Default Timeout**: ${limits.defaultTimeoutMs / 1000} seconds
• **Maximum Timeout**: ${limits.maxTimeoutMs / 1000} seconds
• **Cleanup Interval**: ${limits.cleanupIntervalMs / 1000} seconds
• **Resource Check Interval**: ${limits.resourceCheckIntervalMs / 1000} seconds`
        }
      ]
    };
  }

  private monitorResources(enhancedCLI: IEnhancedCLIHandler): ToolResult {
    // Changed type
    const stats = enhancedCLI.getStats();
    const processes = enhancedCLI.getProcesses();

    // Focus on resource monitoring
    const activeProcesses = processes.filter(p => p.status === 'running'); // p is ProcessInfoPublic
    const highMemoryProcesses = activeProcesses.filter(p => p.memoryUsage > 100);
    const highCpuProcesses = activeProcesses.filter(p => p.cpuUsage > 50);

    let monitoringReport = '📈 **Resource Monitoring Report**\n\n';

    // System overview
    monitoringReport += `**System Overview:**\n`;
    monitoringReport += `• Memory: ${stats.systemResources.memoryUsagePercent}% used (${stats.systemResources.freeMemory} MB free)\n`;
    monitoringReport += `• Load: ${stats.systemResources.loadAverage[0].toFixed(2)} (1min avg)\n`;
    monitoringReport += `• Active Processes: ${activeProcesses.length}\n\n`;

    // High resource usage processes
    if (highMemoryProcesses.length > 0) {
      monitoringReport += `**High Memory Usage (>100MB):**\n`;
      highMemoryProcesses.forEach(p => {
        monitoringReport += `• ${p.id}: ${p.memoryUsage}MB - ${p.command}\n`;
      });
      monitoringReport += '\n';
    }

    if (highCpuProcesses.length > 0) {
      monitoringReport += `**High CPU Usage (>50%):**\n`;
      highCpuProcesses.forEach(p => {
        monitoringReport += `• ${p.id}: ${p.cpuUsage.toFixed(1)}% - ${p.command}\n`;
      });
      monitoringReport += '\n';
    }

    // Recommendations
    monitoringReport += `**Recommendations:**\n`;
    if (parseFloat(String(stats.systemResources.memoryUsagePercent)) > 80) {
      // Ensure comparison is numeric
      monitoringReport += `• Consider reducing maxProcessMemoryMB limit\n`;
    }
    if (activeProcesses.length > 3) {
      monitoringReport += `• Consider reducing maxConcurrentProcesses limit\n`;
    }
    if (highMemoryProcesses.length === 0 && highCpuProcesses.length === 0) {
      monitoringReport += `• ✅ All processes within acceptable resource limits\n`;
    }

    return {
      content: [
        {
          type: 'text',
          text: monitoringReport
        }
      ]
    };
  }
}
