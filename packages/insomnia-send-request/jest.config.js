/** @type { import('@jest/types').Config.InitialOptions } */

module.exports = {
  preset: '../../jest-preset.js',
  transform: {
    '^.+\\.tsx?$': ['ts-jest', { tsconfig: './tsconfig.json' }],
  },
};
