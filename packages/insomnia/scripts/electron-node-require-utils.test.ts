/**
 * @jest-environment node
 */
import { describe, expect, it, jest } from '@jest/globals';

import { buildRequireModuleSource, resolveModuleExports } from './electron-node-require-utils';

describe('resolveModuleExports', () => {
  it('uses configured exports without loading the module', () => {
    const nodeRequire = jest.fn<NodeJS.Require>().mockImplementation(() => {
      throw new Error('Should not require native modules when static exports are configured');
    });

    expect(resolveModuleExports('@getinsomnia/node-libcurl', {
      nodeRequire,
      staticExports: {
        '@getinsomnia/node-libcurl': ['Curl', 'CurlAuth', 'default', 'invalid-export-name'],
      },
    })).toEqual({
      exportNames: ['Curl', 'CurlAuth'],
      hasDefaultExport: true,
    });
    expect(nodeRequire).not.toHaveBeenCalled();
  });
});

describe('buildRequireModuleSource', () => {
  it('emits named exports and falls back to the module object as the default export', () => {
    const source = buildRequireModuleSource('@getinsomnia/node-libcurl', ['Curl', 'CurlAuth'], false);

    expect(source).toContain("const requiredModule = globalThis.require('@getinsomnia/node-libcurl');");
    expect(source).toContain('export const Curl = requiredModule.Curl;');
    expect(source).toContain('export const CurlAuth = requiredModule.CurlAuth;');
    expect(source).toContain('export default requiredModule');
  });
});
