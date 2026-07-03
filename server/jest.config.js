module.exports = {
  transform: {
    '^.+\\.(ts|tsx)$': ['ts-jest', { tsconfig: 'test/tsconfig.json' }]
  },
  moduleFileExtensions: ['ts', 'js'],
  coverageDirectory: 'coverage',
  collectCoverageFrom: ['src/**/*.ts', '!src/index.ts', '!src/**/*.d.ts'],
  testMatch: ['**/*.spec.(ts)'],
  testEnvironment: 'node',
  forceExit: true,
  detectOpenHandles: true,
  testTimeout: 60000
}
