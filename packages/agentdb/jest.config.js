/** @type { import('@jest/types').Config.InitialOptions } */
module.exports = {
  preset: '../../jest-preset.js',
  collectCoverage: !!process.env.CI,
  coverageThreshold: {
    global: {
      branches: 47,
      functions: 78,
      lines: 62,
      statements: 62,
    },
  },
};
