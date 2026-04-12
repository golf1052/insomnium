import { createRequire } from 'node:module';

import type { Plugin } from 'vite';

import { buildRequireModuleSource, resolveModuleExports } from './scripts/electron-node-require-utils';

export interface Options {
  modules: string[];
  staticExports?: Record<string, string[]>;
}

const VIRTUAL_EXTERNAL_PREFIX = 'virtual:external:';
const RESOLVED_VIRTUAL_EXTERNAL_PREFIX = `\0${VIRTUAL_EXTERNAL_PREFIX}`;

const getExternalId = (id: string) => {
  if (id.startsWith(RESOLVED_VIRTUAL_EXTERNAL_PREFIX)) {
    return id.slice(RESOLVED_VIRTUAL_EXTERNAL_PREFIX.length);
  }

  if (id.startsWith(VIRTUAL_EXTERNAL_PREFIX)) {
    return id.slice(VIRTUAL_EXTERNAL_PREFIX.length);
  }

  return null;
};

/**
 * Allows Vite to import modules that will be resolved by Node's require() function.
 */
export function electronNodeRequire(options: Options): Plugin {
  const {
    modules = [],
    staticExports = {},
  } = options;
  const moduleSet = new Set(modules);
  const nodeRequire = createRequire(import.meta.url);

  return {
    name: 'vite-plugin-electron-node-require',
    enforce: 'pre',
    config(conf) {
      // Exclude the modules from Vite's dependency optimization (pre-bundling)
      conf.optimizeDeps = {
        ...conf.optimizeDeps,
        exclude: [
          ...conf.optimizeDeps?.exclude ? conf.optimizeDeps.exclude : [],
          ...modules,
        ],
      };

      // Ignore the modules from Rollup's commonjs plugin so that we can resolve them with this plugin
      conf.build ??= {};
      conf.build.commonjsOptions ??= {};
      conf.build.commonjsOptions?.ignore ?? [];
      conf.build.commonjsOptions.ignore = [
        ...modules,
      ];

      return conf;
    },
    resolveId(id) {
      const externalId = getExternalId(id) ?? id;
      if (moduleSet.has(externalId)) {
        // The \0 prefix marks the module as virtual so other plugins skip normal resolution.
        return `${RESOLVED_VIRTUAL_EXTERNAL_PREFIX}${externalId}`;
      }

      // Return null to indicate that this plugin should not resolve the module
      return null;
    },
    load(id) {
      const externalId = getExternalId(id);
      if (externalId && moduleSet.has(externalId)) {

        // We need to handle electron because it's different when required in the renderer process
        if (externalId === 'electron') {
          return `
            const electron = globalThis.require('electron');
            export { electron as default };
            export const clipboard = electron.clipboard;
            export const contextBridge = electron.contextBridge;
            export const crashReporter = electron.crashReporter;
            export const ipcRenderer = electron.ipcRenderer;
            export const nativeImage = electron.nativeImage;
            export const shell = electron.shell;
            export const webFrame = electron.webFrame;
            export const deprecate = electron.deprecate;
          `;
        }

        const { exportNames, hasDefaultExport } = resolveModuleExports(externalId, {
          nodeRequire,
          staticExports,
        });

        return buildRequireModuleSource(externalId, exportNames, hasDefaultExport);
      }

      // Return null to indicate that this plugin should not resolve the module
      return null;
    },
  };
}
