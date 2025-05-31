import type { z } from 'zod';
import type { ServerConfig } from '@infrastructure/config/types.js';

export interface ToolContext {
  config: ServerConfig; // Changed from any
  logger: {
    error: (obj: unknown, msg?: string) => void;
    debug: (obj: unknown, msg?: string) => void;
    info: (obj: unknown, msg?: string) => void;
    warn: (obj: unknown, msg?: string) => void;
  }; // Changed from any
  container: {
    get: <T>(identifier: string) => T;
  }; // Changed from any
}

export interface ToolResult<T = unknown> {
  // Changed from any
  content: Array<{
    type: 'text' | 'image' | 'resource';
    text?: string;
    data?: T;
    mimeType?: string;
  }>;
}

export interface IMCPTool<TParams = unknown> {
  // Changed from any
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
