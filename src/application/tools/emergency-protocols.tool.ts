// Emergency State Management and Recovery Protocols
// File: src/application/tools/emergency-protocols.tool.ts

import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler, EnhancedContextEntry } from '../../core/interfaces/database.interface.js';
import { AutoStateManagerService } from '../services/auto-state-manager.service.js';
import { TokenTracker } from '../../utils/token-tracker.js';
import { logger } from '../../utils/logger.js';

// Schema for PanicStorageTool
const panicStorageSchema = z.object({
  sessionId: z.string().describe('Session ID for emergency storage'),
  currentState: z.record(z.unknown()).describe('Current state to store in emergency'),
  reason: z.string().describe('Reason for panic storage (error, timeout, etc.)'),
  priority: z
    .enum(['low', 'medium', 'high', 'critical'])
    .optional()
    .default('high')
    .describe('Priority level of emergency'),
  includeHistory: z.boolean().optional().default(true).describe('Include recent operation history'),
  compress: z.boolean().optional().default(true).describe('Compress data to save space')
});

@injectable()
export class PanicStorageTool implements IMCPTool {
  name = 'panic_storage';
  description = 'Emergency storage of current state when critical errors or timeouts occur';
  schema = panicStorageSchema;

  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler,
    @inject(AutoStateManagerService) private autoStateManager: AutoStateManagerService
  ) {}

  async execute(params: z.infer<typeof panicStorageSchema>, _context: ToolContext): Promise<ToolResult> {
    try {
      const timestamp = new Date().toISOString();
      const panicKey = `panic_${params.sessionId}_${Date.now()}`;

      // Get recent token usage if available
      let recentUsage: any[] = [];
      if (params.includeHistory) {
        try {
          recentUsage = await this.db.getTokenUsageHistory(params.sessionId, 5);
        } catch (error) {
          logger.warn({ error, sessionId: params.sessionId }, 'Could not retrieve usage history for panic storage');
        }
      }

      // Compress state if requested
      let finalState = params.currentState;
      if (params.compress) {
        finalState = this.autoStateManager.compressState(params.currentState, {
          compressionLevel: 'aggressive',
          maxTokensPerEntry: 500,
          preserveImportantKeys: ['error', 'critical_data', 'recovery_info', 'next_steps']
        });
      }

      // Create emergency context entry
      const panicEntry: EnhancedContextEntry = {
        key: panicKey,
        value: {
          emergency_type: 'panic_storage',
          session_id: params.sessionId,
          panic_timestamp: timestamp,
          reason: params.reason,
          priority: params.priority,

          // Critical state information
          current_state: finalState,

          // Recovery information
          recovery_info: {
            panic_key: panicKey,
            original_session: params.sessionId,
            compressed: params.compress,
            token_estimate: TokenTracker.estimateTokens(finalState),
            emergency_level: params.priority
          },

          // Recent activity for context
          recent_operations: recentUsage.map(usage => ({
            operation: usage.operation,
            tokens: usage.tokensUsed,
            timestamp: usage.timestamp,
            context_key: usage.contextKey
          })),

          // Recovery instructions
          recovery_instructions: [
            'Use recover_from_panic tool to restore state',
            'Check recovery_info for session details',
            'Review recent_operations for context',
            'Validate current_state before continuing'
          ],

          // Metadata
          created_by: 'emergency_protocol',
          requires_manual_review: params.priority === 'critical'
        },
        type: 'emergency',
        contextType: 'panic_storage',
        tokenCount: TokenTracker.estimateTokens(finalState),
        metadata: {
          emergency: true,
          priority: params.priority,
          reason: params.reason,
          sessionId: params.sessionId,
          compressed: params.compress,
          panicTimestamp: timestamp
        },
        semanticTags: ['emergency', 'panic', 'recovery', params.priority, params.reason.toLowerCase()],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      // Store the panic entry
      await this.db.storeEnhancedContext(panicEntry);

      // Create relationship to session
      try {
        await this.db.createRelationship(panicKey, params.sessionId, 'emergency_backup_of', 1.0);
      } catch (error) {
        logger.warn({ error, panicKey }, 'Failed to create emergency relationship');
      }

      // Log the emergency
      logger.error(
        {
          panicKey,
          sessionId: params.sessionId,
          reason: params.reason,
          priority: params.priority,
          stateSize: JSON.stringify(finalState).length
        },
        'PANIC STORAGE ACTIVATED - Emergency state saved'
      );

      const result = {
        success: true,
        panicKey,
        sessionId: params.sessionId,
        timestamp,
        reason: params.reason,
        priority: params.priority,
        stateSize: JSON.stringify(finalState).length,
        tokenEstimate: TokenTracker.estimateTokens(finalState),
        compressed: params.compress,
        recoveryInstructions: [
          `Use recover_from_panic with key: ${panicKey}`,
          'Review emergency state before continuing',
          'Check for data integrity after recovery'
        ]
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
      // Even panic storage failed - this is really bad
      logger.fatal(
        { error, sessionId: params.sessionId, reason: params.reason },
        'PANIC STORAGE FAILED - CRITICAL SYSTEM ERROR'
      );

      return {
        content: [
          {
            type: 'text',
            text: `CRITICAL ERROR: Panic storage failed: ${error instanceof Error ? error.message : 'Unknown error'}. Manual intervention required.`
          }
        ]
      };
    }
  }
}

// Schema for MinimalHandoffTool
const minimalHandoffSchema = z.object({
  sessionId: z.string().describe('Session ID for minimal handoff'),
  essentialData: z.record(z.unknown()).describe('Only the most essential data to preserve'),
  nextAction: z.string().describe('Next critical action to take'),
  errorContext: z.string().optional().describe('Context about what went wrong')
});

@injectable()
export class MinimalHandoffTool implements IMCPTool {
  name = 'minimal_handoff';
  description = 'Create minimal handoff when normal checkpointing fails - preserves only critical data';
  schema = minimalHandoffSchema;

  constructor(@inject('DatabaseHandler') private db: IDatabaseHandler) {}

  async execute(params: z.infer<typeof minimalHandoffSchema>, _context: ToolContext): Promise<ToolResult> {
    try {
      const timestamp = new Date().toISOString();
      const handoffKey = `minimal_handoff_${params.sessionId}_${Date.now()}`;

      // Create ultra-compressed handoff
      const minimalHandoff = {
        type: 'minimal_handoff',
        session_id: params.sessionId,
        timestamp,

        // Only essential data - heavily compressed
        essential_data: TokenTracker.compressContextValue(params.essentialData, 1000),
        next_action: params.nextAction,
        error_context: params.errorContext,

        // Minimal recovery info
        recovery: {
          key: handoffKey,
          session: params.sessionId,
          type: 'minimal',
          critical: true
        },

        // Simple instructions
        instructions: [
          'This is a minimal handoff - some data may be lost',
          'Check essential_data for critical information',
          'Execute next_action immediately',
          'Review error_context if available'
        ]
      };

      // Direct database storage for maximum reliability
      const dbInstance = this.db.getDatabase();
      if (dbInstance) {
        const stmt = dbInstance.prepare(`
          INSERT OR REPLACE INTO context_items
          (key, value, type, context_type, token_count, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
        `);

        const valueJson = JSON.stringify(minimalHandoff);
        const tokenCount = Math.ceil(valueJson.length / 4); // Quick token estimate

        stmt.run(handoffKey, valueJson, 'emergency', 'minimal_handoff', tokenCount);

        logger.warn(
          {
            handoffKey,
            sessionId: params.sessionId,
            nextAction: params.nextAction,
            dataSize: valueJson.length
          },
          'MINIMAL HANDOFF CREATED - Data preservation attempted'
        );

        const result = {
          success: true,
          handoffKey,
          sessionId: params.sessionId,
          timestamp,
          nextAction: params.nextAction,
          dataSize: valueJson.length,
          tokenEstimate: tokenCount,
          warning: 'This is a minimal handoff - some data may have been lost',
          recovery: `Use semantic_search_context to find: ${handoffKey}`
        };

        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify(result, null, 2)
            }
          ]
        };
      } else {
        throw new Error('Database instance not available for minimal handoff');
      }
    } catch (error) {
      logger.fatal({ error, sessionId: params.sessionId }, 'MINIMAL HANDOFF FAILED - COMPLETE SYSTEM FAILURE');

      // Last resort - return the essential data in response
      return {
        content: [
          {
            type: 'text',
            text: `SYSTEM FAILURE - Minimal handoff failed. Essential data: ${JSON.stringify({
              sessionId: params.sessionId,
              nextAction: params.nextAction,
              essentialData: params.essentialData,
              timestamp: new Date().toISOString(),
              error: error instanceof Error ? error.message : 'Unknown error'
            })}`
          }
        ]
      };
    }
  }
}

// Schema for RecoverFromPanicTool
const recoverFromPanicSchema = z.object({
  panicKey: z.string().optional().describe('Specific panic key to recover from'),
  sessionId: z.string().optional().describe('Session ID to find panic states for'),
  autoValidate: z.boolean().optional().default(true).describe('Automatically validate recovered state'),
  maxAge: z.number().optional().default(24).describe('Maximum age in hours for panic states to consider')
});

@injectable()
export class RecoverFromPanicTool implements IMCPTool {
  name = 'recover_from_panic';
  description = 'Recover state from panic storage or minimal handoff';
  schema = recoverFromPanicSchema;

  constructor(@inject('DatabaseHandler') private db: IDatabaseHandler) {}

  async execute(params: z.infer<typeof recoverFromPanicSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      let panicEntry: EnhancedContextEntry | null = null;

      if (params.panicKey) {
        // Recover specific panic entry
        panicEntry = await this.db.getEnhancedContext(params.panicKey);
      } else if (params.sessionId) {
        // Find latest panic entry for session
        const maxAge = new Date(Date.now() - params.maxAge! * 60 * 60 * 1000);

        const panicEntries = await this.db.queryEnhancedContext({
          contextType: 'panic_storage',
          keyPattern: params.sessionId,
          sortBy: 'updated',
          sortOrder: 'desc',
          limit: 1
        });

        if (panicEntries.length === 0) {
          // Try minimal handoff
          const minimalEntries = await this.db.queryEnhancedContext({
            contextType: 'minimal_handoff',
            keyPattern: params.sessionId,
            sortBy: 'updated',
            sortOrder: 'desc',
            limit: 1
          });

          if (minimalEntries.length > 0 && minimalEntries[0] && minimalEntries[0].updatedAt > maxAge) {
            panicEntry = minimalEntries[0];
          }
        } else if (panicEntries[0] && panicEntries[0].updatedAt > maxAge) {
          panicEntry = panicEntries[0];
        }
      } else {
        return {
          content: [
            {
              type: 'text',
              text: 'Either panicKey or sessionId must be provided for recovery'
            }
          ]
        };
      }

      if (!panicEntry) {
        return {
          content: [
            {
              type: 'text',
              text: `No recoverable panic state found. Checked age limit: ${params.maxAge} hours`
            }
          ]
        };
      }

      const panicValue = panicEntry.value as any;
      const recoveredState = panicValue.current_state || panicValue.essential_data || panicValue;

      // Validate recovered state if requested
      let validationResults: any = null;
      if (params.autoValidate) {
        validationResults = this.validateRecoveredState(recoveredState, panicValue);
      }

      // Create recovery summary
      const recoveryInfo = {
        success: true,
        panicKey: panicEntry.key,
        recoveryType: panicValue.emergency_type || panicValue.type || 'unknown',
        originalSession: panicValue.session_id || panicValue.sessionId,
        panicReason: panicValue.reason || 'unknown',
        panicTimestamp: panicValue.panic_timestamp || panicValue.timestamp,
        recoveredAt: new Date().toISOString(),

        // Recovered data
        recoveredState,

        // Metadata
        dataIntegrity: validationResults?.integrity || 'not_validated',
        compressed: panicValue.recovery_info?.compressed || false,
        tokenEstimate: TokenTracker.estimateTokens(recoveredState),

        // Next steps
        recommendations: this.generateRecoveryRecommendations(panicValue, validationResults),

        // Original recovery instructions
        originalInstructions: panicValue.recovery_instructions || panicValue.instructions || []
      };

      // Log successful recovery
      logger.info(
        {
          panicKey: panicEntry.key,
          sessionId: recoveryInfo.originalSession,
          recoveryType: recoveryInfo.recoveryType,
          ageHours: Math.round((Date.now() - panicEntry.updatedAt.getTime()) / (1000 * 60 * 60))
        },
        'Emergency state recovered successfully'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(recoveryInfo, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to recover from panic');
      return {
        content: [
          {
            type: 'text',
            text: `Recovery failed: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private validateRecoveredState(state: any, panicValue: any): any {
    const validation = {
      integrity: 'unknown',
      issues: [] as string[],
      dataTypes: {} as Record<string, string>,
      size: JSON.stringify(state).length
    };

    try {
      // Check if state is valid JSON-serializable
      JSON.stringify(state);
      validation.integrity = 'valid';
    } catch (error) {
      validation.integrity = 'corrupted';
      validation.issues.push('State is not JSON-serializable');
    }

    // Analyze data types
    for (const [key, value] of Object.entries(state)) {
      validation.dataTypes[key] = typeof value;

      // Check for potential corruption indicators
      if (typeof value === 'string' && value.includes('[TRUNCATED]')) {
        validation.issues.push(`${key} appears to be truncated`);
      }
    }

    // Check compression status
    if (panicValue.recovery_info?.compressed) {
      validation.issues.push('Data was compressed - some information may be lost');
    }

    // Size validation
    if (validation.size > 100000) {
      // 100KB
      validation.issues.push('Recovered state is very large - may impact performance');
    }

    return validation;
  }

  private generateRecoveryRecommendations(panicValue: any, validationResults: any): string[] {
    const recommendations: string[] = [];

    // Based on panic reason
    const reason = panicValue.reason || '';
    if (reason.toLowerCase().includes('error')) {
      recommendations.push('Review and resolve the original error condition');
    }
    if (reason.toLowerCase().includes('timeout')) {
      recommendations.push('Check system performance and resource availability');
    }
    if (reason.toLowerCase().includes('memory') || reason.toLowerCase().includes('token')) {
      recommendations.push('Consider state compression or splitting work into smaller tasks');
    }

    // Based on validation results
    if (validationResults?.issues.length > 0) {
      recommendations.push('Review data integrity issues before continuing');
      if (validationResults.issues.some((issue: string) => issue.includes('truncated'))) {
        recommendations.push('Some data was truncated - verify critical information is intact');
      }
    }

    // Based on age
    if (panicValue.panic_timestamp || panicValue.timestamp) {
      const panicTime = new Date(panicValue.panic_timestamp || panicValue.timestamp);
      const ageHours = (Date.now() - panicTime.getTime()) / (1000 * 60 * 60);

      if (ageHours > 24) {
        recommendations.push('Panic state is over 24 hours old - verify current relevance');
      }
    }

    // General recommendations
    recommendations.push('Create new checkpoint after validating recovered state');
    recommendations.push('Review recent operations to understand what went wrong');

    if (panicValue.next_action) {
      recommendations.push(`Execute planned next action: ${panicValue.next_action}`);
    }

    return recommendations;
  }
}

// Schema for BackupRedundancyTool
const backupRedundancySchema = z.object({
  sessionId: z.string().describe('Session ID to create redundant backups for'),
  currentState: z.record(z.unknown()).describe('Current state to backup'),
  redundancyLevel: z
    .enum(['basic', 'enhanced', 'maximum'])
    .optional()
    .default('enhanced')
    .describe('Level of redundancy'),
  includeHistory: z.boolean().optional().default(true).describe('Include operation history in backups')
});

@injectable()
export class BackupRedundancyTool implements IMCPTool {
  name = 'backup_redundancy';
  description = 'Create multiple redundant backups with different compression levels and storage strategies';
  schema = backupRedundancySchema;

  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler,
    @inject(AutoStateManagerService) private autoStateManager: AutoStateManagerService
  ) {}

  async execute(params: z.infer<typeof backupRedundancySchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const timestamp = new Date().toISOString();
      const baseKey = `redundant_backup_${params.sessionId}_${Date.now()}`;
      const backups: any[] = [];

      // Get operation history if requested
      let operationHistory: any[] = [];
      if (params.includeHistory) {
        try {
          operationHistory = await this.db.getTokenUsageHistory(params.sessionId, 20);
        } catch (error) {
          logger.warn({ error }, 'Could not retrieve operation history for redundant backup');
        }
      }

      // Create different backup variants based on redundancy level
      const backupVariants = this.getBackupVariants(params.redundancyLevel);

      for (const variant of backupVariants) {
        try {
          const backupKey = `${baseKey}_${variant.suffix}`;

          // Apply variant-specific compression
          let processedState = params.currentState;
          if (variant.compression) {
            processedState = this.autoStateManager.compressState(params.currentState, variant.compression);
          }

          const backupEntry: EnhancedContextEntry = {
            key: backupKey,
            value: {
              backup_type: 'redundant',
              variant: variant.name,
              session_id: params.sessionId,
              backup_timestamp: timestamp,
              redundancy_level: params.redundancyLevel,

              // State data
              current_state: processedState,
              operation_history: variant.includeHistory ? operationHistory : [],

              // Backup metadata
              backup_info: {
                compression_level: variant.compression?.compressionLevel || 'none',
                variant: variant.name,
                original_size: JSON.stringify(params.currentState).length,
                compressed_size: JSON.stringify(processedState).length,
                redundancy_group: baseKey
              },

              // Recovery instructions
              recovery_instructions: [
                `This is a ${variant.name} backup variant`,
                'Use recover_from_backup tool for restoration',
                'Compare with other variants if needed',
                'Validate data integrity after recovery'
              ]
            },
            type: 'backup',
            contextType: 'redundant_backup',
            tokenCount: TokenTracker.estimateTokens(processedState),
            metadata: {
              redundant: true,
              variant: variant.name,
              sessionId: params.sessionId,
              redundancyLevel: params.redundancyLevel,
              compressionLevel: variant.compression?.compressionLevel || 'none'
            },
            semanticTags: ['backup', 'redundant', variant.name, params.redundancyLevel],
            createdAt: new Date(),
            updatedAt: new Date()
          };

          await this.db.storeEnhancedContext(backupEntry);

          // Create relationships between backup variants
          if (backups.length > 0) {
            await this.db.createRelationship(backupKey, backups[0].key, 'redundant_backup_of', 0.9);
          }

          backups.push({
            key: backupKey,
            variant: variant.name,
            compressionLevel: variant.compression?.compressionLevel || 'none',
            size: JSON.stringify(processedState).length,
            tokenCount: TokenTracker.estimateTokens(processedState)
          });
        } catch (error) {
          logger.error({ error, variant: variant.name }, 'Failed to create backup variant');
        }
      }

      // Create master index backup
      const indexKey = `${baseKey}_index`;
      const indexEntry: EnhancedContextEntry = {
        key: indexKey,
        value: {
          backup_type: 'redundancy_index',
          session_id: params.sessionId,
          timestamp,
          redundancy_level: params.redundancyLevel,
          backup_variants: backups,
          total_backups: backups.length,
          recovery_strategy: 'Try variants in order: full -> compressed -> minimal',
          created_by: 'backup_redundancy_tool'
        },
        type: 'index',
        contextType: 'backup_index',
        tokenCount: TokenTracker.estimateTokens(backups),
        metadata: {
          masterIndex: true,
          sessionId: params.sessionId
        },
        semanticTags: ['backup', 'index', 'redundancy'],
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.db.storeEnhancedContext(indexEntry);

      const result = {
        success: true,
        sessionId: params.sessionId,
        redundancyLevel: params.redundancyLevel,
        backupCount: backups.length,
        masterIndexKey: indexKey,
        backups,
        totalSize: backups.reduce((sum, b) => sum + b.size, 0),
        recommendations: [
          'Use master index key to find all backup variants',
          'Try full backup first for recovery',
          'Use compressed backups if full backup is corrupted',
          'Compare variants if data discrepancies are found'
        ]
      };

      logger.info(
        {
          sessionId: params.sessionId,
          backupCount: backups.length,
          redundancyLevel: params.redundancyLevel,
          masterIndexKey: indexKey
        },
        'Redundant backups created successfully'
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to create redundant backups');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to create redundant backups: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private getBackupVariants(redundancyLevel: string): any[] {
    const variants = {
      basic: [
        {
          name: 'full',
          suffix: 'full',
          compression: null,
          includeHistory: true
        },
        {
          name: 'compressed',
          suffix: 'compressed',
          compression: { compressionLevel: 'medium' as const, maxTokensPerEntry: 2000 },
          includeHistory: false
        }
      ],
      enhanced: [
        {
          name: 'full',
          suffix: 'full',
          compression: null,
          includeHistory: true
        },
        {
          name: 'compressed',
          suffix: 'compressed',
          compression: { compressionLevel: 'medium' as const, maxTokensPerEntry: 2000 },
          includeHistory: true
        },
        {
          name: 'minimal',
          suffix: 'minimal',
          compression: { compressionLevel: 'aggressive' as const, maxTokensPerEntry: 500 },
          includeHistory: false
        }
      ],
      maximum: [
        {
          name: 'full',
          suffix: 'full',
          compression: null,
          includeHistory: true
        },
        {
          name: 'light_compressed',
          suffix: 'light',
          compression: { compressionLevel: 'light' as const, maxTokensPerEntry: 3000 },
          includeHistory: true
        },
        {
          name: 'medium_compressed',
          suffix: 'medium',
          compression: { compressionLevel: 'medium' as const, maxTokensPerEntry: 2000 },
          includeHistory: true
        },
        {
          name: 'aggressive_compressed',
          suffix: 'aggressive',
          compression: { compressionLevel: 'aggressive' as const, maxTokensPerEntry: 500 },
          includeHistory: false
        }
      ]
    };

    return variants[redundancyLevel as keyof typeof variants] || variants.enhanced;
  }
}
