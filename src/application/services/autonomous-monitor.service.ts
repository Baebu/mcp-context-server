// Autonomous System Monitor Service
// File: src/application/services/autonomous-monitor.service.ts

import { injectable, inject } from 'inversify';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import { AutoStateManagerService } from './auto-state-manager.service.js';
import { AdvancedFeaturesService } from './advanced-features.service.js';
import { logger } from '../../utils/logger.js';
import * as cron from 'node-cron';

export interface MonitorConfig {
  tokenCheckInterval: number; // milliseconds
  archiveInterval: string; // cron expression
  deduplicationInterval: string; // cron expression
  compressionThreshold: number; // bytes
  panicThreshold: number; // percentage of max tokens
  handoffThreshold: number; // percentage of max tokens
  autoCheckpointThreshold: number; // percentage of max tokens
}

export interface SystemState {
  sessionId: string;
  currentTokens: number;
  maxTokens: number;
  lastCheckpoint?: string;
  isPanicMode: boolean;
  isHandoffMode: boolean;
}

@injectable()
export class AutonomousMonitorService {
  private tokenMonitorInterval?: NodeJS.Timeout;
  private archiveJob?: cron.ScheduledTask;
  private deduplicationJob?: cron.ScheduledTask;
  private systemStates: Map<string, SystemState> = new Map();
  private isMonitoring: boolean = false;

  private defaultConfig: MonitorConfig = {
    tokenCheckInterval: 5000, // Check every 5 seconds
    archiveInterval: '0 2 * * *', // Daily at 2 AM
    deduplicationInterval: '0 */6 * * *', // Every 6 hours
    compressionThreshold: 10000, // 10KB
    panicThreshold: 0.95, // 95% of max tokens
    handoffThreshold: 0.9, // 90% of max tokens
    autoCheckpointThreshold: 0.7 // 70% of max tokens
  };

  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler,
    @inject(AutoStateManagerService) private autoStateManager: AutoStateManagerService,
    @inject(AdvancedFeaturesService) private advancedFeatures: AdvancedFeaturesService
  ) {}

  /**
   * Start autonomous monitoring
   */
  async startMonitoring(config?: Partial<MonitorConfig>): Promise<void> {
    if (this.isMonitoring) {
      logger.warn('Autonomous monitoring already running');
      return;
    }

    const finalConfig = { ...this.defaultConfig, ...config };
    this.isMonitoring = true;

    logger.info({ config: finalConfig }, 'Starting autonomous system monitoring');

    // Start token monitoring
    this.startTokenMonitoring(finalConfig);

    // Start scheduled tasks
    this.startScheduledTasks(finalConfig);

    // Initialize compression monitoring
    this.initializeCompressionMonitoring();

    logger.info('Autonomous monitoring started successfully');
  }

  /**
   * Stop all monitoring
   */
  async stopMonitoring(): Promise<void> {
    logger.info('Stopping autonomous monitoring');

    if (this.tokenMonitorInterval) {
      clearInterval(this.tokenMonitorInterval);
      this.tokenMonitorInterval = undefined;
    }

    if (this.archiveJob) {
      this.archiveJob.stop();
      this.archiveJob = undefined;
    }

    if (this.deduplicationJob) {
      this.deduplicationJob.stop();
      this.deduplicationJob = undefined;
    }

    this.isMonitoring = false;
    this.systemStates.clear();

    logger.info('Autonomous monitoring stopped');
  }

  /**
   * Register a session for monitoring
   */
  async registerSession(sessionId: string, maxTokens: number = 200000): Promise<void> {
    const state: SystemState = {
      sessionId,
      currentTokens: 0,
      maxTokens,
      isPanicMode: false,
      isHandoffMode: false
    };

    this.systemStates.set(sessionId, state);
    
    // Create token budget if not exists
    try {
      await this.db.createTokenBudget(sessionId, maxTokens);
    } catch (error) {
      logger.warn({ error, sessionId }, 'Failed to create token budget');
    }

    logger.info({ sessionId, maxTokens }, 'Session registered for autonomous monitoring');
  }

  /**
   * Update session state (called automatically when contexts are stored)
   */
  async updateSessionState(sessionId: string, operation: string, tokensUsed: number): Promise<void> {
    const state = this.systemStates.get(sessionId);
    if (!state) {
      // Auto-register if not exists
      await this.registerSession(sessionId);
      return;
    }

    state.currentTokens += tokensUsed;

    // Check thresholds and trigger actions
    await this.checkThresholdsAndAct(state, operation);
  }

  /**
   * Start token monitoring loop
   */
  private startTokenMonitoring(config: MonitorConfig): void {
    this.tokenMonitorInterval = setInterval(async () => {
      for (const [sessionId, state] of this.systemStates) {
        try {
          // Get actual token usage from database
          const budget = await this.db.getTokenBudget(sessionId);
          if (budget) {
            state.currentTokens = budget.usedTokens;
            await this.checkThresholdsAndAct(state, 'periodic_check');
          }
        } catch (error) {
          logger.error({ error, sessionId }, 'Error in token monitoring');
        }
      }
    }, config.tokenCheckInterval);
  }

  /**
   * Check token thresholds and trigger appropriate actions
   */
  private async checkThresholdsAndAct(state: SystemState, operation: string): Promise<void> {
    const tokenPercentage = state.currentTokens / state.maxTokens;

    // PANIC MODE - 95%+
    if (tokenPercentage >= this.defaultConfig.panicThreshold && !state.isPanicMode) {
      state.isPanicMode = true;
      await this.triggerPanicMode(state, operation);
    }
    // HANDOFF MODE - 90%+
    else if (tokenPercentage >= this.defaultConfig.handoffThreshold && !state.isHandoffMode) {
      state.isHandoffMode = true;
      await this.triggerHandoffMode(state, operation);
    }
    // AUTO CHECKPOINT - 70%+
    else if (tokenPercentage >= this.defaultConfig.autoCheckpointThreshold) {
      await this.triggerAutoCheckpoint(state, operation);
    }

    // Log critical states
    if (tokenPercentage >= 0.8) {
      logger.warn({
        sessionId: state.sessionId,
        tokenPercentage: Math.round(tokenPercentage * 100),
        currentTokens: state.currentTokens,
        maxTokens: state.maxTokens
      }, 'High token usage detected');
    }
  }

  /**
   * Trigger panic mode - emergency state preservation
   */
  private async triggerPanicMode(state: SystemState, operation: string): Promise<void> {
    logger.error({
      sessionId: state.sessionId,
      tokenPercentage: Math.round((state.currentTokens / state.maxTokens) * 100)
    }, 'PANIC MODE TRIGGERED - Emergency state preservation');

    try {
      // Get current session state
      const contexts = await this.db.queryEnhancedContext({
        keyPattern: state.sessionId,
        sortBy: 'updated',
        sortOrder: 'desc',
        limit: 10
      });

      // Create panic storage
      const panicKey = `panic_${state.sessionId}_${Date.now()}`;
      const compressedState = this.autoStateManager.compressState(
        { contexts, operation, tokenUsage: state },
        { compressionLevel: 'aggressive' }
      );

      await this.db.storeEnhancedContext({
        key: panicKey,
        value: {
          emergency_type: 'autonomous_panic',
          session_id: state.sessionId,
          panic_timestamp: new Date().toISOString(),
          reason: `Token usage at ${Math.round((state.currentTokens / state.maxTokens) * 100)}%`,
          priority: 'critical',
          current_state: compressedState,
          recovery_instructions: [
            'CRITICAL: Token limit reached',
            'Use recover_from_panic tool with this key',
            'Start new session immediately',
            'Review and compress existing contexts'
          ]
        },
        type: 'emergency',
        contextType: 'panic_storage',
        metadata: {
          autonomous: true,
          critical: true,
          sessionId: state.sessionId
        },
        createdAt: new Date(),
        updatedAt: new Date()
      });

      // Send alert (could integrate with notification system)
      logger.fatal({
        panicKey,
        sessionId: state.sessionId,
        tokenUsage: state.currentTokens,
        maxTokens: state.maxTokens
      }, 'PANIC STORAGE CREATED - Immediate action required');

    } catch (error) {
      logger.fatal({ error, sessionId: state.sessionId }, 'PANIC MODE FAILED - System critical');
    }
  }

  /**
   * Trigger handoff mode - prepare for session transition
   */
  private async triggerHandoffMode(state: SystemState, operation: string): Promise<void> {
    logger.warn({
      sessionId: state.sessionId,
      tokenPercentage: Math.round((state.currentTokens / state.maxTokens) * 100)
    }, 'HANDOFF MODE TRIGGERED - Preparing session transition');

    try {
      // Create comprehensive handoff
      const handoffResult = await this.autoStateManager.detectHandoff(
        state.sessionId,
        { operation, tokenState: state }
      );

      if (handoffResult.handoffContext) {
        const handoffKey = `handoff_${state.sessionId}_${Date.now()}`;
        
        await this.db.storeEnhancedContext({
          key: handoffKey,
          value: handoffResult.handoffContext,
          type: 'handoff',
          contextType: 'autonomous_handoff',
          metadata: {
            autonomous: true,
            sessionId: state.sessionId,
            remainingTokens: handoffResult.remainingTokens
          },
          createdAt: new Date(),
          updatedAt: new Date()
        });

        logger.info({
          handoffKey,
          sessionId: state.sessionId,
          remainingTokens: handoffResult.remainingTokens
        }, 'Autonomous handoff created');
      }
    } catch (error) {
      logger.error({ error, sessionId: state.sessionId }, 'Handoff mode failed');
    }
  }

  /**
   * Trigger auto checkpoint
   */
  private async triggerAutoCheckpoint(state: SystemState, operation: string): Promise<void> {
    try {
      // Only checkpoint if significant time has passed or no recent checkpoint
      const shouldCheckpoint = !state.lastCheckpoint || 
        (Date.now() - new Date(state.lastCheckpoint).getTime()) > 300000; // 5 minutes

      if (shouldCheckpoint) {
        const result = await this.autoStateManager.autoCheckpoint({
          sessionId: state.sessionId,
          currentState: { operation, tokenUsage: state },
          operation: `autonomous_${operation}`,
          forceCheckpoint: false
        });

        if (result.checkpointed) {
          state.lastCheckpoint = new Date().toISOString();
          logger.debug({
            sessionId: state.sessionId,
            checkpointKey: result.key
          }, 'Autonomous checkpoint created');
        }
      }
    } catch (error) {
      logger.error({ error, sessionId: state.sessionId }, 'Auto checkpoint failed');
    }
  }

  /**
   * Initialize compression monitoring for new contexts
   */
  private initializeCompressionMonitoring(): void {
    // Hook into context storage to auto-compress large contexts
    const originalStore = this.db.storeEnhancedContext.bind(this.db);
    
    this.db.storeEnhancedContext = async (entry) => {
      // Check if context should be compressed
      const size = JSON.stringify(entry.value).length;
      
      if (size > this.defaultConfig.compressionThreshold && !entry.metadata?.compressed) {
        try {
          const compressed = this.autoStateManager.compressState({ content: entry.value }, {
            compressionLevel: 'medium'
          }).content;
          
          entry.value = compressed;
          entry.metadata = {
            ...entry.metadata,
            compressed: true,
            originalSize: size,
            compressedSize: JSON.stringify(compressed).length
          };
          
          logger.debug({
            key: entry.key,
            originalSize: size,
            compressedSize: JSON.stringify(compressed).length
          }, 'Auto-compressed large context');
        } catch (error) {
          logger.warn({ error, key: entry.key }, 'Auto-compression failed');
        }
      }

      // Update session state if sessionId present
      const sessionId = entry.metadata?.sessionId || 
        (entry.value as any)?.sessionId || 
        (entry.value as any)?.session_id;
        
      if (sessionId && entry.tokenCount) {
        await this.updateSessionState(sessionId, 'store_context', entry.tokenCount);
      }

      return originalStore(entry);
    };
  }

  /**
   * Start scheduled background tasks
   */
  private startScheduledTasks(config: MonitorConfig): void {
    // Archive old contexts
    this.archiveJob = cron.schedule(config.archiveInterval, async () => {
      logger.info('Running scheduled archive task');
      try {
        await this.advancedFeatures.archiveOldContexts({
          maxAge: 2160, // 90 days
          compressionLevel: 7
        });
      } catch (error) {
        logger.error({ error }, 'Scheduled archive task failed');
      }
    });

    // Deduplicate contexts
    this.deduplicationJob = cron.schedule(config.deduplicationInterval, async () => {
      logger.info('Running scheduled deduplication task');
      try {
        await this.advancedFeatures.deduplicateContexts({
          similarityThreshold: 0.85,
          mergeStrategy: 'keep_newest'
        });
      } catch (error) {
        logger.error({ error }, 'Scheduled deduplication task failed');
      }
    });

    // Start the scheduled tasks
    this.archiveJob.start();
    this.deduplicationJob.start();
  }

  /**
   * Get monitoring status
   */
  getMonitoringStatus(): {
    isActive: boolean;
    sessions: Array<{
      sessionId: string;
      tokenUsage: number;
      tokenPercentage: number;
      isPanicMode: boolean;
      isHandoffMode: boolean;
    }>;
  } {
    const sessions = Array.from(this.systemStates.entries()).map(([sessionId, state]) => ({
      sessionId,
      tokenUsage: state.currentTokens,
      tokenPercentage: Math.round((state.currentTokens / state.maxTokens) * 100),
      isPanicMode: state.isPanicMode,
      isHandoffMode: state.isHandoffMode
    }));

    return {
      isActive: this.isMonitoring,
      sessions
    };
  }
}
