/** @type {import('jest').Config} */
export default {
  preset: 'ts-jest/presets/default-esm',
  extensionsToTreatAsEsm: ['.ts'],

  // Fixed: was "moduleNameMapping" (incorrect)
  moduleNameMapper: {
    '^@core/(.*)$': '<rootDir>/src/core/$1',
    '^@application/(.*)$': '<rootDir>/src/application/$1',
    '^@infrastructure/(.*)$': '<rootDir>/src/infrastructure/$1',
    '^@presentation/(.*)$': '<rootDir>/src/presentation/$1',
    '^@utils/(.*)$': '<rootDir>/src/utils/$1',
    '^(\\.{1,2}/.*)\\.js$': '$1'
  },

  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/tests'],
  testMatch: ['**/__tests__/**/*.ts', '**/?(*.)+(spec|test).ts'],

  transform: {
    '^.+\\.ts$': [
      'ts-jest',
      {
        useESM: true,
        tsconfig: {
          module: 'ES2022',
          target: 'ES2022',
          moduleResolution: 'NodeNext'
        }
      }
    ]
  },

  transformIgnorePatterns: [
    'node_modules/(?!(@modelcontextprotocol)/)'
  ],

  coverageDirectory: 'coverage',
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.d.ts',
    '!src/index.ts',
    '!src/**/*.test.ts',
    '!src/**/*.spec.ts'
  ],
  coverageReporters: ['text', 'lcov', 'html'],

  coverageThreshold: {
    global: {
      branches: 50,
      functions: 50,
      lines: 50,
      statements: 50
    }
  },

  setupFilesAfterEnv: ['<rootDir>/tests/setup.ts'],
  testTimeout: 15000,
  verbose: true,
  detectOpenHandles: true,
  forceExit: true,
  maxWorkers: '50%',

  globals: {
    'ts-jest': {
      useESM: true
    }
  }
};