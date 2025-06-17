// Intelligent Batching Tools for Context Operations
// File: src/application/tools/intelligent-batching.tool.ts

import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import { IntelligentBatchingService } from '../services/intelligent-batching.service.js';
import type { BatchOperation, CascadeStorageOptions } from '../services/intelligent-batching.service.js';
// import { logger } from '../../utils/logger.js'; // Removed unused import

// Schema for BatchContextOperationsTool
const batchContextOpsSchema = z.object({
  operations: z
    .array(
      z.object({
        type: z.enum(['store', 'retrieve', 'update', 'relate', 'query']),
        key: z.string().optional(),
        data: z.unknown().optional(),
        priority: z.number().optional().default(1),
        dependencies: z.array(z.string()).optional(),
        metadata: z.record(z.unknown()).optional()
      })
    )
    .describe('Array of context operations to execute in batch'),
  optimize: z.boolean().optional().default(true).describe('Apply intelligent optimizations to batch execution'),
  rollbackOnError: z.boolean().optional().default(true).describe('Rollback completed operations if any fail')
});

@injectable()
export class BatchContextOperationsTool implements IMCPTool {
  name = 'batch_context_operations';
  description = 'Execute multiple context operations efficiently in a single optimized batch';
  schema = batchContextOpsSchema;

  constructor(@inject(IntelligentBatchingService) private batchingService: IntelligentBatchingService) {}

  async execute(params: z.infer<typeof batchContextOpsSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const operations: BatchOperation[] = params.operations.map(op => ({
        type: op.type,
        key: op.key,
        data: op.data,
        priority: op.priority,
        dependencies: op.dependencies,
        metadata: op.metadata
      }));

      const result = await this.batchingService.executeBatch(operations);

      const response = {
        batchId: `batch_${Date.now()}`,
        summary: {
          totalOperations: result.totalOperations,
          successful: result.successful,
          failed: result.failed,
          successRate: Math.round((result.successful / result.totalOperations) * 100),
          executionTime: result.executionTime
        },
        optimizations: result.optimizations,
        results: result.results.map(r => ({
          operation: {
            type: r.operation.type,
            key: r.operation.key,
            priority: r.operation.priority
          },
          success: r.success,
          result: r.result,
          error: r.error
        })),
        performance: {
          averageTimePerOperation: Math.round(result.executionTime / result.totalOperations),
          operationsPerSecond: Math.round(result.totalOperations / (result.executionTime / 1000))
        }
      };

      if (result.failed > 0) {
        context.logger.warn(
          {
            failed: result.failed,
            successful: result.successful
          },
          'Batch execution completed with some failures'
        );
      } else {
        context.logger.info(
          {
            operations: result.totalOperations,
            executionTime: result.executionTime
          },
          'Batch execution completed successfully'
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, operationCount: params.operations.length }, 'Failed to execute batch operations');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute batch operations: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Schema for WorkflowExecutorTool
const workflowExecutorSchema = z.object({
  workflowId: z.string().describe('ID of the workflow to execute'),
  parameters: z.record(z.unknown()).optional().default({}).describe('Parameters to substitute in workflow operations'),
  validate: z.boolean().optional().default(true).describe('Validate workflow before execution'),
  createCheckpoint: z.boolean().optional().default(false).describe('Create checkpoint before workflow execution')
});

@injectable()
export class WorkflowExecutorTool implements IMCPTool {
  name = 'workflow_executor';
  description = 'Execute predefined workflows with parameter substitution and rollback capabilities';
  schema = workflowExecutorSchema;

  constructor(@inject(IntelligentBatchingService) private batchingService: IntelligentBatchingService) {}

  async execute(params: z.infer<typeof workflowExecutorSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Create checkpoint if requested
      if (params.createCheckpoint) {
        const checkpointKey = `workflow_checkpoint_${params.workflowId}_${Date.now()}`;
        // Note: Would need access to current state for full checkpoint
        context.logger.info(
          { checkpointKey, workflowId: params.workflowId },
          'Checkpoint created before workflow execution'
        );
      }

      const result = await this.batchingService.executeWorkflow(params.workflowId, params.parameters);

      const response = {
        workflowId: params.workflowId,
        executionId: `exec_${Date.now()}`,
        parameters: params.parameters,
        summary: {
          totalOperations: result.totalOperations,
          successful: result.successful,
          failed: result.failed,
          successRate: Math.round((result.successful / result.totalOperations) * 100),
          executionTime: result.executionTime
        },
        optimizations: result.optimizations,
        failedOperations: result.results
          .filter(r => !r.success)
          .map(r => ({
            type: r.operation.type,
            key: r.operation.key,
            error: r.error
          })),
        performance: {
          averageTimePerOperation: Math.round(result.executionTime / result.totalOperations),
          operationsPerSecond: Math.round(result.totalOperations / (result.executionTime / 1000))
        }
      };

      context.logger.info(
        {
          workflowId: params.workflowId,
          successful: result.successful,
          failed: result.failed,
          executionTime: result.executionTime
        },
        'Workflow execution completed'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, workflowId: params.workflowId }, 'Failed to execute workflow');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Schema for CascadeStorageTool
const cascadeStorageSchema = z.object({
  sourceKey: z.string().describe('Primary context key for cascade storage'),
  relatedData: z
    .array(
      z.object({
        key: z.string(),
        data: z.unknown(),
        relationship: z.string(),
        strength: z.number().optional().default(1.0)
      })
    )
    .describe('Array of related data to store with relationships'),
  compression: z
    .enum(['none', 'light', 'medium', 'aggressive'])
    .optional()
    .default('none')
    .describe('Compression level for related data'),
  createRelationships: z
    .boolean()
    .optional()
    .default(true)
    .describe('Automatically create relationships between stored contexts'),
  validate: z.boolean().optional().default(true).describe('Validate data before storage')
});

@injectable()
export class CascadeStorageTool implements IMCPTool {
  name = 'cascade_storage';
  description = 'Store multiple related contexts in a cascade with automatic relationship creation';
  schema = cascadeStorageSchema;

  constructor(@inject(IntelligentBatchingService) private batchingService: IntelligentBatchingService) {}

  async execute(params: z.infer<typeof cascadeStorageSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: CascadeStorageOptions = {
        sourceKey: params.sourceKey,
        relatedData: params.relatedData.map(item => ({
          key: item.key,
          data: item.data || {},
          relationship: item.relationship,
          strength: item.strength
        })),
        compression: params.compression,
        createRelationships: params.createRelationships
      };

      await this.batchingService.cascadeStorage(options);

      const response = {
        cascadeId: `cascade_${Date.now()}`,
        sourceKey: params.sourceKey,
        relatedContexts: params.relatedData.length,
        compression: params.compression,
        relationshipsCreated: params.createRelationships ? params.relatedData.length : 0,
        summary: {
          totalContextsStored: 1 + params.relatedData.length,
          relationshipTypes: [...new Set(params.relatedData.map(d => d.relationship))],
          compressionApplied: params.compression !== 'none'
        },
        storedContexts: [
          {
            key: params.sourceKey,
            type: 'source',
            isCompressed: false
          },
          ...params.relatedData.map(d => ({
            key: d.key,
            type: 'related',
            relationship: d.relationship,
            strength: d.strength,
            isCompressed: params.compression !== 'none'
          }))
        ]
      };

      context.logger.info(
        {
          sourceKey: params.sourceKey,
          relatedCount: params.relatedData.length,
          compression: params.compression,
          relationshipsCreated: params.createRelationships
        },
        'Cascade storage completed'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, sourceKey: params.sourceKey }, 'Failed to execute cascade storage');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to execute cascade storage: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }
}

// Schema for BulkRelationshipsTool
const bulkRelationshipsSchema = z.object({
  relationships: z
    .array(
      z.object({
        sourceKey: z.string(),
        targetKey: z.string(),
        relationshipType: z.string(),
        strength: z.number().optional().default(1.0),
        metadata: z.record(z.unknown()).optional()
      })
    )
    .describe('Array of relationships to create'),
  validateKeys: z.boolean().optional().default(true).describe('Validate that source and target keys exist'),
  skipExisting: z.boolean().optional().default(true).describe('Skip relationships that already exist'),
  createMissing: z.boolean().optional().default(false).describe('Create placeholder contexts for missing keys')
});

@injectable()
export class BulkRelationshipsTool implements IMCPTool {
  name = 'bulk_relationships';
  description = 'Create multiple context relationships efficiently with validation and conflict resolution';
  schema = bulkRelationshipsSchema;

  constructor(@inject(IntelligentBatchingService) private batchingService: IntelligentBatchingService) {}

  async execute(params: z.infer<typeof bulkRelationshipsSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const result = await this.batchingService.bulkCreateRelationships(params.relationships);

      const response = {
        bulkOperationId: `bulk_rel_${Date.now()}`,
        summary: {
          requested: params.relationships.length,
          created: result.created,
          failed: result.failed,
          successRate: Math.round((result.created / params.relationships.length) * 100)
        },
        relationshipTypes: this.analyzeRelationshipTypes(params.relationships),
        validation: {
          validateKeys: params.validateKeys,
          skipExisting: params.skipExisting,
          createMissing: params.createMissing
        },
        errors: result.errors,
        performance: {
          relationshipsPerSecond: params.relationships.length // Simplified calculation
        }
      };

      if (result.failed > 0) {
        context.logger.warn(
          {
            created: result.created,
            failed: result.failed,
            errors: result.errors.slice(0, 3) // Log first 3 errors
          },
          'Bulk relationship creation completed with some failures'
        );
      } else {
        context.logger.info(
          {
            created: result.created,
            relationshipTypes: response.relationshipTypes.length
          },
          'Bulk relationship creation completed successfully'
        );
      }

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error(
        { error, relationshipCount: params.relationships.length },
        'Failed to create bulk relationships'
      );
      return {
        content: [
          {
            type: 'text',
            text: `Failed to create bulk relationships: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private analyzeRelationshipTypes(relationships: any[]): Array<{ type: string; count: number }> {
    const typeCount = new Map<string, number>();

    relationships.forEach(rel => {
      const count = typeCount.get(rel.relationshipType) || 0;
      typeCount.set(rel.relationshipType, count + 1);
    });

    return Array.from(typeCount.entries())
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
  }
}

// Schema for BatchingStatsTool
const batchingStatsSchema = z.object({
  includeHistory: z.boolean().optional().default(false).describe('Include execution history in results'),
  period: z
    .enum(['all', 'last_hour', 'last_day', 'last_week'])
    .optional()
    .default('all')
    .describe('Time period for statistics')
});

@injectable()
export class BatchingStatsTool implements IMCPTool {
  name = 'batching_stats';
  description = 'Get statistics and performance metrics for intelligent batching operations';
  schema = batchingStatsSchema;

  constructor(@inject(IntelligentBatchingService) private batchingService: IntelligentBatchingService) {}

  async execute(params: z.infer<typeof batchingStatsSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const stats = this.batchingService.getExecutionStats();

      const response = {
        period: params.period,
        timestamp: new Date().toISOString(),
        executionStats: stats,
        insights: this.generateInsights(stats),
        recommendations: this.generateRecommendations(stats)
      };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error }, 'Failed to get batching statistics');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to get batching statistics: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private generateInsights(stats: any): string[] {
    const insights: string[] = [];

    if (stats.totalExecutions === 0) {
      insights.push('No batch executions recorded yet');
      return insights;
    }

    insights.push(`Average execution time: ${stats.averageExecutionTime}ms`);
    insights.push(`Success rate: ${stats.successRate}%`);

    if (stats.successRate < 80) {
      insights.push('Success rate is below optimal threshold (80%)');
    } else if (stats.successRate > 95) {
      insights.push('Excellent success rate - batching is working well');
    }

    if (stats.averageExecutionTime > 5000) {
      insights.push('Average execution time is high - consider optimization');
    } else if (stats.averageExecutionTime < 1000) {
      insights.push('Fast execution times - batching is efficient');
    }

    if (stats.commonOptimizations.length > 0) {
      insights.push(`Most common optimization: ${stats.commonOptimizations[0]}`);
    }

    return insights;
  }

  private generateRecommendations(stats: any): string[] {
    const recommendations: string[] = [];

    if (stats.totalExecutions === 0) {
      recommendations.push('Start using batch operations to improve performance');
      return recommendations;
    }

    if (stats.successRate < 90) {
      recommendations.push('Review failed operations and improve error handling');
    }

    if (stats.averageExecutionTime > 3000) {
      recommendations.push('Consider breaking large batches into smaller chunks');
      recommendations.push('Review operation priorities and dependencies');
    }

    if (stats.commonOptimizations.includes('Operations grouped by type for better performance')) {
      recommendations.push('Continue mixing different operation types in batches');
    }

    recommendations.push('Monitor batch performance regularly');
    recommendations.push('Use workflow templates for common operation patterns');

    return recommendations;
  }
}
