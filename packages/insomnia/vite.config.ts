import babel from '@rolldown/plugin-babel';
import react from '@vitejs/plugin-react';
import { builtinModules } from 'module';
import path from 'path';
import { defineConfig } from 'vite';

import pkg from './package.json';
import { electronNodeRequire } from './vite-plugin-electron-node-require';

export default defineConfig(({ mode }) => {
  const __DEV__ = mode !== 'production';
  const nodeRequiredModules = Object.entries(pkg.dependencies)
    .filter(([, version]) => !version.startsWith('file:') && !version.startsWith('workspace:'))
    .map(([name]) => name);

  return {
    mode,
    root: path.join(__dirname, 'src'),
    base: __DEV__ ? '/' : './',
    define: {
      __DEV__: JSON.stringify(__DEV__),
      'process.type': JSON.stringify('renderer'),
      'process.env.NODE_ENV': JSON.stringify(mode),
      'process.env.INSOMNIA_ENV': JSON.stringify(mode),
    },
    server: {
      port: pkg.dev['dev-server-port'],
      fs: {
        strict: true,
      },
    },
    build: {
      sourcemap: true,
      outDir: path.join(__dirname, 'build'),
      assetsDir: './',
      brotliSize: false,
      chunkSizeWarningLimit: 2048,
      emptyOutDir: false,
      rolldownOptions: {
        checks: {
          pluginTimings: false,
        },
      },
      rollupOptions: {
        external: ['@getinsomnia/node-libcurl'],
      },
    },
    optimizeDeps: {
      exclude: ['@getinsomnia/node-libcurl'],
    },
    plugins: [
      // Allows us to import modules that will be resolved by Node's require() function.
      // e.g. import fs from 'fs'; will get transformed to const fs = require('fs'); so that it works in the renderer process.
      // This is necessary because we use nodeIntegration: true in the renderer process and allow importing modules from node.
      electronNodeRequire({
        modules: [
          'electron',
          ...nodeRequiredModules,
          ...builtinModules.filter(m => m !== 'buffer'),
          ...builtinModules.map(m => `node:${m}`),
        ],
      }),
      babel({
        include: /[\\/]src[\\/].*\.[jt]sx?$/,
        plugins: [
          ['@babel/plugin-proposal-class-properties', { loose: true }],
        ],
      }),
      react({
        jsxRuntime: 'automatic',
      }),
    ],
  };
});
