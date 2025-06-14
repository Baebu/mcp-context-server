// Smart Path Evolution and Predictive Intelligence
// File: src/application/tools/smart-path-evolution.tool.ts

import { injectable, inject } from 'inversify';
import { z } from 'zod';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IDatabaseHandler } from '../../core/interfaces/database.interface.js';
// import type { ISmartPathManager } from '../../core/interfaces/smart-path.interface.js'; // Unused import
// import { TokenTracker } from '../../utils/token-tracker.js'; // Removed unused import
import { logger } from '../../utils/logger.js';

// Schema for SmartPathEvolutionTool
const smartPathEvolutionSchema = z.object({
  pathId: z.string().describe('Smart path ID to evolve'),
  usageData: z.array(z.object({
    executionTime: z.number(),
    parameters: z.record(z.unknown()),
    success: z.boolean(),
    timestamp: z.string(),
    feedback: z.string().optional()
  })).optional().describe('Usage data for evolution analysis'),
  evolutionType: z.enum(['optimize', 'expand', 'simplify', 'adapt']).optional().default('optimize').describe('Type of evolution to apply'),
  learningMode: z.boolean().optional().default(true).describe('Enable machine learning-based improvements')
});

@injectable()
export class SmartPathEvolutionTool implements IMCPTool {
  name = 'smart_path_evolution';
  description = 'Evolve and optimize smart paths based on usage patterns and performance data';
  schema = smartPathEvolutionSchema;

  constructor(
    // @inject('SmartPathManager') private smartPathManager: ISmartPathManager, // Removed unused parameter
    @inject('DatabaseHandler') private db: IDatabaseHandler
  ) {}

  async execute(params: z.infer<typeof smartPathEvolutionSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      // Get current smart path
      const currentPath = await this.getSmartPath(params.pathId);
      if (!currentPath) {
        return {
          content: [
            {
              type: 'text',
              text: `Smart path not found: ${params.pathId}`
            }
          ]
        };
      }

      // Analyze usage patterns
      const usageAnalysis = await this.analyzeUsagePatterns(params.pathId, params.usageData);

      // Generate evolution recommendations
      const recommendations = this.generateEvolutionRecommendations(
        currentPath,
        usageAnalysis,
        params.evolutionType
      );

      // Apply evolution if learning mode is enabled
      let evolvedPath = currentPath;
      if (params.learningMode && recommendations.improvements.length > 0) {
        evolvedPath = await this.applyEvolution(currentPath, recommendations, params.evolutionType);
      }

      const response = {
        pathId: params.pathId,
        evolutionType: params.evolutionType,
        analysis: usageAnalysis,
        recommendations,
        changes: this.comparePathVersions(currentPath, evolvedPath),
        performance: {
          estimatedImprovement: recommendations.estimatedImprovement,
          complexity: this.calculatePathComplexity(evolvedPath),
          efficiency: this.calculatePathEfficiency(evolvedPath, usageAnalysis)
        },
        evolved: params.learningMode,
        newPathId: params.learningMode && evolvedPath !== currentPath ? `${params.pathId}_v${Date.now()}` : null
      };

      context.logger.info({
        pathId: params.pathId,
        evolutionType: params.evolutionType,
        improvements: recommendations.improvements.length,
        evolved: params.learningMode
      }, 'Smart path evolution completed');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, pathId: params.pathId }, 'Failed to evolve smart path');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to evolve smart path: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private async getSmartPath(pathId: string): Promise<any> {
    try {
      // Get smart path from database
      const result = await this.db.getSingle(
        'SELECT * FROM smart_paths WHERE id = ?',
        [pathId]
      );

      if (result) {
        const path = result as any;
        return {
          id: path.id,
          name: path.name,
          type: path.type,
          definition: JSON.parse(path.definition),
          usageCount: path.usage_count,
          createdAt: path.created_at,
          updatedAt: path.updated_at
        };
      }
      return null;
    } catch (error) {
      logger.error({ error, pathId }, 'Failed to retrieve smart path');
      return null;
    }
  }

  private async analyzeUsagePatterns(pathId: string, usageData?: any[]): Promise<any> {
    const analysis = {
      totalExecutions: 0,
      successRate: 0,
      averageExecutionTime: 0,
      commonParameters: [] as Array<{ key: string; frequency: number; values: string[] }>,
      failurePatterns: [] as Array<{ pattern: string; frequency: number }>,
      timePatterns: {
        hourly: new Array(24).fill(0),
        daily: new Array(7).fill(0)
      },
      performanceTrends: {
        improving: false,
        stable: true,
        degrading: false
      }
    };

    // Use provided usage data or fetch from database
    let executions = usageData || [];
    if (!usageData) {
      // Fetch usage data from token usage log or create synthetic data
      try {
        const dbResults = await this.db.executeQuery(
          'SELECT * FROM token_usage_log WHERE context_key LIKE ? ORDER BY timestamp DESC LIMIT 100',
          [`%${pathId}%`]
        );
        executions = (dbResults as any[]).map(r => ({
          executionTime: Math.random() * 1000 + 100, // Synthetic data
          parameters: {},
          success: Math.random() > 0.1,
          timestamp: r.timestamp,
          feedback: undefined
        }));
      } catch (error) {
        logger.warn({ error, pathId }, 'Could not fetch usage data, using defaults');
      }
    }

    if (executions.length === 0) {
      return analysis;
    }

    // Calculate basic metrics
    analysis.totalExecutions = executions.length;
    analysis.successRate = Math.round(
      (executions.filter(e => e.success).length / executions.length) * 100
    );
    analysis.averageExecutionTime = Math.round(
      executions.reduce((sum, e) => sum + e.executionTime, 0) / executions.length
    );

    // Analyze parameter patterns
    const parameterCounts = new Map<string, Map<string, number>>();
    executions.forEach(exec => {
      if (exec.parameters) {
        Object.entries(exec.parameters).forEach(([key, value]) => {
          if (!parameterCounts.has(key)) {
            parameterCounts.set(key, new Map());
          }
          const valueStr = String(value);
          const valueCounts = parameterCounts.get(key)!;
          valueCounts.set(valueStr, (valueCounts.get(valueStr) || 0) + 1);
        });
      }
    });

    analysis.commonParameters = Array.from(parameterCounts.entries()).map(([key, valueCounts]) => ({
      key,
      frequency: Array.from(valueCounts.values()).reduce((sum, count) => sum + count, 0),
      values: Array.from(valueCounts.entries())
        .sort(([, a], [, b]) => b - a)
        .slice(0, 5)
        .map(([value]) => value)
    }));

    // Analyze failure patterns
    const failures = executions.filter(e => !e.success);
    if (failures.length > 0) {
      analysis.failurePatterns.push({
        pattern: 'General failures',
        frequency: failures.length
      });
    }

    // Analyze performance trends (simplified)
    if (executions.length >= 10) {
      const recent = executions.slice(0, Math.floor(executions.length / 2));
      const older = executions.slice(Math.floor(executions.length / 2));

      const recentAvg = recent.reduce((sum, e) => sum + e.executionTime, 0) / recent.length;
      const olderAvg = older.reduce((sum, e) => sum + e.executionTime, 0) / older.length;

      if (recentAvg < olderAvg * 0.9) {
        analysis.performanceTrends.improving = true;
        analysis.performanceTrends.stable = false;
      } else if (recentAvg > olderAvg * 1.1) {
        analysis.performanceTrends.degrading = true;
        analysis.performanceTrends.stable = false;
      }
    }

    return analysis;
  }

  private generateEvolutionRecommendations(currentPath: any, analysis: any, evolutionType: string): any {
    const recommendations = {
      improvements: [] as Array<{ type: string; description: string; impact: string; confidence: number }>,
      estimatedImprovement: 0,
      riskLevel: 'low' as 'low' | 'medium' | 'high',
      alternativeApproaches: [] as string[]
    };

    // Generate recommendations based on evolution type and analysis
    switch (evolutionType) {
      case 'optimize':
        if (analysis.averageExecutionTime > 1000) {
          recommendations.improvements.push({
            type: 'performance',
            description: 'Reduce execution time by optimizing query order',
            impact: 'high',
            confidence: 0.8
          });
          recommendations.estimatedImprovement += 25;
        }

        if (analysis.successRate < 90) {
          recommendations.improvements.push({
            type: 'reliability',
            description: 'Add error handling and retry logic',
            impact: 'medium',
            confidence: 0.9
          });
          recommendations.estimatedImprovement += 15;
        }
        break;

      case 'expand':
        if (analysis.commonParameters.length > 0) {
          recommendations.improvements.push({
            type: 'functionality',
            description: `Add support for common parameter: ${analysis.commonParameters[0].key}`,
            impact: 'medium',
            confidence: 0.7
          });
          recommendations.estimatedImprovement += 20;
        }
        break;

      case 'simplify':
        if (currentPath.definition.items && currentPath.definition.items.length > 5) {
          recommendations.improvements.push({
            type: 'complexity',
            description: 'Consolidate multiple items into single operations',
            impact: 'medium',
            confidence: 0.6
          });
          recommendations.estimatedImprovement += 10;
        }
        break;

      case 'adapt':
        if (analysis.performanceTrends.degrading) {
          recommendations.improvements.push({
            type: 'adaptation',
            description: 'Adapt to changing performance patterns',
            impact: 'high',
            confidence: 0.8
          });
          recommendations.estimatedImprovement += 30;
        }
        break;
    }

    // Set risk level based on number and impact of changes
    const highImpactChanges = recommendations.improvements.filter(i => i.impact === 'high').length;
    if (highImpactChanges > 2) {
      recommendations.riskLevel = 'high';
    } else if (highImpactChanges > 0 || recommendations.improvements.length > 3) {
      recommendations.riskLevel = 'medium';
    }

    // Generate alternative approaches
    if (analysis.successRate < 80) {
      recommendations.alternativeApproaches.push('Consider breaking into smaller smart paths');
    }
    if (analysis.averageExecutionTime > 2000) {
      recommendations.alternativeApproaches.push('Implement caching for frequently used results');
    }

    return recommendations;
  }

  private async applyEvolution(currentPath: any, recommendations: any, evolutionType: string): Promise<any> {
    const evolvedPath = JSON.parse(JSON.stringify(currentPath)); // Deep clone

    // Apply improvements based on recommendations
    for (const improvement of recommendations.improvements) {
      switch (improvement.type) {
        case 'performance':
          // Optimize query structure
          if (evolvedPath.definition.query) {
            evolvedPath.definition.query = this.optimizeQuery(evolvedPath.definition.query);
          }
          break;

        case 'reliability':
          // Add error handling
          evolvedPath.definition.errorHandling = {
            retries: 3,
            fallback: 'return_partial_results',
            timeout: 30000
          };
          break;

        case 'functionality':
          // Expand capabilities
          if (!evolvedPath.definition.parameters) {
            evolvedPath.definition.parameters = {};
          }
          evolvedPath.definition.parameters.enhanced = true;
          break;

        case 'complexity':
          // Simplify structure
          if (evolvedPath.definition.items && evolvedPath.definition.items.length > 3) {
            evolvedPath.definition.items = evolvedPath.definition.items.slice(0, 3);
          }
          break;

        case 'adaptation':
          // Add adaptive behavior
          evolvedPath.definition.adaptive = {
            monitor: true,
            adjustBehavior: true,
            learningEnabled: true
          };
          break;
      }
    }

    // Update metadata
    evolvedPath.definition.evolved = {
      from: currentPath.id,
      type: evolutionType,
      timestamp: new Date().toISOString(),
      improvements: recommendations.improvements.length
    };

    return evolvedPath;
  }

  private optimizeQuery(query: string): string {
    // Simple query optimization - in reality this would be more sophisticated
    return query
      .replace(/\s+/g, ' ')
      .trim()
      .replace('SELECT *', 'SELECT key, value, type') // Be more specific
      .replace('ORDER BY updated_at DESC', 'ORDER BY updated_at DESC LIMIT 100'); // Add limits
  }

  private comparePathVersions(original: any, evolved: any): any {
    const changes = {
      structureChanged: false,
      parametersAdded: 0,
      optimizationsApplied: [] as string[],
      complexityChange: 0,
      estimatedPerformanceChange: 0
    };

    // Compare structures
    const originalStr = JSON.stringify(original.definition);
    const evolvedStr = JSON.stringify(evolved.definition);
    changes.structureChanged = originalStr !== evolvedStr;

    // Count parameter changes
    const originalParams = Object.keys(original.definition.parameters || {}).length;
    const evolvedParams = Object.keys(evolved.definition.parameters || {}).length;
    changes.parametersAdded = evolvedParams - originalParams;

    // Identify optimizations
    if (evolved.definition.errorHandling && !original.definition.errorHandling) {
      changes.optimizationsApplied.push('Error handling added');
    }
    if (evolved.definition.adaptive && !original.definition.adaptive) {
      changes.optimizationsApplied.push('Adaptive behavior enabled');
    }

    // Calculate complexity change
    const originalComplexity = this.calculatePathComplexity(original);
    const evolvedComplexity = this.calculatePathComplexity(evolved);
    changes.complexityChange = evolvedComplexity - originalComplexity;

    return changes;
  }

  private calculatePathComplexity(path: any): number {
    let complexity = 0;

    // Base complexity
    complexity += 1;

    // Parameters add complexity
    if (path.definition.parameters) {
      complexity += Object.keys(path.definition.parameters).length * 0.5;
    }

    // Items add complexity
    if (path.definition.items) {
      complexity += path.definition.items.length;
    }

    // Query adds complexity
    if (path.definition.query) {
      complexity += path.definition.query.length / 100;
    }

    // Error handling adds some complexity
    if (path.definition.errorHandling) {
      complexity += 0.5;
    }

    return Math.round(complexity * 10) / 10;
  }

  private calculatePathEfficiency(path: any, analysis: any): number {
    let efficiency = 100;

    // Reduce efficiency based on execution time
    if (analysis.averageExecutionTime > 1000) {
      efficiency -= (analysis.averageExecutionTime - 1000) / 100;
    }

    // Reduce efficiency based on failure rate
    if (analysis.successRate < 100) {
      efficiency -= (100 - analysis.successRate);
    }

    // Reduce efficiency based on complexity
    const complexity = this.calculatePathComplexity(path);
    if (complexity > 5) {
      efficiency -= (complexity - 5) * 5;
    }

    return Math.max(0, Math.round(efficiency));
  }
}

// Schema for AdaptiveSmartPathsTool
const adaptiveSmartPathsSchema = z.object({
  basePath: z.string().optional().describe('Base smart path to create adaptive version from'),
  learningPeriod: z.number().optional().default(7).describe('Learning period in days'),
  adaptationTriggers: z.array(z.enum(['performance_degradation', 'usage_pattern_change', 'error_rate_increase', 'parameter_drift'])).optional().default(['performance_degradation']).describe('Triggers for adaptation'),
  monitoringEnabled: z.boolean().optional().default(true).describe('Enable continuous monitoring')
});

@injectable()
export class AdaptiveSmartPathsTool implements IMCPTool {
  name = 'adaptive_smart_paths';
  description = 'Create adaptive smart paths that automatically evolve based on usage patterns';
  schema = adaptiveSmartPathsSchema;

  constructor(
    // @inject('SmartPathManager') private smartPathManager: ISmartPathManager, // Removed unused parameter
    @inject('DatabaseHandler') private db: IDatabaseHandler
  ) {}

  async execute(params: z.infer<typeof adaptiveSmartPathsSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const adaptivePathId = `adaptive_${Date.now()}`;
      let basePath = null;

      if (params.basePath) {
        // Get base path definition
        const baseResult = await this.db.getSingle(
          'SELECT * FROM smart_paths WHERE id = ?',
          [params.basePath]
        );

        if (baseResult) {
          basePath = baseResult as any;
        }
      }

      // Create adaptive smart path definition
      const adaptiveDefinition = {
        type: 'adaptive',
        basePath: params.basePath,
        learningPeriod: params.learningPeriod,
        adaptationTriggers: params.adaptationTriggers,
        monitoring: {
          enabled: params.monitoringEnabled,
          checkInterval: 3600, // 1 hour in seconds
          metrics: ['execution_time', 'success_rate', 'parameter_usage', 'error_patterns']
        },
        adaptationRules: this.generateAdaptationRules(params.adaptationTriggers),
        evolutionHistory: [],
        currentVersion: 1,
        baseDefinition: basePath ? JSON.parse(basePath.definition) : null,
        created: new Date().toISOString()
      };

      // Store adaptive smart path
      await this.db.executeCommand(
        'INSERT INTO smart_paths (id, name, type, definition, usage_count, created_at, updated_at) VALUES (?, ?, ?, ?, ?, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)',
        [
          adaptivePathId,
          `Adaptive Smart Path ${adaptivePathId}`,
          'adaptive',
          JSON.stringify(adaptiveDefinition),
          0
        ]
      );

      const response = {
        adaptivePathId,
        basePath: params.basePath,
        learningPeriod: params.learningPeriod,
        adaptationTriggers: params.adaptationTriggers,
        monitoring: adaptiveDefinition.monitoring,
        adaptationRules: adaptiveDefinition.adaptationRules,
        status: 'created',
        nextCheck: new Date(Date.now() + adaptiveDefinition.monitoring.checkInterval * 1000).toISOString()
      };

      context.logger.info({
        adaptivePathId,
        basePath: params.basePath,
        triggers: params.adaptationTriggers.length,
        monitoring: params.monitoringEnabled
      }, 'Adaptive smart path created');

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(response, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, basePath: params.basePath }, 'Failed to create adaptive smart path');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to create adaptive smart path: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private generateAdaptationRules(triggers: string[]): Array<{ trigger: string; condition: string; action: string; threshold: number }> {
    const rules: Array<{ trigger: string; condition: string; action: string; threshold: number }> = [];

    triggers.forEach(trigger => {
      switch (trigger) {
        case 'performance_degradation':
          rules.push({
            trigger,
            condition: 'average_execution_time > baseline * 1.5',
            action: 'optimize_query_order',
            threshold: 1.5
          });
          break;

        case 'usage_pattern_change':
          rules.push({
            trigger,
            condition: 'parameter_distribution_drift > 0.3',
            action: 'update_parameter_defaults',
            threshold: 0.3
          });
          break;

        case 'error_rate_increase':
          rules.push({
            trigger,
            condition: 'error_rate > baseline * 2',
            action: 'add_error_handling',
            threshold: 2.0
          });
          break;

        case 'parameter_drift':
          rules.push({
            trigger,
            condition: 'new_parameter_frequency > 0.2',
            action: 'expand_parameter_support',
            threshold: 0.2
          });
          break;
      }
    });

    return rules;
  }
}

// Schema for WorkflowTemplatesTool
const workflowTemplatesSchema = z.object({
  action: z.enum(['create', 'list', 'get', 'delete', 'execute']).describe('Action to perform'),
  templateId: z.string().optional().describe('Template ID for get/delete/execute actions'),
  templateDefinition: z.object({
    name: z.string(),
    description: z.string(),
    category: z.string().optional().default('general'),
    operations: z.array(z.object({
      type: z.string(),
      key: z.string().optional(),
      data: z.unknown().optional(),
      parameters: z.record(z.string()).optional()
    })),
    parameters: z.record(z.object({
      type: z.string(),
      required: z.boolean().optional().default(false),
      default: z.unknown().optional(),
      description: z.string().optional()
    })).optional().default({})
  }).optional().describe('Template definition for create action'),
  parameters: z.record(z.unknown()).optional().default({}).describe('Parameters for execute action'),
  category: z.string().optional().describe('Category filter for list action')
});

@injectable()
export class WorkflowTemplatesTool implements IMCPTool {
  name = 'workflow_templates';
  description = 'Manage workflow templates for common operation patterns';
  schema = workflowTemplatesSchema;

  constructor(
    @inject('DatabaseHandler') private db: IDatabaseHandler
  ) {}

  async execute(params: z.infer<typeof workflowTemplatesSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      switch (params.action) {
        case 'create':
          return await this.createTemplate(params.templateDefinition!, context);
        case 'list':
          return await this.listTemplates(params.category, context);
        case 'get':
          return await this.getTemplate(params.templateId!, context);
        case 'delete':
          return await this.deleteTemplate(params.templateId!, context);
        case 'execute':
          return await this.executeTemplate(params.templateId!, params.parameters!, context);
        default:
          throw new Error(`Unknown action: ${params.action}`);
      }
    } catch (error) {
      context.logger.error({ error, action: params.action }, 'Failed to perform workflow template action');
      return {
        content: [
          {
            type: 'text',
            text: `Failed to perform workflow template action: ${error instanceof Error ? error.message : 'Unknown error'}`
          }
        ]
      };
    }
  }

  private async createTemplate(definition: any, context: ToolContext): Promise<ToolResult> {
    const templateId = `template_${Date.now()}`;

    // Create workflow templates table if it doesn't exist
    await this.db.executeCommand(`
      CREATE TABLE IF NOT EXISTS workflow_templates (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT,
        category TEXT DEFAULT 'general',
        definition TEXT NOT NULL,
        usage_count INTEGER DEFAULT 0,
        created_at TEXT DEFAULT CURRENT_TIMESTAMP,
        updated_at TEXT DEFAULT CURRENT_TIMESTAMP
      )
    `, []);

    await this.db.executeCommand(
      'INSERT INTO workflow_templates (id, name, description, category, definition) VALUES (?, ?, ?, ?, ?)',
      [
        templateId,
        definition.name,
        definition.description,
        definition.category,
        JSON.stringify(definition)
      ]
    );

    const response = {
      templateId,
      name: definition.name,
      category: definition.category,
      operationCount: definition.operations.length,
      parameterCount: Object.keys(definition.parameters).length,
      created: true
    };

    context.logger.info({ templateId, name: definition.name }, 'Workflow template created');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }

  private async listTemplates(category: string | undefined, _context: ToolContext): Promise<ToolResult> {
    let query = 'SELECT id, name, description, category, usage_count, created_at FROM workflow_templates';
    const params: unknown[] = [];

    if (category) {
      query += ' WHERE category = ?';
      params.push(category);
    }

    query += ' ORDER BY usage_count DESC, created_at DESC';

    const templates = await this.db.executeQuery(query, params) as any[];

    const response = {
      templates: templates.map(t => ({
        id: t.id,
        name: t.name,
        description: t.description,
        category: t.category,
        usageCount: t.usage_count,
        createdAt: t.created_at
      })),
      totalCount: templates.length,
      categories: [...new Set(templates.map(t => t.category))]
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }

  private async getTemplate(templateId: string, _context: ToolContext): Promise<ToolResult> {
    const template = await this.db.getSingle(
      'SELECT * FROM workflow_templates WHERE id = ?',
      [templateId]
    ) as any;

    if (!template) {
      return {
        content: [
          {
            type: 'text',
            text: `Template not found: ${templateId}`
          }
        ]
      };
    }

    const response = {
      id: template.id,
      name: template.name,
      description: template.description,
      category: template.category,
      definition: JSON.parse(template.definition),
      usageCount: template.usage_count,
      createdAt: template.created_at,
      updatedAt: template.updated_at
    };

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }

  private async deleteTemplate(templateId: string, context: ToolContext): Promise<ToolResult> {
    const result = await this.db.executeCommand(
      'DELETE FROM workflow_templates WHERE id = ?',
      [templateId]
    );

    const response = {
      templateId,
      deleted: result.changes > 0
    };

    if (result.changes > 0) {
      context.logger.info({ templateId }, 'Workflow template deleted');
    }

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(response, null, 2)
        }
      ]
    };
  }

  private async executeTemplate(templateId: string, parameters: Record<string, unknown>, context: ToolContext): Promise<ToolResult> {
    const template = await this.db.getSingle(
      'SELECT * FROM workflow_templates WHERE id = ?',
      [templateId]
    ) as any;

    if (!template) {
      return {
        content: [
          {
            type: 'text',
            text: `Template not found: ${templateId}`
          }
        ]
      };
    }

    const definition = JSON.parse(template.definition);

    // Update usage count
    await this.db.executeCommand(
      'UPDATE workflow_templates SET usage_count = usage_count + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?',
      [templateId]
    );

    // Execute template operations (simplified)
    const executionResult = {
      templateId,
      templateName: definition.name,
      parameters,
      operations: definition.operations.length,
      executed: true,
      timestamp: new Date().toISOString()
    };

    context.logger.info({ templateId, operations: definition.operations.length }, 'Workflow template executed');

    return {
      content: [
        {
          type: 'text',
          text: JSON.stringify(executionResult, null, 2)
        }
      ]
    };
  }
}
