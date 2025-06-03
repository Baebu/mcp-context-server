import { injectable, inject } from 'inversify';
import { z } from 'zod';
import * as yaml from 'yaml';
import type { IMCPTool, ToolContext, ToolResult } from '../../core/interfaces/tool-registry.interface.js';
import type { IFilesystemHandler } from '../../core/interfaces/filesystem.interface.js';

interface JsonSummary {
  type: string;
  length?: number;
  keyCount?: number;
  itemTypes?: string[];
  keys?: string[];
  preview?: JsonSummary | null;
  structure?: Record<string, JsonSummary>;
  value?: unknown;
  truncated?: boolean;
}

interface CsvSummary {
  rowCount: number;
  columnCount: number;
  headers: string[];
  sampleRow: Record<string, string> | null;
}

const parseFileSchema = z.object({
  path: z.string().describe('Path to the file to parse'),
  format: z.enum(['json', 'yaml', 'csv']).describe('File format to parse'),
  summaryOnly: z.boolean().optional().default(false).describe('Return only summary information')
});

@injectable()
export class ParseFileTool implements IMCPTool {
  name = 'parse_file';
  description = 'Parse structured files (JSON, YAML, CSV) and return content or summary';
  schema = parseFileSchema;

  constructor(@inject('FilesystemHandler') private filesystem: IFilesystemHandler) {}

  async execute(params: z.infer<typeof parseFileSchema>, context: ToolContext): Promise<ToolResult> {
    try {
      const fileContent = await this.filesystem.readFileWithTruncation(params.path, 1048576); // 1MB limit

      let parsed: unknown;
      let summary: JsonSummary | CsvSummary;

      switch (params.format) {
        case 'json': {
          parsed = JSON.parse(fileContent.content);
          summary = this.generateJsonSummary(parsed);
          break;
        }
        case 'yaml': {
          parsed = yaml.parse(fileContent.content);
          summary = this.generateJsonSummary(parsed);
          break;
        }
        case 'csv': {
          const csvResult = this.parseCSV(fileContent.content);
          parsed = csvResult.data;
          summary = csvResult.summary;
          break;
        }
      }

      const result = params.summaryOnly ? summary : { summary, data: parsed };

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(result, null, 2)
          }
        ]
      };
    } catch (error) {
      context.logger.error({ error, params }, 'Failed to parse file');
      throw error;
    }
  }

  private generateJsonSummary(data: unknown): JsonSummary {
    const getType = (value: unknown): string => {
      if (Array.isArray(value)) {
        return 'array';
      }
      if (value === null) {
        return 'null';
      }
      return typeof value;
    };

    const summarize = (obj: unknown, depth = 0): JsonSummary => {
      if (depth > 3) {
        return { type: getType(obj), truncated: true };
      }

      const type = getType(obj);

      if (type === 'array' && Array.isArray(obj)) {
        return {
          type: 'array',
          length: obj.length,
          itemTypes: [...new Set(obj.slice(0, 10).map(getType))],
          preview: obj.length > 0 ? summarize(obj[0], depth + 1) : null
        };
      } else if (type === 'object' && obj !== null && typeof obj === 'object') {
        const keys = Object.keys(obj);
        const structure: Record<string, JsonSummary> = {};
        keys.slice(0, 5).forEach(key => {
          structure[key] = summarize((obj as Record<string, unknown>)[key], depth + 1);
        });

        return {
          type: 'object',
          keyCount: keys.length,
          keys: keys.slice(0, 10),
          structure
        };
      } else {
        return {
          type,
          value: type === 'string' && typeof obj === 'string' && obj.length > 100 ? `${obj.substring(0, 100)}...` : obj
        };
      }
    };

    return summarize(data);
  }

  private parseCSV(content: string): { data: Record<string, string>[]; summary: CsvSummary } {
    const lines = content.split('\n').filter(line => line.trim());
    if (lines.length === 0) {
      return {
        data: [],
        summary: { rowCount: 0, columnCount: 0, headers: [], sampleRow: null }
      };
    }

    const firstLine = lines[0];
    if (!firstLine) {
      return {
        data: [],
        summary: { rowCount: 0, columnCount: 0, headers: [], sampleRow: null }
      };
    }

    const headers = firstLine.split(',').map(h => h.trim().replace(/^"|"$/g, ''));
    const rows = lines.slice(1).map(line => {
      const values = line.split(',').map(v => v.trim().replace(/^"|"$/g, ''));
      const row: Record<string, string> = {};
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });
      return row;
    });

    return {
      data: rows,
      summary: {
        rowCount: rows.length,
        columnCount: headers.length,
        headers,
        sampleRow: rows[0] || null
      }
    };
  }
}
