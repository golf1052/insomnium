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
  - `.nvmrc` -> Node `18.18.2`
  - `.npmrc` -> Electron runtime target `25.2.0`
  - `shell.nix` -> `nodejs-18_x` and `electron_25`
- The external `nedb` package no longer appears in workspace manifests or `package-lock.json`; the app now uses the in-repo `agentdb` workspace, while some fixture names still reflect the legacy NeDB file format for compatibility.
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
- `electron-toolchain-upgrade` and `node-libcurl-compatibility` are currently blocked in this environment.
  - Attempted to align the toolchain around Electron 41 and Node 20, then upgrade `@getinsomnia/node-libcurl`.
  - Repeated installs failed during `node-pre-gyp` startup with a `tar` / `minipass` crash under both the current Node 24 runtime and a Node 20.20.2 retry.
  - The toolchain file edits were intentionally reverted instead of committing a broken install state.
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
  - The remaining blocked scope is the Electron major bump and the `@getinsomnia/node-libcurl` compatibility work.
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
- `npm audit` after this wave:
  - 52 total vulnerabilities
  - 4 critical
  - 28 high
  - 12 moderate
  - 8 low
- Manual-review findings so far:
  - `mocha` still reports a direct high via `serialize-javascript`, but the current npm audit suggestion is a downgrade to `7.2.0`, so it should be treated as a manual-review item rather than a straightforward forward upgrade.
- Next active backlog item: `manual-review-no-fix-remediation`.

## Highest-priority findings

### 1. Critical direct dependencies

- `@stoplight/spectral-core` with related `@stoplight/spectral-formats` and `@stoplight/spectral-rulesets`
  - Declared in `packages/insomnia/package.json` and `packages/insomnia-send-request/package.json`
  - Audit still indicates major-version remediation and transitive issues through `jsonpath-plus`, `minimatch`, and `nimma`
- The previously critical direct `httpsnippet` and `jsonpath-plus` findings have been cleared by the completed upgrade waves.

### 2. Remaining high direct dependencies

- App/tooling still showing direct high findings: `jshint`
- Platform-coupled direct highs: `electron`, `@getinsomnia/node-libcurl`
- `mocha` still shows a direct high via `serialize-javascript`, but npm audit currently points to an older `7.2.0` release instead of a viable forward upgrade
- The previously straightforward `@xmldom/xmldom`, `axios`, `dompurify`, `lodash`, `node-forge`, `express`, `react-router-dom`, `svgo`, `ws`, `electron-builder`, `electron-builder-squirrel-windows`, and `grpc-reflection-js` findings have been cleared.
- `packages/insomnia/package.json` also pins `protobufjs` in `overrides`, which should be reevaluated after direct dependency upgrades

### 3. Moderate direct dependencies that should be batched after the high-severity wave

- `vite` remains as a moderate direct finding after the safe `4.x` upgrade, and it still carries the residual `esbuild` advisory through its nested `esbuild@0.18.20`; the next audit fix path requires a major jump
- `apiconnect-wsdl` still needs manual review because the audit fix suggestion is not obviously safe
- The previously moderate `@grpc/grpc-js`, `graphql`, `js-yaml`, `postcss`, and `yaml` findings have been cleared.

### 4. High-risk platform/toolchain area

- `electron` is pinned at `25.8.1` in `packages/insomnia/package.json`
- Audit recommends a much newer major Electron line
- Electron upgrade work is coupled to:
  - `.npmrc`
  - `.nvmrc`
  - `shell.nix`
  - packaging/build behavior
  - native module compatibility for `@getinsomnia/node-libcurl`
- The unused root `@electron-forge/cli` dependency has already been removed and the packaging helpers are now on `26.8.1`, so the remaining build-chain exposure is concentrated in Electron and native-module compatibility

### 5. Special investigation items

- `@getinsomnia/node-libcurl` has a high-severity finding and is tightly coupled to Electron / Node ABI compatibility
- `apiconnect-wsdl` appears to pull vulnerable XML-related dependencies; the audit fix suggestion is not obviously safe and needs manual review
- `mocha` still reports a direct high via `serialize-javascript`, but the audit recommendation is a downgrade to `7.2.0` rather than a usable forward fix
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
1. `electron-toolchain-upgrade` - blocked
    - Upgrade `electron`, the remaining runtime/toolchain alignment files, and any packaging pieces still tied to the Electron jump.
    - `electron-builder` and `electron-builder-squirrel-windows` were moved to `^26.8.1`, the package config was adapted to the new schema, and the unused root `@electron-forge/cli` dependency was removed.
    - Align `.npmrc`, `.nvmrc`, `shell.nix`, and related build assumptions.
1. `node-libcurl-compatibility` - blocked
    - Upgrade `@getinsomnia/node-libcurl` alongside the chosen Electron/Node versions.
    - Verify native build, development startup, and packaging behavior.
1. `smoke-test-and-shared-tooling-security-upgrades` - done
    - Update `express`, `graphql`, `mocha`, `ws`, and related smoke-test or shared-tooling dependencies.
    - Rework or replace packages that cannot be updated cleanly, especially `grpc-reflection-js`.
1. `manual-review-no-fix-remediation` - in progress
    - Investigate `apiconnect-wsdl`, `jshint`, `mocha`, `svg-text-to-path`, and other audit items without a clean automatic path.
    - The stale NeDB documentation cleanup is complete; remaining work is package-level manual review.
1. `transitive-overrides-and-reaudit` - done
   - Revisited the historical `protobufjs` override and removed it because it no longer affected the resolved dependency tree.
   - Updated direct `esbuild` pins and re-audited; the remaining `esbuild` finding is now only Vite's nested copy and does not have a safe non-major fix in the current toolchain.

## Notes

- Confirmed scope: this plan covers runtime, build, and test dependencies, because build-chain issues still affect the repo's security posture and ability to ship safely.
- Confirmed scope: this backlog still includes replacement or mitigation work for packages without clean fixes, but the historical `nedb` package risk has already been reduced by the in-repo `agentdb` replacement.
