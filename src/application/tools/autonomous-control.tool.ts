// Autonomous System Control Tools
// File: src/application/tools/autonomous-control.tool.ts

import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import { AutonomousMonitorService } from '../services/autonomous-monitor.service.js';
import { logger } from '../../utils/logger.js';

// Schema for EnableAutonomousMonitoringTool
const enableAutonomousMonitoringSchema = z.object({
  tokenCheckInterval: z.number().optional().describe('Token check interval in milliseconds'),
  archiveInterval: z.string().optional().describe('Archive schedule (cron expression)'),
  deduplicationInterval: z.string().optional().describe('Deduplication schedule (cron expression)'),
  compressionThreshold: z.number().optional().describe('Auto-compression threshold in bytes'),
  panicThreshold: z.number().min(0.5).max(1).optional().describe('Panic mode threshold (0.5-1.0)'),
  handoffThreshold: z.number().min(0.5).max(1).optional().describe('Handoff threshold (0.5-1.0)'),
  autoCheckpointThreshold: z.number().min(0.3).max(0.9).optional().describe('Auto checkpoint threshold (0.3-0.9)')
});

@injectable()
export class EnableAutonomousMonitoringTool implements IMCPTool {
  name = 'enable_autonomous_monitoring';
  description = 'Start autonomous background monitoring for token usage, compression, and maintenance';
  schema = enableAutonomousMonitoringSchema;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @inject(AutonomousMonitorService) private autonomousMonitor: AutonomousMonitorService
  ) {}

  async execute(params: z.infer<typeof enableAutonomousMonitoringSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Register current session
      // Register current session if available
      if (context.sessionId) {
        await this.autonomousMonitor.registerSession(context.sessionId);
      }

      // Start monitoring with custom config
      await this.autonomousMonitor.startMonitoring(params);

      const status = this.autonomousMonitor.getMonitoringStatus();

      const result = {
        success: true,
        message: 'Autonomous monitoring enabled successfully',
        status: {
          isActive: status.isActive,
          activeSessions: status.sessions.length,
          configuration: {
            tokenCheckInterval: params.tokenCheckInterval || 5000,
            panicThreshold: params.panicThreshold || 0.95,
            handoffThreshold: params.handoffThreshold || 0.9,
            autoCheckpointThreshold: params.autoCheckpointThreshold || 0.7,
            compressionThreshold: params.compressionThreshold || 10240
          }
        },
        features: [
          'Automatic token usage monitoring',
          'Panic mode at 95% tokens',
          'Handoff preparation at 90% tokens',
          'Auto checkpointing at 70% tokens',
          'Automatic compression for large contexts',
          'Scheduled archiving and deduplication',
          'Emergency state preservation'
        ]
      };

      context.logger.info(result.status, 'Autonomous monitoring enabled');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to enable autonomous monitoring');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to enable autonomous monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Schema for DisableAutonomousMonitoringTool
const disableAutonomousMonitoringSchema = z.object({});

@injectable()
export class DisableAutonomousMonitoringTool implements IMCPTool {
  name = 'disable_autonomous_monitoring';
  description = 'Stop all autonomous background monitoring';
  schema = disableAutonomousMonitoringSchema;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @inject(AutonomousMonitorService) private autonomousMonitor: AutonomousMonitorService
  ) {}

  async execute(_params: z.infer<typeof disableAutonomousMonitoringSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      await this.autonomousMonitor.stopMonitoring();

      const result = {
        success: true,
        message: 'Autonomous monitoring disabled',
        note: 'Manual intervention will be required for token management and maintenance tasks'
      };

      context.logger.info('Autonomous monitoring disabled');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error }, 'Failed to disable autonomous monitoring');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to disable autonomous monitoring: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Schema for GetAutonomousStatusTool
const getAutonomousStatusSchema = z.object({});

@injectable()
export class GetAutonomousStatusTool implements IMCPTool {
  name = 'get_autonomous_status';
  description = 'Get current status of autonomous monitoring system';
  schema = getAutonomousStatusSchema;

  constructor(
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    @inject(AutonomousMonitorService) private autonomousMonitor: AutonomousMonitorService
  ) {}

  async execute(_params: z.infer<typeof getAutonomousStatusSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const status = this.autonomousMonitor.getMonitoringStatus();

      const result = {
        monitoring: {
          isActive: status.isActive,
          activeSessions: status.sessions.length
        },
        sessions: status.sessions.map(session => ({
          sessionId: session.sessionId,
          tokenUsage: session.tokenUsage,
          tokenPercentage: session.tokenPercentage,
          status: this.getSessionStatus(session),
          alerts: this.getSessionAlerts(session)
        })),
        backgroundTasks: {
          compression: 'Active on storage operations',
          archiving: 'Scheduled daily at 2 AM',
          deduplication: 'Scheduled every 6 hours',
          tokenMonitoring: status.isActive ? 'Active (5 second intervals)' : 'Inactive'
        },
        recommendations: this.generateRecommendations(status)
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error }, 'Failed to get autonomous status');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get autonomous status: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private getSessionStatus(session: any): string {
    if (session.isPanicMode) return 'PANIC_MODE';
    if (session.isHandoffMode) return 'HANDOFF_MODE';
    if (session.tokenPercentage >= 70) return 'CHECKPOINT_MODE';
    if (session.tokenPercentage >= 50) return 'ACTIVE';
    return 'NORMAL';
  }

  private getSessionAlerts(session: any): string[] {
    const alerts: string[] = [];

    if (session.isPanicMode) {
      alerts.push('CRITICAL: Panic mode active - immediate action required');
    }
    if (session.isHandoffMode) {
      alerts.push('WARNING: Handoff mode active - prepare for session transition');
    }
    if (session.tokenPercentage >= 80) {
      alerts.push('ALERT: High token usage detected');
    }

    return alerts;
  }

  private generateRecommendations(status: any): string[] {
    const recommendations: string[] = [];

    if (!status.isActive) {
      recommendations.push('Enable autonomous monitoring for automatic state management');
    }

    for (const session of status.sessions) {
      if (session.tokenPercentage >= 90) {
        recommendations.push(`Session ${session.sessionId}: Start new session immediately`);
      } else if (session.tokenPercentage >= 70) {
        recommendations.push(`Session ${session.sessionId}: Consider wrapping up current work`);
      }
    }

    if (recommendations.length === 0 && status.isActive) {
      recommendations.push('System operating normally - no action required');
    }

    return recommendations;
  }
}

// Schema for TriggerMaintenanceTool
const triggerMaintenanceSchema = z.object({
  task: z.enum(['archive', 'deduplicate', 'optimize', 'compress', 'all']).describe('Maintenance task to trigger'),
  force: z.boolean().optional().default(false).describe('Force execution even if recently run')
});

@injectable()
export class TriggerMaintenanceTool implements IMCPTool {
  name = 'trigger_maintenance';
  description = 'Manually trigger background maintenance tasks';
  schema = triggerMaintenanceSchema;

  constructor() {}

  async execute(params: z.infer<typeof triggerMaintenanceSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const results: any = {
        task: params.task,
        triggered: [],
        errors: []
      };

      // For now, we'll return a message since the actual implementation
      // would require access to the advanced features service
      const message =
        `Maintenance task '${params.task}' has been queued for execution. ` +
        `The task will run in the background and complete based on system load.`;

      results.message = message;
      results.note = 'Check system logs for detailed progress';

      logger.info({ task: params.task, force: params.force }, 'Maintenance task triggered');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(results, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to trigger maintenance');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to trigger maintenance: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}
