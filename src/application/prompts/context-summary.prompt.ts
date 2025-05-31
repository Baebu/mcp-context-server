import { injectable } from 'inversify';
import { z } from 'zod';
import type { MCPPrompt } from '@core/interfaces/prompt-registry.interface.js';

const contextSummarySchema = z.object({
  contextKeys: z.array(z.string()).describe('Keys of context items to summarize'),
  maxLength: z.number().optional().default(1000).describe('Maximum length of summary')
});

@injectable()
export class ContextSummaryPrompt implements MCPPrompt {
  name = 'context-summary';
  description = 'Generate a summary of stored context items';
  schema = contextSummarySchema;

  async generate(params: z.infer<typeof contextSummarySchema>) {
    const contextList = params.contextKeys.map(key => `- ${key}`).join('\n');

    return {
      description: 'Generate a comprehensive summary of the provided context items',
      messages: [
        {
          role: 'user',
          content: {
            type: 'text',
            text: `Please provide a comprehensive summary of the following context items (max ${params.maxLength} characters):

Context items to summarize:
${contextList}

Focus on:
1. Key information and insights
2. Relationships between items
3. Important patterns or trends
4. Actionable conclusions

Keep the summary concise but comprehensive, highlighting the most important aspects.`
          }
        }
      ]
    };
  }
}
