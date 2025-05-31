import { injectable } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolResult, ToolContext } from '@core/interfaces/tool-registry.interface.js';

const getMetricsSchema = z.object({
  category: z.enum(['server', 'database', 'filesystem', 'security']).optional().describe('Specific metric category')
});
type GetMetricsParams = z.infer<typeof getMetricsSchema>;

@injectable()
export class GetMetricsTool implements IMCPTool<GetMetricsParams> {
  name = 'get_metrics';
  description = 'Get server performance metrics and statistics';
  schema = getMetricsSchema;

  private startTime = Date.now();
  private requestCount = 0;
  private errorCount = 0;
  private lastRequestTime = Date.now(); // Call #2 in constructor

  async execute(
    params: GetMetricsParams,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars, no-unused-vars
    _context: ToolContext
  ): Promise<ToolResult> {
    this.requestCount++;
    this.lastRequestTime = Date.now(); // Call #1 in execute (updates)

    const metrics = {
      server: {
        uptime: Date.now() - this.startTime, // Call #2 in execute
        uptimeFormatted: this.formatUptime(Date.now() - this.startTime), // Call #3 in execute
        requestCount: this.requestCount,
        errorCount: this.errorCount,
        lastRequestTime: new Date(this.lastRequestTime).toISOString(),
        memoryUsage: process.memoryUsage(),
        cpuUsage: process.cpuUsage()
      },
      database: {
        connectionCount: 1,
        queryCount: 0,
        averageQueryTime: 0
      },
      filesystem: {
        readOperations: 0,
        writeOperations: 0,
        totalBytesRead: 0,
        totalBytesWritten: 0
      },
      security: {
        validationCount: 0,
        blockedOperations: 0,
        safeZoneViolations: 0
      }
    };

    const resultData =
      params.category && metrics[params.category] ? { [params.category]: metrics[params.category] } : metrics;

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(resultData, null, 2)
        }
      ]
    };
  }

  private formatUptime(ms: number): string {
    const seconds = Math.floor(ms / 1000);
    const minutes = Math.floor(seconds / 60);
    const hours = Math.floor(minutes / 60);
    const days = Math.floor(hours / 24);

    if (days > 0) {
      return `${days}d ${hours % 24}h ${minutes % 60}m`;
    }
    if (hours > 0) {
      return `${hours}h ${minutes % 60}m ${seconds % 60}s`;
    }
    if (minutes > 0) {
      return `${minutes}m ${seconds % 60}s`;
    }
    return `${seconds}s`;
  }
}
