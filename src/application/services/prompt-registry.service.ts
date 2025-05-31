import { injectable } from 'inversify';
import type { IPromptRegistry, MCPPrompt } from '../../core/interfaces/prompt-registry.interface.js';
import { logger } from '../../utils/logger.js';

@injectable()
export class PromptRegistry implements IPromptRegistry {
  private prompts = new Map<string, MCPPrompt>();

  register(prompt: MCPPrompt): void {
    this.prompts.set(prompt.name, prompt);
    logger.debug({ promptName: prompt.name }, 'Prompt registered');
  }

  get(name: string): MCPPrompt | undefined {
    return this.prompts.get(name);
  }

  async getAllPrompts(): Promise<MCPPrompt[]> {
    return Array.from(this.prompts.values());
  }
}
