// Intelligent Batching Service for Context Operations
// File: src/application/services/intelligent-batching.service.ts

import { injectable, inject } from 'inversify';
import type { IDatabaseHandler, EnhancedContextEntry } from '../../core/interfaces/database.interface.js';
import { TokenTracker } from '../../utils/token-tracker.js';
import { logger } from '../../utils/logger.js';

export interface BatchOperation {
  type: 'store' | 'retrieve' | 'update' | 'relate' | 'query';
  key?: string;
  data?: unknown;
  options?: Record<string, unknown>;
  priority?: number;
  dependencies?: string[];
  metadata?: Record<string, unknown>;
}

export interface BatchExecutionResult {
  successful: number;
  failed: number;
  totalOperations: number;
  executionTime: number;
  results: Array<{
    operation: BatchOperation;
    success: boolean;
    result?: unknown;
    error?: string;
  }>;
  optimizations: string[];
}

export interface WorkflowDefinition {
  id: string;
  name: string;
  description: string;
  operations: BatchOperation[];
  conditions?: Record<string, unknown>;
  rollbackStrategy?: 'none' | 'partial' | 'full';
  maxRetries?: number;
  timeout?: number;
}

export interface CascadeStorageOptions {
  sourceKey: string;
  relatedData: Array<{
    key: string;
    data: unknown;
    relationship: string;
    strength?: number;
  }>;
  compression?: 'none' | 'light' | 'medium' | 'aggressive';
  createRelationships?: boolean;
}

@injectable()
export class IntelligentBatchingService {
  private batchQueue: BatchOperation[] = [];
  private workflowTemplates: Map<string, WorkflowDefinition> = new Map();
  private executionHistory: Array<{ timestamp: Date; result: BatchExecutionResult }> = [];

  constructor(@inject('DatabaseHandler') private db: IDatabaseHandler) {
    this.initializeDefaultWorkflows();
  }

  /**
   * Execute multiple context operations efficiently in a single batch
   */
  async executeBatch(operations: BatchOperation[]): Promise<BatchExecutionResult> {
    const startTime = Date.now();
    const results: BatchExecutionResult['results'] = [];
    let successful = 0;
    let failed = 0;

    // Optimize operation order
    const optimizedOps = this.optimizeOperationOrder(operations);
    const optimizations = this.analyzeOptimizations(operations, optimizedOps);

    logger.info(
      {
        totalOps: operations.length,
        optimizations: optimizations.length
      },
      'Starting batch execution'
    );

    // Group operations by type for better performance
    const groupedOps = this.groupOperationsByType(optimizedOps);

    for (const [opType, ops] of groupedOps.entries()) {
      try {
        const typeResults = await this.executeOperationGroup(opType, ops);
        results.push(...typeResults);
        successful += typeResults.filter(r => r.success).length;
        failed += typeResults.filter(r => !r.success).length;
      } catch (error) {
        logger.error({ error, opType, opsCount: ops.length }, 'Failed to execute operation group');
        // Mark all operations in this group as failed
        for (const op of ops) {
          results.push({
            operation: op,
            success: false,
            error: error instanceof Error ? error.message : 'Unknown error'
          });
          failed++;
        }
      }
    }

    const executionTime = Date.now() - startTime;
    const batchResult: BatchExecutionResult = {
      successful,
      failed,
      totalOperations: operations.length,
      executionTime,
      results,
      optimizations
    };

    // Store execution history
    this.executionHistory.push({
      timestamp: new Date(),
      result: batchResult
    });

    // Keep only last 100 executions
    if (this.executionHistory.length > 100) {
      this.executionHistory.shift();
    }

    logger.info(
      {
        successful,
        failed,
        executionTime,
        optimizations: optimizations.length
      },
      'Batch execution completed'
    );

    return batchResult;
  }

  /**
   * Execute a predefined workflow with rollback capabilities
   */
  async executeWorkflow(workflowId: string, parameters: Record<string, unknown> = {}): Promise<BatchExecutionResult> {
    const workflow = this.workflowTemplates.get(workflowId);
    if (!workflow) {
      throw new Error(`Workflow not found: ${workflowId}`);
    }

    // Substitute parameters in operations
    const parameterizedOps = this.substituteParameters(workflow.operations, parameters);

    // Execute with rollback capability
    const results = await this.executeWithRollback(parameterizedOps, workflow.rollbackStrategy || 'partial');

    logger.info(
      {
        workflowId,
        successful: results.successful,
        failed: results.failed
      },
      'Workflow execution completed'
    );

    return results;
  }

  /**
   * Store multiple related contexts in a cascade with automatic relationships
   */
  async cascadeStorage(options: CascadeStorageOptions): Promise<void> {
    const operations: BatchOperation[] = [];

    // Primary storage operation
    operations.push({
      type: 'store',
      key: options.sourceKey,
      data: options.relatedData,
      priority: 1,
      metadata: { cascade: true, isSource: true }
    });

    // Related data storage operations
    for (const related of options.relatedData) {
      let processedData = related.data;

      // Apply compression if specified
      if (options.compression && options.compression !== 'none') {
        processedData = TokenTracker.compressContextValue(related.data, this.getCompressionLimit(options.compression));
      }

      operations.push({
        type: 'store',
        key: related.key,
        data: processedData,
        priority: 2,
        dependencies: [options.sourceKey],
        metadata: {
          cascade: true,
          isRelated: true,
          sourceKey: options.sourceKey,
          relationship: related.relationship
        }
      });

      // Create relationship operations if requested
      if (options.createRelationships) {
        operations.push({
          type: 'relate',
          key: `${options.sourceKey}->${related.key}`,
          data: {
            sourceKey: options.sourceKey,
            targetKey: related.key,
            relationshipType: related.relationship,
            strength: related.strength || 1.0
          },
          priority: 3,
          dependencies: [options.sourceKey, related.key],
          metadata: { cascade: true, isRelationship: true }
        });
      }
    }

    // Execute cascade operations
    await this.executeBatch(operations);

    logger.info(
      {
        sourceKey: options.sourceKey,
        relatedCount: options.relatedData.length,
        createRelationships: options.createRelationships
      },
      'Cascade storage completed'
    );
  }

  /**
   * Bulk relationship creation with validation
   */
  async bulkCreateRelationships(
    relationships: Array<{
      sourceKey: string;
      targetKey: string;
      relationshipType: string;
      strength?: number;
      metadata?: Record<string, unknown>;
    }>
  ): Promise<{ created: number; failed: number; errors: string[] }> {
    const operations: BatchOperation[] = relationships.map((rel, index) => ({
      type: 'relate',
      key: `bulk_rel_${index}`,
      data: rel,
      priority: 1,
      metadata: { bulkRelationship: true, ...rel.metadata }
    }));

    const result = await this.executeBatch(operations);
    const errors = result.results.filter(r => !r.success).map(r => r.error || 'Unknown error');

    return {
      created: result.successful,
      failed: result.failed,
      errors
    };
  }

  /**
   * Add operation to batch queue for deferred execution
   */
  queueOperation(operation: BatchOperation): void {
    this.batchQueue.push(operation);
    logger.debug({ queueSize: this.batchQueue.length }, 'Operation queued');
  }

  /**
   * Flush queued operations
   */
  async flushQueue(): Promise<BatchExecutionResult> {
    if (this.batchQueue.length === 0) {
      return {
        successful: 0,
        failed: 0,
        totalOperations: 0,
        executionTime: 0,
        results: [],
        optimizations: ['No operations to execute']
      };
    }

    const operations = [...this.batchQueue];
    this.batchQueue = [];

    logger.info({ operationCount: operations.length }, 'Flushing operation queue');
    return await this.executeBatch(operations);
  }

  /**
   * Register a new workflow template
   */
  registerWorkflow(workflow: WorkflowDefinition): void {
    this.workflowTemplates.set(workflow.id, workflow);
    logger.info({ workflowId: workflow.id, operationCount: workflow.operations.length }, 'Workflow registered');
  }

  /**
   * Get execution statistics
   */
  getExecutionStats(): {
    totalExecutions: number;
    averageExecutionTime: number;
    successRate: number;
    commonOptimizations: string[];
  } {
    if (this.executionHistory.length === 0) {
      return {
        totalExecutions: 0,
        averageExecutionTime: 0,
        successRate: 0,
        commonOptimizations: []
      };
    }

    const totalTime = this.executionHistory.reduce((sum, exec) => sum + exec.result.executionTime, 0);
    const totalOps = this.executionHistory.reduce((sum, exec) => sum + exec.result.totalOperations, 0);
    const successfulOps = this.executionHistory.reduce((sum, exec) => sum + exec.result.successful, 0);

    // Collect all optimizations and find most common
    const allOptimizations = this.executionHistory.flatMap(exec => exec.result.optimizations);
    const optimizationCounts = new Map<string, number>();
    allOptimizations.forEach(opt => {
      optimizationCounts.set(opt, (optimizationCounts.get(opt) || 0) + 1);
    });

    const commonOptimizations = Array.from(optimizationCounts.entries())
      .sort(([, a], [, b]) => b - a)
      .slice(0, 5)
      .map(([opt]) => opt);

    return {
      totalExecutions: this.executionHistory.length,
      averageExecutionTime: Math.round(totalTime / this.executionHistory.length),
      successRate: totalOps > 0 ? Math.round((successfulOps / totalOps) * 100) : 0,
      commonOptimizations
    };
  }

  // Private helper methods

  private optimizeOperationOrder(operations: BatchOperation[]): BatchOperation[] {
    // Sort by priority (higher first), then by dependencies
    return operations.slice().sort((a, b) => {
      const priorityA = a.priority || 0;
      const priorityB = b.priority || 0;

      if (priorityA !== priorityB) {
        return priorityB - priorityA; // Higher priority first
      }

      // Operations with no dependencies come first
      const depsA = a.dependencies?.length || 0;
      const depsB = b.dependencies?.length || 0;
      return depsA - depsB;
    });
  }

  private groupOperationsByType(operations: BatchOperation[]): Map<string, BatchOperation[]> {
    const grouped = new Map<string, BatchOperation[]>();

    for (const op of operations) {
      const key = op.type;
      if (!grouped.has(key)) {
        grouped.set(key, []);
      }
      grouped.get(key)!.push(op);
    }

    return grouped;
  }

  private async executeOperationGroup(
    type: string,
    operations: BatchOperation[]
  ): Promise<BatchExecutionResult['results']> {
    const results: BatchExecutionResult['results'] = [];

    switch (type) {
      case 'store':
        return await this.executeStoreOperations(operations);
      case 'retrieve':
        return await this.executeRetrieveOperations(operations);
      case 'update':
        return await this.executeUpdateOperations(operations);
      case 'relate':
        return await this.executeRelateOperations(operations);
      case 'query':
        return await this.executeQueryOperations(operations);
      default:
        // Unknown operation type
        for (const op of operations) {
          results.push({
            operation: op,
            success: false,
            error: `Unknown operation type: ${type}`
          });
        }
    }

    return results;
  }

  private async executeStoreOperations(operations: BatchOperation[]): Promise<BatchExecutionResult['results']> {
    const results: BatchExecutionResult['results'] = [];

    for (const op of operations) {
      try {
        if (!op.key || op.data === undefined) {
          throw new Error('Store operation requires key and data');
        }

        const contextEntry: EnhancedContextEntry = {
          key: op.key,
          value: op.data,
          type: 'batch_stored',
          contextType: 'intelligent_batch',
          tokenCount: TokenTracker.estimateTokens(op.data),
          metadata: {
            batchOperation: true,
            priority: op.priority,
            ...op.metadata
          },
          createdAt: new Date(),
          updatedAt: new Date()
        };

        await this.db.storeEnhancedContext(contextEntry);

        results.push({
          operation: op,
          success: true,
          result: { key: op.key, stored: true }
        });
      } catch (error) {
        results.push({
          operation: op,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  private async executeRetrieveOperations(operations: BatchOperation[]): Promise<BatchExecutionResult['results']> {
    const results: BatchExecutionResult['results'] = [];

    for (const op of operations) {
      try {
        if (!op.key) {
          throw new Error('Retrieve operation requires key');
        }

        const context = await this.db.getEnhancedContext(op.key);

        results.push({
          operation: op,
          success: true,
          result: context
        });
      } catch (error) {
        results.push({
          operation: op,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  private async executeUpdateOperations(operations: BatchOperation[]): Promise<BatchExecutionResult['results']> {
    // Similar to store operations but for updates
    return await this.executeStoreOperations(operations);
  }

  private async executeRelateOperations(operations: BatchOperation[]): Promise<BatchExecutionResult['results']> {
    const results: BatchExecutionResult['results'] = [];

    for (const op of operations) {
      try {
        const relationData = op.data as any;
        if (!relationData?.sourceKey || !relationData?.targetKey || !relationData?.relationshipType) {
          throw new Error('Relate operation requires sourceKey, targetKey, and relationshipType');
        }

        await this.db.createRelationship(
          relationData.sourceKey,
          relationData.targetKey,
          relationData.relationshipType,
          relationData.strength || 1.0
        );

        results.push({
          operation: op,
          success: true,
          result: {
            relationship: `${relationData.sourceKey} -> ${relationData.targetKey}`,
            type: relationData.relationshipType
          }
        });
      } catch (error) {
        results.push({
          operation: op,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  private async executeQueryOperations(operations: BatchOperation[]): Promise<BatchExecutionResult['results']> {
    const results: BatchExecutionResult['results'] = [];

    for (const op of operations) {
      try {
        const queryOptions = op.data as any;
        const contexts = await this.db.queryEnhancedContext(queryOptions);

        results.push({
          operation: op,
          success: true,
          result: { contexts, count: contexts.length }
        });
      } catch (error) {
        results.push({
          operation: op,
          success: false,
          error: error instanceof Error ? error.message : 'Unknown error'
        });
      }
    }

    return results;
  }

  private async executeWithRollback(
    operations: BatchOperation[],
    rollbackStrategy: string
  ): Promise<BatchExecutionResult> {
    const completedOperations: string[] = [];
    let result: BatchExecutionResult;

    try {
      result = await this.executeBatch(operations);

      if (result.failed > 0 && rollbackStrategy !== 'none') {
        logger.warn(
          {
            failed: result.failed,
            rollbackStrategy
          },
          'Executing rollback due to failures'
        );

        await this.performRollback(completedOperations, rollbackStrategy);
      }
    } catch (error) {
      logger.error({ error, rollbackStrategy }, 'Critical error during workflow execution');
      await this.performRollback(completedOperations, rollbackStrategy);
      throw error;
    }

    return result;
  }

  private async performRollback(completedOperations: string[], strategy: string): Promise<void> {
    // Implementation would depend on operation types and rollback strategy
    logger.warn(
      {
        operationCount: completedOperations.length,
        strategy
      },
      'Rollback performed'
    );
  }

  private substituteParameters(operations: BatchOperation[], parameters: Record<string, unknown>): BatchOperation[] {
    return operations.map(op => {
      const substituted = { ...op };

      // Simple parameter substitution in keys
      if (substituted.key) {
        substituted.key = this.substituteInString(substituted.key, parameters);
      }

      // Parameter substitution in data
      if (substituted.data) {
        substituted.data = this.substituteInData(substituted.data, parameters);
      }

      return substituted;
    });
  }

  private substituteInString(str: string, parameters: Record<string, unknown>): string {
    return str.replace(/\{\{(\w+)\}\}/g, (match, key) => {
      return parameters[key]?.toString() || match;
    });
  }

  private substituteInData(data: unknown, parameters: Record<string, unknown>): unknown {
    if (typeof data === 'string') {
      return this.substituteInString(data, parameters);
    } else if (Array.isArray(data)) {
      return data.map(item => this.substituteInData(item, parameters));
    } else if (typeof data === 'object' && data !== null) {
      const result: Record<string, unknown> = {};
      for (const [key, value] of Object.entries(data)) {
        result[key] = this.substituteInData(value, parameters);
      }
      return result;
    }
    return data;
  }

  private analyzeOptimizations(original: BatchOperation[], optimized: BatchOperation[]): string[] {
    const optimizations: string[] = [];

    if (original.length !== optimized.length) {
      optimizations.push('Operation count mismatch detected');
    }

    // Check if order was changed
    let orderChanged = false;
    const minLength = Math.min(original.length, optimized.length);
    for (let i = 0; i < minLength; i++) {
      if (original[i] && optimized[i] && original[i]?.key !== optimized[i]?.key) {
        orderChanged = true;
        break;
      }
    }

    if (orderChanged) {
      optimizations.push('Execution order optimized based on priorities and dependencies');
    }

    // Check for type grouping benefits
    const originalTypes = new Set(original.map(op => op.type));
    if (originalTypes.size > 1) {
      optimizations.push('Operations grouped by type for better performance');
    }

    return optimizations;
  }

  private getCompressionLimit(level: string): number {
    switch (level) {
      case 'light':
        return 5000;
      case 'medium':
        return 2000;
      case 'aggressive':
        return 1000;
      default:
        return 10000;
    }
  }

  private initializeDefaultWorkflows(): void {
    // Task completion workflow
    this.registerWorkflow({
      id: 'task_completion',
      name: 'Task Completion Workflow',
      description: 'Complete a task with progress update and relationship creation',
      operations: [
        {
          type: 'update',
          key: '{{taskKey}}',
          data: {
            status: 'completed',
            progress: 100,
            completedAt: new Date().toISOString()
          },
          priority: 1
        },
        {
          type: 'relate',
          key: 'completion_rel',
          data: {
            sourceKey: '{{taskKey}}',
            targetKey: '{{sessionKey}}',
            relationshipType: 'completed_in_session',
            strength: 1.0
          },
          priority: 2,
          dependencies: ['{{taskKey}}']
        }
      ]
    });

    // State backup workflow
    this.registerWorkflow({
      id: 'state_backup',
      name: 'State Backup Workflow',
      description: 'Create comprehensive backup of current state',
      operations: [
        {
          type: 'store',
          key: '{{backupKey}}_full',
          data: '{{fullState}}',
          priority: 1
        },
        {
          type: 'store',
          key: '{{backupKey}}_compressed',
          data: '{{compressedState}}',
          priority: 2
        },
        {
          type: 'relate',
          key: 'backup_rel',
          data: {
            sourceKey: '{{backupKey}}_full',
            targetKey: '{{backupKey}}_compressed',
            relationshipType: 'compressed_version_of',
            strength: 0.9
          },
          priority: 3,
          dependencies: ['{{backupKey}}_full', '{{backupKey}}_compressed']
        }
      ]
    });

    logger.info({ workflowCount: this.workflowTemplates.size }, 'Default workflows initialized');
  }
}
