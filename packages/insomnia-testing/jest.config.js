/** @type { import('@jest/types').Config.InitialOptions } */

module.exports = {
  preset: '../../jest-preset.js',
  collectCoverage: !!process.env.CI,
  coverageThreshold: {
    global: {
      branches: 65,
      functions: 80,
      lines: 89,
      statements: 90,
    },
  },
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true, tsconfig: '../../tsconfig.base.json' }],
  },
};
