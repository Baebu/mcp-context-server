import { injectable } from 'inversify';
import type { IResourceRegistry, MCPResource } from '@core/interfaces/resource-registry.interface.js';
import { logger } from '@utils/logger.js';

@injectable()
export class ResourceRegistry implements IResourceRegistry {
  private resources = new Map<string, MCPResource>();

  register(resource: MCPResource): void {
    this.resources.set(resource.name, resource);
    logger.debug({ resourceName: resource.name }, 'Resource registered');
  }

  get(name: string): MCPResource | undefined {
    return this.resources.get(name);
  }

  async getAllResources(): Promise<MCPResource[]> {
    return Array.from(this.resources.values());
  }
}
