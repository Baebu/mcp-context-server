import { promises as fs } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { logger } from '../src/utils/logger.js'; // Assuming logger can be used standalone

// Determine project root dynamically
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const WORKSPACE_NAME = 'test-fs-workspace';
const WORKSPACE_ROOT_PATH = path.join(PROJECT_ROOT, WORKSPACE_NAME);

interface FileItem {
  type: 'file';
  name: string;
  content: string;
}

interface DirItem {
  type: 'dir';
  name: string;
  items: Array<FileItem | DirItem>;
}

type WorkspaceItem = FileItem | DirItem;

const componentTsContent = `// Mock Component - Over 200 lines
import { injectable, inject } from 'inversify';

interface ComponentProps {
  id: string;
  title?: string;
  visible: boolean;
  data: Record<string, any>;
  onRender?: (element: HTMLElement) => void;
}

@injectable()
export class MyAdvancedComponent {
  private element: HTMLElement | null = null;
  private internalState: Record<string, any> = {};
  private eventListeners: Map<string, Function> = new Map();

  constructor(
    @inject('LoggerService') private logger: any, // Replace 'any' with actual Logger type if available
    private props: ComponentProps
  ) {
    this.logger.log(\`Component '\${props.id}' initialized.\`);
    this.internalState = { ...props.data, lastUpdate: new Date().toISOString() };
  }

  public render(containerId: string): void {
    const container = document.getElementById(containerId);
    if (!container) {
      this.logger.error(\`Container with id '\${containerId}' not found.\`);
      return;
    }

    if (!this.props.visible) {
      this.logger.log(\`Component '\${this.props.id}' is not visible, skipping render.\`);
      if (this.element) {
        this.element.style.display = 'none';
      }
      return;
    }

    if (!this.element) {
      this.element = document.createElement('div');
      this.element.id = \`component-\${this.props.id}\`;
      this.element.className = 'advanced-component';
      container.appendChild(this.element);
    }

    this.element.style.display = 'block';
    this.element.innerHTML = \`\`; // Clear previous content
    const titleElement = document.createElement('h3');
    titleElement.textContent = this.props.title || \`Component \${this.props.id}\`;
    this.element.appendChild(titleElement);

    const dataList = document.createElement('ul');
    for (const key in this.internalState) {
      const listItem = document.createElement('li');
      listItem.textContent = \`\${key}: \${JSON.stringify(this.internalState[key])}\`;
      dataList.appendChild(listItem);
    }
    this.element.appendChild(dataList);

${Array.from(
  { length: 150 },
  (_, i) => `
    // Auto-generated comment line ${i + 1} to increase length.
    this.performAuxiliaryTask${i + 1}();`
).join('')}

    if (this.props.onRender) {
      this.props.onRender(this.element);
    }
    this.logger.log(\`Component '\${this.props.id}' rendered.\`);
  }

  public updateData(newData: Record<string, any>): void {
    this.internalState = { ...this.internalState, ...newData, lastUpdate: new Date().toISOString() };
    this.logger.log(\`Component '\${this.props.id}' data updated.\`);
    if (this.element && this.props.visible) {
      this.render(this.element.parentElement?.id || ''); // Re-render
    }
  }

  public show(): void {
    this.props.visible = true;
    if (this.element) {
      this.render(this.element.parentElement?.id || '');
    }
  }

  public hide(): void {
    this.props.visible = false;
    if (this.element) {
      this.element.style.display = 'none';
    }
  }

  public addEventListener(event: string, callback: Function): void {
    this.eventListeners.set(event, callback);
    // Actual event listener attachment would go here
    this.logger.log(\`Event listener for '\${event}' added to component '\${this.props.id}'.\`);
  }

  // Generate dummy methods
${Array.from(
  { length: 150 },
  (_, i) => `
  private performAuxiliaryTask${i + 1}(): void {
    // This is dummy task ${i + 1} for MyAdvancedComponent.
    const result = ${i + 1} * 2;
    this.logger.debug(\`Task ${i + 1} completed with result \${result} for \${this.props.id}\`);
  }`
).join('')}
}

// End of MyAdvancedComponent
`;

const serviceTsContent = `// Mock Service - Over 200 lines
import { injectable, inject } from 'inversify';

interface ServiceConfig {
  endpoint: string;
  apiKey?: string;
  timeout: number;
  retries: number;
}

@injectable()
export class MyComplexService {
  private lastCallTimestamp: number = 0;
  private callCount: number = 0;

  constructor(
    @inject('ApiService') private api: any, // Replace 'any'
    @inject('CacheService') private cache: any, // Replace 'any'
    private config: ServiceConfig
  ) {
    console.log('MyComplexService initialized with endpoint:', config.endpoint);
  }

  public async fetchData(id: string, params?: Record<string, string>): Promise<any> {
    this.callCount++;
    this.lastCallTimestamp = Date.now();

    const cacheKey = \`data_\${id}_\${JSON.stringify(params || {})}\`;
    const cachedData = await this.cache.get(cacheKey);
    if (cachedData) {
      console.log(\`Returning cached data for id: \${id}\`);
      return cachedData;
    }

    console.log(\`Fetching data for id: \${id} from \${this.config.endpoint}/\${id}\`);
    try {
      const response = await this.api.get(\`\${this.config.endpoint}/\${id}\`, {
        params,
        headers: this.config.apiKey ? { 'X-API-Key': this.config.apiKey } : {},
        timeout: this.config.timeout
      });

      await this.cache.set(cacheKey, response.data);
      return response.data;
    } catch (error) {
      console.error(\`Error fetching data for id \${id}:\`, error);
      // Implement retry logic based on this.config.retries
      throw error;
    }
  }

  public async postData(path: string, data: any): Promise<any> {
    this.callCount++;
    this.lastCallTimestamp = Date.now();
    console.log(\`Posting data to \${this.config.endpoint}/\${path}\`);
    // Dummy implementation of post
    await new Promise(resolve => setTimeout(resolve, 100));
    return { success: true, dataReceived: data };
  }

  // Many dummy methods to increase line count
${Array.from(
  { length: 50 },
  (_, j) => `
  /**
   * Dummy method ${j + 1} for MyComplexService.
   * This method performs a simulated complex operation.
   * @param input${j + 1} - Some input for the dummy method.
   * @returns A promise that resolves with a string.
   */
  public async dummyMethod${j + 1}(input${j + 1}: string): Promise<string> {
    console.log(\`Executing dummyMethod${j + 1} with input:\`, input${j + 1});
    // Simulate some async work
    await new Promise(resolve => setTimeout(resolve, Math.random() * 50 + 50));
    const result = \`Processed by dummyMethod${j + 1}: \${input${j + 1}.toUpperCase()}\`;
    this.logOperation('dummyMethod${j + 1}', { input: input${j + 1}, result });
    return result;
  }
`
).join('')}

  private logOperation(methodName: string, details: any): void {
    console.debug(\`Operation logged from \${methodName}:\`, details);
    // In a real scenario, this might write to a more persistent log.
  }

  public getStatus(): Record<string, any> {
    return {
      endpoint: this.config.endpoint,
      callsMade: this.callCount,
      lastCall: new Date(this.lastCallTimestamp).toISOString(),
      timeout: this.config.timeout,
      retries: this.config.retries
    };
  }
}

// End of MyComplexService
`;

const stringUtilsTsContent = `// String Utilities - Extended
export function capitalize(s: string): string {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

export function toKebabCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1-$2') // getV2
    .replace(/[\\s_]+/g, '-')
    .toLowerCase();
}

export function toSnakeCase(s: string): string {
  return s
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/[\\s-]+/g, '_')
    .toLowerCase();
}

export function toCamelCase(s: string): string {
  return s
    .replace(/[\\s_-]+(.)?/g, (_match: string, chr: string) => chr ? chr.toUpperCase() : '')
    .replace(/^(.)/, (match: string) => match.toLowerCase());
}

// Add more utility functions to increase length
${Array.from(
  { length: 30 },
  (_, k) => `
export function utilityFunction${k + 1}(paramA: number, paramB: string): string {
  // This is dummy utility function number ${k + 1}.
  // It performs some arbitrary string and number manipulation.
  const intermediate = paramA * ${k + 1} + paramB.length;
  return \`Utility${k + 1} result: \${intermediate} for input '\${paramB}'\`;
}
`
).join('')}
`;

const fileEditSampleContent = `Line 1: This is the first line of the file.
Line 2: Intended for various editing tests.
Line 3:
Line 4: === Section A: Basic Text ===
Line 5: This is a simple sentence.
Line 6: Another sentence follows this one.
Line 7: Target this line for replacement.
Line 8:
Line 9: === Section B: List Items ===
Line 10: - Item Alpha
Line 11: - Item Beta (target for deletion)
Line 12: - Item Gamma
Line 13: Insert new items around here.
Line 14:
Line 15: === Section C: Multi-line Block ===
Line 16: This is the start of a block
Line 17: that spans multiple lines.
Line 18: It can be targeted for
Line 19: a multi-line replacement or deletion.
Line 20: This is the end of the block.
Line 21:
Line 22: === Section D: Empty Lines Test ===
Line 23:
Line 24:
Line 25: Above lines are empty.
Line 26:
Line 27: === Section E: End of File ===
Line 28: Last editable line.
Line 29: Penultimate line.
Line 30: Final line for testing.`;

const workspaceStructure: DirItem = {
  type: 'dir',
  name: WORKSPACE_NAME, // Root name, path is WORKSPACE_ROOT_PATH
  items: [
    {
      type: 'dir',
      name: 'documents',
      items: [
        { type: 'file', name: 'report.txt', content: 'This is a test report.\nLine 2 of the report.\nEnd of report.' },
        {
          type: 'file',
          name: 'notes.md',
          content: '# Test Notes\n\n- Item 1\n- Item 2\n\nSome *markdown* content.'
        },
        {
          type: 'dir',
          name: 'archive',
          items: [{ type: 'file', name: 'old_data.dat', content: 'Binary-like data: \x00\x01\x02\x03\x04' }]
        }
      ]
    },
    {
      type: 'dir',
      name: 'images',
      items: [
        { type: 'file', name: 'logo.png', content: '' }, // Empty file
        { type: 'file', name: 'photo.jpg', content: '' } // Empty file
      ]
    },
    {
      type: 'dir',
      name: 'scripts',
      items: [
        {
          type: 'file',
          name: 'main.py',
          content: "def main():\n    print('Hello from main.py')\n\nif __name__ == '__main__':\n    main()"
        },
        { type: 'file', name: 'helper.js', content: 'function greet(name) {\n    return `Hello, ${name}!`;\n}' }
      ]
    },
    {
      type: 'dir',
      name: 'source',
      items: [
        {
          type: 'dir',
          name: 'app',
          items: [
            { type: 'file', name: 'component.ts', content: componentTsContent },
            { type: 'file', name: 'service.ts', content: serviceTsContent }
          ]
        },
        {
          type: 'dir',
          name: 'utils',
          items: [{ type: 'file', name: 'string-utils.ts', content: stringUtilsTsContent }]
        }
      ]
    },
    { type: 'file', name: '.hidden-file.txt', content: 'This is a hidden file.' },
    {
      type: 'file',
      name: 'config.json',
      content: JSON.stringify({ settingA: true, settingB: 'value', nested: { level: 2 } }, null, 2)
    },
    {
      type: 'file',
      name: 'README.md',
      content: '# Test Workspace\n\nThis workspace is for testing file system tools.'
    },
    { type: 'file', name: 'file_edit_sample.txt', content: fileEditSampleContent },
    {
      type: 'dir',
      name: 'empty_dir',
      items: []
    }
  ]
};

async function processItem(item: WorkspaceItem, currentPath: string): Promise<void> {
  const itemPath = path.join(currentPath, item.name);

  if (item.type === 'dir') {
    try {
      await fs.mkdir(itemPath, { recursive: true });
      logger.info(`Created directory: ${itemPath}`);
      for (const subItem of item.items) {
        await processItem(subItem, itemPath);
      }
    } catch (error) {
      logger.error({ error, path: itemPath }, `Failed to create directory ${itemPath}`);
      throw error; // Propagate error to stop execution
    }
  } else if (item.type === 'file') {
    try {
      await fs.writeFile(itemPath, item.content, 'utf8');
      logger.info(`Created file: ${itemPath} (Content length: ${item.content.length})`);
    } catch (error) {
      logger.error({ error, path: itemPath }, `Failed to create file ${itemPath}`);
      throw error; // Propagate error
    }
  }
}

async function createTestWorkspace(): Promise<void> {
  logger.info(`Attempting to create test workspace at: ${WORKSPACE_ROOT_PATH}`);

  try {
    // Check if workspace directory exists and remove it for a clean slate
    try {
      await fs.access(WORKSPACE_ROOT_PATH);
      logger.warn(`Existing test workspace found at ${WORKSPACE_ROOT_PATH}. Removing it...`);
      await fs.rm(WORKSPACE_ROOT_PATH, { recursive: true, force: true });
      logger.info(`Removed existing test workspace.`);
    } catch (error) {
      // If error is ENOENT, it means directory doesn't exist, which is fine.
      if ((error as NodeJS.ErrnoException).code !== 'ENOENT') {
        logger.error({ error }, `Error checking/removing existing workspace directory ${WORKSPACE_ROOT_PATH}`);
        throw error; // Propagate if it's not a "not found" error
      }
    }

    // Create the root workspace directory
    await fs.mkdir(WORKSPACE_ROOT_PATH, { recursive: true });
    logger.info(`Successfully created root test workspace directory: ${WORKSPACE_ROOT_PATH}`);

    // Process all items defined in the structure, starting from the WORKSPACE_ROOT_PATH
    for (const item of workspaceStructure.items) {
      await processItem(item, WORKSPACE_ROOT_PATH);
    }

    logger.info(`🎉 Test workspace successfully created at: ${WORKSPACE_ROOT_PATH}`);
    logger.info('Key files created:');
    logger.info(`  - ${WORKSPACE_NAME}/source/app/component.ts (length: ${componentTsContent.length})`);
    logger.info(`  - ${WORKSPACE_NAME}/source/app/service.ts (length: ${serviceTsContent.length})`);
    logger.info(`  - ${WORKSPACE_NAME}/file_edit_sample.txt (length: ${fileEditSampleContent.length})`);
    logger.info(`  - ... and other files/directories as defined.`);
  } catch (error) {
    logger.error({ error, rootPath: WORKSPACE_ROOT_PATH }, 'Failed to create the test workspace.');
    process.exitCode = 1; // Indicate failure
  }
}

// Check if the script is being run directly
if (import.meta.url.startsWith('file:') && process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  createTestWorkspace();
}

export { WORKSPACE_ROOT_PATH as testWorkspacePath, workspaceStructure };
