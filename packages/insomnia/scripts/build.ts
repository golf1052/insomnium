import childProcess from 'child_process';
import { readFileSync, writeFileSync } from 'fs';
import fs from 'fs';
import { rm } from 'fs/promises';
import licenseChecker from 'license-checker';
import { ncp } from 'ncp';
import path from 'path';
import * as vite from 'vite';

import buildMainAndPreload from '../esbuild.main';

const minimumBuildNodeVersion = {
  major: 18,
  minor: 18,
  patch: 2,
};

const isSupportedBuildNodeVersion = (version: string) => {
  const [major = 0, minor = 0, patch = 0] = version
    .replace(/^v/, '')
    .split('.')
    .map(part => parseInt(part, 10));

  if (major !== minimumBuildNodeVersion.major) {
    return major > minimumBuildNodeVersion.major;
  }

  if (minor !== minimumBuildNodeVersion.minor) {
    return minor > minimumBuildNodeVersion.minor;
  }

  return patch >= minimumBuildNodeVersion.patch;
};

const readCommandVersion = (command: string, args: string[]) => {
  const stdout = childProcess.spawnSync(command, args, { encoding: 'utf8' }).stdout;
  return typeof stdout === 'string' ? stdout.trim() : 'unknown';
};

// Start build if ran from CLI
if (require.main === module) {
  process.nextTick(async () => {
    try {
      await module.exports.start();
    } catch (err) {
      console.log('[build] ERROR:', err);
      process.exit(1);
    }
  });
}

const copyFiles = (relSource: string, relDest: string) =>
  new Promise<void>((resolve, reject) => {
    const source = path.resolve(__dirname, relSource);
    const dest = path.resolve(__dirname, relDest);
    console.log(`[build] copy "${relSource}" to "${relDest}"`);
    ncp(source, dest, err => {
      if (err) {
        reject(err);
      } else {
        resolve();
      }
    });
  });

const buildLicenseList = (relSource: string, relDest: string) =>
  new Promise<void>((resolve, reject) => {
    const source = path.resolve(__dirname, relSource);
    const dest = path.resolve(__dirname, relDest);
    fs.mkdirSync(path.dirname(dest), { recursive: true });

    licenseChecker.init(
      {
        start: source,
        production: true,
      },
      (err, packages) => {
        if (err) {
          return reject(err);
        }

        const header = [
          'This application bundles the following third-party packages in ',
          'accordance with the following licenses:',
          '-------------------------------------------------------------------------',
          '',
          '',
        ].join('\n');

        const out = Object.keys(packages)
          .sort()
          .map(packageName => {
            const {
              licenses,
              repository,
              publisher,
              email,
              licenseFile: lf,
            } = packages[packageName];
            const licenseFile = (lf || '').includes('README') ? null : lf;
            return [
              '-------------------------------------------------------------------------',
              '',
              `PACKAGE: ${packageName}`,
              licenses ? `LICENSES: ${licenses}` : null,
              repository ? `REPOSITORY: ${repository}` : null,
              publisher ? `PUBLISHER: ${publisher}` : null,
              email ? `EMAIL: ${email}` : null,
              '',
              licenseFile ? readFileSync(licenseFile) : '[no license file]',
              '',
              '',
            ]
              .filter(v => v !== null)
              .join('\n');
          })
          .join('\n');

        writeFileSync(dest, `${header}${out}`);
        resolve();
      }
    );
  });

export const start = async () => {
  console.log('[build] Starting build');

  console.log(
    `[build] npm: ${readCommandVersion(process.platform === 'win32' ? 'npm.cmd' : 'npm', ['--version'])}`
  );
  console.log(`[build] node: ${process.version}`);

  if (!isSupportedBuildNodeVersion(process.version)) {
    console.log('[build] Node >=18.18.2 is required to build');
    process.exit(1);
  }

  const buildFolder = path.join('../build');

  // Remove folders first
  console.log('[build] Removing existing directories');
  await rm(path.resolve(__dirname, buildFolder), { recursive: true, force: true });

  // Build the things
  console.log('[build] Building license list');
  await buildLicenseList(
    '../',
    path.join(buildFolder, 'opensource-licenses.txt')
  );

  console.log('[build] Building main.min.js and preload');
  await buildMainAndPreload({
    mode: 'production',
  });

  console.log('[build] Building renderer');

  await vite.build({
    configFile: path.join(__dirname, '..', 'vite.config.ts'),
  });

  // Copy necessary files
  console.log('[build] Copying files');
  await copyFiles('../bin', buildFolder);
  await copyFiles('../src/static', path.join(buildFolder, 'static'));
  await copyFiles('../src/icons', buildFolder);

  console.log('[build] Complete!');
};
