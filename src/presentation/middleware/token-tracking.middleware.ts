// Token Tracking Middleware for MCP
// File: src/presentation/middleware/token-tracking.middleware.ts

import type { ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import { TokenTracker } from '../../utils/token-tracker.js';
import { AutonomousMonitorService } from '../../application/services/autonomous-monitor.service.js';
import { logger } from '../../utils/logger.js';

export class TokenTrackingMiddleware {
  constructor(private autonomousMonitor: AutonomousMonitorService) {}

  /**
   * Wrap tool execution to track token usage
   */
  async wrapToolExecution(
    toolName: string,
    params: unknown,
    context: ToolContext,
    executeFunction: () => Promise<ToolResult>
  ): Promise<ToolResult> {
    const startTime = Date.now();
    const sessionId = context.sessionId || TokenTracker.generateSessionId();

    // Estimate input tokens
    const inputTokens = TokenTracker.estimateTokens({
      tool: toolName,
      params
    });

    try {
      // Execute the actual tool
      const result = await executeFunction();

      // Estimate output tokens
      const outputTokens = TokenTracker.estimateTokens(result);
      const totalTokens = inputTokens + outputTokens;

      // Update session state in autonomous monitor
      await this.autonomousMonitor.updateSessionState(sessionId, `tool:${toolName}`, totalTokens);

      // Log token usage
      logger.debug(
        {
          sessionId,
          tool: toolName,
          inputTokens,
          outputTokens,
          totalTokens,
          duration: Date.now() - startTime
        },
        'Tool execution token tracking'
      );

      // Add token info to result metadata if possible
      if (typeof result === 'object' && result !== null) {
        (result as any).__tokenUsage = {
          input: inputTokens,
          output: outputTokens,
          total: totalTokens
        };
      }

      return result;
    } catch (error) {
      // Still track tokens even on error
      await this.autonomousMonitor.updateSessionState(sessionId, `tool:${toolName}:error`, inputTokens);

      throw error;
    }
  }

  /**
   * Create middleware for MCP server
   */
  createMCPMiddleware() {
    return {
      beforeToolExecution: async (toolName: string, params: unknown, context: ToolContext) => {
        // Register session if not exists
        if (context.sessionId) {
          await this.autonomousMonitor.registerSession(context.sessionId);
        }

        // Return wrapped execution function
        return {
          execute: (originalExecute: () => Promise<ToolResult>) =>
            this.wrapToolExecution(toolName, params, context, originalExecute)
        };
      }
    };
  }
}

/**
 * Create a tool wrapper that automatically tracks tokens
 */
export function withTokenTracking<T extends (...args: any[]) => Promise<ToolResult>>(
  executeFunction: T,
  autonomousMonitor: AutonomousMonitorService
): T {
  return (async (...args: Parameters<T>) => {
    const [params, context] = args;
    const middleware = new TokenTrackingMiddleware(autonomousMonitor);

    return middleware.wrapToolExecution('wrapped_tool', params, context as ToolContext, () => executeFunction(...args));
  }) as T;
}
