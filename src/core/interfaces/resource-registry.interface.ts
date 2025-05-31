export interface MCPResource {
  name: string;
  template: string;
  description?: string;
  read(
    uri: string,
    params?: Record<string, unknown> // Changed from any
  ): Promise<{
    contents: Array<{ uri: string; mimeType?: string; text?: string }>;
  }>;
}

export interface IResourceRegistry {
  register(resource: MCPResource): void;
  get(name: string): MCPResource | undefined;
  getAllResources(): Promise<MCPResource[]>;
}
