// Token Tracking and Budget Management Utilities
// File: src/utils/token-tracker.ts

import { logger } from './logger.js';

export interface TokenEstimationOptions {
  includeJson?: boolean;
  includeMetadata?: boolean;
  multiplier?: number;
}

export interface HandoffState {
  needsHandoff: boolean;
  remainingTokens: number;
  usedTokens: number;
  threshold: number;
  recommendations: string[];
}

export class TokenTracker {
  // Conservative token estimation (roughly 4 characters per token)
  static estimateTokens(content: unknown, options: TokenEstimationOptions = {}): number {
    const { includeJson = true, /* includeMetadata = false, */ multiplier = 1.2 } = options;

    let text = '';

    if (typeof content === 'string') {
      text = content;
    } else if (includeJson && content !== null && content !== undefined) {
      try {
        text = JSON.stringify(content);
      } catch {
        text = String(content);
      }
    } else {
      text = String(content);
    }

    // Basic token estimation: ~4 characters per token
    const baseTokens = Math.ceil(text.length / 4);

    // Apply multiplier for JSON structure overhead
    const adjustedTokens = Math.ceil(baseTokens * multiplier);

    logger.debug(
      {
        contentLength: text.length,
        baseTokens,
        adjustedTokens,
        multiplier
      },
      'Token estimation completed'
    );

    return adjustedTokens;
  }

  static analyzeHandoffState(
    usedTokens: number,
    maxTokens: number = 200000,
    handoffThreshold: number = 180000
  ): HandoffState {
    const remainingTokens = maxTokens - usedTokens;
    const needsHandoff = usedTokens >= handoffThreshold;
    const percentageUsed = (usedTokens / maxTokens) * 100;

    const recommendations: string[] = [];

    if (needsHandoff) {
      recommendations.push('Store complete state immediately');
      recommendations.push('Create task_state handoff context');
      recommendations.push('Summarize key decisions and progress');
    } else if (percentageUsed > 75) {
      recommendations.push('Consider storing intermediate state');
      recommendations.push('Prepare for potential handoff');
    } else if (percentageUsed > 50) {
      recommendations.push('Monitor token usage closely');
    }

    if (remainingTokens < 20000) {
      recommendations.push('Critical: Very low token budget remaining');
    }

    return {
      needsHandoff,
      remainingTokens,
      usedTokens,
      threshold: handoffThreshold,
      recommendations
    };
  }

  static compressContextValue(value: unknown, maxTokens: number = 5000): unknown {
    const currentTokens = this.estimateTokens(value);

    if (currentTokens <= maxTokens) {
      return value;
    }

    // If it's a string, truncate it
    if (typeof value === 'string') {
      const maxLength = maxTokens * 4; // Rough character estimate
      return value.substring(0, maxLength) + '... [TRUNCATED]';
    }

    // If it's an object, try to compress it
    if (typeof value === 'object' && value !== null) {
      try {
        const compressed = this.compressObject(value, maxTokens);
        return compressed;
      } catch {
        return `[OBJECT TOO LARGE - ${currentTokens} tokens]`;
      }
    }

    return value;
  }

  private static compressObject(obj: unknown, maxTokens: number): unknown {
    if (Array.isArray(obj)) {
      // For arrays, take the first few items
      const itemCount = Math.max(1, Math.floor(maxTokens / 100));
      return obj
        .slice(0, itemCount)
        .concat(obj.length > itemCount ? [`... and ${obj.length - itemCount} more items`] : []);
    }

    if (typeof obj === 'object' && obj !== null) {
      const result: Record<string, unknown> = {};
      const entries = Object.entries(obj);
      const maxEntries = Math.max(1, Math.floor(maxTokens / 200));

      for (let i = 0; i < Math.min(entries.length, maxEntries); i++) {
        const entry = entries[i];
        if (entry) {
          const [key, value] = entry;
          result[key] = this.compressContextValue(value, Math.floor(maxTokens / maxEntries));
        }
      }

      if (entries.length > maxEntries) {
        result['__truncated__'] = `... and ${entries.length - maxEntries} more properties`;
      }

      return result;
    }

    return obj;
  }

  static generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  static createHandoffContext(
    currentState: Record<string, unknown>,
    sessionId: string,
    nextSteps: string[]
  ): Record<string, unknown> {
    const timestamp = new Date().toISOString();

    return {
      handoff_type: 'token_limit_reached',
      session_id: sessionId,
      handoff_timestamp: timestamp,
      current_state: this.compressContextValue(currentState, 10000),
      next_steps: nextSteps,
      context_summary: this.generateContextSummary(currentState),
      token_usage: {
        reason: 'Approaching token limit',
        threshold_reached: true,
        recommendations: ['Resume from this state', 'Continue with next steps']
      }
    };
  }

  private static generateContextSummary(state: Record<string, unknown>): string {
    const keys = Object.keys(state);
    const summary = [
      `Context contains ${keys.length} main sections:`,
      ...keys.slice(0, 5).map(key => `- ${key}: ${typeof state[key]}`),
      keys.length > 5 ? `... and ${keys.length - 5} more sections` : ''
    ].filter(Boolean);

    return summary.join('\n');
  }

  static detectTaskCompletion(context: Record<string, unknown>): {
    isComplete: boolean;
    completionPercentage: number;
    remainingTasks: string[];
  } {
    // Simple heuristic-based task completion detection
    const indicators = {
      complete: ['complete', 'done', 'finished', 'success', 'implemented'],
      incomplete: ['todo', 'pending', 'next', 'remaining', 'error', 'failed']
    };

    const text = JSON.stringify(context).toLowerCase();

    let completeScore = 0;
    let incompleteScore = 0;

    indicators.complete.forEach(word => {
      const matches = (text.match(new RegExp(word, 'g')) || []).length;
      completeScore += matches;
    });

    indicators.incomplete.forEach(word => {
      const matches = (text.match(new RegExp(word, 'g')) || []).length;
      incompleteScore += matches;
    });

    const totalScore = completeScore + incompleteScore;
    const completionPercentage = totalScore > 0 ? (completeScore / totalScore) * 100 : 0;
    const isComplete = completionPercentage > 70;

    // Extract potential remaining tasks
    const remainingTasks = this.extractTasks(text, indicators.incomplete);

    return {
      isComplete,
      completionPercentage,
      remainingTasks
    };
  }

  private static extractTasks(text: string, _indicators: string[]): string[] {
    const tasks: string[] = [];

    // Look for patterns like "TODO:", "Next:", etc.
    const taskPatterns = [
      /(?:todo|next|remaining|pending):\s*([^\n.!?]{10,100})/gi,
      /(?:need to|must|should)\s+([^\n.!?]{10,100})/gi
    ];

    taskPatterns.forEach(pattern => {
      const matches = text.match(pattern);
      if (matches) {
        tasks.push(...matches.slice(0, 5)); // Limit to 5 tasks
      }
    });

    return [...new Set(tasks)]; // Remove duplicates
  }
}
