# Dependency security update plan

## Problem

Keep this monorepo as up to date as practical to reduce dependency-related security exposure, while acknowledging that some parts of the stack (especially Electron and native modules) are harder to upgrade safely than ordinary library dependencies.

## Current state

- The repo is an npm workspace monorepo with these relevant manifests:
  - `package.json`
  - `packages/agentdb/package.json`
  - `packages/insomnia/package.json`
  - `packages/insomnia-send-request/package.json`
  - `packages/insomnia-smoke-test/package.json`
  - `packages/insomnia-testing/package.json`
  - `packages/insomnia/send-request/electron/package.json` is only a tiny shim.
- Most of the dependency surface lives in `packages/insomnia` (57 dependencies, 93 devDependencies).
- `packages/insomnia-send-request` adds 27 dependencies.
- `packages/insomnia-smoke-test` adds 4 dependencies and 25 devDependencies.
- Root `package.json` adds 1 dependency and 29 devDependencies.
- `packages/agentdb` and `packages/insomnia-testing` currently have no direct dependency surface of their own.
- Runtime and toolchain pins are currently spread across:
  - `.nvmrc` -> Node `24.14.1`
  - `package.json` -> Node `>=24.14.0` and explicit `install-libcurl-electron` / `install-libcurl-node` scripts
  - `.npmrc` -> `engine-strict=true` plus the existing Playwright browser-download skip flag
  - `shell.nix` -> `nodejs-24_x` and `electron_41`
- The external `nedb` package no longer appears in workspace manifests or `package-lock.json`; the app now uses the in-repo `agentdb` workspace, while some fixture names still reflect the legacy NeDB file format for compatibility.
- The current builder stack also pulls in `@electron/rebuild@4.0.3` through `electron-builder-squirrel-windows`, which requires Node `>=22.12.0`; the older Node 18 pins were therefore stale relative to the checked-in dependency graph.
- `npm audit` baseline at plan time:
  - 102 total vulnerabilities
  - 9 critical
  - 62 high
  - 18 moderate
  - 13 low

## Progress updates

- Completed `root-and-common-security-bumps`.
  - Updated root `@xmldom/xmldom` to `^0.8.12`.
  - Updated `packages/insomnia` to `js-yaml@^4.1.1`, `yaml@^2.8.3`, and `postcss@^8.5.8`.
  - Updated `packages/insomnia-send-request` to `yaml@^2.8.3`.
  - Removed the legacy `yaml-source-map` dependency and replaced its spec-editor usage with native `yaml@2` AST traversal.
  - Added a Jest module mapping so app tests resolve `yaml` to the Node entry point instead of the browser bundle.
- Completed `http-parser-and-sanitizer-updates`.
  - Updated `axios` to `^1.14.0` in `packages/insomnia` and `packages/insomnia-send-request`.
  - Updated `dompurify` to `^3.3.3`, `lodash` to `^4.18.1`, and `node-forge` to `^1.4.0` in `packages/insomnia`.
  - Updated `node-forge` to `^1.4.0` in `packages/insomnia-send-request`.
- Completed `spectral-stack-major-upgrade`.
  - Updated `@stoplight/spectral-core` to `^1.21.0`, `@stoplight/spectral-formats` to `^1.8.2`, `@stoplight/spectral-rulesets` to `^1.22.0`, and `@stoplight/spectral-ruleset-bundler` to `^1.6.3` in `packages/insomnia`.
  - Updated `@stoplight/spectral-core`, `@stoplight/spectral-formats`, and `@stoplight/spectral-rulesets` to the same versions in `packages/insomnia-send-request`.
  - Updated `jsonpath-plus` to `^10.4.0` in both app packages.
  - Validation passed, and the direct `jsonpath-plus` critical finding is gone.
  - Residual high-severity audit findings still remain on the latest spectral packages, so any further reduction now belongs in the transitive-override or manual-remediation waves rather than more direct version bumps.
- Completed `httpsnippet-major-upgrade`.
  - Updated `httpsnippet` to `^3.0.10` in `packages/insomnia` and `packages/insomnia-send-request`.
  - Existing generate-code and copy-as-cURL integrations remained compatible without code changes.
- Initial `electron-toolchain-upgrade` and `node-libcurl-compatibility` attempts hit environment-specific install failures.
  - Attempted to align the toolchain around Electron 41 and Node 20, then upgrade `@getinsomnia/node-libcurl`.
  - Repeated installs failed during `node-pre-gyp` startup with a `tar` / `minipass` crash under both the current Node 24 runtime and a Node 20.20.2 retry.
  - The toolchain file edits were intentionally reverted instead of committing a broken install state, and that failed path was later superseded by the successful combined Electron 41 / `node-libcurl` 3.2.1 upgrade described below.
- Completed `smoke-test-and-shared-tooling-security-upgrades`.
  - Updated `@grpc/grpc-js` to `^1.14.3` in `packages/insomnia` and `packages/insomnia-smoke-test`.
  - Updated `mocha` to `^10.8.2` in `packages/insomnia`.
  - Updated `graphql` to `^16.13.2` and `ws` to `^8.20.0` in `packages/insomnia` and `packages/insomnia-smoke-test`.
  - Updated `express` to `^4.22.1` in `packages/insomnia-smoke-test`.
- Completed the packaging-helper subset of `electron-toolchain-upgrade`.
  - Removed the unused root `@electron-forge/cli` dependency.
  - Updated `electron-builder` and `electron-builder-squirrel-windows` to `^26.8.1` in `packages/insomnia`.
  - Updated `packages/insomnia/electron-builder.config.js` for the newer builder schema (`mac.notarize` and Linux `desktop.entry`).
  - Validated packaging with `BUILD_TARGETS=portable npm run app-package`.
  - That earlier subset stopped at the Electron major bump and the `@getinsomnia/node-libcurl` compatibility work, which were later completed in the combined upgrade wave below.
- Completed the safe app/tooling direct-upgrade subset.
  - Updated `react-router-dom` to `^6.30.3` and `vite` to `^4.5.14` in `packages/insomnia`.
  - Updated root `svgo` to `^2.8.2`.
  - Adjusted route error handling to match the newer `react-router-dom` `ErrorResponse` typing.
- Completed the `grpc-reflection-js` manual-remediation slice.
  - Replaced `grpc-reflection-js` with the maintained `@grpc/reflection` package in `packages/insomnia`.
  - Added a local reflection client that uses the official v1alpha reflection proto and preserves the existing service/method loading flow.
  - Updated the gRPC IPC tests to mock the new client seam instead of the removed package.
- Completed `transitive-overrides-and-reaudit`.
  - Updated root and app direct `esbuild` dependencies to `^0.28.0`.
  - Re-ran the audit and confirmed the direct `esbuild` finding is gone; the remaining `esbuild` advisory now only comes from Vite 4's nested `esbuild@0.18.20`.
  - Reevaluated the stale workspace-only `protobufjs` override in `packages/insomnia` and removed it because root installs already resolve `protobufjs@7.5.4`.
  - Cleaned stale NeDB architecture wording so docs and comments reflect the current `agentdb` compatibility layer.
- Completed `manual-review-no-fix-remediation`.
  - Verified `jshint` is already on its latest `2.13.6` release, while npm audit still suggests an unusable downgrade to `0.5.9`.
  - Verified `mocha` is not fixable through a normal forward upgrade in the current audit data; the advisory range still includes the latest `11.7.5` line.
  - Verified `svg-text-to-path` still has no fix available, even on its latest `2.1.0` release.
  - Investigated `apiconnect-wsdl@2.0.36`, but its `>=18.7.0 <21.0.0` engine range conflicts with the repo's current Node 24.x toolchain, so there is no single engine window that satisfies both under the repo's `engine-strict=true` installs.
  - Updated the checked-in Node pins to match the current installable toolchain instead of the stale Node 18 values.
- Reinvestigated `node-libcurl-compatibility` against the current `@getinsomnia/node-libcurl@3.2.1` line.
  - `3.2.1` no longer hits the earlier `tar` / `minipass` startup crash and its package layout still matches the repo's current usage and test mocks.
  - The package now requires Node `>=24.14.0`, which matches the repo's current `.nvmrc`, but Kong does not publish a Windows prebuilt binary for `electron-v25.2`, so installs fall back to a source build.
  - The Windows source-build path got past the Python 3.12 `distutils` issue with a throwaway virtualenv, then failed in `curl-for-windows` because `nasm` is not present in this environment.
  - At that point the upgrade path was still constrained by Electron 25 being outside the upstream prebuilt-binary window and by missing Windows native-build prerequisites, not by the old `node-pre-gyp` crash.
- Completed `electron-toolchain-upgrade` and `node-libcurl-compatibility` together.
  - Used the public upstream pairing from `Kong/insomnia#9734` as the base path, then moved one Electron patch level farther to `41.1.1` after confirming it shares ABI `145` with `41.0.3`.
  - Updated `packages/insomnia` to `electron@41.1.1`.
  - Updated `@getinsomnia/node-libcurl` to `3.2.1` in `packages/insomnia` and `packages/insomnia-send-request`.
  - Replaced the stale `.npmrc` Electron target with explicit root `install-libcurl-electron` / `install-libcurl-node` scripts plus a `postinstall` hook.
  - The Electron install hook intentionally targets `41.0.3`, because `@getinsomnia/node-libcurl@3.2.1` publishes Windows prebuilt assets for `electron-v41.0` but not `electron-v41.1`, while Electron `41.1.1` remains ABI-compatible with that published prebuilt.
  - `npm install`, `npm run lint`, `npm run type-check`, `npm test`, `npm run app-build`, and `BUILD_TARGETS=portable npm run app-package` all passed on Windows after the combined upgrade.
- Ran `npm audit fix` after the Electron / `node-libcurl` wave.
  - The non-breaking audit remediation only updated `package-lock.json`.
  - That lockfile refresh re-hoisted `yaml`, so `packages/insomnia/jest.config.js` needed a follow-up mapper fix to point at the root `node_modules` path instead of a workspace-local one.
  - Validation still passed after that config adjustment.
- `npm audit` after this wave:
  - 22 total vulnerabilities
  - 1 critical
  - 12 high
  - 4 moderate
  - 5 low
- Manual-review findings:
  - `mocha` still reports a direct high via `serialize-javascript`, and the current audit data does not offer a viable forward-only upgrade path.
  - `jshint` is already on its latest release, and the current audit recommendation is an unusable downgrade to `0.5.9`.
  - `svg-text-to-path` still has no fix available, even on its latest release.
  - `apiconnect-wsdl` does have a newer `2.0.36` line, but it conflicts with the repo's current Node 24.x toolchain.
- No active implementation backlog items remain; the remaining risk is concentrated in no-fix/manual-review packages and future major-upgrade follow-ups.

## Highest-priority findings

### 1. Critical direct dependencies

- No critical direct dependencies remain after the Electron / `node-libcurl` upgrade and the follow-up `npm audit fix`.
- The remaining single critical issue is transitive under `apiconnect-wsdl` via `xmldom`, and the direct package itself is still reported as a moderate finding because the clean forward path remains blocked by the repo's current Node 24.x toolchain.

### 2. Remaining high direct dependencies

- Spectral stack direct highs:
  - `@stoplight/spectral-core`
  - `@stoplight/spectral-formats`
  - `@stoplight/spectral-ruleset-bundler`
  - `@stoplight/spectral-rulesets`
- App/tooling still showing direct high findings: `jshint`
- `mocha` still shows a direct high via `serialize-javascript`, and the current audit data does not offer a viable forward-only upgrade path
- The previous platform-coupled direct findings on `electron` and `@getinsomnia/node-libcurl` have been cleared by the Electron 41 / `node-libcurl` 3.2.1 upgrade
- The previously straightforward `@xmldom/xmldom`, `axios`, `dompurify`, `lodash`, `node-forge`, `express`, `react-router-dom`, `svgo`, `ws`, `electron-builder`, `electron-builder-squirrel-windows`, `grpc-reflection-js`, and `@vitejs/plugin-react` findings have been cleared.

### 3. Moderate direct dependencies that should be batched after the high-severity wave

- `vite` remains as a moderate direct finding after the safe `4.x` upgrade, and it still carries the residual `esbuild` advisory through its nested `esbuild@0.18.20`; the next audit fix path requires a major jump
- `apiconnect-wsdl` remains a moderate direct finding, but its newer line is currently blocked by an install-time Node engine conflict with the repo's current Node 24.x toolchain
- The previously moderate `@grpc/grpc-js`, `graphql`, `js-yaml`, `postcss`, and `yaml` findings have been cleared.

### 4. High-risk platform/toolchain area

- `electron` is now pinned at `41.1.1` in `packages/insomnia/package.json`
- `@getinsomnia/node-libcurl` is now pinned at `3.2.1` in both app workspaces
- The current builder stack and root engines are aligned to Node `>=24.14.0`
- Root installs now use explicit `install-libcurl-electron` / `install-libcurl-node` scripts instead of a checked-in `.npmrc` Electron target
- Windows installs intentionally consume the published `electron-v41.0` `node-libcurl` prebuild because Electron `41.1.1` shares ABI `145` with `41.0.3`, while upstream does not publish a `electron-v41.1` Windows asset for `3.2.1`
- The unused root `@electron-forge/cli` dependency has already been removed and the packaging helpers are now on `26.8.1`

### 5. Special investigation items

- `@getinsomnia/node-libcurl` has been upgraded to `3.2.1` and now installs successfully from the upstream Electron 41 Windows prebuild path in this repo
- Electron `41.1.1` is running against the ABI-compatible published `electron-v41.0` `node-libcurl` prebuild, because upstream `3.2.1` assets still stop at `41.0.x` on Windows
- `apiconnect-wsdl` does have a newer `2.0.36` line, but it is blocked by a Node engine conflict with the repo's current Node 24.x toolchain
- `mocha` still reports a direct high via `serialize-javascript`, but the audit recommendation is not a usable forward fix
- `svg-text-to-path` has a low-severity issue with no automatic fix, so it should stay visible until the SVG toolchain is reviewed
- Historical NeDB follow-up is now down to legacy fixture naming and compatibility language, not a current direct-package audit item

## Proposed approach

1. Prioritize direct dependencies first, because they give the highest security payoff with the clearest ownership.
1. Separate work into update waves so the hardest parts do not block easier fixes:
   - fast direct upgrades
   - major library upgrades
   - Electron/native-module toolchain upgrades
   - no-fix replacement or mitigation work
1. Re-run install/audit/lint/type-check/test/smoke validation after each wave rather than attempting one repo-wide mega-upgrade.
1. Keep replacements and mitigations visible in the same backlog, since version bumps alone will not eliminate the most serious long-term risks.

## Todo backlog

1. `root-and-common-security-bumps` - done
    - Update root `@xmldom/xmldom` and other low-risk direct packages such as `js-yaml`, `postcss`, and `yaml`.
    - Refresh lockfile state and reduce the easy audit findings first.
1. `http-parser-and-sanitizer-updates` - done
    - Update `axios`, `dompurify`, `lodash`, `node-forge`, and adjacent direct app/send-request dependencies.
    - Verify request sending, auth flows, and HTML rendering paths.
1. `spectral-stack-major-upgrade` - done
    - Upgrade `@stoplight/spectral-core`, `@stoplight/spectral-formats`, `@stoplight/spectral-rulesets`, and `jsonpath-plus`.
    - Validate ruleset loading, linting behavior, and bundling.
1. `httpsnippet-major-upgrade` - done
    - Move `httpsnippet` to a current safe major in both app packages.
    - Validate generated request snippets and any export/copy workflows that depend on it.
1. `electron-toolchain-upgrade` - done
    - Upgraded `electron` to `41.1.1`, aligned the checked-in toolchain files, and replaced the stale `.npmrc` Electron target with explicit root install scripts.
    - `electron-builder` and `electron-builder-squirrel-windows` were already on `^26.8.1`, and portable packaging now passes on the Electron 41 app build.
1. `node-libcurl-compatibility` - done
    - Upgraded `@getinsomnia/node-libcurl` to `3.2.1` in both app workspaces.
    - Windows installs now consume the published `electron-v41.0` prebuild through the root postinstall hook, which remains ABI-compatible with Electron `41.1.1`.
    - Verified native install, development startup, test/build flow, and portable packaging behavior on the combined Electron 41 / Node 24 pairing.
1. `smoke-test-and-shared-tooling-security-upgrades` - done
    - Update `express`, `graphql`, `mocha`, `ws`, and related smoke-test or shared-tooling dependencies.
    - Rework or replace packages that cannot be updated cleanly, especially `grpc-reflection-js`.
1. `manual-review-no-fix-remediation` - done
    - Investigated `apiconnect-wsdl`, `jshint`, `mocha`, `svg-text-to-path`, and the historical NeDB cleanup.
    - Remaining no-fix/manual-review items are now documented results rather than active upgrade work.
1. `transitive-overrides-and-reaudit` - done
   - Revisited the historical `protobufjs` override and removed it because it no longer affected the resolved dependency tree.
   - Updated direct `esbuild` pins and re-audited; the remaining `esbuild` finding is now only Vite's nested copy and does not have a safe non-major fix in the current toolchain.

## Notes

- Confirmed scope: this plan covers runtime, build, and test dependencies, because build-chain issues still affect the repo's security posture and ability to ship safely.
- Confirmed scope: this backlog still includes replacement or mitigation work for packages without clean fixes, but the historical `nedb` package risk has already been reduced by the in-repo `agentdb` replacement.
