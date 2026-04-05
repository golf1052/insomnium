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
- The external `nedb` package no longer appears in workspace manifests or `package-lock.json`; the app now uses the in-repo `agentdb` workspace, while some docs and fixtures still refer to the legacy NeDB file format.
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
- `npm audit` after this wave:
  - 96 total vulnerabilities
  - 9 critical
  - 58 high
  - 16 moderate
  - 13 low
- Next active backlog item: `spectral-stack-major-upgrade`.

## Highest-priority findings

### 1. Critical direct dependencies

- `@stoplight/spectral-core` with related `@stoplight/spectral-formats` and `@stoplight/spectral-rulesets`
  - Declared in `packages/insomnia/package.json` and `packages/insomnia-send-request/package.json`
  - Audit still indicates major-version remediation and transitive issues through `jsonpath-plus`, `minimatch`, and `nimma`
- `httpsnippet`
  - Declared in `packages/insomnia/package.json` and `packages/insomnia-send-request/package.json`
  - Audit suggests moving to `3.0.10` as a major upgrade
- `jsonpath-plus`
  - Declared directly in `packages/insomnia/package.json` and `packages/insomnia-send-request/package.json`
  - Audit suggests moving to `10.4.0`

### 2. High direct dependencies with straightforward remediation paths

- Root: `@xmldom/xmldom`
- App/send-request: `axios`, `dompurify`, `lodash`, `node-forge`
- Smoke tests and shared tooling: `express`, `mocha`, `ws`
- App/tooling: `jshint`, `react-router-dom`, `svgo`, `vite`, `electron-builder`, `electron-builder-squirrel-windows`
- `packages/insomnia/package.json` also pins `protobufjs` in `overrides`, which should be reevaluated after direct dependency upgrades

### 3. Moderate direct dependencies that should be batched after the high-severity wave

- `@grpc/grpc-js`
- `esbuild`
- `graphql`
- `js-yaml`
- `postcss`
- `yaml`

### 4. High-risk platform/toolchain area

- `electron` is pinned at `25.8.1` in `packages/insomnia/package.json`
- Audit recommends a much newer major Electron line
- Electron upgrade work is coupled to:
  - `.npmrc`
  - `.nvmrc`
  - `shell.nix`
  - packaging/build behavior
  - native module compatibility for `@getinsomnia/node-libcurl`
- `@electron-forge/cli` also shows audit pressure with no automatic fix path, so the build chain needs to be treated as a coordinated upgrade rather than a piecemeal bump

### 5. Special investigation items

- `@getinsomnia/node-libcurl` has a high-severity finding and is tightly coupled to Electron / Node ABI compatibility
- `apiconnect-wsdl` appears to pull vulnerable XML-related dependencies; the audit fix suggestion is not obviously safe and needs manual review
- `grpc-reflection-js` in the smoke test workspace has no automatic audit fix
- `svg-text-to-path` has a low-severity issue with no automatic fix, so it should stay visible until the SVG toolchain is reviewed
- Historical NeDB follow-up is now documentation and compatibility cleanup around `agentdb` and legacy fixtures, not a current direct-package audit item

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
1. `spectral-stack-major-upgrade` - in progress
    - Upgrade `@stoplight/spectral-core`, `@stoplight/spectral-formats`, `@stoplight/spectral-rulesets`, and `jsonpath-plus`.
    - Validate ruleset loading, linting behavior, and bundling.
1. `httpsnippet-major-upgrade`
   - Move `httpsnippet` to a current safe major in both app packages.
   - Validate generated request snippets and any export/copy workflows that depend on it.
1. `electron-toolchain-upgrade`
   - Upgrade `electron`, `electron-builder`, Windows packaging helpers, and the surrounding Forge/build-tooling stack.
   - Align `.npmrc`, `.nvmrc`, `shell.nix`, and related build assumptions.
1. `node-libcurl-compatibility`
   - Upgrade `@getinsomnia/node-libcurl` alongside the chosen Electron/Node versions.
   - Verify native build, development startup, and packaging behavior.
1. `smoke-test-and-shared-tooling-security-upgrades`
   - Update `express`, `graphql`, `mocha`, `ws`, and related smoke-test or shared-tooling dependencies.
   - Rework or replace packages that cannot be updated cleanly, especially `grpc-reflection-js`.
1. `manual-review-no-fix-remediation`
   - Investigate `apiconnect-wsdl`, `grpc-reflection-js`, `svg-text-to-path`, and other audit items without a clean automatic path.
   - Clean up stale NeDB references separately so the backlog reflects the current `agentdb` architecture.
1. `transitive-overrides-and-reaudit`
   - Revisit `overrides` such as `protobufjs`.
   - Add targeted overrides only where direct upgrades are insufficient, then re-audit to measure residual risk.

## Notes

- Confirmed scope: this plan covers runtime, build, and test dependencies, because build-chain issues still affect the repo's security posture and ability to ship safely.
- Confirmed scope: this backlog still includes replacement or mitigation work for packages without clean fixes, but the historical `nedb` package risk has already been reduced by the in-repo `agentdb` replacement.
