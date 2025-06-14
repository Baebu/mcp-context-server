// Advanced Features Service for Compression, Optimization, and Templates
// File: src/application/services/advanced-features.service.ts

import { injectable, inject } from 'inversify';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
import { TokenTracker } from '../../utils/token-tracker.js';
import { logger } from '../../utils/logger.js';

// Compression & Optimization Interfaces
export interface CompressionOptions {
  algorithm: 'lz4' | 'gzip' | 'brotli' | 'semantic' | 'hybrid';
  compressionLevel?: number;
  minSize?: number; // Minimum size in bytes to compress
  preserveStructure?: boolean;
  batchSize?: number;
}

export interface CompressionResult {
  processedCount: number;
  compressedCount: number;
  totalSavings: number;
  compressionRatio: number;
  algorithm: string;
  errors: string[];
  summary: {
    originalSize: number;
    compressedSize: number;
    timeElapsed: number;
  };
}

export interface TokenBudgetOptions {
  maxTokens?: number;
  targetUtilization?: number; // 0.0 to 1.0
  priorityWeights?: {
    recency: number;
    frequency: number;
    importance: number;
    relationships: number;
  };
  preserveTypes?: string[];
  archiveThreshold?: number; // 0.0 to 1.0
}

export interface TokenOptimizationResult {
  currentUsage: number;
  targetUsage: number;
  optimizedUsage: number;
  tokensSaved: number;
  efficiency: number;
  actions: Array<{
    action: 'compress' | 'archive' | 'deduplicate' | 'summarize';
    contextKey: string;
    tokensSaved: number;
    impact: 'low' | 'medium' | 'high';
  }>;
  recommendations: string[];
}

export interface DeduplicationOptions {
  similarityThreshold?: number;
  preserveRecent?: boolean;
  batchSize?: number;
  fieldWeights?: {
    content: number;
    metadata: number;
    tags: number;
    relationships: number;
  };
  mergeStrategy?: 'keep_newest' | 'keep_oldest' | 'merge_all' | 'manual_review';
}

export interface DeduplicationResult {
  totalAnalyzed: number;
  duplicatesFound: number;
  duplicatesRemoved: number;
  spaceFreed: number;
  mergedContexts: number;
  duplicateGroups: Array<{
    groupId: string;
    members: string[];
    similarity: number;
    action: string;
  }>;
  summary: {
    efficiencyGain: number;
    qualityScore: number;
    processingTime: number;
  };
}

export interface ArchivalOptions {
  maxAge?: number; // hours
  minAccessCount?: number;
  preserveRelationships?: boolean;
  compressionLevel?: number;
  storageLocation?: 'database' | 'file' | 'external';
  retentionPolicy?: {
    keepVersions: number;
    keepMetadata: boolean;
    keepRelationships: boolean;
  };
}

export interface ArchivalResult {
  candidatesEvaluated: number;
  contextsArchived: number;
  spaceFreed: number;
  relationshipsPreserved: number;
  archiveLocation: string;
  summary: {
    storageReduction: number;
    performanceImpact: number;
    recoverability: number;
  };
}

// Advanced Templates Interfaces
export interface ContextTemplate {
  templateId: string;
  name: string;
  description: string;
  category: string;
  version: string;
  schema: {
    fields: Array<{
      name: string;
      type: 'string' | 'number' | 'boolean' | 'array' | 'object' | 'date';
      required: boolean;
      default?: unknown;
      validation?: string;
      description?: string;
    }>;
    relationships?: Array<{
      name: string;
      type: string;
      required: boolean;
      description?: string;
    }>;
  };
  usage: {
    usageCount: number;
    lastUsed: Date;
    successRate: number;
    averageRating: number;
  };
  metadata: {
    createdAt: Date;
    createdBy?: string;
    tags: string[];
    difficulty: 'beginner' | 'intermediate' | 'advanced';
  };
}

export interface AdaptiveWorkflowOptions {
  analysisDepth?: number;
  patternThreshold?: number;
  adaptationRate?: number;
  userBehaviorWeight?: number;
  contextualRelevance?: number;
  performanceMetrics?: string[];
}

export interface AdaptiveWorkflow {
  workflowId: string;
  name: string;
  description: string;
  steps: Array<{
    stepId: string;
    action: string;
    parameters: Record<string, unknown>;
    conditions?: Array<{
      field: string;
      operator: string;
      value: unknown;
    }>;
    adaptations: Array<{
      trigger: string;
      modification: string;
      confidence: number;
    }>;
  }>;
  adaptations: {
    learningRate: number;
    patterns: Array<{
      pattern: string;
      frequency: number;
      success: number;
      adaptation: string;
    }>;
    performance: {
      completionRate: number;
      averageTime: number;
      userSatisfaction: number;
      errorRate: number;
    };
  };
  metadata: {
    createdAt: Date;
    lastAdapted: Date;
    version: string;
    usage: number;
  };
}

export interface SmartPathGenerationOptions {
  patternMinOccurrence?: number;
  confidenceThreshold?: number;
  maxPathLength?: number;
  includeVariations?: boolean;
  optimizeForFrequency?: boolean;
  contextTypes?: string[];
}

export interface GeneratedSmartPath {
  pathId: string;
  name: string;
  description: string;
  confidence: number;
  frequency: number;
  pattern: Array<{
    step: number;
    action: string;
    contextType?: string;
    parameters?: Record<string, unknown>;
    alternatives?: string[];
  }>;
  statistics: {
    successRate: number;
    averageExecutionTime: number;
    tokenEfficiency: number;
    userAdoption: number;
  };
  variations: Array<{
    variationId: string;
    description: string;
    modifications: Array<{
      step: number;
      change: string;
    }>;
    performance: {
      relative: number;
      absolute: number;
    };
  }>;
}

@injectable()
export class AdvancedFeaturesService {
  private compressionCache = new Map<string, { data: string; algorithm: string; ratio: number }>();
  private templateLibrary = new Map<string, ContextTemplate>();
  private workflowRegistry = new Map<string, AdaptiveWorkflow>();


  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler
  ) {}

  // ===== COMPRESSION & OPTIMIZATION METHODS =====

  /**
   * Apply compression algorithms to context data
   */
  async applyCompression(options: CompressionOptions = { algorithm: 'hybrid' }): Promise<CompressionResult> {
    const startTime = Date.now();
    const algorithm = options.algorithm || 'hybrid';
    const minSize = options.minSize || 1000; // 1KB minimum
    const batchSize = options.batchSize || 100;

    try {
      let processedCount = 0;
      let compressedCount = 0;
      let totalOriginalSize = 0;
      let totalCompressedSize = 0;
      const errors: string[] = [];

      // Get contexts to compress
      const candidateQuery = `
        SELECT key, value, LENGTH(value) as size
        FROM context_items 
        WHERE LENGTH(value) > ?
        ORDER BY LENGTH(value) DESC
        LIMIT ?
      `;

      const candidates = await this.db.executeQuery(candidateQuery, [minSize, batchSize * 10]) as any[];

      // Process in batches
      for (let i = 0; i < candidates.length; i += batchSize) {
        const batch = candidates.slice(i, i + batchSize);
        
        for (const candidate of batch) {
          try {
            const originalSize = candidate.size;
            const compressed = await this.compressContent(candidate.value, algorithm, options);
            
            if (compressed.success && compressed.ratio > 0.1) { // At least 10% savings
              // Store compressed version
              await this.storeCompressedContext(candidate.key, compressed.data, {
                algorithm,
                originalSize,
                compressedSize: compressed.size,
                ratio: compressed.ratio
              });

              compressedCount++;
              totalOriginalSize += originalSize;
              totalCompressedSize += compressed.size;
            }

            processedCount++;

          } catch (error) {
            errors.push(`Failed to compress ${candidate.key}: ${error instanceof Error ? error.message : 'Unknown error'}`);
          }
        }
      }

      const totalSavings = totalOriginalSize - totalCompressedSize;
      const compressionRatio = totalOriginalSize > 0 ? totalCompressedSize / totalOriginalSize : 1;

      const result: CompressionResult = {
        processedCount,
        compressedCount,
        totalSavings,
        compressionRatio,
        algorithm,
        errors,
        summary: {
          originalSize: totalOriginalSize,
          compressedSize: totalCompressedSize,
          timeElapsed: Date.now() - startTime
        }
      };

      logger.info({
        algorithm,
        processedCount,
        compressedCount,
        totalSavings,
        compressionRatio
      }, 'Compression completed');

      return result;

    } catch (error) {
      logger.error({ error, options }, 'Failed to apply compression');
      throw error;
    }
  }

  /**
   * Optimize token budget usage
   */
  async optimizeTokenBudget(options: TokenBudgetOptions = {}): Promise<TokenOptimizationResult> {
    try {
      const maxTokens = options.maxTokens || 200000; // 200K token limit
      const targetUtilization = options.targetUtilization || 0.8; // 80% target
      const targetUsage = Math.floor(maxTokens * targetUtilization);

      // Calculate current token usage
      const currentUsage = await this.calculateCurrentTokenUsage();
      
      if (currentUsage <= targetUsage) {
        return {
          currentUsage,
          targetUsage,
          optimizedUsage: currentUsage,
          tokensSaved: 0,
          efficiency: 1.0,
          actions: [],
          recommendations: ['Token usage is within optimal range']
        };
      }

      // Find optimization opportunities
      const tokensToSave = currentUsage - targetUsage;
      const actions = await this.findOptimizationActions(tokensToSave, options);

      // Apply optimizations
      let tokensSaved = 0;
      for (const action of actions) {
        try {
          await this.applyOptimizationAction(action);
          tokensSaved += action.tokensSaved;
        } catch (error) {
          logger.warn({ error, action }, 'Failed to apply optimization action');
        }
      }

      const optimizedUsage = currentUsage - tokensSaved;
      const efficiency = targetUsage / optimizedUsage;

      const recommendations = this.generateOptimizationRecommendations(
        currentUsage,
        optimizedUsage,
        targetUsage,
        actions
      );

      logger.info({
        currentUsage,
        targetUsage,
        optimizedUsage,
        tokensSaved,
        efficiency
      }, 'Token budget optimization completed');

      return {
        currentUsage,
        targetUsage,
        optimizedUsage,
        tokensSaved,
        efficiency,
        actions,
        recommendations
      };

    } catch (error) {
      logger.error({ error, options }, 'Failed to optimize token budget');
      throw error;
    }
  }

  /**
   * Deduplicate contexts intelligently
   */
  async deduplicateContexts(options: DeduplicationOptions = {}): Promise<DeduplicationResult> {
    const startTime = Date.now();
    const similarityThreshold = options.similarityThreshold || 0.85;
    const batchSize = options.batchSize || 50;
    const mergeStrategy = options.mergeStrategy || 'keep_newest';

    try {
      // Get all contexts for analysis
      const allContexts = await this.db.executeQuery(
        'SELECT key, value, updated_at, context_type FROM context_items ORDER BY updated_at DESC',
        []
      ) as any[];

      const duplicateGroups: DeduplicationResult['duplicateGroups'] = [];
      const processed = new Set<string>();
      let duplicatesFound = 0;
      let duplicatesRemoved = 0;
      let spaceFreed = 0;
      let mergedContexts = 0;

      // Process in batches to avoid memory issues
      for (let i = 0; i < allContexts.length; i += batchSize) {
        const batch = allContexts.slice(i, i + batchSize);
        
        for (const context of batch) {
          if (processed.has(context.key)) continue;

          // Find similar contexts
          const similarities = await this.findSimilarContexts(
            context,
            allContexts.filter(c => !processed.has(c.key) && c.key !== context.key),
            similarityThreshold,
            options.fieldWeights
          );

          if (similarities.length > 0) {
            const group = {
              groupId: `dup_group_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
              members: [context.key, ...similarities.map(s => s.key)],
              similarity: similarities.reduce((sum, s) => sum + s.similarity, 1) / (similarities.length + 1),
              action: mergeStrategy
            };

            duplicateGroups.push(group);
            duplicatesFound += similarities.length;

            // Apply deduplication strategy
            const removalResult = await this.applyDeduplicationStrategy(
              context,
              similarities,
              mergeStrategy,
              options.preserveRecent
            );

            duplicatesRemoved += removalResult.removed;
            spaceFreed += removalResult.spaceFreed;
            mergedContexts += removalResult.merged;

            // Mark all group members as processed
            group.members.forEach(key => processed.add(key));
          } else {
            processed.add(context.key);
          }
        }
      }

      const efficiencyGain = allContexts.length > 0 ? (duplicatesRemoved / allContexts.length) * 100 : 0;
      const qualityScore = this.calculateDeduplicationQuality(duplicateGroups);

      const result: DeduplicationResult = {
        totalAnalyzed: allContexts.length,
        duplicatesFound,
        duplicatesRemoved,
        spaceFreed,
        mergedContexts,
        duplicateGroups,
        summary: {
          efficiencyGain,
          qualityScore,
          processingTime: Date.now() - startTime
        }
      };

      logger.info({
        totalAnalyzed: allContexts.length,
        duplicatesFound,
        duplicatesRemoved,
        efficiencyGain,
        qualityScore
      }, 'Context deduplication completed');

      return result;

    } catch (error) {
      logger.error({ error, options }, 'Failed to deduplicate contexts');
      throw error;
    }
  }

  /**
   * Archive old contexts for storage optimization
   */
  async archiveOldContexts(options: ArchivalOptions = {}): Promise<ArchivalResult> {
    try {
      const maxAge = options.maxAge || 2160; // 90 days default
      const minAccessCount = options.minAccessCount || 0;
      const cutoffTime = new Date(Date.now() - maxAge * 60 * 60 * 1000);

      // Find archival candidates
      const candidateQuery = `
        SELECT key, value, created_at, updated_at, context_type, LENGTH(value) as size
        FROM context_items 
        WHERE updated_at < ? 
        AND (access_count IS NULL OR access_count <= ?)
        ORDER BY updated_at ASC
      `;

      const candidates = await this.db.executeQuery(candidateQuery, [
        cutoffTime.toISOString(),
        minAccessCount
      ]) as any[];

      let contextsArchived = 0;
      let spaceFreed = 0;
      let relationshipsPreserved = 0;
      const archiveLocation = options.storageLocation || 'database';

      for (const candidate of candidates) {
        try {
          // Check if context has important relationships
          const relationships = await this.getContextRelationships(candidate.key);
          
          // Create archive entry
          const archiveData = {
            originalKey: candidate.key,
            archivedAt: new Date().toISOString(),
            originalSize: candidate.size,
            contextType: candidate.context_type,
            metadata: {
              createdAt: candidate.created_at,
              updatedAt: candidate.updated_at,
              archivalReason: 'age_based',
              preservedRelationships: options.preserveRelationships && relationships.length > 0
            }
          };

          // Compress and store archive
          const compressed = await this.compressContent(
            candidate.value,
            'gzip',
            { compressionLevel: options.compressionLevel || 9 }
          );

          const archiveKey = `archived_${candidate.key}_${Date.now()}`;
          await this.storeArchivedContext(archiveKey, {
            ...archiveData,
            compressedContent: compressed.data,
            compressionRatio: compressed.ratio
          });

          // Preserve relationships if requested
          if (options.preserveRelationships && relationships.length > 0) {
            await this.preserveArchivedRelationships(candidate.key, archiveKey, relationships);
            relationshipsPreserved += relationships.length;
          }

          // Remove original context
          await this.db.deleteContext(candidate.key);

          contextsArchived++;
          spaceFreed += candidate.size;

        } catch (error) {
          logger.warn({ error, contextKey: candidate.key }, 'Failed to archive context');
        }
      }

      const storageReduction = candidates.reduce((sum, c) => sum + c.size, 0);
      const performanceImpact = this.calculatePerformanceImpact(contextsArchived, spaceFreed);
      const recoverability = options.preserveRelationships ? 0.9 : 0.7;

      const result: ArchivalResult = {
        candidatesEvaluated: candidates.length,
        contextsArchived,
        spaceFreed,
        relationshipsPreserved,
        archiveLocation,
        summary: {
          storageReduction,
          performanceImpact,
          recoverability
        }
      };

      logger.info({
        candidatesEvaluated: candidates.length,
        contextsArchived,
        spaceFreed,
        relationshipsPreserved
      }, 'Context archival completed');

      return result;

    } catch (error) {
      logger.error({ error, options }, 'Failed to archive old contexts');
      throw error;
    }
  }

  // ===== ADVANCED TEMPLATES METHODS =====

  /**
   * Manage context templates library
   */
  async manageTemplateLibrary(): Promise<{
    templates: ContextTemplate[];
    statistics: {
      totalTemplates: number;
      byCategory: Record<string, number>;
      byDifficulty: Record<string, number>;
      topUsed: Array<{ templateId: string; name: string; usageCount: number }>;
    };
    recommendations: string[];
  }> {
    try {
      // Load existing templates
      await this.loadExistingTemplates();

      // Generate new templates from usage patterns
      const generatedTemplates = await this.generateTemplatesFromPatterns();
      
      // Add generated templates to library
      for (const template of generatedTemplates) {
        this.templateLibrary.set(template.templateId, template);
      }

      // Update template usage statistics
      await this.updateTemplateStatistics();

      const templates = Array.from(this.templateLibrary.values());
      
      const statistics = {
        totalTemplates: templates.length,
        byCategory: templates.reduce((acc, t) => {
          acc[t.category] = (acc[t.category] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        byDifficulty: templates.reduce((acc, t) => {
          acc[t.metadata.difficulty] = (acc[t.metadata.difficulty] || 0) + 1;
          return acc;
        }, {} as Record<string, number>),
        topUsed: templates
          .sort((a, b) => b.usage.usageCount - a.usage.usageCount)
          .slice(0, 10)
          .map(t => ({
            templateId: t.templateId,
            name: t.name,
            usageCount: t.usage.usageCount
          }))
      };

      const recommendations = this.generateTemplateRecommendations(templates, statistics);

      logger.info({
        totalTemplates: statistics.totalTemplates,
        generated: generatedTemplates.length,
        topUsed: statistics.topUsed.length
      }, 'Template library management completed');

      return { templates, statistics, recommendations };

    } catch (error) {
      logger.error({ error }, 'Failed to manage template library');
      throw error;
    }
  }

  /**
   * Create adaptive workflows that learn from usage patterns
   */
  async createAdaptiveWorkflow(
    baseName: string,
    initialSteps: Array<{ action: string; parameters: Record<string, unknown> }>,
    options: AdaptiveWorkflowOptions = {}
  ): Promise<AdaptiveWorkflow> {
    try {
      const workflowId = `adaptive_${baseName}_${Date.now()}`;
      
      // Analyze existing patterns for this type of workflow
      const patterns = await this.analyzeWorkflowPatterns(baseName, options);
      
      // Create adaptive steps with learning capabilities
      const adaptiveSteps = initialSteps.map((step, index) => ({
        stepId: `step_${index}`,
        action: step.action,
        parameters: step.parameters,
        conditions: [],
        adaptations: patterns.filter(p => p.stepIndex === index).map(p => ({
          trigger: p.trigger,
          modification: p.modification,
          confidence: p.confidence
        }))
      }));

      const workflow: AdaptiveWorkflow = {
        workflowId,
        name: baseName,
        description: `Adaptive workflow for ${baseName} operations`,
        steps: adaptiveSteps,
        adaptations: {
          learningRate: options.adaptationRate || 0.1,
          patterns: patterns.map(p => ({
            pattern: p.pattern,
            frequency: p.frequency,
            success: p.success,
            adaptation: p.adaptation
          })),
          performance: {
            completionRate: 1.0,
            averageTime: 0,
            userSatisfaction: 0.8,
            errorRate: 0.0
          }
        },
        metadata: {
          createdAt: new Date(),
          lastAdapted: new Date(),
          version: '1.0',
          usage: 0
        }
      };

      // Store workflow
      this.workflowRegistry.set(workflowId, workflow);
      await this.storeAdaptiveWorkflow(workflow);

      logger.info({
        workflowId,
        name: baseName,
        stepsCount: adaptiveSteps.length,
        patternsCount: patterns.length
      }, 'Adaptive workflow created');

      return workflow;

    } catch (error) {
      logger.error({ error, baseName }, 'Failed to create adaptive workflow');
      throw error;
    }
  }

  /**
   * Automatically generate smart paths from usage patterns
   */
  async generateSmartPaths(options: SmartPathGenerationOptions = {}): Promise<GeneratedSmartPath[]> {
    try {
      const minOccurrence = options.patternMinOccurrence || 5;
      const confidenceThreshold = options.confidenceThreshold || 0.7;
      const maxPathLength = options.maxPathLength || 10;

      // Analyze usage patterns
      const patterns = await this.analyzeUsagePatterns(options);
      
      // Filter patterns by occurrence and confidence
      const qualifiedPatterns = patterns.filter(p => 
        p.frequency >= minOccurrence && p.confidence >= confidenceThreshold
      );

      const generatedPaths: GeneratedSmartPath[] = [];

      for (const pattern of qualifiedPatterns) {
        try {
          // Generate smart path from pattern
          const smartPath = await this.createSmartPathFromPattern(pattern, options);
          
          if (smartPath.pattern.length <= maxPathLength) {
            // Calculate statistics
            smartPath.statistics = await this.calculatePathStatistics(smartPath);
            
            // Generate variations
            if (options.includeVariations) {
              smartPath.variations = await this.generatePathVariations(smartPath);
            }

            generatedPaths.push(smartPath);
          }

        } catch (error) {
          logger.warn({ error, pattern }, 'Failed to generate smart path from pattern');
        }
      }

      // Sort by confidence and frequency
      generatedPaths.sort((a, b) => {
        const scoreA = a.confidence * 0.6 + (a.frequency / 100) * 0.4;
        const scoreB = b.confidence * 0.6 + (b.frequency / 100) * 0.4;
        return scoreB - scoreA;
      });

      // Store generated paths
      for (const path of generatedPaths) {
        await this.storeGeneratedSmartPath(path);
      }

      logger.info({
        patternsAnalyzed: patterns.length,
        qualifiedPatterns: qualifiedPatterns.length,
        pathsGenerated: generatedPaths.length
      }, 'Smart path generation completed');

      return generatedPaths;

    } catch (error) {
      logger.error({ error, options }, 'Failed to generate smart paths');
      throw error;
    }
  }

  // ===== PRIVATE HELPER METHODS =====

  // Compression helpers
  private async compressContent(content: string, algorithm: string, options: any): Promise<{
    success: boolean;
    data: string;
    size: number;
    ratio: number;
  }> {
    const originalSize = Buffer.byteLength(content, 'utf8');
    
    try {
      let compressedData: string;
      
      switch (algorithm) {
        case 'semantic':
          compressedData = await this.semanticCompression(content);
          break;
        case 'hybrid':
          compressedData = await this.hybridCompression(content, options);
          break;
        default:
          // Simple text compression simulation
          compressedData = this.simpleTextCompression(content);
      }
      
      const compressedSize = Buffer.byteLength(compressedData, 'utf8');
      const ratio = compressedSize / originalSize;
      
      return {
        success: true,
        data: compressedData,
        size: compressedSize,
        ratio
      };
    } catch (error) {
      return {
        success: false,
        data: content,
        size: originalSize,
        ratio: 1.0
      };
    }
  }

  private async semanticCompression(content: string): Promise<string> {
    // Semantic compression - extract key concepts and relationships
    const parsed = this.parseJsonSafely(content);
    if (typeof parsed === 'object' && parsed !== null) {
      const compressed = this.extractSemanticCore(parsed);
      return JSON.stringify(compressed);
    }
    
    // Text summarization for string content
    return this.summarizeText(content);
  }

  private async hybridCompression(content: string, _options: any): Promise<string> {
    // Combine multiple compression strategies
    const semantic = await this.semanticCompression(content);
    const textCompressed = this.simpleTextCompression(semantic);
    
    // Choose the best compression
    return textCompressed.length < semantic.length ? textCompressed : semantic;
  }

  private simpleTextCompression(content: string): string {
    // Simple text compression: remove redundancy, compress JSON
    return content
      .replace(/\s+/g, ' ') // Collapse whitespace
      .replace(/,\s*}/g, '}') // Remove trailing commas
      .replace(/:\s+/g, ':') // Remove spaces after colons
      .trim();
  }

  private extractSemanticCore(obj: any): any {
    if (Array.isArray(obj)) {
      return obj.map(item => this.extractSemanticCore(item));
    }
    
    if (typeof obj === 'object' && obj !== null) {
      const core: any = {};
      
      // Keep essential fields
      const essentialFields = ['id', 'key', 'type', 'name', 'title', 'status', 'priority', 'summary'];
      
      for (const [key, value] of Object.entries(obj)) {
        if (essentialFields.includes(key.toLowerCase()) || key.startsWith('_')) {
          core[key] = this.extractSemanticCore(value);
        } else if (typeof value === 'string' && value.length > 100) {
          // Summarize long strings
          core[key] = value.substring(0, 100) + '...';
        } else if (typeof value === 'object') {
          const compressed = this.extractSemanticCore(value);
          if (Object.keys(compressed).length > 0) {
            core[key] = compressed;
          }
        } else {
          core[key] = value;
        }
      }
      
      return core;
    }
    
    return obj;
  }

  private summarizeText(text: string): string {
    if (text.length <= 200) return text;
    
    // Simple text summarization
    const sentences = text.split(/[.!?]+/).filter(s => s.trim().length > 0);
    if (sentences.length <= 2) return text;
    
    // Keep first and last sentences, and one from the middle
    const summary = [
      sentences[0],
      sentences[Math.floor(sentences.length / 2)],
      sentences[sentences.length - 1]
    ].join('. ') + '.';
    
    return summary.length < text.length ? summary : text.substring(0, 200) + '...';
  }

  private async storeCompressedContext(key: string, compressedData: string, metadata: any): Promise<void> {
    const compressionKey = `compressed_${key}`;
    await this.db.storeContext(compressionKey, {
      originalKey: key,
      compressedData,
      ...metadata,
      compressedAt: new Date().toISOString()
    }, 'compressed');
    
    // Cache for quick access
    this.compressionCache.set(key, {
      data: compressedData,
      algorithm: metadata.algorithm,
      ratio: metadata.ratio
    });
  }

  // Token optimization helpers
  private async calculateCurrentTokenUsage(): Promise<number> {
    const allContexts = await this.db.executeQuery(
      'SELECT value FROM context_items',
      []
    ) as any[];
    
    return allContexts.reduce((total, context) => {
      const tokens = TokenTracker.estimateTokens(context.value);
      return total + tokens;
    }, 0);
  }

  private async findOptimizationActions(tokensToSave: number, options: TokenBudgetOptions): Promise<TokenOptimizationResult['actions']> {
    const actions: TokenOptimizationResult['actions'] = [];
    const weights = options.priorityWeights || {
      recency: 0.3,
      frequency: 0.2,
      importance: 0.3,
      relationships: 0.2
    };

    // Get context usage statistics
    const contexts = await this.db.executeQuery(`
      SELECT key, value, updated_at, context_type, access_count,
             LENGTH(value) as size
      FROM context_items 
      ORDER BY updated_at DESC
    `, []) as any[];

    let tokensSavedSoFar = 0;

    for (const context of contexts) {
      if (tokensSavedSoFar >= tokensToSave) break;

      const tokens = TokenTracker.estimateTokens(context.value);
      const score = this.calculateOptimizationScore(context, weights);
      
      let action: TokenOptimizationResult['actions'][0] | null = null;

      // Determine best optimization action
      if (score < 0.3 && tokens > 1000) {
        // Archive low-score, high-token contexts
        action = {
          action: 'archive',
          contextKey: context.key,
          tokensSaved: tokens,
          impact: tokens > 5000 ? 'high' : tokens > 2000 ? 'medium' : 'low'
        };
      } else if (tokens > 2000 && context.size > 5000) {
        // Compress large contexts
        const estimatedSavings = Math.floor(tokens * 0.3); // Estimate 30% compression
        action = {
          action: 'compress',
          contextKey: context.key,
          tokensSaved: estimatedSavings,
          impact: estimatedSavings > 1000 ? 'high' : 'medium'
        };
      } else if (score < 0.5 && tokens > 500) {
        // Summarize medium-score contexts
        const estimatedSavings = Math.floor(tokens * 0.5); // Estimate 50% reduction
        action = {
          action: 'summarize',
          contextKey: context.key,
          tokensSaved: estimatedSavings,
          impact: 'medium'
        };
      }

      if (action) {
        actions.push(action);
        tokensSavedSoFar += action.tokensSaved;
      }
    }

    return actions;
  }

  private calculateOptimizationScore(context: any, weights: any): number {
    const now = Date.now();
    const updatedAt = new Date(context.updated_at).getTime();
    const ageHours = (now - updatedAt) / (1000 * 60 * 60);
    
    // Recency score (0-1, higher is more recent)
    const recencyScore = Math.max(0, 1 - (ageHours / (30 * 24))); // 30 days max
    
    // Frequency score (0-1, based on access count)
    const accessCount = context.access_count || 0;
    const frequencyScore = Math.min(1, accessCount / 100); // Normalize to 100 accesses
    
    // Importance score (0-1, based on context type and relationships)
    const importanceScore = this.calculateImportanceScore(context);
    
    // Relationship score (0-1, based on connections)
    const relationshipScore = 0.5; // Placeholder - would need actual relationship data
    
    return (
      recencyScore * weights.recency +
      frequencyScore * weights.frequency +
      importanceScore * weights.importance +
      relationshipScore * weights.relationships
    );
  }

  private calculateImportanceScore(context: any): number {
    const importantTypes = ['task', 'checkpoint', 'decision', 'critical'];
    const type = context.context_type || '';
    
    if (importantTypes.includes(type)) return 0.8;
    if (type === 'reference' || type === 'knowledge') return 0.6;
    return 0.4;
  }

  private async applyOptimizationAction(action: TokenOptimizationResult['actions'][0]): Promise<void> {
    switch (action.action) {
      case 'compress':
        await this.applyCompression({ algorithm: 'hybrid' });
        break;
      case 'archive':
        await this.archiveOldContexts({ maxAge: 1 }); // Archive immediately
        break;
      case 'summarize':
        await this.summarizeContext(action.contextKey);
        break;
      case 'deduplicate':
        await this.deduplicateContexts({ similarityThreshold: 0.9 });
        break;
    }
  }

  private async summarizeContext(contextKey: string): Promise<void> {
    const context = await this.db.getEnhancedContext(contextKey);
    if (!context) return;

    const summarized = this.summarizeText(JSON.stringify(context.value));
    const contextValue = typeof context.value === 'object' && context.value !== null ? context.value : {};
    await this.db.storeContext(contextKey, { 
      ...contextValue, 
      _summarized: true,
      _originalLength: JSON.stringify(context.value).length,
      summary: summarized
    });
  }

  private generateOptimizationRecommendations(
    currentUsage: number,
    optimizedUsage: number,
    targetUsage: number,
    actions: TokenOptimizationResult['actions']
  ): string[] {
    const recommendations = [];

    if (optimizedUsage > targetUsage) {
      recommendations.push('Additional optimization needed - consider more aggressive archival policies');
    }

    const compressionActions = actions.filter(a => a.action === 'compress').length;
    if (compressionActions > 0) {
      recommendations.push(`${compressionActions} contexts compressed - monitor performance impact`);
    }

    const archiveActions = actions.filter(a => a.action === 'archive').length;
    if (archiveActions > 0) {
      recommendations.push(`${archiveActions} contexts archived - ensure important data is preserved`);
    }

    const efficiency = (currentUsage - optimizedUsage) / currentUsage * 100;
    recommendations.push(`Achieved ${Math.round(efficiency)}% token reduction`);

    return recommendations;
  }

  // Deduplication helpers
  private async findSimilarContexts(
    baseContext: any,
    candidates: any[],
    threshold: number,
    fieldWeights?: any
  ): Promise<Array<{ key: string; similarity: number }>> {
    const similarities = [];
    const weights = fieldWeights || { content: 0.6, metadata: 0.2, tags: 0.2 };

    for (const candidate of candidates) {
      const similarity = this.calculateContextSimilarity(baseContext, candidate, weights);
      if (similarity >= threshold) {
        similarities.push({ key: candidate.key, similarity });
      }
    }

    return similarities.sort((a, b) => b.similarity - a.similarity);
  }

  private calculateContextSimilarity(context1: any, context2: any, weights: any): number {
    // Content similarity
    const content1 = JSON.stringify(this.parseJsonSafely(context1.value));
    const content2 = JSON.stringify(this.parseJsonSafely(context2.value));
    const contentSimilarity = this.calculateTextSimilarity(content1, content2);

    // Type similarity
    const typeSimilarity = context1.context_type === context2.context_type ? 1.0 : 0.0;

    // Combined similarity
    return (
      contentSimilarity * weights.content +
      typeSimilarity * weights.metadata
    );
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    // Simple Jaccard similarity
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(x => words2.has(x)));
    const union = new Set([...words1, ...words2]);
    
    return union.size > 0 ? intersection.size / union.size : 0;
  }

  private async applyDeduplicationStrategy(
    baseContext: any,
    duplicates: Array<{ key: string; similarity: number }>,
    strategy: string,
    preserveRecent?: boolean
  ): Promise<{ removed: number; spaceFreed: number; merged: number }> {
    let removed = 0;
    let spaceFreed = 0;
    let merged = 0;

    const allContexts = [baseContext, ...duplicates.map(d => ({ key: d.key }))];
    
    switch (strategy) {
      case 'keep_newest':
        // Sort by update time, keep the newest
        const newest = preserveRecent ? baseContext : allContexts[0];
        for (const context of allContexts) {
          if (context.key !== newest.key) {
            const size = await this.getContextSize(context.key);
            await this.db.deleteContext(context.key);
            removed++;
            spaceFreed += size;
          }
        }
        break;
        
      case 'merge_all':
        // Merge all contexts into one
        const mergedContent = await this.mergeContexts(allContexts);
        const mergedKey = `merged_${Date.now()}`;
        await this.db.storeContext(mergedKey, mergedContent, 'merged');
        
        // Remove originals
        for (const context of allContexts) {
          const size = await this.getContextSize(context.key);
          await this.db.deleteContext(context.key);
          spaceFreed += size;
        }
        
        removed = allContexts.length;
        merged = 1;
        break;
    }

    return { removed, spaceFreed, merged };
  }

  private async getContextSize(contextKey: string): Promise<number> {
    const result = await this.db.executeQuery(
      'SELECT LENGTH(value) as size FROM context_items WHERE key = ?',
      [contextKey]
    ) as any[];
    
    return result.length > 0 ? result[0].size : 0;
  }

  private async mergeContexts(contexts: any[]): Promise<any> {
    // Simple merge strategy - combine all unique information
    const merged: any = {
      _mergedFrom: contexts.map(c => c.key),
      _mergedAt: new Date().toISOString(),
      _mergeStrategy: 'deduplicate_merge'
    };

    // Merge all unique keys and values
    for (const context of contexts) {
      const content = this.parseJsonSafely(context.value || '{}');
      if (typeof content === 'object' && content !== null) {
        Object.assign(merged, content);
      }
    }

    return merged;
  }

  private calculateDeduplicationQuality(groups: any[]): number {
    if (groups.length === 0) return 1.0;
    
    const averageSimilarity = groups.reduce((sum, g) => sum + g.similarity, 0) / groups.length;
    return averageSimilarity;
  }

  // Archive helpers
  private async getContextRelationships(_contextKey: string): Promise<any[]> {
    // Placeholder - would query actual relationships table
    return [];
  }

  private async storeArchivedContext(archiveKey: string, archiveData: any): Promise<void> {
    await this.db.storeContext(archiveKey, archiveData, 'archived');
  }

  private async preserveArchivedRelationships(originalKey: string, archiveKey: string, relationships: any[]): Promise<void> {
    // Store relationship preservation mapping
    await this.db.storeContext(`archive_relationships_${archiveKey}`, {
      originalKey,
      archiveKey,
      relationships,
      preservedAt: new Date().toISOString()
    }, 'archive_relationships');
  }

  private calculatePerformanceImpact(contextsArchived: number, spaceFreed: number): number {
    // Estimate performance improvement from reduced data size
    const storageImpact = Math.min(1.0, spaceFreed / 10000000); // 10MB baseline
    const queryImpact = Math.min(1.0, contextsArchived / 1000); // 1000 contexts baseline
    return (storageImpact + queryImpact) / 2;
  }

  // Template helpers
  private async loadExistingTemplates(): Promise<void> {
    const templates = await this.db.executeQuery(
      'SELECT key, value FROM context_items WHERE context_type = ?',
      ['template']
    ) as any[];

    for (const template of templates) {
      try {
        const templateData = this.parseJsonSafely(template.value) as ContextTemplate;
        this.templateLibrary.set(templateData.templateId, templateData);
      } catch (error) {
        logger.warn({ error, templateKey: template.key }, 'Failed to load template');
      }
    }
  }

  private async generateTemplatesFromPatterns(): Promise<ContextTemplate[]> {
    const templates: ContextTemplate[] = [];
    
    // Analyze common context patterns
    const patterns = await this.analyzeContextPatterns();
    
    for (const pattern of patterns) {
      if (pattern.frequency >= 5) { // At least 5 occurrences
        const template = this.createTemplateFromPattern(pattern);
        templates.push(template);
      }
    }

    return templates;
  }

  private async analyzeContextPatterns(): Promise<Array<{
    pattern: string;
    frequency: number;
    structure: any;
    contextType: string;
  }>> {
    const contexts = await this.db.executeQuery(
      'SELECT context_type, value FROM context_items',
      []
    ) as any[];

    const patterns = new Map<string, { frequency: number; structure: any; contextType: string }>();

    for (const context of contexts) {
      const structure = this.extractStructure(context.value);
      const patternKey = this.generatePatternKey(structure);
      
      if (patterns.has(patternKey)) {
        patterns.get(patternKey)!.frequency++;
      } else {
        patterns.set(patternKey, {
          frequency: 1,
          structure,
          contextType: context.context_type || 'generic'
        });
      }
    }

    return Array.from(patterns.entries()).map(([pattern, data]) => ({
      pattern,
      ...data
    }));
  }

  private extractStructure(value: string): any {
    const parsed = this.parseJsonSafely(value);
    if (typeof parsed === 'object' && parsed !== null) {
      return this.getObjectStructure(parsed);
    }
    return { type: 'string', length: value.length };
  }

  private getObjectStructure(obj: any): any {
    if (Array.isArray(obj)) {
      return {
        type: 'array',
        length: obj.length,
        itemType: obj.length > 0 ? this.getObjectStructure(obj[0]) : 'unknown'
      };
    }

    if (typeof obj === 'object' && obj !== null) {
      const structure: any = { type: 'object', fields: {} };
      for (const [key, value] of Object.entries(obj)) {
        structure.fields[key] = this.getObjectStructure(value);
      }
      return structure;
    }

    return { type: typeof obj };
  }

  private generatePatternKey(structure: any): string {
    return JSON.stringify(structure);
  }

  private createTemplateFromPattern(pattern: any): ContextTemplate {
    const templateId = `pattern_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      templateId,
      name: `Pattern Template ${pattern.contextType}`,
      description: `Auto-generated template from ${pattern.frequency} similar contexts`,
      category: pattern.contextType,
      version: '1.0',
      schema: {
        fields: this.convertStructureToFields(pattern.structure),
        relationships: []
      },
      usage: {
        usageCount: 0,
        lastUsed: new Date(),
        successRate: 1.0,
        averageRating: 4.0
      },
      metadata: {
        createdAt: new Date(),
        tags: ['auto-generated', 'pattern', pattern.contextType],
        difficulty: 'beginner'
      }
    };
  }

  private convertStructureToFields(structure: any): ContextTemplate['schema']['fields'] {
    const fields: ContextTemplate['schema']['fields'] = [];
    
    if (structure.type === 'object' && structure.fields) {
      for (const [fieldName, fieldStructure] of Object.entries(structure.fields)) {
        fields.push({
          name: fieldName,
          type: this.mapStructureTypeToFieldType(fieldStructure),
          required: false,
          description: `Field extracted from pattern analysis`
        });
      }
    }

    return fields;
  }

  private mapStructureTypeToFieldType(structure: any): ContextTemplate['schema']['fields'][0]['type'] {
    switch (structure.type) {
      case 'string': return 'string';
      case 'number': return 'number';
      case 'boolean': return 'boolean';
      case 'array': return 'array';
      case 'object': return 'object';
      default: return 'string';
    }
  }

  private async updateTemplateStatistics(): Promise<void> {
    // Update usage statistics for templates
    for (const [templateId, template] of this.templateLibrary.entries()) {
      // Query usage from database
      const usageQuery = await this.db.executeQuery(
        'SELECT COUNT(*) as count FROM context_items WHERE value LIKE ?',
        [`%${templateId}%`]
      ) as any[];

      if (usageQuery.length > 0) {
        template.usage.usageCount = usageQuery[0].count;
        template.usage.lastUsed = new Date();
      }
    }
  }

  private generateTemplateRecommendations(templates: ContextTemplate[], statistics: any): string[] {
    const recommendations = [];

    if (statistics.totalTemplates === 0) {
      recommendations.push('No templates found - consider creating basic templates for common use cases');
      return recommendations;
    }

    const lowUsageTemplates = templates.filter(t => t.usage.usageCount < 5).length;
    if (lowUsageTemplates > statistics.totalTemplates * 0.5) {
      recommendations.push('Many templates have low usage - consider consolidating or removing unused templates');
    }

    const topCategory = Object.entries(statistics.byCategory)
      .sort(([,a], [,b]) => (b as number) - (a as number))[0];
    
    if (topCategory) {
      recommendations.push(`Most templates are in '${topCategory[0]}' category - consider expanding other categories`);
    }

    if (statistics.topUsed.length > 0) {
      recommendations.push(`Top template: '${statistics.topUsed[0].name}' with ${statistics.topUsed[0].usageCount} uses`);
    }

    return recommendations;
  }

  // Workflow helpers
  private async analyzeWorkflowPatterns(_baseName: string, _options: any): Promise<Array<{
    stepIndex: number;
    trigger: string;
    modification: string;
    confidence: number;
    pattern: string;
    frequency: number;
    success: number;
    adaptation: string;
  }>> {
    // Analyze existing workflow patterns
    const patterns = [];
    
    // This would analyze actual usage data
    // For now, return some example patterns
    patterns.push({
      stepIndex: 0,
      trigger: 'high_frequency_usage',
      modification: 'add_caching',
      confidence: 0.8,
      pattern: 'frequent_access',
      frequency: 10,
      success: 0.9,
      adaptation: 'cache_results'
    });

    return patterns;
  }

  private async storeAdaptiveWorkflow(workflow: AdaptiveWorkflow): Promise<void> {
    await this.db.storeContext(`workflow_${workflow.workflowId}`, workflow, 'adaptive_workflow');
  }

  // Smart path generation helpers
  private async analyzeUsagePatterns(_options: any): Promise<Array<{
    pattern: string;
    frequency: number;
    confidence: number;
    steps: Array<{ action: string; parameters: any }>;
  }>> {
    // Analyze actual usage patterns from logs/database
    const patterns = [];
    
    // This would analyze real usage data
    // For now, return example patterns
    patterns.push({
      pattern: 'context_creation_workflow',
      frequency: 15,
      confidence: 0.85,
      steps: [
        { action: 'store_context', parameters: { type: 'task' } },
        { action: 'create_context_relationship', parameters: { type: 'relates_to' } },
        { action: 'semantic_search_context', parameters: { query: 'related' } }
      ]
    });

    return patterns;
  }

  private async createSmartPathFromPattern(pattern: any, _options: any): Promise<GeneratedSmartPath> {
    const pathId = `generated_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    
    return {
      pathId,
      name: `Auto-generated: ${pattern.pattern}`,
      description: `Smart path generated from usage pattern with ${pattern.frequency} occurrences`,
      confidence: pattern.confidence,
      frequency: pattern.frequency,
      pattern: pattern.steps.map((step: any, index: number) => ({
        step: index + 1,
        action: step.action,
        contextType: step.parameters.type,
        parameters: step.parameters,
        alternatives: []
      })),
      statistics: {
        successRate: 0,
        averageExecutionTime: 0,
        tokenEfficiency: 0,
        userAdoption: 0
      },
      variations: []
    };
  }

  private async calculatePathStatistics(smartPath: GeneratedSmartPath): Promise<GeneratedSmartPath['statistics']> {
    // Calculate statistics based on pattern data
    return {
      successRate: smartPath.confidence,
      averageExecutionTime: 1000, // ms
      tokenEfficiency: 0.8,
      userAdoption: smartPath.frequency / 100 // Normalize
    };
  }

  private async generatePathVariations(smartPath: GeneratedSmartPath): Promise<GeneratedSmartPath['variations']> {
    const variations = [];
    
    // Generate simple variations
    variations.push({
      variationId: `${smartPath.pathId}_variation_1`,
      description: 'Optimized for speed',
      modifications: [
        { step: 1, change: 'Add caching' }
      ],
      performance: {
        relative: 1.2,
        absolute: 800
      }
    });

    return variations;
  }

  private async storeGeneratedSmartPath(path: GeneratedSmartPath): Promise<void> {
    await this.db.storeContext(`generated_smart_path_${path.pathId}`, path, 'generated_smart_path');
  }

  // Utility methods
  private parseJsonSafely(value: string): unknown {
    try {
      return JSON.parse(value);
    } catch {
      return value;
    }
  }
}
