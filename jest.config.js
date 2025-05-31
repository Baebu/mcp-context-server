/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm', // Handles TypeScript and ESM
  extensionsToTreatAsEsm: ['.ts'], // Treat .ts files as ESM modules

  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@application/(.*)$': '<rootDir>/src/application/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@presentation/(.*)$': '<rootDir>/src/presentation/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    // This helps Jest resolve .js extensions in imports if your compiled output uses them
    // (which is common for ESM modules from TypeScript)
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },

  testEnvironment: 'node',
  roots: ['<rootDir>/tests'], // Look for tests in the tests directory
  testMatch: ['**/__tests__/**/*.+(ts|tsx|js)', '**/?(*.)+(spec|test).+(ts|tsx|js)'],

  transform: {
    // Use ts-jest for .ts and .tsx files
    '^.+\\.tsx?$': [
      'ts-jest',
      {
        useESM: true, // Important for ESM support
        tsconfig: 'tsconfig.json' // Or point to a specific tsconfig.test.json if you have one
        // isolatedModules: true, // Can sometimes speed up, but ensure it doesn't break type-related transforms
      }
    ]
  },

  // If you have dependencies that are ESM and Jest struggles with them:
  transformIgnorePatterns: [
    // Example: 'node_modules/(?!(@modelcontextprotocol)/)', // Adjust as needed
    'node_modules/(?!(@modelcontextprotocol|p-queue|other-esm-module)/)' // Allow transforming specific ESM modules
  ],

  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts', // Usually, the main entry point is hard to unit test directly
    '!src/**/types.ts', // Often just interfaces
    '!src/**/interfaces/*', // Interface files
    '!src/utils/logger.ts', // Logger can be tricky to cover fully if complex
    '!src/infrastructure/di/*', // DI setup might be integration-tested
    // Exclude test setup files if they are in src for some reason
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  coverageReporters: ['text', 'lcov', 'html'],

  coverageThreshold: {
    global: {
      // Adjust these as your coverage improves
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },

  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'], // Global setup after environment
  testTimeout: 15000, // Increased timeout for potentially longer tests
  verbose: true
  // detectOpenHandles: true, // Useful for finding leaks, but can slow down tests
  // forceExit: true, // Avoid using this unless absolutely necessary for hanging tests

  // globals: { // Not needed if using useESM: true in ts-jest options directly
  //   'ts-jest': {
  //     useESM: true,
  //   }
  // }
};
