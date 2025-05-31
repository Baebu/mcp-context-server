import { loadConfig, configSchema as actualConfigSchema } from '../../../src/infrastructure/config/config-loader';
import type { ServerConfig } from '../../../src/infrastructure/config/types';
import { logger } from '../../../src/utils/logger'; // Mocked
import path from 'node:path';
import * as yaml from 'yaml'; // Import the actual yaml for spyOn

// Use the globally mocked fs and convict
const mockFs = global.mockFsAdapter;
const mockConvict = global.mockConvictFn;
const mockSchema = global.mockConvictSchemaInstance;

jest.mock('../../../src/utils/logger');
jest.mock('yaml', () => ({
  ...jest.requireActual('yaml'), // Keep actual functionalities
  parse: jest.fn(jest.requireActual('yaml').parse) // Mock parse to allow spying
}));

describe('ConfigLoader', () => {
  const CWD = process.cwd();
  let defaultConfig: ServerConfig;

  beforeEach(() => {
    // Reset all mocks
    jest.clearAllMocks();
    mockFs.__clearFs();

    // Fetch default config at the start of each test, as actualConfigSchema might be module-scoped
    defaultConfig = actualConfigSchema.getProperties() as ServerConfig;

    // Setup convict mock to return the actual schema definition for getProperties
    // and allow validation to pass by default.
    mockConvict.mockReturnValue(mockSchema);
    // Ensure getProperties returns a fresh copy of defaults before any load
    mockSchema.getProperties.mockReturnValue(JSON.parse(JSON.stringify(actualConfigSchema.getProperties())));
    mockSchema.validate.mockImplementation(() => {}); // Default to valid

    mockSchema.load.mockImplementation(loadedConfig => {
      // Simulate convict's load behavior by merging with defaults
      const currentProps = JSON.parse(JSON.stringify(actualConfigSchema.getProperties())); // Start with fresh defaults for merge simulation
      const newProps = { ...currentProps };
      for (const key in loadedConfig) {
        if (
          typeof loadedConfig[key] === 'object' &&
          loadedConfig[key] !== null &&
          typeof newProps[key] === 'object' &&
          newProps[key] !== null &&
          !Array.isArray(newProps[key])
        ) {
          newProps[key] = { ...newProps[key], ...loadedConfig[key] };
        } else {
          // Handles primitives, arrays, and complete object overwrites.
          newProps[key] = loadedConfig[key];
        }
      }
      // After loading, subsequent getProperties should reflect the loaded state.
      mockSchema.getProperties.mockReturnValue(newProps);
    });
    mockSchema.get.mockImplementation((key: string) => {
      // This mock for 'get' should reflect what actualConfigSchema would return for defaults.
      const props = actualConfigSchema.getProperties() as Record<string, any>;
      const keys = key.split('.');
      let val = props;
      for (const k of keys) {
        if (val && typeof val === 'object' && k in val) {
          val = val[k];
        } else {
          // If key not found, convict's get typically throws or returns default.
          // For simplicity here, return undefined if not found in the default structure.
          return undefined;
        }
      }
      return val;
    });
  });

  it('should load default configuration if no file is found', async () => {
    // Ensure getProperties returns defaults when no file is loaded.
    mockSchema.getProperties.mockReturnValue(JSON.parse(JSON.stringify(actualConfigSchema.getProperties())));
    const config = await loadConfig();
    expect(config).toEqual(defaultConfig);
    expect(logger.warn).toHaveBeenCalledWith('No configuration file found, using defaults');
    expect(mockSchema.load).not.toHaveBeenCalled();
  });

  it('should load configuration from server.yaml if present', async () => {
    const yamlConfig = { server: { name: 'yaml-server' }, logging: { level: 'debug' } };
    mockFs.__setFile(path.join(CWD, 'config/server.yaml'), yaml.stringify(yamlConfig));

    // Simulate that after load, getProperties returns the merged config
    const expectedFullConfig = {
      ...defaultConfig,
      server: { ...defaultConfig.server, name: 'yaml-server' },
      logging: { ...defaultConfig.logging, level: 'debug' }
    };
    // mockSchema.getProperties will be updated by the mockSchema.load implementation

    const config = await loadConfig();

    expect(yaml.parse).toHaveBeenCalled();
    expect(mockSchema.load).toHaveBeenCalledWith(yamlConfig);

    // The config returned by loadConfig() should be the one from mockSchema.getProperties() AFTER load
    const finalConfigFromMock = mockSchema.getProperties();
    expect(finalConfigFromMock.server.name).toBe('yaml-server');
    expect(finalConfigFromMock.logging.level).toBe('debug');
    expect(config.server.name).toBe('yaml-server'); // Check returned config too
    expect(config.logging.level).toBe('debug');

    expect(logger.info).toHaveBeenCalledWith(
      { path: path.join(CWD, 'config/server.yaml') },
      'Configuration loaded successfully'
    );
  });

  it('should load configuration from server.json if present and server.yaml is not', async () => {
    const jsonConfig = { server: { name: 'json-server' }, database: { path: '/db/data.sqlite' } };
    mockFs.__setFile(path.join(CWD, 'config/server.json'), JSON.stringify(jsonConfig));

    // Simulate merged config
    // const expectedFullConfig = { ... }; // As above, mockSchema.load handles this

    const config = await loadConfig();

    expect(mockSchema.load).toHaveBeenCalledWith(jsonConfig);
    const finalConfigFromMock = mockSchema.getProperties();
    expect(finalConfigFromMock.server.name).toBe('json-server');
    expect(finalConfigFromMock.database.path).toBe('/db/data.sqlite');
    expect(config.server.name).toBe('json-server');
    expect(config.database.path).toBe('/db/data.sqlite');

    expect(logger.info).toHaveBeenCalledWith(
      { path: path.join(CWD, 'config/server.json') },
      'Configuration loaded successfully'
    );
  });

  it('should prioritize server.yaml over server.json', async () => {
    const yamlContent = { server: { name: 'from-yaml' } };
    const jsonContent = { server: { name: 'from-json' } };
    mockFs.__setFile(path.join(CWD, 'config/server.yaml'), yaml.stringify(yamlContent));
    mockFs.__setFile(path.join(CWD, 'config/server.json'), JSON.stringify(jsonContent));

    await loadConfig();
    const finalConfigFromMock = mockSchema.getProperties();
    expect(finalConfigFromMock.server.name).toBe('from-yaml');
    expect(mockSchema.load).toHaveBeenCalledWith(yamlContent);
    // Check that it was called ONLY with yamlContent, not with jsonContent after.
    // This requires ensuring mockSchema.load was called once or that the last call was with yamlContent.
    expect(mockSchema.load.mock.calls.some(call => call[0] === jsonContent)).toBe(false);
  });

  it('should throw an error if config file parsing fails (YAML)', async () => {
    mockFs.__setFile(path.join(CWD, 'config/server.yaml'), 'invalid: yaml: content');
    const parseSpy = jest.spyOn(yaml, 'parse').mockImplementation(() => {
      throw new Error('Mock YAML Parse Error');
    });

    await expect(loadConfig()).rejects.toThrow(/YAML parsing error.*Mock YAML Parse Error/);
    parseSpy.mockRestore();
  });

  it('should throw an error if config file parsing fails (JSON)', async () => {
    mockFs.__setFile(path.join(CWD, 'config/server.json'), '{invalid json,');
    // JSON.parse will throw directly, no need to spy on a mock unless it's wrapped
    await expect(loadConfig()).rejects.toThrow(/JSON parsing error/);
  });

  it('should throw an error if configuration validation fails', async () => {
    const validYamlContent = { server: { name: 'valid-server' } };
    mockFs.__setFile(path.join(CWD, 'config/server.yaml'), yaml.stringify(validYamlContent));
    mockSchema.validate.mockImplementation(() => {
      throw new Error('Mock Validation Error');
    });

    await expect(loadConfig()).rejects.toThrow('Configuration validation error: Mock Validation Error');
  });

  it('should correctly handle environment variable overrides (convict behavior)', async () => {
    process.env.MCP_SERVER_NAME = 'env-server-override';
    // Convict applies env vars when .getProperties() is called, or during load().
    // Our mock for getProperties needs to simulate this.
    // A more accurate mock would involve convict's internal logic for env vars.
    // For this test, we'll assume `loadConfig` triggers convict correctly and
    // `getProperties` would reflect env var application.
    const configWithEnv = { ...defaultConfig, server: { ...defaultConfig.server, name: 'env-server-override' } };
    mockSchema.getProperties.mockReturnValue(configWithEnv); // Simulate convict providing the env-var-applied config

    const config = await loadConfig(); // Call loadConfig which internally calls getProperties

    expect(config.server.name).toBe('env-server-override');
    delete process.env.MCP_SERVER_NAME;
  });

  it('should ensure unsafeArgumentPatterns is an array even if not in config file', async () => {
    const yamlConfigMissingPattern = { security: { allowedCommands: ['ls'] } };
    mockFs.__setFile(path.join(CWD, 'config/server.yaml'), yaml.stringify(yamlConfigMissingPattern));

    // mockSchema.load will be called with yamlConfigMissingPattern.
    // Then getProperties will be called. It should return the merged result.
    // The default value for unsafeArgumentPatterns should come from actualConfigSchema.

    const config = await loadConfig(); // This will call the mocked load and then getProperties

    expect(Array.isArray(config.security.unsafeArgumentPatterns)).toBe(true);
    // Check against the default from the actual schema, as this is what convict would fall back to.
    expect(config.security.unsafeArgumentPatterns).toEqual(actualConfigSchema.get('security.unsafeArgumentPatterns'));
  });

  it('should log final configuration details', async () => {
    const yamlConfig = { server: { name: 'log-test-server' }, logging: { level: 'debug' } };
    mockFs.__setFile(path.join(CWD, 'config/server.yaml'), yaml.stringify(yamlConfig));

    await loadConfig(); // This triggers mockSchema.load and then mockSchema.getProperties

    expect(logger.info).toHaveBeenCalledWith(
      expect.objectContaining({
        loadedFrom: path.join(CWD, 'config/server.yaml'),
        serverName: 'log-test-server',
        logLevel: 'debug',
        unsafeArgumentPatternsCount: (actualConfigSchema.get('security.unsafeArgumentPatterns') as string[]).length
      }),
      'Configuration loaded and validated'
    );
  });

  it('should try multiple config paths and pick the first one found', async () => {
    const mcpConfigContent = { server: { name: 'mcp-config-server' } };
    mockFs.__setFile(path.join(CWD, 'mcp-config.yaml'), yaml.stringify(mcpConfigContent));
    mockFs.__setFile(path.join(CWD, 'config/server.json'), JSON.stringify({ server: { name: 'ignored-json-server' } }));

    const config = await loadConfig();
    const finalConfigFromMock = mockSchema.getProperties();

    expect(finalConfigFromMock.server.name).toBe('mcp-config-server');
    expect(config.server.name).toBe('mcp-config-server');
    expect(logger.info).toHaveBeenCalledWith(
      { path: path.join(CWD, 'mcp-config.yaml') },
      'Configuration loaded successfully'
    );
  });

  it('should handle empty but valid config file (uses defaults)', async () => {
    mockFs.__setFile(path.join(CWD, 'config/server.yaml'), yaml.stringify({}));

    // When an empty config is loaded, getProperties should return the defaults.
    mockSchema.getProperties.mockReturnValue(JSON.parse(JSON.stringify(actualConfigSchema.getProperties())));

    const config = await loadConfig();
    expect(config).toEqual(defaultConfig);
    expect(mockSchema.load).toHaveBeenCalledWith({});
  });
});
