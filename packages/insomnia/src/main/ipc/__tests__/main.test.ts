import { describe, expect, it, jest } from '@jest/globals';
import type { RulesetDefinition } from '@stoplight/spectral-core';

jest.mock('@stoplight/spectral-ruleset-bundler/with-loader', () => ({
  bundleAndLoadRuleset: jest.fn(),
}));
jest.mock('electron', () => ({
  app: {
    exit: jest.fn(),
    relaunch: jest.fn(),
  },
  BrowserWindow: {
    getAllWindows: jest.fn(() => []),
  },
  ipcMain: {
    handle: jest.fn(),
    on: jest.fn(),
  },
  shell: {
    openExternal: jest.fn(),
  },
}));
jest.mock('../../authorizeUserInWindow', () => ({
  authorizeUserInWindow: jest.fn(),
}));
jest.mock('../../backup', () => ({
  backup: jest.fn(),
  restoreBackup: jest.fn(),
}));
jest.mock('../../insomniaFetch', () => ({
  insomniaFetch: jest.fn(),
}));
jest.mock('../../install-plugin', () => ({
  __esModule: true,
  default: jest.fn(),
}));
jest.mock('../../network/axios-request', () => ({
  axiosRequest: jest.fn(),
}));
jest.mock('../../network/curl', () => ({}));
jest.mock('../../network/libcurl-promise', () => ({
  cancelCurlRequest: jest.fn(),
  curlRequest: jest.fn(),
}));
jest.mock('../../network/websocket', () => ({}));
jest.mock('../grpc', () => ({}));

import { runSpectral } from '../main';

describe('runSpectral', () => {
  it('uses the fallback ruleset when no custom ruleset path is provided', async () => {
    const diagnostics = [{ code: 'oas3-schema' }];
    const setRuleset = jest.fn();
    const run = jest.fn().mockResolvedValue(diagnostics);
    const fallbackRuleset = { rules: {} } as RulesetDefinition;

    const result = await runSpectral(
      { contents: 'openapi: 3.0.0' },
      {
        createSpectral: () => ({ run, setRuleset }),
        fallbackRuleset,
      },
    );

    expect(setRuleset).toHaveBeenCalledWith(fallbackRuleset);
    expect(run).toHaveBeenCalledWith('openapi: 3.0.0');
    expect(result).toEqual(diagnostics);
  });

  it('loads custom rulesets with the provided fetch implementation', async () => {
    const setRuleset = jest.fn();
    const run = jest.fn().mockResolvedValue([]);
    const fetchUrl = jest.fn().mockResolvedValue({ data: 'ruleset' });
    const customRuleset = { rules: { custom: {} } } as RulesetDefinition;
    const bundleRuleset = jest.fn(async (_rulesetPath, loaderOptions) => {
      await loaderOptions.fetch('https://example.com/ruleset.yaml');
      return customRuleset;
    });

    await runSpectral(
      { contents: 'openapi: 3.0.0', rulesetPath: 'ruleset.yaml' },
      {
        bundleRuleset,
        createSpectral: () => ({ run, setRuleset }),
        fetchUrl,
      },
    );

    expect(bundleRuleset).toHaveBeenCalledWith('ruleset.yaml', expect.objectContaining({
      fetch: expect.any(Function),
    }));
    expect(fetchUrl).toHaveBeenCalledWith('https://example.com/ruleset.yaml');
    expect(setRuleset).toHaveBeenCalledWith(customRuleset);
  });

  it('falls back to the default ruleset when custom ruleset loading fails', async () => {
    const setRuleset = jest.fn();
    const run = jest.fn().mockResolvedValue([]);
    const fallbackRuleset = { rules: { default: {} } } as RulesetDefinition;
    const logError = jest.fn();

    await runSpectral(
      { contents: 'openapi: 3.0.0', rulesetPath: 'ruleset.yaml' },
      {
        bundleRuleset: jest.fn().mockRejectedValue(new Error('broken ruleset')),
        createSpectral: () => ({ run, setRuleset }),
        fallbackRuleset,
        logError,
      },
    );

    expect(logError).toHaveBeenCalledWith('Error while parsing ruleset:', expect.any(Error));
    expect(setRuleset).toHaveBeenCalledWith(fallbackRuleset);
  });
});
