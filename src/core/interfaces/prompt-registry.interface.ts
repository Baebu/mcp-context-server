import type { z } from 'zod';

export interface MCPPrompt<T = unknown> {
  // Added generic constraint
  name: string;
  description?: string;
  schema: z.ZodSchema<T>; // Changed from any
  generate(params: T): Promise<{
    // Changed from any
    description?: string;
    messages: Array<{ role: string; content: { type: string; text: string } }>;
  }>;
}

export interface IPromptRegistry {
  register(prompt: MCPPrompt): void;
  get(name: string): MCPPrompt | undefined;
  getAllPrompts(): Promise<MCPPrompt[]>;
}
