import type { z } from 'zod';
import type { ServerConfig } from '@infrastructure/config/schema.js'; // Corrected import

export interface ToolContext {
  config: ServerConfig;
  logger: {
    error: (obj: unknown, msg?: string) => void;
    debug: (obj: unknown, msg?: string) => void;
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  };
  container: {
    get: <T>(identifier: string) => T;
  };
}

export interface ToolResult<T = unknown> {
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: T;
    mimeType?: string;
  }>;
}

export interface IMCPTool<TParams = unknown> {
  name: string;
  description: string;
  schema: z.ZodSchema<TParams>;
  execute(params: TParams, context: ToolContext): Promise<ToolResult>;
}

export interface IToolRegistry {
  register(tool: IMCPTool): void;
  get(name: string): IMCPTool | undefined;
  getAllTools(): Promise<IMCPTool[]>;
}
