// Advanced Features Tools for Compression, Optimization, and Templates
// File: src/application/tools/advanced-features.tool.ts

import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import { AdvancedFeaturesService } from '../services/advanced-features.service.js';
import type { CompressionOptions, TokenBudgetOptions, DeduplicationOptions, ArchivalOptions, AdaptiveWorkflowOptions, SmartPathGenerationOptions } from '../services/advanced-features.service.js';


// ===== COMPRESSION & OPTIMIZATION TOOLS =====

// Schema for CompressionAlgorithmsTool
const compressionAlgorithmsSchema = z.object({
  algorithm: z.enum(['lz4', 'gzip', 'brotli', 'semantic', 'hybrid']).default('hybrid').describe('Compression algorithm to use'),
  compressionLevel: z.number().min(1).max(9).optional().default(6).describe('Compression level (1-9)'),
  minSize: z.number().optional().default(1000).describe('Minimum size in bytes to compress'),
  preserveStructure: z.boolean().optional().default(true).describe('Preserve data structure during compression'),
  batchSize: z.number().optional().default(100).describe('Number of contexts to process in each batch')
});

@injectable()
export class CompressionAlgorithmsTool implements IMCPTool {
  name = 'compression_algorithms';
  description = 'Apply advanced compression algorithms to optimize context storage';
  schema = compressionAlgorithmsSchema;

  constructor(
    @inject(AdvancedFeaturesService) private advancedFeaturesService: AdvancedFeaturesService
  ) {}

  async execute(params: z.infer<typeof compressionAlgorithmsSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: CompressionOptions = {
        algorithm: params.algorithm,
        compressionLevel: params.compressionLevel,
        minSize: params.minSize,
        preserveStructure: params.preserveStructure,
        batchSize: params.batchSize
      };

      const result = await this.advancedFeaturesService.applyCompression(options);

      const response = {
        compressionOperation: {
          algorithm: params.algorithm,
          options,
          processedCount: result.processedCount,
          compressedCount: result.compressedCount
        },
        results: {
          totalSavings: result.totalSavings,
          compressionRatio: Math.round(result.compressionRatio * 100) / 100,
          storageEfficiency: Math.round((1 - result.compressionRatio) * 100),
          processingTime: result.summary.timeElapsed
        },
        analysis: {
          compressionEffectiveness: this.analyzeCompressionEffectiveness(result),
          algorithmPerformance: this.analyzeAlgorithmPerformance(result, params.algorithm),
          qualityMetrics: {
            successRate: result.compressedCount / Math.max(result.processedCount, 1) * 100,
            errorRate: result.errors.length / Math.max(result.processedCount, 1) * 100,
            averageSavings: result.compressedCount > 0 ? result.totalSavings / result.compressedCount : 0
          }
        },
        recommendations: this.generateCompressionRecommendations(result, options),
        insights: this.generateCompressionInsights(result),
        errors: result.errors.slice(0, 5) // Limit error display
      };

      context.logger.info({
        algorithm: params.algorithm,
        processedCount: result.processedCount,
        compressedCount: result.compressedCount,
        compressionRatio: result.compressionRatio,
        totalSavings: result.totalSavings
      }, 'Compression algorithms completed');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, options: params }, 'Failed to apply compression algorithms');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to apply compression algorithms: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private analyzeCompressionEffectiveness(result: any): string {
    const efficiency = 1 - result.compressionRatio;
    if (efficiency > 0.5) return 'excellent';
    if (efficiency > 0.3) return 'good';
    if (efficiency > 0.15) return 'moderate';
    return 'limited';
  }

  private analyzeAlgorithmPerformance(result: any, algorithm: string): {
    speed: string;
    ratio: string;
    suitability: string;
  } {
    const timePerItem = result.summary.timeElapsed / Math.max(result.processedCount, 1);
    
    return {
      speed: timePerItem < 10 ? 'fast' : timePerItem < 50 ? 'moderate' : 'slow',
      ratio: result.compressionRatio < 0.5 ? 'excellent' : result.compressionRatio < 0.7 ? 'good' : 'fair',
      suitability: algorithm === 'hybrid' ? 'optimal' : algorithm === 'semantic' ? 'content-aware' : 'general-purpose'
    };
  }

  private generateCompressionRecommendations(result: any, options: CompressionOptions): string[] {
    const recommendations = [];

    if (result.compressionRatio > 0.8) {
      recommendations.push('Low compression ratio - consider using semantic or hybrid algorithms for better results');
    }

    if (result.errors.length > result.processedCount * 0.1) {
      recommendations.push('High error rate - review input data quality and algorithm parameters');
    }

    if (options.algorithm === 'semantic' && result.compressionRatio > 0.6) {
      recommendations.push('Semantic compression underperforming - may be better suited for structured data');
    }

    if (result.totalSavings > 1000000) { // 1MB
      recommendations.push('Significant storage savings achieved - consider regular compression maintenance');
    }

    recommendations.push(`Processed ${result.processedCount} contexts with ${Math.round((1 - result.compressionRatio) * 100)}% storage reduction`);

    return recommendations;
  }

  private generateCompressionInsights(result: any): string[] {
    const insights = [];

    const efficiency = (1 - result.compressionRatio) * 100;
    insights.push(`Achieved ${Math.round(efficiency)}% storage reduction across ${result.compressedCount} contexts`);

    if (result.compressedCount > 0) {
      const avgSavingsPerContext = result.totalSavings / result.compressedCount;
      insights.push(`Average savings per context: ${Math.round(avgSavingsPerContext)} bytes`);
    }

    const processingSpeed = result.processedCount / (result.summary.timeElapsed / 1000);
    insights.push(`Processing speed: ${Math.round(processingSpeed)} contexts per second`);

    if (result.errors.length > 0) {
      insights.push(`${result.errors.length} contexts could not be compressed`);
    }

    return insights;
  }
}

// Schema for TokenBudgetOptimizationTool
const tokenBudgetOptimizationSchema = z.object({
  maxTokens: z.number().optional().default(200000).describe('Maximum token budget'),
  targetUtilization: z.number().min(0.1).max(1.0).optional().default(0.8).describe('Target utilization percentage'),
  priorityWeights: z.object({
    recency: z.number().optional().default(0.3),
    frequency: z.number().optional().default(0.2),
    importance: z.number().optional().default(0.3),
    relationships: z.number().optional().default(0.2)
  }).optional().describe('Weights for different priority factors'),
  preserveTypes: z.array(z.string()).optional().describe('Context types to preserve from optimization'),
  archiveThreshold: z.number().min(0).max(1).optional().default(0.3).describe('Threshold below which contexts are archived')
});

@injectable()
export class TokenBudgetOptimizationTool implements IMCPTool {
  name = 'token_budget_optimization';
  description = 'Optimize token usage and manage budget constraints intelligently';
  schema = tokenBudgetOptimizationSchema;

  constructor(
    @inject(AdvancedFeaturesService) private advancedFeaturesService: AdvancedFeaturesService
  ) {}

  async execute(params: z.infer<typeof tokenBudgetOptimizationSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: TokenBudgetOptions = {
        maxTokens: params.maxTokens,
        targetUtilization: params.targetUtilization,
        priorityWeights: params.priorityWeights,
        preserveTypes: params.preserveTypes,
        archiveThreshold: params.archiveThreshold
      };

      const result = await this.advancedFeaturesService.optimizeTokenBudget(options);

      const response = {
        budgetOptimization: {
          maxTokens: params.maxTokens,
          targetUtilization: params.targetUtilization,
          currentUsage: result.currentUsage,
          targetUsage: result.targetUsage,
          optimizedUsage: result.optimizedUsage
        },
        results: {
          tokensSaved: result.tokensSaved,
          efficiency: Math.round(result.efficiency * 100) / 100,
          utilizationBefore: Math.round((result.currentUsage / params.maxTokens) * 100),
          utilizationAfter: Math.round((result.optimizedUsage / params.maxTokens) * 100),
          optimizationGoalMet: result.optimizedUsage <= result.targetUsage
        },
        actions: result.actions.map(action => ({
          action: action.action,
          contextKey: action.contextKey,
          tokensSaved: action.tokensSaved,
          impact: action.impact,
          description: this.describeOptimizationAction(action)
        })),
        analysis: {
          budgetHealth: this.analyzeBudgetHealth(result, params.maxTokens),
          optimizationBreakdown: this.analyzeOptimizationActions(result.actions),
          performanceImpact: this.assessPerformanceImpact(result.actions)
        },
        recommendations: result.recommendations,
        futureProjections: this.generateFutureProjections(result, options)
      };

      context.logger.info({
        currentUsage: result.currentUsage,
        targetUsage: result.targetUsage,
        optimizedUsage: result.optimizedUsage,
        tokensSaved: result.tokensSaved,
        efficiency: result.efficiency,
        actionsCount: result.actions.length
      }, 'Token budget optimization completed');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, options: params }, 'Failed to optimize token budget');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to optimize token budget: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private describeOptimizationAction(action: any): string {
    const descriptions = {
      compress: 'Apply compression to reduce token count while preserving information',
      archive: 'Move to long-term storage to free up active token budget',
      deduplicate: 'Remove duplicate content to eliminate redundancy',
      summarize: 'Create concise summary to reduce token usage'
    };

    return descriptions[action.action as keyof typeof descriptions] || 'Optimization action';
  }

  private analyzeBudgetHealth(result: any, maxTokens: number): {
    status: string;
    utilization: number;
    capacity: string;
    trend: string;
  } {
    const utilization = result.optimizedUsage / maxTokens;
    
    let status = 'healthy';
    if (utilization > 0.9) status = 'critical';
    else if (utilization > 0.8) status = 'warning';
    else if (utilization > 0.6) status = 'moderate';

    let capacity = 'sufficient';
    if (utilization > 0.85) capacity = 'limited';
    if (utilization > 0.95) capacity = 'exhausted';

    const trend = result.tokensSaved > 0 ? 'improving' : 'stable';

    return {
      status,
      utilization: Math.round(utilization * 100),
      capacity,
      trend
    };
  }

  private analyzeOptimizationActions(actions: any[]): Record<string, number> {
    return actions.reduce((acc, action) => {
      acc[action.action] = (acc[action.action] || 0) + 1;
      return acc;
    }, {});
  }

  private assessPerformanceImpact(actions: any[]): {
    overallImpact: string;
    riskLevel: string;
    recoverability: string;
  } {
    const highImpactActions = actions.filter(a => a.impact === 'high').length;
    const archiveActions = actions.filter(a => a.action === 'archive').length;

    let overallImpact = 'minimal';
    if (highImpactActions > 5) overallImpact = 'significant';
    else if (highImpactActions > 0) overallImpact = 'moderate';

    let riskLevel = 'low';
    if (archiveActions > actions.length * 0.5) riskLevel = 'medium';
    if (archiveActions > actions.length * 0.8) riskLevel = 'high';

    const recoverability = archiveActions > 0 ? 'partial' : 'full';

    return { overallImpact, riskLevel, recoverability };
  }

  private generateFutureProjections(result: any, options: TokenBudgetOptions): {
    projectedGrowth: string;
    maintenanceSchedule: string;
    scalabilityAssessment: string;
  } {
    const efficiency = result.efficiency;
    
    return {
      projectedGrowth: efficiency > 0.9 ? 'sustainable' : efficiency > 0.7 ? 'manageable' : 'concerning',
      maintenanceSchedule: result.tokensSaved > 50000 ? 'monthly' : result.tokensSaved > 20000 ? 'quarterly' : 'as-needed',
      scalabilityAssessment: options.maxTokens && result.optimizedUsage < options.maxTokens * 0.6 ? 'good' : 'limited'
    };
  }
}

// Schema for ContextDeduplicationTool
const contextDeduplicationSchema = z.object({
  similarityThreshold: z.number().min(0.1).max(1.0).optional().default(0.85).describe('Minimum similarity threshold for deduplication'),
  preserveRecent: z.boolean().optional().default(true).describe('Preserve more recent contexts when deduplicating'),
  batchSize: z.number().optional().default(50).describe('Number of contexts to process in each batch'),
  fieldWeights: z.object({
    content: z.number().optional().default(0.6),
    metadata: z.number().optional().default(0.2),
    tags: z.number().optional().default(0.2),
    relationships: z.number().optional().default(0.0)
  }).optional().describe('Weights for different fields in similarity calculation'),
  mergeStrategy: z.enum(['keep_newest', 'keep_oldest', 'merge_all', 'manual_review']).optional().default('keep_newest').describe('Strategy for handling duplicates')
});

@injectable()
export class ContextDeduplicationTool implements IMCPTool {
  name = 'context_deduplication';
  description = 'Intelligently remove duplicate contexts while preserving important information';
  schema = contextDeduplicationSchema;

  constructor(
    @inject(AdvancedFeaturesService) private advancedFeaturesService: AdvancedFeaturesService
  ) {}

  async execute(params: z.infer<typeof contextDeduplicationSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: DeduplicationOptions = {
        similarityThreshold: params.similarityThreshold,
        preserveRecent: params.preserveRecent,
        batchSize: params.batchSize,
        fieldWeights: params.fieldWeights,
        mergeStrategy: params.mergeStrategy
      };

      const result = await this.advancedFeaturesService.deduplicateContexts(options);

      const response = {
        deduplicationOperation: {
          similarityThreshold: params.similarityThreshold,
          mergeStrategy: params.mergeStrategy,
          totalAnalyzed: result.totalAnalyzed,
          duplicatesFound: result.duplicatesFound
        },
        results: {
          duplicatesRemoved: result.duplicatesRemoved,
          spaceFreed: result.spaceFreed,
          mergedContexts: result.mergedContexts,
          efficiencyGain: Math.round(result.summary.efficiencyGain * 100) / 100,
          qualityScore: Math.round(result.summary.qualityScore * 100) / 100
        },
        duplicateGroups: result.duplicateGroups.slice(0, 10).map(group => ({
          groupId: group.groupId,
          memberCount: group.members.length,
          similarity: Math.round(group.similarity * 100) / 100,
          action: group.action,
          members: group.members.slice(0, 5) // Limit member display
        })),
        analysis: {
          deduplicationEffectiveness: this.analyzeDeduplicationEffectiveness(result),
          qualityAssessment: this.assessDeduplicationQuality(result),
          storageOptimization: this.analyzeStorageOptimization(result)
        },
        insights: this.generateDeduplicationInsights(result),
        recommendations: this.generateDeduplicationRecommendations(result, options),
        riskAssessment: this.assessDeduplicationRisks(result, params.mergeStrategy)
      };

      context.logger.info({
        totalAnalyzed: result.totalAnalyzed,
        duplicatesFound: result.duplicatesFound,
        duplicatesRemoved: result.duplicatesRemoved,
        spaceFreed: result.spaceFreed,
        efficiencyGain: result.summary.efficiencyGain,
        qualityScore: result.summary.qualityScore
      }, 'Context deduplication completed');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, options: params }, 'Failed to deduplicate contexts');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to deduplicate contexts: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private analyzeDeduplicationEffectiveness(result: any): string {
    const duplicateRate = result.duplicatesFound / Math.max(result.totalAnalyzed, 1);
    if (duplicateRate > 0.3) return 'high-redundancy';
    if (duplicateRate > 0.15) return 'moderate-redundancy';
    if (duplicateRate > 0.05) return 'low-redundancy';
    return 'minimal-redundancy';
  }

  private assessDeduplicationQuality(result: any): {
    precision: string;
    recall: string;
    confidence: string;
  } {
    const qualityScore = result.summary.qualityScore;
    
    return {
      precision: qualityScore > 0.8 ? 'high' : qualityScore > 0.6 ? 'medium' : 'low',
      recall: result.summary.efficiencyGain > 20 ? 'high' : result.summary.efficiencyGain > 10 ? 'medium' : 'low',
      confidence: qualityScore > 0.7 && result.summary.efficiencyGain > 15 ? 'high' : 'medium'
    };
  }

  private analyzeStorageOptimization(result: any): {
    spaceReduction: number;
    storageEfficiency: string;
    maintenanceImpact: string;
  } {
    const spaceReduction = (result.spaceFreed / Math.max(result.totalAnalyzed * 1000, 1)) * 100; // Estimate
    
    return {
      spaceReduction: Math.round(spaceReduction),
      storageEfficiency: spaceReduction > 20 ? 'excellent' : spaceReduction > 10 ? 'good' : 'limited',
      maintenanceImpact: result.duplicatesRemoved > 100 ? 'significant' : result.duplicatesRemoved > 20 ? 'moderate' : 'minimal'
    };
  }

  private generateDeduplicationInsights(result: any): string[] {
    const insights = [];

    if (result.duplicatesFound === 0) {
      insights.push('No duplicates found - context collection is well-maintained');
      return insights;
    }

    const duplicateRate = (result.duplicatesFound / result.totalAnalyzed) * 100;
    insights.push(`${Math.round(duplicateRate)}% duplicate rate detected across ${result.totalAnalyzed} contexts`);

    if (result.mergedContexts > 0) {
      insights.push(`${result.mergedContexts} contexts merged to preserve comprehensive information`);
    }

    const avgGroupSize = result.duplicateGroups.reduce((sum: number, group: any) => sum + group.members.length, 0) / Math.max(result.duplicateGroups.length, 1);
    insights.push(`Average duplicate group size: ${Math.round(avgGroupSize)} contexts`);

    if (result.spaceFreed > 1000000) { // 1MB
      insights.push(`Significant storage savings: ${Math.round(result.spaceFreed / 1000000)}MB freed`);
    }

    return insights;
  }

  private generateDeduplicationRecommendations(result: any, options: DeduplicationOptions): string[] {
    const recommendations = [];

    if (result.summary.qualityScore < 0.7) {
      recommendations.push('Low quality score - consider adjusting similarity threshold or field weights');
    }

    if (result.duplicateGroups.length > result.totalAnalyzed * 0.1) {
      recommendations.push('High number of duplicate groups - implement automated deduplication policies');
    }

    if (options.mergeStrategy === 'manual_review' && result.duplicatesFound > 50) {
      recommendations.push('Large number of duplicates for manual review - consider automated strategies');
    }

    if (result.summary.efficiencyGain > 25) {
      recommendations.push('Excellent deduplication results - consider regular maintenance schedule');
    }

    recommendations.push(`Successfully processed ${result.totalAnalyzed} contexts with ${result.summary.efficiencyGain}% efficiency gain`);

    return recommendations;
  }

  private assessDeduplicationRisks(result: any, mergeStrategy: string): {
    dataLossRisk: string;
    recoveryComplexity: string;
    operationalImpact: string;
  } {
    let dataLossRisk = 'low';
    if (mergeStrategy === 'keep_oldest' || result.duplicatesRemoved > result.totalAnalyzed * 0.2) {
      dataLossRisk = 'medium';
    }
    if (mergeStrategy === 'merge_all' && result.mergedContexts > 20) {
      dataLossRisk = 'high';
    }

    const recoveryComplexity = result.mergedContexts > 0 ? 'complex' : result.duplicatesRemoved > 50 ? 'moderate' : 'simple';
    const operationalImpact = result.duplicatesRemoved > 100 ? 'significant' : result.duplicatesRemoved > 20 ? 'moderate' : 'minimal';

    return { dataLossRisk, recoveryComplexity, operationalImpact };
  }
}

// Schema for ArchiveOldContextsTool
const archiveOldContextsSchema = z.object({
  maxAge: z.number().optional().default(2160).describe('Maximum age in hours for contexts to be archived (default: 90 days)'),
  minAccessCount: z.number().optional().default(0).describe('Minimum access count to preserve contexts'),
  preserveRelationships: z.boolean().optional().default(true).describe('Preserve relationships when archiving'),
  compressionLevel: z.number().min(1).max(9).optional().default(7).describe('Compression level for archived content'),
  storageLocation: z.enum(['database', 'file', 'external']).optional().default('database').describe('Location to store archived content'),
  retentionPolicy: z.object({
    keepVersions: z.number().optional().default(3),
    keepMetadata: z.boolean().optional().default(true),
    keepRelationships: z.boolean().optional().default(true)
  }).optional().describe('Retention policy for archived content')
});

@injectable()
export class ArchiveOldContextsTool implements IMCPTool {
  name = 'archive_old_contexts';
  description = 'Archive old contexts for storage optimization while preserving recoverability';
  schema = archiveOldContextsSchema;

  constructor(
    @inject(AdvancedFeaturesService) private advancedFeaturesService: AdvancedFeaturesService
  ) {}

  async execute(params: z.infer<typeof archiveOldContextsSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: ArchivalOptions = {
        maxAge: params.maxAge,
        minAccessCount: params.minAccessCount,
        preserveRelationships: params.preserveRelationships,
        compressionLevel: params.compressionLevel,
        storageLocation: params.storageLocation,
        retentionPolicy: params.retentionPolicy
      };

      const result = await this.advancedFeaturesService.archiveOldContexts(options);

      const response = {
        archivalOperation: {
          maxAge: params.maxAge,
          maxAgeDisplay: this.formatAgeDisplay(params.maxAge),
          storageLocation: params.storageLocation,
          candidatesEvaluated: result.candidatesEvaluated,
          contextsArchived: result.contextsArchived
        },
        results: {
          spaceFreed: result.spaceFreed,
          relationshipsPreserved: result.relationshipsPreserved,
          storageReduction: Math.round(result.summary.storageReduction),
          performanceImpact: Math.round(result.summary.performanceImpact * 100) / 100,
          recoverability: Math.round(result.summary.recoverability * 100) / 100
        },
        analysis: {
          archivalEfficiency: this.analyzeArchivalEfficiency(result),
          storageOptimization: this.analyzeStorageOptimization(result),
          dataPreservation: this.analyzeDataPreservation(result, options)
        },
        insights: this.generateArchivalInsights(result, options),
        recommendations: this.generateArchivalRecommendations(result, options),
        recoverabilityPlan: this.generateRecoverabilityPlan(result, options)
      };

      context.logger.info({
        candidatesEvaluated: result.candidatesEvaluated,
        contextsArchived: result.contextsArchived,
        spaceFreed: result.spaceFreed,
        relationshipsPreserved: result.relationshipsPreserved,
        storageReduction: result.summary.storageReduction,
        performanceImpact: result.summary.performanceImpact
      }, 'Archive old contexts completed');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, options: params }, 'Failed to archive old contexts');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to archive old contexts: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private formatAgeDisplay(hours: number): string {
    const days = Math.round(hours / 24);
    if (days < 7) return `${days} days`;
    if (days < 30) return `${Math.round(days / 7)} weeks`;
    return `${Math.round(days / 30)} months`;
  }

  private analyzeArchivalEfficiency(result: any): {
    candidateUtilization: number;
    archivalRate: number;
    efficiency: string;
  } {
    const candidateUtilization = (result.contextsArchived / Math.max(result.candidatesEvaluated, 1)) * 100;
    const archivalRate = result.contextsArchived;
    
    let efficiency = 'low';
    if (candidateUtilization > 80) efficiency = 'excellent';
    else if (candidateUtilization > 60) efficiency = 'good';
    else if (candidateUtilization > 40) efficiency = 'moderate';

    return {
      candidateUtilization: Math.round(candidateUtilization),
      archivalRate,
      efficiency
    };
  }

  private analyzeStorageOptimization(result: any): {
    spaceReductionMB: number;
    compressionEffectiveness: string;
    storageImpact: string;
  } {
    const spaceReductionMB = Math.round(result.spaceFreed / (1024 * 1024));
    
    let compressionEffectiveness = 'standard';
    if (result.summary.storageReduction > result.spaceFreed * 1.5) compressionEffectiveness = 'excellent';
    else if (result.summary.storageReduction > result.spaceFreed * 1.2) compressionEffectiveness = 'good';

    let storageImpact = 'minimal';
    if (spaceReductionMB > 100) storageImpact = 'significant';
    else if (spaceReductionMB > 10) storageImpact = 'moderate';

    return {
      spaceReductionMB,
      compressionEffectiveness,
      storageImpact
    };
  }

  private analyzeDataPreservation(result: any, options: ArchivalOptions): {
    relationshipPreservation: string;
    metadataRetention: string;
    recoverabilityScore: string;
  } {
    const relationshipPreservation = options.preserveRelationships && result.relationshipsPreserved > 0 ? 'full' : 'none';
    const metadataRetention = options.retentionPolicy?.keepMetadata ? 'full' : 'partial';
    
    let recoverabilityScore = 'good';
    if (result.summary.recoverability > 0.9) recoverabilityScore = 'excellent';
    else if (result.summary.recoverability < 0.7) recoverabilityScore = 'limited';

    return {
      relationshipPreservation,
      metadataRetention,
      recoverabilityScore
    };
  }

  private generateArchivalInsights(result: any, _options: ArchivalOptions): string[] {
    const insights = [];

    if (result.candidatesEvaluated === 0) {
      insights.push('No archival candidates found - all contexts are within the specified age threshold');
      return insights;
    }

    const archivalRate = (result.contextsArchived / result.candidatesEvaluated) * 100;
    insights.push(`${Math.round(archivalRate)}% of eligible contexts were archived (${result.contextsArchived} of ${result.candidatesEvaluated})`);

    if (result.spaceFreed > 0) {
      const spaceMB = Math.round(result.spaceFreed / (1024 * 1024));
      insights.push(`Storage optimization: ${spaceMB}MB freed through archival and compression`);
    }

    if (result.relationshipsPreserved > 0) {
      insights.push(`${result.relationshipsPreserved} relationships preserved to maintain data integrity`);
    }

    const performanceGain = result.summary.performanceImpact * 100;
    if (performanceGain > 10) {
      insights.push(`Expected performance improvement: ${Math.round(performanceGain)}% due to reduced active dataset size`);
    }

    return insights;
  }

  private generateArchivalRecommendations(result: any, options: ArchivalOptions): string[] {
    const recommendations = [];

    if (result.candidatesEvaluated > result.contextsArchived * 2) {
      recommendations.push('Many contexts evaluated but few archived - consider adjusting age or access thresholds');
    }

    if (result.summary.recoverability < 0.8) {
      recommendations.push('Lower recoverability score - ensure backup procedures are in place');
    }

    if (options.storageLocation === 'database' && result.spaceFreed > 50000000) { // 50MB
      recommendations.push('Large archive in database - consider external storage for better performance');
    }

    if (result.relationshipsPreserved === 0 && options.preserveRelationships) {
      recommendations.push('No relationships preserved - verify relationship preservation configuration');
    }

    recommendations.push(`Successfully archived ${result.contextsArchived} contexts with ${Math.round(result.summary.recoverability * 100)}% recoverability`);

    return recommendations;
  }

  private generateRecoverabilityPlan(result: any, options: ArchivalOptions): {
    recoveryMethods: string[];
    estimatedRecoveryTime: string;
    dataIntegrityLevel: string;
  } {
    const recoveryMethods = [];
    
    if (options.storageLocation === 'database') {
      recoveryMethods.push('Direct database query and decompression');
    }
    if (options.retentionPolicy?.keepMetadata) {
      recoveryMethods.push('Metadata-based context reconstruction');
    }
    if (options.preserveRelationships) {
      recoveryMethods.push('Relationship-guided recovery');
    }

    const estimatedRecoveryTime = result.contextsArchived < 100 ? 'minutes' : 
                                 result.contextsArchived < 1000 ? 'hours' : 'days';

    const dataIntegrityLevel = result.summary.recoverability > 0.9 ? 'high' :
                              result.summary.recoverability > 0.7 ? 'medium' : 'limited';

    return {
      recoveryMethods,
      estimatedRecoveryTime,
      dataIntegrityLevel
    };
  }
}

// ===== ADVANCED TEMPLATES TOOLS =====

// Schema for ContextTemplatesLibraryTool
const contextTemplatesLibrarySchema = z.object({
  includeUsageStats: z.boolean().optional().default(true).describe('Include usage statistics in results'),
  filterByCategory: z.string().optional().describe('Filter templates by category'),
  filterByDifficulty: z.enum(['beginner', 'intermediate', 'advanced']).optional().describe('Filter templates by difficulty level'),
  generateNew: z.boolean().optional().default(true).describe('Generate new templates from usage patterns')
});

@injectable()
export class ContextTemplatesLibraryTool implements IMCPTool {
  name = 'context_templates_library';
  description = 'Manage and organize a comprehensive library of reusable context templates';
  schema = contextTemplatesLibrarySchema;

  constructor(
    @inject(AdvancedFeaturesService) private advancedFeaturesService: AdvancedFeaturesService
  ) {}

  async execute(params: z.infer<typeof contextTemplatesLibrarySchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const result = await this.advancedFeaturesService.manageTemplateLibrary();

      // Apply filters
      let filteredTemplates = result.templates;
      
      if (params.filterByCategory) {
        filteredTemplates = filteredTemplates.filter(t => t.category === params.filterByCategory);
      }
      
      if (params.filterByDifficulty) {
        filteredTemplates = filteredTemplates.filter(t => t.metadata.difficulty === params.filterByDifficulty);
      }

      const response = {
        templateLibrary: {
          totalTemplates: result.statistics.totalTemplates,
          filteredCount: filteredTemplates.length,
          filters: {
            category: params.filterByCategory,
            difficulty: params.filterByDifficulty
          }
        },
        statistics: result.statistics,
        templates: filteredTemplates.map(template => ({
          templateId: template.templateId,
          name: template.name,
          description: template.description,
          category: template.category,
          version: template.version,
          difficulty: template.metadata.difficulty,
          usage: params.includeUsageStats ? {
            usageCount: template.usage.usageCount,
            lastUsed: template.usage.lastUsed,
            successRate: Math.round(template.usage.successRate * 100),
            averageRating: Math.round(template.usage.averageRating * 10) / 10
          } : undefined,
          schema: {
            fieldCount: template.schema.fields.length,
            relationshipCount: template.schema.relationships?.length || 0,
            requiredFields: template.schema.fields.filter(f => f.required).length
          },
          tags: template.metadata.tags
        })),
        analysis: {
          libraryHealth: this.analyzeLibraryHealth(result.statistics),
          usagePatterns: this.analyzeUsagePatterns(result.templates),
          categoryDistribution: this.analyzeCategoryDistribution(result.statistics.byCategory)
        },
        recommendations: result.recommendations,
        insights: this.generateTemplateInsights(result.statistics, filteredTemplates),
        topTemplates: result.statistics.topUsed
      };

      context.logger.info({
        totalTemplates: result.statistics.totalTemplates,
        filteredCount: filteredTemplates.length,
        categories: Object.keys(result.statistics.byCategory).length,
        topUsedCount: result.statistics.topUsed.length
      }, 'Context templates library management completed');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to manage context templates library');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to manage context templates library: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private analyzeLibraryHealth(statistics: any): {
    status: string;
    coverage: string;
    utilization: string;
  } {
    const categoryCount = Object.keys(statistics.byCategory).length;
    const avgUsage = statistics.topUsed.length > 0 ? 
      statistics.topUsed.reduce((sum: number, t: any) => sum + t.usageCount, 0) / statistics.topUsed.length : 0;

    let status = 'healthy';
    if (statistics.totalTemplates < 5) status = 'limited';
    else if (statistics.totalTemplates > 50) status = 'comprehensive';

    let coverage = 'basic';
    if (categoryCount > 5) coverage = 'good';
    if (categoryCount > 10) coverage = 'excellent';

    let utilization = 'low';
    if (avgUsage > 10) utilization = 'good';
    if (avgUsage > 25) utilization = 'high';

    return { status, coverage, utilization };
  }

  private analyzeUsagePatterns(templates: any[]): {
    highUsage: number;
    mediumUsage: number;
    lowUsage: number;
    unused: number;
  } {
    return {
      highUsage: templates.filter(t => t.usage.usageCount > 20).length,
      mediumUsage: templates.filter(t => t.usage.usageCount > 5 && t.usage.usageCount <= 20).length,
      lowUsage: templates.filter(t => t.usage.usageCount > 0 && t.usage.usageCount <= 5).length,
      unused: templates.filter(t => t.usage.usageCount === 0).length
    };
  }

  private analyzeCategoryDistribution(byCategory: Record<string, number>): {
    dominant: string | null;
    balanced: boolean;
    gaps: string[];
  } {
    const entries = Object.entries(byCategory);
    if (entries.length === 0) {
      return { dominant: null, balanced: false, gaps: ['No categories found'] };
    }

    const sortedCategories = entries.sort(([,a], [,b]) => b - a);
    const dominant = sortedCategories[0]?.[0] || null;
    const total = sortedCategories.reduce((sum, [,count]) => sum + count, 0);
    const dominantPercentage = sortedCategories[0] ? (sortedCategories[0][1] / total) * 100 : 0;
    
    const balanced = dominantPercentage < 50;
    
    const expectedCategories = ['task', 'knowledge', 'reference', 'workflow', 'decision'];
    const gaps = expectedCategories.filter(cat => !byCategory[cat]);

    return { dominant, balanced, gaps };
  }

  private generateTemplateInsights(statistics: any, templates: any[]): string[] {
    const insights = [];

    if (statistics.totalTemplates === 0) {
      insights.push('Template library is empty - consider creating basic templates for common use cases');
      return insights;
    }

    insights.push(`Library contains ${statistics.totalTemplates} templates across ${Object.keys(statistics.byCategory).length} categories`);

    const highUsageTemplates = templates.filter(t => t.usage && t.usage.usageCount > 10).length;
    if (highUsageTemplates > 0) {
      insights.push(`${highUsageTemplates} templates have high usage (>10 uses)`);
    }

    const newTemplates = templates.filter(t => {
      const createdRecently = new Date(t.metadata.createdAt).getTime() > Date.now() - 7 * 24 * 60 * 60 * 1000;
      return createdRecently;
    }).length;
    
    if (newTemplates > 0) {
      insights.push(`${newTemplates} templates created in the past week`);
    }

    const avgSuccessRate = templates.reduce((sum, t) => sum + (t.usage?.successRate || 0), 0) / templates.length;
    if (avgSuccessRate > 0) {
      insights.push(`Average template success rate: ${Math.round(avgSuccessRate * 100)}%`);
    }

    return insights;
  }
}

// Schema for AdaptiveWorkflowCreationTool
const adaptiveWorkflowCreationSchema = z.object({
  workflowName: z.string().describe('Name for the adaptive workflow'),
  initialSteps: z.array(z.object({
    action: z.string().describe('Action to perform'),
    parameters: z.record(z.unknown()).describe('Parameters for the action')
  })).describe('Initial workflow steps'),
  analysisDepth: z.number().optional().default(5).describe('Depth of pattern analysis'),
  patternThreshold: z.number().optional().default(3).describe('Minimum pattern occurrences to consider'),
  adaptationRate: z.number().min(0.01).max(1.0).optional().default(0.1).describe('Learning rate for adaptations'),
  userBehaviorWeight: z.number().min(0).max(1).optional().default(0.3).describe('Weight given to user behavior patterns'),
  contextualRelevance: z.number().min(0).max(1).optional().default(0.4).describe('Weight given to contextual relevance')
});

@injectable()
export class AdaptiveWorkflowCreationTool implements IMCPTool {
  name = 'adaptive_workflow_creation';
  description = 'Create workflows that learn and adapt from usage patterns and user behavior';
  schema = adaptiveWorkflowCreationSchema;

  constructor(
    @inject(AdvancedFeaturesService) private advancedFeaturesService: AdvancedFeaturesService
  ) {}

  async execute(params: z.infer<typeof adaptiveWorkflowCreationSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: AdaptiveWorkflowOptions = {
        analysisDepth: params.analysisDepth,
        patternThreshold: params.patternThreshold,
        adaptationRate: params.adaptationRate,
        userBehaviorWeight: params.userBehaviorWeight,
        contextualRelevance: params.contextualRelevance
      };

      const workflow = await this.advancedFeaturesService.createAdaptiveWorkflow(
        params.workflowName,
        params.initialSteps,
        options
      );

      const response = {
        workflow: {
          workflowId: workflow.workflowId,
          name: workflow.name,
          description: workflow.description,
          version: workflow.metadata.version,
          createdAt: workflow.metadata.createdAt
        },
        structure: {
          stepCount: workflow.steps.length,
          adaptationCount: workflow.steps.reduce((sum, step) => sum + step.adaptations.length, 0),
          patternCount: workflow.adaptations.patterns.length,
          learningRate: workflow.adaptations.learningRate
        },
        steps: workflow.steps.map((step, _index) => ({
          stepId: step.stepId,
          action: step.action,
          parameterCount: Object.keys(step.parameters).length,
          conditionCount: step.conditions?.length || 0,
          adaptationCount: step.adaptations.length,
          adaptations: step.adaptations.map(adaptation => ({
            trigger: adaptation.trigger,
            modification: adaptation.modification,
            confidence: Math.round(adaptation.confidence * 100) / 100
          }))
        })),
        adaptations: {
          learningCapabilities: this.analyzeAdaptiveCapabilities(workflow),
          patternAnalysis: this.analyzePatterns(workflow.adaptations.patterns),
          performanceMetrics: workflow.adaptations.performance
        },
        insights: this.generateWorkflowInsights(workflow, options),
        recommendations: this.generateWorkflowRecommendations(workflow),
        futureEvolution: this.predictWorkflowEvolution(workflow)
      };

      context.logger.info({
        workflowId: workflow.workflowId,
        name: params.workflowName,
        stepCount: workflow.steps.length,
        adaptationCount: workflow.steps.reduce((sum, step) => sum + step.adaptations.length, 0),
        patternCount: workflow.adaptations.patterns.length
      }, 'Adaptive workflow creation completed');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, workflowName: params.workflowName }, 'Failed to create adaptive workflow');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to create adaptive workflow: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private analyzeAdaptiveCapabilities(workflow: any): {
    adaptabilityScore: number;
    learningPotential: string;
    complexityLevel: string;
  } {
    const totalAdaptations = workflow.steps.reduce((sum: number, step: any) => sum + step.adaptations.length, 0);
    const avgConfidence = workflow.steps.reduce((sum: number, step: any) => {
      const stepConfidence = step.adaptations.reduce((stepSum: number, adaptation: any) => stepSum + adaptation.confidence, 0) / Math.max(step.adaptations.length, 1);
      return sum + stepConfidence;
    }, 0) / workflow.steps.length;

    const adaptabilityScore = Math.round((totalAdaptations * 10 + avgConfidence * 100) / 2);

    let learningPotential = 'basic';
    if (workflow.adaptations.learningRate > 0.2 && totalAdaptations > 5) learningPotential = 'high';
    else if (workflow.adaptations.learningRate > 0.1 || totalAdaptations > 2) learningPotential = 'medium';

    let complexityLevel = 'simple';
    if (workflow.steps.length > 10 || totalAdaptations > 15) complexityLevel = 'complex';
    else if (workflow.steps.length > 5 || totalAdaptations > 5) complexityLevel = 'moderate';

    return {
      adaptabilityScore,
      learningPotential,
      complexityLevel
    };
  }

  private analyzePatterns(patterns: any[]): {
    patternTypes: Record<string, number>;
    avgFrequency: number;
    avgSuccess: number;
    topPatterns: Array<{ pattern: string; frequency: number; success: number }>;
  } {
    const patternTypes = patterns.reduce((acc, pattern) => {
      const type = pattern.pattern.split('_')[0] || 'unknown';
      acc[type] = (acc[type] || 0) + 1;
      return acc;
    }, {});

    const avgFrequency = patterns.reduce((sum, p) => sum + p.frequency, 0) / Math.max(patterns.length, 1);
    const avgSuccess = patterns.reduce((sum, p) => sum + p.success, 0) / Math.max(patterns.length, 1);

    const topPatterns = patterns
      .sort((a, b) => (b.frequency * b.success) - (a.frequency * a.success))
      .slice(0, 5)
      .map(p => ({
        pattern: p.pattern,
        frequency: p.frequency,
        success: Math.round(p.success * 100) / 100
      }));

    return {
      patternTypes,
      avgFrequency: Math.round(avgFrequency),
      avgSuccess: Math.round(avgSuccess * 100) / 100,
      topPatterns
    };
  }

  private generateWorkflowInsights(workflow: any, _options: AdaptiveWorkflowOptions): string[] {
    const insights = [];

    insights.push(`Created adaptive workflow '${workflow.name}' with ${workflow.steps.length} steps`);

    const totalAdaptations = workflow.steps.reduce((sum: number, step: any) => sum + step.adaptations.length, 0);
    if (totalAdaptations > 0) {
      insights.push(`${totalAdaptations} potential adaptations identified from pattern analysis`);
    }

    if (workflow.adaptations.patterns.length > 0) {
      insights.push(`Analyzed ${workflow.adaptations.patterns.length} usage patterns to inform adaptations`);
    }

    const highConfidenceAdaptations = workflow.steps.reduce((count: number, step: any) => {
      return count + step.adaptations.filter((a: any) => a.confidence > 0.7).length;
    }, 0);

    if (highConfidenceAdaptations > 0) {
      insights.push(`${highConfidenceAdaptations} high-confidence adaptations (>70%) ready for implementation`);
    }

    insights.push(`Learning rate set to ${workflow.adaptations.learningRate} for gradual adaptation`);

    return insights;
  }

  private generateWorkflowRecommendations(workflow: any): string[] {
    const recommendations = [];

    if (workflow.steps.length > 15) {
      recommendations.push('Consider breaking down complex workflow into smaller, focused sub-workflows');
    }

    const stepsWithoutAdaptations = workflow.steps.filter((step: any) => step.adaptations.length === 0).length;
    if (stepsWithoutAdaptations > 0) {
      recommendations.push(`${stepsWithoutAdaptations} steps have no adaptations - monitor usage to identify optimization opportunities`);
    }

    if (workflow.adaptations.learningRate < 0.05) {
      recommendations.push('Low learning rate may slow adaptation - consider increasing for faster optimization');
    }

    const avgPatternSuccess = workflow.adaptations.patterns.reduce((sum: number, p: any) => sum + p.success, 0) / Math.max(workflow.adaptations.patterns.length, 1);
    if (avgPatternSuccess < 0.7) {
      recommendations.push('Lower pattern success rates - review and refine adaptation triggers');
    }

    recommendations.push('Monitor workflow performance and user feedback to guide future adaptations');

    return recommendations;
  }

  private predictWorkflowEvolution(workflow: any): {
    evolutionPotential: string;
    expectedChanges: string[];
    timeToAdaptation: string;
  } {
    const totalAdaptations = workflow.steps.reduce((sum: number, step: any) => sum + step.adaptations.length, 0);
    const learningRate = workflow.adaptations.learningRate;

    let evolutionPotential = 'low';
    if (totalAdaptations > 10 && learningRate > 0.15) evolutionPotential = 'high';
    else if (totalAdaptations > 5 && learningRate > 0.1) evolutionPotential = 'medium';

    const expectedChanges = [];
    if (totalAdaptations > 0) {
      expectedChanges.push('Step optimization based on usage patterns');
    }
    if (learningRate > 0.1) {
      expectedChanges.push('Parameter tuning for improved performance');
    }
    if (workflow.adaptations.patterns.length > 3) {
      expectedChanges.push('New steps addition based on common patterns');
    }

    const timeToAdaptation = learningRate > 0.2 ? 'days' : learningRate > 0.1 ? 'weeks' : 'months';

    return {
      evolutionPotential,
      expectedChanges,
      timeToAdaptation
    };
  }
}

// Schema for AutoSmartPathCreationTool
const autoSmartPathCreationSchema = z.object({
  patternMinOccurrence: z.number().optional().default(5).describe('Minimum pattern occurrences to generate smart path'),
  confidenceThreshold: z.number().min(0.1).max(1.0).optional().default(0.7).describe('Minimum confidence threshold for path generation'),
  maxPathLength: z.number().optional().default(10).describe('Maximum number of steps in generated paths'),
  includeVariations: z.boolean().optional().default(true).describe('Generate path variations and alternatives'),
  optimizeForFrequency: z.boolean().optional().default(true).describe('Prioritize frequently used patterns'),
  contextTypes: z.array(z.string()).optional().describe('Filter patterns by context types')
});

@injectable()
export class AutoSmartPathCreationTool implements IMCPTool {
  name = 'auto_smart_path_creation';
  description = 'Automatically generate smart paths from discovered usage patterns and behaviors';
  schema = autoSmartPathCreationSchema;

  constructor(
    @inject(AdvancedFeaturesService) private advancedFeaturesService: AdvancedFeaturesService
  ) {}

  async execute(params: z.infer<typeof autoSmartPathCreationSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const options: SmartPathGenerationOptions = {
        patternMinOccurrence: params.patternMinOccurrence,
        confidenceThreshold: params.confidenceThreshold,
        maxPathLength: params.maxPathLength,
        includeVariations: params.includeVariations,
        optimizeForFrequency: params.optimizeForFrequency,
        contextTypes: params.contextTypes
      };

      const generatedPaths = await this.advancedFeaturesService.generateSmartPaths(options);

      const response = {
        generation: {
          pathsGenerated: generatedPaths.length,
          options,
          generationComplete: true
        },
        paths: generatedPaths.map(path => ({
          pathId: path.pathId,
          name: path.name,
          description: path.description,
          confidence: Math.round(path.confidence * 100) / 100,
          frequency: path.frequency,
          stepCount: path.pattern.length,
          statistics: {
            successRate: Math.round(path.statistics.successRate * 100) / 100,
            averageExecutionTime: path.statistics.averageExecutionTime,
            tokenEfficiency: Math.round(path.statistics.tokenEfficiency * 100) / 100,
            userAdoption: Math.round(path.statistics.userAdoption * 100) / 100
          },
          variationCount: path.variations.length
        })),
        analysis: {
          qualityMetrics: this.analyzePathQuality(generatedPaths),
          diversityMetrics: this.analyzePathDiversity(generatedPaths),
          utilizationPrediction: this.predictPathUtilization(generatedPaths)
        },
        topPaths: this.identifyTopPaths(generatedPaths),
        insights: this.generateSmartPathInsights(generatedPaths, options),
        recommendations: this.generateSmartPathRecommendations(generatedPaths),
        implementationPlan: this.createImplementationPlan(generatedPaths)
      };

      context.logger.info({
        pathsGenerated: generatedPaths.length,
        avgConfidence: generatedPaths.reduce((sum, p) => sum + p.confidence, 0) / Math.max(generatedPaths.length, 1),
        avgFrequency: generatedPaths.reduce((sum, p) => sum + p.frequency, 0) / Math.max(generatedPaths.length, 1),
        totalVariations: generatedPaths.reduce((sum, p) => sum + p.variations.length, 0)
      }, 'Auto smart path creation completed');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, options: params }, 'Failed to auto-create smart paths');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to auto-create smart paths: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private analyzePathQuality(paths: any[]): {
    avgConfidence: number;
    highQualityPaths: number;
    qualityDistribution: Record<string, number>;
  } {
    const avgConfidence = paths.reduce((sum, p) => sum + p.confidence, 0) / Math.max(paths.length, 1);
    const highQualityPaths = paths.filter(p => p.confidence > 0.8 && p.frequency > 10).length;
    
    const qualityDistribution = {
      excellent: paths.filter(p => p.confidence > 0.9).length,
      good: paths.filter(p => p.confidence > 0.7 && p.confidence <= 0.9).length,
      fair: paths.filter(p => p.confidence > 0.5 && p.confidence <= 0.7).length,
      poor: paths.filter(p => p.confidence <= 0.5).length
    };

    return {
      avgConfidence: Math.round(avgConfidence * 100) / 100,
      highQualityPaths,
      qualityDistribution
    };
  }

  private analyzePathDiversity(paths: any[]): {
    uniqueActions: number;
    pathLengthVariation: number;
    categorySpread: number;
  } {
    const allActions = new Set();
    const pathLengths = [];
    
    for (const path of paths) {
      pathLengths.push(path.pattern.length);
      for (const step of path.pattern) {
        allActions.add(step.action);
      }
    }

    const uniqueActions = allActions.size;
    const pathLengthVariation = pathLengths.length > 1 ? 
      Math.max(...pathLengths) - Math.min(...pathLengths) : 0;
    
    // Estimate category spread based on action diversity
    const categorySpread = Math.min(Math.floor(uniqueActions / 3), 10);

    return {
      uniqueActions,
      pathLengthVariation,
      categorySpread
    };
  }

  private predictPathUtilization(paths: any[]): {
    highUtilization: number;
    mediumUtilization: number;
    lowUtilization: number;
    adoptionScore: number;
  } {
    let highUtilization = 0;
    let mediumUtilization = 0;
    let lowUtilization = 0;
    
    for (const path of paths) {
      const utilizationScore = (path.confidence * 0.4) + (path.frequency / 100 * 0.3) + (path.statistics.userAdoption * 0.3);
      
      if (utilizationScore > 0.7) highUtilization++;
      else if (utilizationScore > 0.4) mediumUtilization++;
      else lowUtilization++;
    }

    const adoptionScore = Math.round(((highUtilization * 1.0 + mediumUtilization * 0.6) / Math.max(paths.length, 1)) * 100);

    return {
      highUtilization,
      mediumUtilization,
      lowUtilization,
      adoptionScore
    };
  }

  private identifyTopPaths(paths: any[]): Array<{
    pathId: string;
    name: string;
    score: number;
    reason: string;
  }> {
    return paths
      .map(path => ({
        pathId: path.pathId,
        name: path.name,
        score: (path.confidence * 0.4) + (path.frequency / 100 * 0.3) + (path.statistics.userAdoption * 0.3),
        reason: this.determineTopPathReason(path)
      }))
      .sort((a, b) => b.score - a.score)
      .slice(0, 5);
  }

  private determineTopPathReason(path: any): string {
    if (path.confidence > 0.9) return 'Excellent confidence score';
    if (path.frequency > 50) return 'High usage frequency';
    if (path.statistics.userAdoption > 0.8) return 'Strong user adoption';
    if (path.statistics.tokenEfficiency > 0.8) return 'High token efficiency';
    return 'Well-balanced metrics';
  }

  private generateSmartPathInsights(paths: any[], options: SmartPathGenerationOptions): string[] {
    const insights = [];

    if (paths.length === 0) {
      insights.push('No smart paths generated - consider lowering confidence threshold or minimum occurrence');
      return insights;
    }

    insights.push(`Generated ${paths.length} smart paths from usage pattern analysis`);

    const avgSteps = paths.reduce((sum, p) => sum + p.pattern.length, 0) / paths.length;
    insights.push(`Average path length: ${Math.round(avgSteps)} steps`);

    const highConfidencePaths = paths.filter(p => p.confidence > 0.8).length;
    if (highConfidencePaths > 0) {
      insights.push(`${highConfidencePaths} paths have high confidence (>80%)`);
    }

    const totalVariations = paths.reduce((sum, p) => sum + p.variations.length, 0);
    if (totalVariations > 0 && options.includeVariations) {
      insights.push(`${totalVariations} path variations generated for optimization`);
    }

    const avgTokenEfficiency = paths.reduce((sum, p) => sum + p.statistics.tokenEfficiency, 0) / paths.length;
    insights.push(`Average token efficiency: ${Math.round(avgTokenEfficiency * 100)}%`);

    return insights;
  }

  private generateSmartPathRecommendations(paths: any[]): string[] {
    const recommendations = [];

    if (paths.length === 0) {
      recommendations.push('No paths generated - increase usage data collection or lower generation thresholds');
      return recommendations;
    }

    const lowConfidencePaths = paths.filter(p => p.confidence < 0.6).length;
    if (lowConfidencePaths > paths.length * 0.3) {
      recommendations.push('Many low-confidence paths - review pattern analysis parameters');
    }

    const shortPaths = paths.filter(p => p.pattern.length < 3).length;
    if (shortPaths > paths.length * 0.5) {
      recommendations.push('Many short paths detected - consider combining related patterns');
    }

    const highEfficiencyPaths = paths.filter(p => p.statistics.tokenEfficiency > 0.8).length;
    if (highEfficiencyPaths > 0) {
      recommendations.push(`Prioritize ${highEfficiencyPaths} high-efficiency paths for immediate implementation`);
    }

    recommendations.push('Test generated paths with small user groups before full deployment');
    recommendations.push('Monitor path usage and adapt based on real-world performance');

    return recommendations;
  }

  private createImplementationPlan(paths: any[]): {
    phase1: string[];
    phase2: string[];
    phase3: string[];
    timeline: string;
  } {
    const sortedPaths = paths.sort((a, b) => 
      (b.confidence * 0.5 + b.frequency / 100 * 0.3 + b.statistics.userAdoption * 0.2) - 
      (a.confidence * 0.5 + a.frequency / 100 * 0.3 + a.statistics.userAdoption * 0.2)
    );

    const totalPaths = sortedPaths.length;
    const phase1Count = Math.min(Math.ceil(totalPaths * 0.3), 5);
    const phase2Count = Math.min(Math.ceil(totalPaths * 0.4), 8);

    return {
      phase1: sortedPaths.slice(0, phase1Count).map(p => `${p.name} (confidence: ${Math.round(p.confidence * 100)}%)`),
      phase2: sortedPaths.slice(phase1Count, phase1Count + phase2Count).map(p => `${p.name} (confidence: ${Math.round(p.confidence * 100)}%)`),
      phase3: sortedPaths.slice(phase1Count + phase2Count).map(p => `${p.name} (confidence: ${Math.round(p.confidence * 100)}%)`),
      timeline: totalPaths > 15 ? '3-4 months' : totalPaths > 8 ? '2-3 months' : '1-2 months'
    };
  }
}
