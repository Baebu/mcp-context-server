export interface SmartPathDefinition {
  name: string;
  type: 'item_bundle' | 'query_template' | 'file_set';
  definition: {
    paths?: string[] | undefined;
    query?: string | undefined;
    items?: string[] | undefined;
    metadata?: Record<string, unknown> | undefined; // Changed from any
  };
}

export interface SmartPathResult {
  id: string;
  name: string;
  type: string;
  data: unknown; // Changed from any
  metadata: Record<string, unknown>; // Changed from any
}

export interface ISmartPathManager {
  create(definition: SmartPathDefinition): Promise<string>;
  execute(id: string, params?: Record<string, unknown>): Promise<SmartPathResult>; // Changed from any
  list(): Promise<Array<{ id: string; name: string; type: string; usageCount: number }>>;
  delete(id: string): Promise<boolean>;
}
