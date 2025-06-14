// Automatic State Management Service
// File: src/application/services/auto-state-manager.service.ts

import { injectable, inject } from 'inversify';
import type { IDatabaseHandler, EnhancedContextEntry, TokenBudget } from '../../core/interfaces/database.interface.js';
import { TokenTracker } from '../../utils/token-tracker.js';
import { logger } from '../../utils/logger.js';

export interface AutoCheckpointOptions {
  sessionId: string;
  currentState: Record<string, unknown>;
  operation: string;
  forceCheckpoint?: boolean;
  compressLargeValues?: boolean;
}

export interface HandoffDetectionResult {
  shouldHandoff: boolean;
  remainingTokens: number;
  recommendations: string[];
  handoffContext?: Record<string, unknown>;
}

export interface StateCompressionOptions {
  maxTokensPerEntry?: number;
  preserveImportantKeys?: string[];
  compressionLevel?: 'light' | 'medium' | 'aggressive';
}

export interface ResumeContextResult {
  success: boolean;
  resumedState: Record<string, unknown>;
  sessionId: string;
  lastOperation: string;
  recommendations: string[];
}

@injectable()
export class AutoStateManagerService {
  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler
  ) {}

  /**
   * Automatically checkpoint state based on token usage and operation importance
   */
  async autoCheckpoint(options: AutoCheckpointOptions): Promise<{ checkpointed: boolean; key: string }> {
    try {
      const { sessionId, currentState, operation, forceCheckpoint = false, compressLargeValues = true } = options;

      // Get current token budget
      let budget = await this.db.getTokenBudget(sessionId);
      if (!budget) {
        budget = await this.db.createTokenBudget(sessionId);
      }

      // Estimate tokens for current state
      const stateTokens = TokenTracker.estimateTokens(currentState);
      
      // Determine if checkpoint is needed
      const shouldCheckpoint = forceCheckpoint || 
        budget.usedTokens > budget.handoffThreshold * 0.7 || // 70% of handoff threshold
        stateTokens > 10000 || // Large state
        this.isImportantOperation(operation);

      if (!shouldCheckpoint) {
        logger.debug({ sessionId, operation, stateTokens }, 'Checkpoint not needed');
        return { checkpointed: false, key: '' };
      }

      // Compress state if needed
      let finalState = currentState;
      if (compressLargeValues && stateTokens > 5000) {
        finalState = this.compressState(currentState, { compressionLevel: 'medium' });
      }

      // Create checkpoint
      const checkpointKey = `checkpoint_${sessionId}_${Date.now()}`;
      const checkpointEntry: EnhancedContextEntry = {
        key: checkpointKey,
        value: {
          sessionId,
          operation,
          state: finalState,
          originalTokens: stateTokens,
          checkpointedAt: new Date().toISOString(),
          budget: {
            usedTokens: budget.usedTokens,
            remainingTokens: budget.remainingTokens
          }
        },
        type: 'checkpoint',
        contextType: 'automatic_checkpoint',
        tokenCount: TokenTracker.estimateTokens(finalState),
        metadata: {
          automatic: true,
          operation,
          sessionId,
          compressed: compressLargeValues && stateTokens > 5000
        },
        createdAt: new Date(),
        updatedAt: new Date()
      };

      await this.db.storeEnhancedContext(checkpointEntry);
      
      // Update token usage
      await this.db.updateTokenUsage(sessionId, `checkpoint_${operation}`, checkpointEntry.tokenCount || 0, checkpointKey);

      logger.info({ 
        sessionId, 
        checkpointKey, 
        operation, 
        originalTokens: stateTokens, 
        compressedTokens: checkpointEntry.tokenCount 
      }, 'Auto checkpoint created');

      return { checkpointed: true, key: checkpointKey };
    } catch (error) {
      logger.error({ error, sessionId: options.sessionId, operation: options.operation }, 'Failed to create auto checkpoint');
      throw error;
    }
  }

  /**
   * Detect if handoff is needed and prepare handoff context
   */
  async detectHandoff(sessionId: string, currentState: Record<string, unknown>): Promise<HandoffDetectionResult> {
    try {
      const budget = await this.db.getTokenBudget(sessionId);
      if (!budget) {
        return {
          shouldHandoff: false,
          remainingTokens: 200000,
          recommendations: ['Create token budget first']
        };
      }

      const handoffAnalysis = TokenTracker.analyzeHandoffState(
        budget.usedTokens,
        budget.maxTokens,
        budget.handoffThreshold
      );

      if (handoffAnalysis.needsHandoff) {
        // Create comprehensive handoff context
        const handoffContext = await this.createHandoffContext(sessionId, currentState, budget);
        
        return {
          shouldHandoff: true,
          remainingTokens: handoffAnalysis.remainingTokens,
          recommendations: handoffAnalysis.recommendations,
          handoffContext
        };
      }

      return {
        shouldHandoff: false,
        remainingTokens: handoffAnalysis.remainingTokens,
        recommendations: handoffAnalysis.recommendations
      };
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to detect handoff need');
      throw error;
    }
  }

  /**
   * Compress state to reduce token usage
   */
  compressState(state: Record<string, unknown>, options: StateCompressionOptions = {}): Record<string, unknown> {
    const {
      maxTokensPerEntry = 1000,
      preserveImportantKeys = ['current_task', 'next_steps', 'progress', 'decisions'],
      compressionLevel = 'medium'
    } = options;

    const compressed: Record<string, unknown> = {};
    const compressionMultipliers = {
      light: 0.8,
      medium: 0.6,
      aggressive: 0.4
    };

    const targetTokens = Math.floor(maxTokensPerEntry * compressionMultipliers[compressionLevel]);

    for (const [key, value] of Object.entries(state)) {
      if (preserveImportantKeys.includes(key)) {
        // Preserve important keys with light compression only
        compressed[key] = TokenTracker.compressContextValue(value, maxTokensPerEntry);
      } else {
        // Apply full compression to other keys
        compressed[key] = TokenTracker.compressContextValue(value, targetTokens);
      }
    }

    // Add compression metadata
    compressed['__compression_info__'] = {
      level: compressionLevel,
      originalKeys: Object.keys(state).length,
      compressedAt: new Date().toISOString(),
      preserved: preserveImportantKeys
    };

    return compressed;
  }

  /**
   * Resume context from the latest checkpoint or handoff state
   */
  async resumeContext(pattern: string = 'task_state_'): Promise<ResumeContextResult> {
    try {
      // Find the latest checkpoint or handoff context
      const contexts = await this.db.queryEnhancedContext({
        keyPattern: pattern,
        sortBy: 'updated',
        sortOrder: 'desc',
        limit: 1
      });

      if (contexts.length === 0) {
        return {
          success: false,
          resumedState: {},
          sessionId: '',
          lastOperation: '',
          recommendations: ['No previous context found', 'Start fresh or check pattern']
        };
      }

      const latestContext = contexts[0]!; // Safe because we checked length above
      const contextValue = latestContext.value as any;

      // Extract session information
      const sessionId = contextValue.sessionId || TokenTracker.generateSessionId();
      const lastOperation = contextValue.operation || contextValue.lastOperation || 'unknown';
      const resumedState = contextValue.state || contextValue.currentState || contextValue;

      // Generate recommendations based on the resumed context
      const recommendations = this.generateResumeRecommendations(contextValue);

      logger.info({
        resumedKey: latestContext.key,
        sessionId,
        lastOperation,
        age: new Date().getTime() - latestContext.updatedAt.getTime()
      }, 'Context resumed successfully');

      return {
        success: true,
        resumedState,
        sessionId,
        lastOperation,
        recommendations
      };
    } catch (error) {
      logger.error({ error, pattern }, 'Failed to resume context');
      return {
        success: false,
        resumedState: {},
        sessionId: '',
        lastOperation: '',
        recommendations: ['Resume failed', 'Check logs for details', 'Consider starting fresh']
      };
    }
  }

  /**
   * Create comprehensive handoff context
   */
  private async createHandoffContext(
    sessionId: string,
    currentState: Record<string, unknown>,
    budget: TokenBudget
  ): Promise<Record<string, unknown>> {
    try {
      // Get recent token usage history
      const recentUsage = await this.db.getTokenUsageHistory(sessionId, 10);
      
      // Analyze task completion
      const taskAnalysis = TokenTracker.detectTaskCompletion(currentState);
      
      // Compress current state
      const compressedState = this.compressState(currentState, { 
        compressionLevel: 'medium',
        maxTokensPerEntry: 2000
      });

      const handoffContext = {
        handoff_type: 'automatic_token_limit',
        session_id: sessionId,
        handoff_timestamp: new Date().toISOString(),
        
        // State information
        current_state: compressedState,
        task_analysis: taskAnalysis,
        
        // Token information
        token_budget: {
          used: budget.usedTokens,
          remaining: budget.remainingTokens,
          max: budget.maxTokens,
          threshold: budget.handoffThreshold,
          percentage_used: (budget.usedTokens / budget.maxTokens) * 100
        },
        
        // Recent activity
        recent_operations: recentUsage.map(usage => ({
          operation: usage.operation,
          tokens: usage.tokensUsed,
          timestamp: usage.timestamp,
          context_key: usage.contextKey
        })),
        
        // Recommendations
        next_steps: this.generateNextSteps(currentState, taskAnalysis),
        resume_instructions: [
          'Use semantic_search_context to find this handoff state',
          'Continue from current_state section',
          'Follow next_steps recommendations',
          'Create new token budget for continued work'
        ]
      };

      return handoffContext;
    } catch (error) {
      logger.error({ error, sessionId }, 'Failed to create handoff context');
      // Return minimal handoff context on error
      return TokenTracker.createHandoffContext(currentState, sessionId, ['Continue previous work']);
    }
  }

  /**
   * Check if operation is important enough to trigger checkpoint
   */
  private isImportantOperation(operation: string): boolean {
    const importantOps = [
      'phase_complete',
      'major_decision',
      'error_occurred',
      'file_modified',
      'critical_update',
      'task_transition',
      'handoff_preparation'
    ];

    return importantOps.some(op => operation.toLowerCase().includes(op));
  }

  /**
   * Generate recommendations for resumed context
   */
  private generateResumeRecommendations(contextValue: any): string[] {
    const recommendations: string[] = [];

    // Check age of context
    if (contextValue.checkpointedAt || contextValue.handoff_timestamp) {
      const timestamp = new Date(contextValue.checkpointedAt || contextValue.handoff_timestamp);
      const ageHours = (Date.now() - timestamp.getTime()) / (1000 * 60 * 60);
      
      if (ageHours > 24) {
        recommendations.push('Context is over 24 hours old - review for relevance');
      } else if (ageHours > 1) {
        recommendations.push('Review context for any time-sensitive information');
      }
    }

    // Check for task completion status
    if (contextValue.task_analysis?.isComplete) {
      recommendations.push('Previous task appears complete - consider new objectives');
    } else if (contextValue.task_analysis?.remainingTasks?.length > 0) {
      recommendations.push('Continue with remaining tasks from previous session');
    }

    // Check for next steps
    if (contextValue.next_steps?.length > 0) {
      recommendations.push('Follow the next_steps outlined in previous session');
    }

    // Default recommendations
    if (recommendations.length === 0) {
      recommendations.push('Review previous state and continue where left off');
      recommendations.push('Create new token budget for current session');
    }

    return recommendations;
  }

  /**
   * Generate next steps based on current state and task analysis
   */
  private generateNextSteps(currentState: Record<string, unknown>, taskAnalysis: any): string[] {
    const nextSteps: string[] = [];

    // Based on task completion
    if (taskAnalysis.isComplete) {
      nextSteps.push('Review completed work for quality');
      nextSteps.push('Document final results and decisions');
      nextSteps.push('Plan next phase or objectives');
    } else {
      nextSteps.push('Continue with remaining tasks');
      nextSteps.push('Address any incomplete objectives');
    }

    // Based on remaining tasks
    if (taskAnalysis.remainingTasks?.length > 0) {
      nextSteps.push(`Priority tasks: ${taskAnalysis.remainingTasks.slice(0, 3).join(', ')}`);
    }

    // Check for error states
    const stateString = JSON.stringify(currentState).toLowerCase();
    if (stateString.includes('error') || stateString.includes('failed')) {
      nextSteps.push('Review and resolve any error conditions');
    }

    // Default next steps
    if (nextSteps.length === 0) {
      nextSteps.push('Review current progress and objectives');
      nextSteps.push('Continue with planned work');
    }

    return nextSteps;
  }
}
