/** @type { import('@jest/types').Config.InitialOptions } */

module.exports = {
  preset: '../../jest-preset.js',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { isolatedModules: true, tsconfig: '../../tsconfig.base.json' }],
  },
};
