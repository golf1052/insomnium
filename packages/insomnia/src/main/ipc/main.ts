import type { ISpectralDiagnostic } from '@stoplight/spectral-core';
import type { RulesetDefinition } from '@stoplight/spectral-core';
import { Spectral } from '@stoplight/spectral-core';
// @ts-expect-error - This is a bundled file not sure why it's not found
import { bundleAndLoadRuleset } from '@stoplight/spectral-ruleset-bundler/with-loader';
import { oas } from '@stoplight/spectral-rulesets';
import { app, BrowserWindow, ipcMain, IpcRendererEvent, shell } from 'electron';
import fs from 'fs';

import { authorizeUserInWindow } from '../authorizeUserInWindow';
import { backup, restoreBackup } from '../backup';
import { insomniaFetch } from '../insomniaFetch';
import installPlugin from '../install-plugin';
import { axiosRequest } from '../network/axios-request';
import { CurlBridgeAPI } from '../network/curl';
import { cancelCurlRequest, curlRequest } from '../network/libcurl-promise';
import { WebSocketBridgeAPI } from '../network/websocket';
import { gRPCBridgeAPI } from './grpc';

export interface MainBridgeAPI {
  loginStateChange: () => void;
  openInBrowser: (url: string) => void;
  restart: () => void;
  halfSecondAfterAppStart: () => void;
  manualUpdateCheck: () => void;
  backup: () => Promise<void>;
  restoreBackup: (version: string) => Promise<void>;
  spectralRun: (options: { contents: string; rulesetPath: string }) => Promise<ISpectralDiagnostic[]>;
  authorizeUserInWindow: typeof authorizeUserInWindow;
  setMenuBarVisibility: (visible: boolean) => void;
  installPlugin: typeof installPlugin;
  writeFile: (options: { path: string; content: string }) => Promise<string>;
  cancelCurlRequest: typeof cancelCurlRequest;
  curlRequest: typeof curlRequest;
  on: (channel: string, listener: (event: IpcRendererEvent, ...args: any[]) => void) => () => void;
  webSocket: WebSocketBridgeAPI;
  grpc: gRPCBridgeAPI;
  curl: CurlBridgeAPI;
  trackSegmentEvent: (options: { event: string; properties?: Record<string, unknown> }) => void;
  trackPageView: (options: { name: string }) => void;
  axiosRequest: typeof axiosRequest;
  insomniaFetch: typeof insomniaFetch;
  showContextMenu: (options: { key: string }) => void;
}

interface SpectralRunner {
  run: Spectral['run'];
  setRuleset: Spectral['setRuleset'];
}

interface RunSpectralDependencies {
  bundleRuleset?: typeof bundleAndLoadRuleset;
  createSpectral?: () => SpectralRunner;
  fallbackRuleset?: RulesetDefinition;
  fetchUrl?: (url: string) => ReturnType<typeof axiosRequest>;
  logError?: (message: string, error: unknown) => void;
  rulesetFs?: typeof fs;
}

export async function runSpectral(
  { contents, rulesetPath }: { contents: string; rulesetPath?: string },
  deps: RunSpectralDependencies = {},
) {
  const spectral = (deps.createSpectral || (() => new Spectral()))();
  const fallbackRuleset = deps.fallbackRuleset || oas as RulesetDefinition;
  const fetchUrl = deps.fetchUrl || ((url: string) => axiosRequest({ url, method: 'GET' }));

  if (rulesetPath) {
    try {
      const ruleset = await (deps.bundleRuleset || bundleAndLoadRuleset)(rulesetPath, {
        fs: deps.rulesetFs || fs,
        fetch: fetchUrl,
      });

      spectral.setRuleset(ruleset);
    } catch (err) {
      (deps.logError || ((message, error) => console.log(message, error)))('Error while parsing ruleset:', err);
      spectral.setRuleset(fallbackRuleset);
    }
  } else {
    spectral.setRuleset(fallbackRuleset);
  }

  return spectral.run(contents);
}

export function registerMainHandlers() {
  ipcMain.handle('insomniaFetch', async (_, options: Parameters<typeof insomniaFetch>[0]) => {
    return insomniaFetch(options);
  });
  ipcMain.handle('axiosRequest', async (_, options: Parameters<typeof axiosRequest>[0]) => {
    return axiosRequest(options);
  });
  ipcMain.on('loginStateChange', async () => {
    BrowserWindow.getAllWindows().forEach(w => {
      w.webContents.send('loggedIn');
    });
  });
  ipcMain.handle('backup', async () => {
    return backup();
  });
  ipcMain.handle('restoreBackup', async (_, options: string) => {
    return restoreBackup(options);
  });
  ipcMain.handle('authorizeUserInWindow', (_, options: Parameters<typeof authorizeUserInWindow>[0]) => {
    const { url, urlSuccessRegex, urlFailureRegex, sessionId } = options;
    return authorizeUserInWindow({ url, urlSuccessRegex, urlFailureRegex, sessionId });
  });

  ipcMain.handle('writeFile', async (_, options: { path: string; content: string }) => {
    try {
      await fs.promises.writeFile(options.path, options.content);
      return options.path;
    } catch (err) {
      throw new Error(err);
    }
  });

  ipcMain.handle('curlRequest', (_, options: Parameters<typeof curlRequest>[0]) => {
    return curlRequest(options);
  });

  ipcMain.on('cancelCurlRequest', (_, requestId: string): void => {
    cancelCurlRequest(requestId);
  });

  ipcMain.on('trackSegmentEvent', (_, options: {}): void => {
  //  removed tracking from insomnia
  });
  ipcMain.on('trackPageView', (_, options: { name: string }): void => {
    // removed tracking from insomnia
  });

  ipcMain.handle('installPlugin', (_, lookupName: string) => {
    return installPlugin(lookupName);
  });

  ipcMain.on('restart', () => {
    app.relaunch();
    app.exit();
  });

  ipcMain.on('openInBrowser', (_, href: string) => {
    const { protocol } = new URL(href);
    if (protocol === 'http:' || protocol === 'https:') {
      // eslint-disable-next-line no-restricted-properties
      shell.openExternal(href);
    }
  });

  ipcMain.handle('spectralRun', async (_, { contents, rulesetPath }: {
    contents: string;
    rulesetPath?: string;
  }) => {
    return runSpectral({ contents, rulesetPath });
  });
}
